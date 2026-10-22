import type { Page } from '@playwright/test';
import { expect, test } from './support';

/**
 * Cache-Control for unknown boards, from the ruling on
 * https://github.com/kayode96-max/Signpen_V2/pull/17.
 *
 * 1. An id that is neither a UUID nor a slug (`^[a-z0-9]+(-[a-z0-9]+)*$`,
 *    3 to 30 characters) is a 404 with a short public cache: `s-maxage` of
 *    about 60. An 80-character id and a 2048-character id are both in this
 *    bucket.
 * 2. A valid but unknown UUID, and a valid but unknown slug such as
 *    `qa-unknown-2026`, are a 404 whose `Cache-Control` contains `no-store`.
 * 3. An error from the board page, or from
 *    `GET /api/boards/[studentId]/signatures`, sends `no-store`. That case
 *    stays `test.fixme` until a failure can be forced, and it is skipped
 *    unless `SUPABASE_PREVIEW_URL` is set.
 *
 * Cases 1 and 2 are `test.fail` on main. The server still returns 200 for
 * these paths. Remove `test.fail` when #17 is on main.
 * Read-only. The status and header come from the document response.
 */

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXPECTED_ON_MAIN =
  'Expected to fail on main. Unknown-board cache headers land in https://github.com/kayode96-max/Signpen_V2/pull/17. Remove test.fail when that fix is on main.';

function isSlug(value: string): boolean {
  return value.length >= 3 && value.length <= 30 && SLUG_PATTERN.test(value);
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function cacheControlOf(headers: Record<string, string>): string {
  return headers['cache-control'] ?? '';
}

/** Short public cache from the #17 ruling: s-maxage of about 60, not no-store. */
function expectShortPublicCache(header: string): void {
  expect(header.toLowerCase(), 'malformed ids are a public cache, not no-store').not.toContain('no-store');
  const match = /(?:^|,)\s*s-maxage=(\d+)\b/i.exec(header);
  expect(match, `Cache-Control should include s-maxage of about 60, received "${header}"`).not.toBeNull();
  const age = Number(match?.[1]);
  expect(age, 's-maxage of about 60').toBeGreaterThanOrEqual(30);
  expect(age, 's-maxage of about 60').toBeLessThanOrEqual(120);
}

function expectNoStore(header: string): void {
  expect(header.toLowerCase(), `Cache-Control should contain no-store, received "${header}"`).toContain('no-store');
}

async function openBoard(page: Page, studentId: string): Promise<{ status: number; cacheControl: string }> {
  const response = await page.goto(`/${studentId}`, { waitUntil: 'commit' });
  const status = response?.status() ?? 0;
  const cacheControl = response ? cacheControlOf(response.headers()) : '';
  return { status, cacheControl };
}

function noteExpectedFailure(): void {
  test.info().annotations.push({ type: 'known-bug', description: EXPECTED_ON_MAIN });
}

test.fail('80-character garbage id returns 404 with a short public cache', async ({ page }) => {
  noteExpectedFailure();
  const studentId = 'x'.repeat(80);
  expect(isUuid(studentId), '80-character id is not a UUID').toBe(false);
  expect(isSlug(studentId), '80-character id is not a slug').toBe(false);
  const result = await openBoard(page, studentId);
  expect(result.status, 'malformed id').toBe(404);
  expectShortPublicCache(result.cacheControl);
});

test.fail('2048-character garbage id returns 404 with a short public cache', async ({ page }) => {
  noteExpectedFailure();
  const studentId = 'x'.repeat(2048);
  expect(isUuid(studentId), '2048-character id is not a UUID').toBe(false);
  expect(isSlug(studentId), '2048-character id is not a slug').toBe(false);
  const result = await openBoard(page, studentId);
  expect(result.status, 'malformed id').toBe(404);
  expectShortPublicCache(result.cacheControl);
});

test.fail('unknown UUID returns 404 with Cache-Control no-store', async ({ page }) => {
  noteExpectedFailure();
  const studentId = crypto.randomUUID();
  expect(isUuid(studentId), 'fixture UUID').toBe(true);
  expect(isSlug(studentId), 'a UUID is not a slug').toBe(false);
  const result = await openBoard(page, studentId);
  expect(result.status, 'unknown UUID').toBe(404);
  expectNoStore(result.cacheControl);
});

test.fail('unknown slug qa-unknown-2026 returns 404 with Cache-Control no-store', async ({ page }) => {
  noteExpectedFailure();
  const studentId = 'qa-unknown-2026';
  expect(isSlug(studentId), 'qa-unknown-2026 is a slug').toBe(true);
  expect(isUuid(studentId), 'qa-unknown-2026 is not a UUID').toBe(false);
  const result = await openBoard(page, studentId);
  expect(result.status, 'unknown slug').toBe(404);
  expectNoStore(result.cacheControl);
});

test('board page and signatures API errors send Cache-Control no-store', async () => {
  const preview = process.env.SUPABASE_PREVIEW_URL?.trim();
  test.skip(
    !preview,
    'Skipped: set SUPABASE_PREVIEW_URL to a preview Supabase project. Do not point this at production.',
  );
  test.fixme(
    true,
    'Placeholder until a board lookup or GET /api/boards/[studentId]/signatures can be forced to fail. That error must send Cache-Control: no-store.',
  );
  throw new Error(
    'No fault injection yet. Force the board page and GET /api/boards/[studentId]/signatures to fail, then expect Cache-Control to contain no-store.',
  );
});
