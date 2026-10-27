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
      let layout = await horizontalOverflow(page);
      // /contact's support card enters with translateX(20px) for 0.6s. On a
      // 390px iPhone that card sticks out until the entrance ends, and the
      // fixed wait above races hydration, so the first sample sometimes sees
      // a few pixels of that card (or a document scrollWidth with no element).
      // The same check has passed and failed on unchanged 15.3.6 builds.
      // Sample again after animations settle. An overflow that remains is real.
      if (layout.overflow) {
        await page.evaluate(async () => {
          const pending = document.getAnimations().map((animation) => animation.finished);
          await Promise.race([
            Promise.all(pending),
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);
        });
        await page.waitForTimeout(1000);
        layout = await horizontalOverflow(page);
      }
      expect(
        layout.overflow,
        `horizontal overflow at mobile width: ${layout.offenders.join('; ') || 'document scrollWidth'}`,
      ).toBe(false);
    }

    expect(consoleErrors.errors(), `${path} console errors`).toEqual([]);
  });
}
