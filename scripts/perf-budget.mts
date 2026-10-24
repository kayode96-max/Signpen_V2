/**
 * Landing-page performance budget against a local `next start`.
 *
 * Chromium, cache disabled, Chrome DevTools Slow 3G (and 4x CPU when the
 * browser accepts it). No Vercel, no Supabase credentials, no repository secrets.
 *
 * Requires a production build (`.next`) from `npm run build`.
 * Exits 0 when report-only. Exits 1 when ENFORCE_PERF_BUDGETS=1 and the
 * landing page misses the budget, or when the page cannot be measured.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type CDPSession, type Page } from '@playwright/test';
import {
  budgetFailures,
  budgetsAreEnforced,
  formatBudgetReport,
  summarizeFirstView,
  type ByteEntry,
} from '../src/lib/perf/first-view-budget.ts';

/** Same preset as PR #16 (Chrome DevTools Slow 3G). */
const SLOW_3G = {
  offline: false,
  latency: 2000,
  downloadThroughput: (500 * 1000) / 8 * 0.8,
  uploadThroughput: (500 * 1000) / 8 * 0.8,
} as const;

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, '..');
const port = Number(process.env.PERF_BUDGET_PORT || 3210);
const origin = `http://127.0.0.1:${port}`;

type ClockAnchor = { timestamp: number; wallTime: number };
type Chunk = { at: number; bytes: number };
type Tracked = {
  url: string;
  startedAt: number;
  finishedAt?: number;
  encodedBytes?: number;
  chunks: Chunk[];
};

async function main(): Promise<void> {
  const enforced = budgetsAreEnforced(process.env.ENFORCE_PERF_BUDGETS);
  const server = startServer();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await waitForServer(`${origin}/`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const tracked = new Map<string, Tracked>();
    let anchor: ClockAnchor | undefined;
    let cpuNote: string | undefined;

    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', SLOW_3G);
    try {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    } catch (error) {
      cpuNote = `4x CPU throttling is unavailable (${error instanceof Error ? error.message : String(error)}). Network Slow 3G is on.`;
    }
    wireNetwork(cdp, tracked, (next) => {
      anchor = next;
    }, () => anchor);

    await page.goto(`${origin}/`, { waitUntil: 'commit', timeout: 180_000 });
    const fcpAppeared = await page
      .waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, {
        timeout: 150_000,
      })
      .then(() => true)
      .catch(() => false);
    if (!fcpAppeared || !anchor) {
      throw new Error('First contentful paint was not observed under Slow 3G.');
    }

    const timing = await readTiming(page);
    if (timing.fcpMs == null) {
      throw new Error('First contentful paint timestamp was missing.');
    }
    const fcpCdp = performanceMsToCdp(anchor, timing.timeOrigin, timing.fcpMs);
    const entries = entriesAtFirstPaint(tracked, fcpCdp);
    const pending = [...tracked.values()]
      .filter((meta) => meta.startedAt <= fcpCdp)
      .filter((meta) => !entries.some((entry) => entry.url === meta.url))
      .map((meta) => meta.url)
      .sort();
    const summary = summarizeFirstView(entries);
    const failures = budgetFailures(summary);
    console.log(
      formatBudgetReport({
        enforced,
        summary,
        failures,
        fcpMs: timing.fcpMs,
        note: cpuNote,
        pending,
      }),
    );
    if (enforced && failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser?.close().catch(() => undefined);
    await stopServer(server);
  }
}

function startServer(): ChildProcess {
  const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: projectRoot,
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs: string[] = [];
  const capture = (chunk: Buffer) => {
    logs.push(chunk.toString());
    if (logs.length > 40) logs.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  child.once('exit', (code) => {
    if (code && code !== 0 && !child.killed) {
      console.error(logs.join('').slice(-4000));
    }
  });
  return child;
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`next start did not become ready at ${url}: ${lastError}`);
}

function wireNetwork(
  cdp: CDPSession,
  tracked: Map<string, Tracked>,
  setAnchor: (anchor: ClockAnchor) => void,
  getAnchor: () => ClockAnchor | undefined,
): void {
  cdp.on('Network.requestWillBeSent', (event) => {
    if (!getAnchor()) setAnchor({ timestamp: event.timestamp, wallTime: event.wallTime });
    const existing = tracked.get(event.requestId);
    if (existing) {
      existing.url = event.request.url;
      return;
    }
    tracked.set(event.requestId, {
      url: event.request.url,
      startedAt: event.timestamp,
      chunks: [],
    });
  });
  cdp.on('Network.dataReceived', (event) => {
    const meta = tracked.get(event.requestId);
    if (!meta) return;
    meta.chunks.push({ at: event.timestamp, bytes: event.encodedDataLength });
  });
  cdp.on('Network.loadingFinished', (event) => {
    const meta = tracked.get(event.requestId);
    if (!meta) return;
    meta.finishedAt = event.timestamp;
    meta.encodedBytes = event.encodedDataLength;
  });
  cdp.on('Network.loadingFailed', (event) => {
    const meta = tracked.get(event.requestId);
    if (!meta || meta.finishedAt != null) return;
    meta.finishedAt = event.timestamp;
    meta.encodedBytes = meta.chunks.reduce((total, chunk) => total + chunk.bytes, 0);
  });
}

function entriesAtFirstPaint(tracked: Map<string, Tracked>, fcpCdp: number): ByteEntry[] {
  const entries: ByteEntry[] = [];
  for (const meta of tracked.values()) {
    if (meta.startedAt > fcpCdp) continue;
    const doneBeforePaint = meta.finishedAt != null && meta.finishedAt <= fcpCdp;
    if (doneBeforePaint) {
      entries.push({ url: meta.url, bytes: meta.encodedBytes ?? 0 });
      continue;
    }
    const partial = meta.chunks.reduce((total, chunk) => (chunk.at <= fcpCdp ? total + chunk.bytes : total), 0);
    if (partial > 0) entries.push({ url: meta.url, bytes: partial });
  }
  return entries;
}

function performanceMsToCdp(anchor: ClockAnchor, timeOriginMs: number, perfMs: number): number {
  const epochSeconds = (timeOriginMs + perfMs) / 1000;
  return anchor.timestamp + (epochSeconds - anchor.wallTime);
}

async function readTiming(page: Page): Promise<{ fcpMs: number | null; timeOrigin: number }> {
  return page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      fcpMs: fcp ? Math.round(fcp.startTime) : null,
      timeOrigin: performance.timeOrigin,
    };
  });
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode != null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (child.exitCode == null && child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
