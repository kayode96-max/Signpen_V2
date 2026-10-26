import type { Page } from '@playwright/test';
import { expect, test } from './support';

/**
 * Unknown graduates must be a server HTTP 404, not a 200 shell and not a 500.
 *
 * Today `[studentId]/page.tsx` always renders the client page, and
 * `notFound()` runs only after the browser fetches the student
 * (src/components/signature/public-sign-out-page.tsx). The document status
 * stays 200. These tests are expected to fail until that fix merges.
 * Remove `test.fail` once the server returns 404.
 *
 * Read-only: the document status is taken from the navigation response.
 * Anonymous signup and REST writes are aborted by the read-only guard.
 */
const KNOWN_BUG =
  'Unknown student routes still return HTTP 200. The server should return 404. Remove test.fail when the 404 fix merges.';

async function expectServer404(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: 'commit' });
  const status = response?.status() ?? 0;
  expect(status, `${path} must not be HTTP 200`).not.toBe(200);
  expect(status, `${path} must not be HTTP 500`).not.toBe(500);
  expect(status, `${path} must be HTTP 404 from the server`).toBe(404);
}

test.fail('unknown slug /this-student-does-not-exist-qa123 returns HTTP 404', async ({ page }) => {
  test.info().annotations.push({ type: 'known-bug', description: KNOWN_BUG });
  await expectServer404(page, '/this-student-does-not-exist-qa123');
});

test.fail('unknown student UUID returns HTTP 404', async ({ page }) => {
  test.info().annotations.push({ type: 'known-bug', description: KNOWN_BUG });
  const studentId = crypto.randomUUID();
  expect(studentId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  await expectServer404(page, `/${studentId}`);
});

test.fail('very long garbage student id returns HTTP 404', async ({ page }) => {
  test.info().annotations.push({ type: 'known-bug', description: KNOWN_BUG });
  const garbage = `/not-a-student-${'x'.repeat(2048)}`;
  await expectServer404(page, garbage);
});
