import type { Page } from '@playwright/test';
import { expect, test } from './support';

/**
 * Unknown graduates must be a server HTTP 404, not a 200 shell and not a 500.
 *
 * Read-only: the document status is taken from the navigation response.
 * Anonymous signup and REST writes are aborted by the read-only guard.
 */

async function expectServer404(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: 'commit' });
  const status = response?.status() ?? 0;
  expect(status, `${path} must not be HTTP 200`).not.toBe(200);
  expect(status, `${path} must not be HTTP 500`).not.toBe(500);
  expect(status, `${path} must be HTTP 404 from the server`).toBe(404);
}

test('unknown slug /this-student-does-not-exist-qa123 returns HTTP 404', async ({ page }) => {
  await expectServer404(page, '/this-student-does-not-exist-qa123');
});

test('unknown student UUID returns HTTP 404', async ({ page }) => {
  const studentId = crypto.randomUUID();
  expect(studentId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  await expectServer404(page, `/${studentId}`);
});

test('very long garbage student id returns HTTP 404', async ({ page }) => {
  const garbage = `/not-a-student-${'x'.repeat(2048)}`;
  await expectServer404(page, garbage);
});
