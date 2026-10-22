import { expect, test } from './support';
import { measurePage, publishProjectSamples, smokeTargets, type PerfSample } from './perf-baseline';

/**
 * Read-only page-weight baseline for `/`, `/contact`, `/login`, and (when
 * TEST_STUDENT_URL is set) the board page. Desktop Chromium and Pixel 5 use
 * Chrome DevTools Slow 3G plus 4x CPU throttling. iPhone 12 is WebKit, which
 * has no CDP throttle, so those rows are marked unthrottled.
 *
 * Report-only unless ENFORCE_PERF_BUDGETS=1. Budgets then apply to throttled
 * rows only. The merged file is e2e/results/perf-baseline.json.
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
  const transferBudgetBytes = budget('TRANSFER_BUDGET_BYTES', 1024 * 1024);
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
      `[perf] ${sample.project} ${sample.page} ${sample.throttling} fcp=${sample.fcpMs ?? 'n/a'}ms bytes=${sample.transferredBytes} requests=${sample.requestCount}`,
    );
  }

  const baseline = await publishProjectSamples({
    project: testInfo.project.name,
    samples,
    baseURL,
    enforced,
    budgets: { fcpMs: fcpBudgetMs, transferredBytes: transferBudgetBytes },
  });
  await testInfo.attach('perf-baseline.json', {
    body: `${JSON.stringify(baseline, null, 2)}\n`,
    contentType: 'application/json',
  });

  const misses = samples.filter((sample) => {
    if (sample.throttling !== 'slow-3g') return false;
    const fcpOver = sample.fcpMs === null || sample.fcpMs >= fcpBudgetMs;
    const bytesOver = sample.transferredBytes >= transferBudgetBytes;
    return fcpOver || bytesOver || !sample.loadFinished || Boolean(sample.error);
  });
  if (misses.length > 0) {
    testInfo.annotations.push({
      type: 'budget-miss',
      description: enforced
        ? 'Budget miss fails this test because ENFORCE_PERF_BUDGETS=1.'
        : 'Reported only. Set ENFORCE_PERF_BUDGETS=1 to fail throttled rows that miss the budget.',
    });
  }

  if (enforced) {
    const details = misses.map(
      (sample) =>
        `${sample.page}: fcp=${sample.fcpMs ?? 'n/a'} bytes=${sample.transferredBytes} load=${sample.loadFinished} error=${sample.error ?? ''}`,
    );
    expect(details, 'Slow 3G perf budgets').toEqual([]);
  }
});
