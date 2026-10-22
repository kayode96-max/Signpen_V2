import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { installReadOnlyGuard, redact } from './support';

/**
 * Chrome DevTools Slow 3G preset (ThrottlingPresets Slow3GConditions):
 * 500 kbps * 0.8 = 50_000 B/s, latency 400 * 5 = 2000 ms.
 */
export const SLOW_3G = {
  offline: false,
  latency: 2000,
  downloadThroughput: (500 * 1000) / 8 * 0.8,
  uploadThroughput: (500 * 1000) / 8 * 0.8,
} as const;

export type PerfResource = { url: string; bytes: number };

export type PerfSample = {
  page: string;
  path: string;
  project: string;
  browser: string;
  throttling: 'slow-3g' | 'unthrottled';
  throttlingNote?: string;
  cpuThrottle: number | null;
  fcpMs: number | null;
  transferredBytes: number;
  requestCount: number;
  bytesSource: 'cdp' | 'resource-timing';
  loadFinished: boolean;
  largestResources: PerfResource[];
  /** Set when in-flight responses were still open at the settle cap. */
  transferNote?: string;
  error?: string;
};

export type PerfBaseline = {
  generatedAt: string;
  baseURL: string;
  enforced: boolean;
  budgets: { fcpMs: number; transferredBytes: number };
  samples: PerfSample[];
};

const RESULTS_DIR = path.join(process.cwd(), 'e2e', 'results');
const PARTIALS_DIR = path.join(RESULTS_DIR, 'partials');
const BASELINE_PATH = path.join(RESULTS_DIR, 'perf-baseline.json');

export function perfBaselinePath(): string {
  return BASELINE_PATH;
}

export type SmokeTarget = { page: string; path: string; url: string };

/** Public smoke pages, plus the board only when TEST_STUDENT_URL is set. */
export function smokeTargets(baseURL: string): SmokeTarget[] {
  const targets: SmokeTarget[] = [
    { page: '/', path: '/', url: new URL('/', baseURL).href },
    { page: '/contact', path: '/contact', url: new URL('/contact', baseURL).href },
    { page: '/login', path: '/login', url: new URL('/login', baseURL).href },
  ];
  const student = process.env.TEST_STUDENT_URL?.trim();
  if (student) {
    const absolute = new URL(student, baseURL);
    targets.push({
      page: 'board',
      path: absolute.pathname || '/board',
      url: absolute.href,
    });
  }
  return targets;
}

export function safeResourceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.split('#')[0].split('?')[0];
  }
}

export function topResources(entries: { url: string; bytes: number }[]): PerfResource[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const url = safeResourceUrl(entry.url);
    totals.set(url, (totals.get(url) ?? 0) + entry.bytes);
  }
  return [...totals.entries()]
    .map(([url, bytes]) => ({ url, bytes }))
    .sort((a, b) => b.bytes - a.bytes || a.url.localeCompare(b.url))
    .slice(0, 5);
}

type DeviceOptions = Pick<
  BrowserContextOptions,
  'userAgent' | 'viewport' | 'deviceScaleFactor' | 'isMobile' | 'hasTouch' | 'extraHTTPHeaders' | 'baseURL'
>;

type CdpRequest = { url: string; generation: number; type?: string };

type CdpTracker = {
  generation: number;
  meta: Map<string, CdpRequest>;
  bytes: Map<string, number>;
};

function isLongLivedTransfer(type: string | undefined, url: string): boolean {
  if (type === 'WebSocket' || type === 'EventSource') return true;
  return /\/realtime\/v1\/websocket|\/realtime\/v1\/api/i.test(url);
}

/** True when every finite request in this navigation has a byte count. */
function transferIsQuiet(tracker: CdpTracker): boolean {
  for (const [id, meta] of tracker.meta) {
    if (meta.generation !== tracker.generation) continue;
    if (isLongLivedTransfer(meta.type, meta.url)) continue;
    if (!tracker.bytes.has(id)) return false;
  }
  return true;
}

/** Video srcs the document asked for that have not finished transferring. */
async function declaredMediaStillMissing(page: Page, tracker: CdpTracker): Promise<boolean> {
  const srcs = await page
    .evaluate(() =>
      [...document.querySelectorAll('video[src]')].flatMap((node) => {
        const video = node as HTMLVideoElement;
        const src = video.currentSrc || video.src;
        return src.startsWith('http') ? [src] : [];
      }),
    )
    .catch(() => [] as string[]);
  if (srcs.length === 0) return false;
  const finished = new Set<string>();
  for (const [id, meta] of tracker.meta) {
    if (!tracker.bytes.has(id)) continue;
    finished.add(meta.url.split('#')[0].split('?')[0]);
  }
  return srcs.some((src) => !finished.has(src.split('#')[0].split('?')[0]));
}

/**
 * The load event fires while large images and the hero video are still in flight
 * on Slow 3G. The video request often starts only after those images finish, so
 * a quiet network is not enough while a declared video src has no completed
 * response. Realtime sockets are ignored. Returns false when the cap is hit.
 */
async function waitForTransferToSettle(page: Page, tracker: CdpTracker, maxMs = 180_000, quietMs = 2_000): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  let quietSince = 0;
  while (Date.now() < deadline) {
    const mediaMissing = await declaredMediaStillMissing(page, tracker);
    if (transferIsQuiet(tracker) && !mediaMissing) {
      if (quietSince === 0) quietSince = Date.now();
      if (Date.now() - quietSince >= quietMs) return true;
    } else {
      quietSince = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return transferIsQuiet(tracker) && !(await declaredMediaStillMissing(page, tracker));
}

async function readResourceTiming(page: Page): Promise<{ fcpMs: number | null; entries: { url: string; bytes: number }[] }> {
  return page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return {
      fcpMs: fcp ? Math.round(fcp.startTime) : null,
      entries: [
        ...(navigation ? [{ url: navigation.name, bytes: navigation.transferSize || 0 }] : []),
        ...resources.map((entry) => ({ url: entry.name, bytes: entry.transferSize || 0 })),
      ],
    };
  });
}

export async function measurePage(args: {
  browser: Browser;
  browserName: string;
  project: string;
  options: DeviceOptions;
  target: SmokeTarget;
}): Promise<PerfSample> {
  const { browser, browserName, project, options, target } = args;
  const base: Omit<PerfSample, 'fcpMs' | 'transferredBytes' | 'requestCount' | 'bytesSource' | 'loadFinished' | 'largestResources' | 'throttling' | 'cpuThrottle'> = {
    page: target.page,
    path: target.path,
    project,
    browser: browserName,
  };
  let context: BrowserContext | undefined;

  try {
    context = await browser.newContext(options);
    await installReadOnlyGuard(context);
    const page = await context.newPage();
    let throttling: PerfSample['throttling'] = 'unthrottled';
    let throttlingNote: string | undefined;
    let cpuThrottle: number | null = null;
    let tracker: CdpTracker | undefined;

    if (browserName === 'chromium') {
      try {
        const cdp = await context.newCDPSession(page);
        tracker = { generation: 1, meta: new Map(), bytes: new Map() };
        const active = tracker;
        await cdp.send('Network.enable');
        try {
          await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        } catch {
          // A warm cache would skew page weight. Failure here still leaves a fresh context.
        }
        cdp.on('Network.requestWillBeSent', (event) => {
          active.meta.set(event.requestId, {
            url: event.request.url,
            generation: active.generation,
            type: event.type,
          });
        });
        const markDone = (requestId: string, bytes?: number) => {
          if (!active.meta.has(requestId)) return;
          if (bytes === undefined) {
            if (!active.bytes.has(requestId)) active.bytes.set(requestId, 0);
            return;
          }
          active.bytes.set(requestId, bytes);
        };
        cdp.on('Network.loadingFinished', (event) => {
          markDone(event.requestId, event.encodedDataLength);
        });
        cdp.on('Network.loadingFailed', (event) => {
          markDone(event.requestId);
        });
        cdp.on('Network.requestServedFromCache', (event) => {
          markDone(event.requestId);
        });
        await cdp.send('Network.emulateNetworkConditions', SLOW_3G);
        throttling = 'slow-3g';
        try {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          cpuThrottle = 4;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throttlingNote = `Slow 3G network throttle is on. 4x CPU throttling is unavailable (${redact(message)}).`;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throttling = 'unthrottled';
        throttlingNote = `Chrome DevTools throttling is unavailable (${redact(message)}). Recorded unthrottled.`;
        tracker = undefined;
      }
    } else {
      throttlingNote = 'Chrome DevTools throttling is not available on WebKit. Recorded unthrottled.';
    }

    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const fcpAppeared = await page
      .waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    let loadFinished = true;
    await page.waitForLoadState('load', { timeout: 100_000 }).catch(() => {
      loadFinished = false;
    });

    let transferNote: string | undefined;
    if (tracker && throttling === 'slow-3g') {
      const settled = await waitForTransferToSettle(page, tracker);
      if (!settled) {
        transferNote = 'In-flight responses were still open after 180s, so transferredBytes may be short.';
      }
    }

    const timing = await readResourceTiming(page);
    let entries = timing.entries;
    let requestCount = timing.entries.length;
    let bytesSource: PerfSample['bytesSource'] = 'resource-timing';

    if (tracker && throttling === 'slow-3g') {
      const mine = [...tracker.meta.entries()].filter(([, value]) => value.generation === tracker.generation);
      entries = mine.map(([id, value]) => ({ url: value.url, bytes: tracker.bytes.get(id) ?? 0 }));
      requestCount = mine.length;
      bytesSource = 'cdp';
    }

    const transferredBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    const sample: PerfSample = {
      ...base,
      throttling,
      ...(throttlingNote ? { throttlingNote } : {}),
      cpuThrottle,
      fcpMs: fcpAppeared ? timing.fcpMs : null,
      transferredBytes,
      requestCount,
      bytesSource,
      loadFinished,
      largestResources: topResources(entries),
      ...(transferNote ? { transferNote } : {}),
    };
    return sample;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      throttling: browserName === 'chromium' ? 'slow-3g' : 'unthrottled',
      throttlingNote: browserName === 'chromium' ? undefined : 'Chrome DevTools throttling is not available on WebKit. Recorded unthrottled.',
      cpuThrottle: null,
      fcpMs: null,
      transferredBytes: 0,
      requestCount: 0,
      bytesSource: browserName === 'chromium' ? 'cdp' : 'resource-timing',
      loadFinished: false,
      largestResources: [],
      error: redact(message),
    };
  } finally {
    await context?.close();
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const lockPath = path.join(RESULTS_DIR, '.lock');
  const started = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.closeSync(fd);
      try {
        return await fn();
      } finally {
        fs.rmSync(lockPath, { force: true });
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      if (Date.now() - started > 30_000) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/** Merge this project's samples into e2e/results/perf-baseline.json. */
export async function publishProjectSamples(args: {
  project: string;
  samples: PerfSample[];
  baseURL: string;
  enforced: boolean;
  budgets: { fcpMs: number; transferredBytes: number };
}): Promise<PerfBaseline> {
  const slug = args.project.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
  fs.mkdirSync(PARTIALS_DIR, { recursive: true });
  writeJson(path.join(PARTIALS_DIR, `${slug}.json`), args.samples);

  return withLock(async () => {
    const samples: PerfSample[] = [];
    for (const file of fs.readdirSync(PARTIALS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const parsed = JSON.parse(fs.readFileSync(path.join(PARTIALS_DIR, file), 'utf8')) as PerfSample[];
      samples.push(...parsed);
    }
    samples.sort(
      (a, b) => a.path.localeCompare(b.path) || a.project.localeCompare(b.project) || a.browser.localeCompare(b.browser),
    );
    const baseline: PerfBaseline = {
      generatedAt: new Date().toISOString(),
      baseURL: args.baseURL,
      enforced: args.enforced,
      budgets: args.budgets,
      samples,
    };
    writeJson(BASELINE_PATH, baseline);
    return baseline;
  });
}
