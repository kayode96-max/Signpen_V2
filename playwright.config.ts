import { defineConfig, devices } from '@playwright/test';

/**
 * Read-only smoke suite. Point BASE_URL at a local `next start` or a Vercel preview.
 * Never commits secrets; the suite does not read service-role keys.
 */
const baseURL = process.env.BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Pixel 5',
      use: { ...devices['Pixel 5'] },
      testMatch: /public-pages\.spec\.ts/,
    },
    {
      name: 'iPhone 12',
      use: { ...devices['iPhone 12'] },
      testMatch: /public-pages\.spec\.ts/,
    },
  ],
});
