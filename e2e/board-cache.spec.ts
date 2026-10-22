import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './support';

/**
 * Cache-Control for unknown boards, from
 * https://github.com/kayode96-max/Signpen_V2/pull/17.
 *
 * Headers are on `GET /api/boards/[id]/signatures`, not on the shirt page.
 * The page HTML is always `private, no-store`, so the document is only
 * checked for HTTP 404 and for a `Cache-Control` that does not contain
 * `s-maxage`.
 *
 * 1. An id that is neither a UUID nor a slug (`^[a-z0-9]+(-[a-z0-9]+)*$`,
 *    3 to 30 characters) is an API 404 with a short public cache: `s-maxage`
 *    of about 60. An 80-character id and a 2048-character id are both in
 *    this bucket. These run anywhere.
 * 2. `qa-unknown-2026` is a well-formed slug. Slug lookup is not wired, so
 *    the API returns 404 with `no-store` and does not call Supabase. This
 *    runs anywhere.
 * 3. A valid but unknown UUID is an API 404 with `no-store` only when
 *    `SUPABASE_PREVIEW_URL` is set. Without a reachable Supabase the same
 *    request is a lookup failure: 500 with `no-store`, not a 404.
 * 4. That lookup failure is the error case. It runs when
 *    `SUPABASE_PREVIEW_URL` is unset and expects `no-store`.
 *
 * Every case is `test.fail` on main. Main still answers the shirt page with
 * 200 and has no signatures route. Remove `test.fail` when #17 is on main.
 * Read-only. Both checks are GETs.
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
  expect(header.toLowerCase(), `Cache-Control should contain no-store, received "${header}"`).toContain(
    'no-store',
  );
}

/** Shirt HTML is always private, no-store. Do not require s-maxage or no-store on the document. */
function expectShirt404(status: number, cacheControl: string): void {
  expect(status, 'shirt page').toBe(404);
  expect(
    cacheControl.toLowerCase(),
    `shirt page Cache-Control must not contain s-maxage, received "${cacheControl}"`,
  ).not.toContain('s-maxage');
}

async function openBoard(page: Page, studentId: string): Promise<{ status: number; cacheControl: string }> {
  const response = await page.goto(`/${encodeURIComponent(studentId)}`, { waitUntil: 'commit' });
  const status = response?.status() ?? 0;
  const cacheControl = response ? cacheControlOf(response.headers()) : '';
  return { status, cacheControl };
}

async function getSignatures(
  request: APIRequestContext,
  studentId: string,
): Promise<{ status: number; cacheControl: string }> {
  const response = await request.get(`/api/boards/${encodeURIComponent(studentId)}/signatures`);
  return {
    status: response.status(),
    cacheControl: cacheControlOf(response.headers()),
  };
}

function noteExpectedFailure(): void {
  test.info().annotations.push({ type: 'known-bug', description: EXPECTED_ON_MAIN });
}

test.fail('80-character garbage id returns an API 404 with a short public cache', async ({ page, request }) => {
  noteExpectedFailure();
  const studentId = 'x'.repeat(80);
  expect(isUuid(studentId), '80-character id is not a UUID').toBe(false);
  expect(isSlug(studentId), '80-character id is not a slug').toBe(false);
  const api = await getSignatures(request, studentId);
  expect(api.status, 'malformed id').toBe(404);
  expectShortPublicCache(api.cacheControl);
  const shirt = await openBoard(page, studentId);
  expectShirt404(shirt.status, shirt.cacheControl);
});

test.fail('2048-character garbage id returns an API 404 with a short public cache', async ({ page, request }) => {
  noteExpectedFailure();
  const studentId = 'x'.repeat(2048);
  expect(isUuid(studentId), '2048-character id is not a UUID').toBe(false);
  expect(isSlug(studentId), '2048-character id is not a slug').toBe(false);
  const api = await getSignatures(request, studentId);
  expect(api.status, 'malformed id').toBe(404);
  expectShortPublicCache(api.cacheControl);
  const shirt = await openBoard(page, studentId);
  expectShirt404(shirt.status, shirt.cacheControl);
});

test('unknown UUID returns an API 404 with Cache-Control no-store', async ({ page, request }) => {
  const preview = process.env.SUPABASE_PREVIEW_URL?.trim();
  test.skip(
    !preview,
    'Without a reachable Supabase a valid UUID is a 500 from the signatures API, not a 404. Set SUPABASE_PREVIEW_URL to a preview project. Do not point this at production.',
  );
  test.fail(true, EXPECTED_ON_MAIN);
  noteExpectedFailure();
  const studentId = crypto.randomUUID();
  expect(isUuid(studentId), 'fixture UUID').toBe(true);
  expect(isSlug(studentId), 'a UUID is not a slug').toBe(false);
  const api = await getSignatures(request, studentId);
  expect(api.status, 'unknown UUID').toBe(404);
  expectNoStore(api.cacheControl);
  const shirt = await openBoard(page, studentId);
  expectShirt404(shirt.status, shirt.cacheControl);
});

test.fail('unknown slug qa-unknown-2026 returns an API 404 with Cache-Control no-store', async ({ page, request }) => {
  noteExpectedFailure();
  const studentId = 'qa-unknown-2026';
  expect(isSlug(studentId), 'qa-unknown-2026 is a slug').toBe(true);
  expect(isUuid(studentId), 'qa-unknown-2026 is not a UUID').toBe(false);
  const api = await getSignatures(request, studentId);
  expect(api.status, 'unknown slug').toBe(404);
  expectNoStore(api.cacheControl);
  const shirt = await openBoard(page, studentId);
  expectShirt404(shirt.status, shirt.cacheControl);
});

test('signatures API errors return Cache-Control no-store', async ({ request }) => {
  const preview = process.env.SUPABASE_PREVIEW_URL?.trim();
  test.skip(
    Boolean(preview),
    'With SUPABASE_PREVIEW_URL, an unknown UUID is the 404 case. This covers the lookup failure (500, no-store) when Supabase is unreachable.',
  );
  test.fail(true, EXPECTED_ON_MAIN);
  noteExpectedFailure();
  const studentId = crypto.randomUUID();
  expect(isUuid(studentId), 'fixture UUID').toBe(true);
  const api = await getSignatures(request, studentId);
  expect(api.status, 'lookup failure').toBe(500);
  expectNoStore(api.cacheControl);
});
