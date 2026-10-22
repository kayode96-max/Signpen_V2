import { expect, test } from './support';
import { measurePage, publishProjectSamples, smokeTargets, type PerfSample } from './perf-baseline';

/**
 * Read-only page-weight baseline for `/`, `/contact`, `/login`, and (when
 * TEST_STUDENT_URL is set) the board page. Desktop Chromium and Pixel 5 use
 * Chrome DevTools Slow 3G plus 4x CPU throttling. iPhone 12 is WebKit, which
 * has no CDP throttle, so those rows are marked unthrottled.
 *
 * Report-only unless ENFORCE_PERF_BUDGETS=1. Gates read Chromium slow-3g
 * rows only. WebKit rows are unthrottled. The 300 KB cap is the largest
 * file that finished before first contentful paint, excluding the hero
 * video and scene.bin. The merged file is e2e/results/perf-baseline.json.
 */

function budget(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, received ${raw}`);
  }
  return value;
}

test('records a perf baseline for each smoke page', async ({ browser, browserName }, testInfo) => {
  test.setTimeout(720_000);
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  const fcpBudgetMs = budget('FCP_BUDGET_MS', 5000);
  const firstViewBudgetBytes = budget('TRANSFER_BUDGET_BYTES', 1024 * 1024);
  const firstViewFileBudgetBytes = budget('FIRST_VIEW_FILE_BUDGET_BYTES', 300 * 1024);
  const enforced = process.env.ENFORCE_PERF_BUDGETS === '1';
  const projectUse = testInfo.project.use;
  const samples: PerfSample[] = [];

  for (const target of smokeTargets(baseURL)) {
    console.log(`[perf] ${testInfo.project.name} measuring ${target.page}`);
    const sample = await measurePage({
      browser,
      browserName,
      project: testInfo.project.name,
      options: {
        userAgent: projectUse.userAgent,
        viewport: projectUse.viewport ?? undefined,
        deviceScaleFactor: projectUse.deviceScaleFactor,
        isMobile: projectUse.isMobile,
        hasTouch: projectUse.hasTouch,
        extraHTTPHeaders: projectUse.extraHTTPHeaders,
        baseURL: projectUse.baseURL,
      },
      target,
    });
    samples.push(sample);
    console.log(
      `[perf] ${sample.project} ${sample.page} ${sample.throttling} fcp=${sample.fcpMs ?? 'n/a'}ms firstView=${sample.firstViewBytes} largestFirstViewFile=${sample.largestFirstViewFileBytes} bytes=${sample.transferredBytes} requests=${sample.requestCount}`,
    );
  }

  const baseline = await publishProjectSamples({
    project: testInfo.project.name,
    samples,
    baseURL,
    enforced,
    budgets: { fcpMs: fcpBudgetMs, firstViewBytes: firstViewBudgetBytes, firstViewFileBytes: firstViewFileBudgetBytes },
  });
  await testInfo.attach('perf-baseline.json', {
    body: `${JSON.stringify(baseline, null, 2)}\n`,
    contentType: 'application/json',
  });

  const misses = samples.filter((sample) => {
    if (sample.throttling !== 'slow-3g') return false;
    const fcpOver = sample.fcpMs === null || sample.fcpMs >= fcpBudgetMs;
    const bytesOver = sample.firstViewBytes >= firstViewBudgetBytes;
    const fileOver = sample.largestFirstViewFileBytes >= firstViewFileBudgetBytes;
    return fcpOver || bytesOver || fileOver || !sample.loadFinished || Boolean(sample.error);
  });
  if (misses.length > 0) {
    testInfo.annotations.push({
      type: 'budget-miss',
      description: enforced
        ? 'Budget miss fails this test because ENFORCE_PERF_BUDGETS=1. Gates read Chromium slow-3g rows only.'
        : 'Reported only. Set ENFORCE_PERF_BUDGETS=1 to fail Chromium slow-3g rows that miss the budget. WebKit rows are unthrottled and are not gated.',
    });
  }

  if (enforced) {
    const details = misses.map(
      (sample) =>
        `${sample.page}: fcp=${sample.fcpMs ?? 'n/a'} firstView=${sample.firstViewBytes} largestFirstViewFile=${sample.largestFirstViewFileBytes} load=${sample.loadFinished} error=${sample.error ?? ''}`,
    );
    expect(details, 'Slow 3G perf budgets').toEqual([]);
  }
});
