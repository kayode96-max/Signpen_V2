import type { Page } from '@playwright/test';
import { collectConsole, expect, horizontalOverflow, test } from './support';

/**
 * Read-only. These tests never fill inputs or submit forms.
 * Mobile projects (Pixel 5, iPhone 12) also assert there is no horizontal overflow.
 *
 * Login's "Welcome Back" title is a CardTitle div, not a heading, and the
 * marketing h1 is hidden below the md breakpoint. Match visible text instead.
 */
const PAGES: { path: '/' | '/contact' | '/login'; ready: (page: Page) => ReturnType<Page['getByRole']> }[] = [
  {
    path: '/',
    ready: (page) => page.getByRole('heading', { name: /Your Digital Yearbook, Reimagined/i }),
  },
  {
    path: '/contact',
    ready: (page) => page.getByRole('heading', { name: /Drop a Review, Comment, or Message/i }),
  },
  {
    path: '/login',
    ready: (page) => page.getByText('Welcome Back', { exact: true }),
  },
];

for (const { path, ready } of PAGES) {
  test(`${path} returns HTTP 200 without console errors`, async ({ page, isMobile }) => {
    const consoleErrors = collectConsole(page);
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

    expect(response, `${path} navigation`).not.toBeNull();
    expect(response?.status(), `${path} status`).toBe(200);

    await expect(ready(page)).toBeVisible();
    // Client effects (auth session, contact feed) log shortly after first paint.
    await page.waitForTimeout(1500);

    if (isMobile) {
      const layout = await horizontalOverflow(page);
      expect(
        layout.overflow,
        `horizontal overflow at mobile width: ${layout.offenders.join('; ') || 'document scrollWidth'}`,
      ).toBe(false);
    }

    expect(consoleErrors.errors(), `${path} console errors`).toEqual([]);
  });
}
