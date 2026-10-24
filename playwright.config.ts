import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

/**
 * Read-only smoke suite. Point BASE_URL at a local `next start` or a Vercel preview.
 * Never commits secrets. The Vercel bypass value is read from the environment and
 * is not printed.
 */
const baseURL = process.env.BASE_URL || 'http://localhost:3000';

/** Set only when Vercel deployment protection is on. Empty means do not send the headers. */
function vercelBypassHeaders(): Record<string, string> | undefined {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) return undefined;
  return {
    'x-vercel-protection-bypass': secret,
    'x-vercel-set-bypass-cookie': 'true',
  };
}

const bypassHeaders = vercelBypassHeaders();
const mobileAndPerf = /(?:public-pages|perf-baseline|qa-17)\.spec\.ts/;

const config: PlaywrightTestConfig = {
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // A failure trace would store request headers, including the bypass secret.
    trace: bypassHeaders ? 'off' : 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ...(bypassHeaders ? { extraHTTPHeaders: bypassHeaders } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Pixel 5',
      use: { ...devices['Pixel 5'] },
      testMatch: mobileAndPerf,
    },
    {
      name: 'iPhone 12',
      use: { ...devices['iPhone 12'] },
      testMatch: mobileAndPerf,
    },
  ],
};

export default defineConfig(config);
