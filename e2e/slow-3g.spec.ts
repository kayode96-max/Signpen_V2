import { devices, type CDPSession } from '@playwright/test';
import { expect, installReadOnlyGuard, test } from './support';

/**
 * Landing page on Chrome DevTools "Slow 3G" (latency 2000 ms,
 * 50_000 B/s down and up, which is 500 kbps * 0.8) plus 4x CPU
 * throttling where Chromium's CDP supports it.
 *
 * Budgets default to FCP under 5 s and first-view transfer under 1 MiB.
 * Results are printed and annotated. They do not fail the run until
 * ENFORCE_PERF_BUDGETS=1 (expect.soft would still fail the test).
 *
 * Read-only. Runs once, on desktop Chromium, with a Pixel 5 viewport.
 */

// Chrome DevTools Slow 3G preset (front_end ThrottlingPresets Slow3GConditions).
const SLOW_3G = {
  offline: false,
  latency: 2000,
  downloadThroughput: (500 * 1000) / 8 * 0.8,
  uploadThroughput: (500 * 1000) / 8 * 0.8,
} as const;

function budget(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, received ${raw}`);
  }
  return value;
}

test('landing page on Slow 3G records FCP and transferred bytes', async ({ browser }) => {
  test.setTimeout(240_000);

  const fcpBudgetMs = budget('FCP_BUDGET_MS', 5000);
  const transferBudgetBytes = budget('TRANSFER_BUDGET_BYTES', 1024 * 1024);
  const enforce = process.env.ENFORCE_PERF_BUDGETS === '1';

  const descriptor = devices['Pixel 5'];
  const context = await browser.newContext({
    userAgent: descriptor.userAgent,
    viewport: descriptor.viewport,
    deviceScaleFactor: descriptor.deviceScaleFactor,
    isMobile: descriptor.isMobile,
    hasTouch: descriptor.hasTouch,
  });
  await installReadOnlyGuard(context);
  const page = await context.newPage();

  let transferredBytes = 0;
  let cpuThrottled = false;
  let cdp: CDPSession | undefined;

  try {
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.loadingFinished', (event) => {
      transferredBytes += event.encodedDataLength;
    });
    await cdp.send('Network.emulateNetworkConditions', SLOW_3G);
    try {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      cpuThrottled = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      test.info().annotations.push({
        type: 'cpu-throttle',
        description: `4x CPU throttling unavailable: ${message}`,
      });
    }

    const baseURL = process.env.BASE_URL || 'http://localhost:3000';
    await page.goto(new URL('/', baseURL).href, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    const fcpAppeared = await page
      .waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, {
        timeout: 60_000,
      })
      .then(() => true)
      .catch(() => false);

    let loadFinished = true;
    await page.waitForLoadState('load', { timeout: 100_000 }).catch(() => {
      loadFinished = false;
    });

    const timing = await page.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      const navigation = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const resourceBytes = resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
      const documentBytes = navigation?.transferSize || 0;
      return {
        fcpMs: fcp ? Math.round(fcp.startTime) : null,
        resourceTimingBytes: documentBytes + resourceBytes,
      };
    });

    const fcpMs = fcpAppeared ? timing.fcpMs : null;
    const fcpOk = fcpMs !== null && fcpMs < fcpBudgetMs;
    const transferOk = transferredBytes < transferBudgetBytes;
    const summary = [
      `FCP ${fcpMs === null ? 'n/a' : `${fcpMs} ms`} (budget ${fcpBudgetMs} ms, ${fcpOk ? 'within' : 'over'})`,
      `transferred ${transferredBytes} bytes (budget ${transferBudgetBytes} bytes, ${transferOk ? 'within' : 'over'})`,
      `resource-timing ${timing.resourceTimingBytes} bytes`,
      `cpuThrottle=${cpuThrottled ? '4x' : 'off'}`,
      `loadFinished=${loadFinished}`,
      enforce ? 'budgets enforced' : 'budgets not enforced',
    ].join('; ');

    console.log(`[slow-3g] ${summary}`);
    test.info().annotations.push({ type: 'slow-3g', description: summary });
    if (!fcpOk || !transferOk) {
      test.info().annotations.push({
        type: 'budget-miss',
        description: enforce
          ? 'Budget miss fails this test because ENFORCE_PERF_BUDGETS=1.'
          : 'Reported only. Set ENFORCE_PERF_BUDGETS=1 to fail the run.',
      });
    }

    if (enforce) {
      expect(fcpMs, 'first contentful paint').not.toBeNull();
      expect(fcpMs ?? Number.POSITIVE_INFINITY, 'FCP budget').toBeLessThan(fcpBudgetMs);
      expect(transferredBytes, 'first-view transferred bytes').toBeLessThan(transferBudgetBytes);
      expect(loadFinished, 'load event under Slow 3G').toBe(true);
    }
  } finally {
    await context.close();
  }
});
