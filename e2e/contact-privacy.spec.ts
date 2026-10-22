import type { Page } from '@playwright/test';
import { expect, jsonHasEmailField, test } from './support';

/**
 * Privacy guards for `/contact`. Read-only: no form submission.
 *
 * No GitHub issue is open; this file is the guard. `test.fail(condition)`
 * marks a run expected-to-fail only when that bug is reproduced, so a local
 * `next start` with no feedback payload stays green and a preview that still
 * leaks does not turn the suite red. Remove the `test.fail(...)` call once
 * the fix merges and the assertion passes on a preview.
 *
 * 1. Feedback emails (reproduced on production signpen.xyz)
 *    The live feed loads `feedback` with `select('*')`, so the JSON includes
 *    the `email` column even though the UI does not render it.
 *    https://github.com/kayode96-max/Signpen_V2/blob/main/src/app/contact/page.tsx#L79
 *    https://github.com/kayode96-max/Signpen_V2/blob/main/src/supabase/db-hooks.tsx#L176
 *
 * 2. signed_ips
 *    `/contact` must not request the `signed_ips` table (IP addresses used
 *    for spam control). The client read lives in the shared data layer and
 *    the public signing page. Current production `/contact` does not issue
 *    it; this test fails expectedly if it starts to.
 *    https://github.com/kayode96-max/Signpen_V2/blob/main/src/supabase/db-hooks.tsx#L38
 *    https://github.com/kayode96-max/Signpen_V2/blob/main/src/components/signature/public-sign-out-page.tsx#L83
 */

const FEEDBACK_URL = /\/rest\/v1\/feedback(?:\?|$)/;
const SIGNED_IPS_URL = /\/rest\/v1\/signed_ips(?:\?|$)/;

function isFeedback(url: string): boolean {
  return FEEDBACK_URL.test(url);
}

async function openContact(page: Page): Promise<void> {
  await page.goto('/contact', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Drop a Review, Comment, or Message/i })).toBeVisible();
}

test('contact feedback responses do not include an email field', async ({ page }) => {
  let leaked = false;
  const pending: Promise<void>[] = [];
  let settle: () => void = () => {};
  const attempt = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 12_000);
    settle = () => {
      clearTimeout(timer);
      resolve();
    };
  });

  page.on('response', (response) => {
    if (!isFeedback(response.url())) return;
    settle();
    pending.push(
      (async () => {
        try {
          const body: unknown = await response.json();
          // Field names only. Values (the addresses themselves) are never stored.
          if (jsonHasEmailField(body)) leaked = true;
        } catch {
          // Non-JSON bodies have no email field.
        }
      })(),
    );
  });
  page.on('requestfailed', (request) => {
    if (isFeedback(request.url())) settle();
  });

  await openContact(page);
  await attempt;
  await Promise.all(pending);

  // Known critical bug: production feedback responses include `email`.
  // https://github.com/kayode96-max/Signpen_V2/blob/main/src/app/contact/page.tsx#L79
  test.fail(
    leaked,
    'Known critical bug: a feedback response included an email field. Remove test.fail() when the contact feed stops returning email.',
  );
  test.info().annotations.push({
    type: 'privacy-guard',
    description: leaked
      ? 'feedback email field present (expected failure)'
      : 'no email field on feedback responses',
  });
  console.log(`[privacy] feedback email field: ${leaked ? 'present' : 'absent'}`);
  expect(leaked, 'feedback responses must not include an email field').toBe(false);
});

test('contact page does not request signed_ips', async ({ page }) => {
  const signedIpsRequests: string[] = [];

  page.on('request', (request) => {
    const url = request.url();
    const postData = request.postData() ?? '';
    if (SIGNED_IPS_URL.test(url) || postData.includes('signed_ips')) {
      signedIpsRequests.push(`${request.method()} ${url.split('?')[0]}`);
    }
  });
  page.on('websocket', (socket) => {
    socket.on('framesent', (frame) => {
      const payload = typeof frame.payload === 'string' ? frame.payload : '';
      if (payload.includes('signed_ips')) signedIpsRequests.push('websocket realtime frame');
    });
  });

  await openContact(page);
  // The feed request settles quickly; allow the realtime join to be sent.
  await page.waitForTimeout(2000);

  // Known critical bug class: client reads of signed_ips.
  // https://github.com/kayode96-max/Signpen_V2/blob/main/src/supabase/db-hooks.tsx#L38
  test.fail(
    signedIpsRequests.length > 0,
    'Known critical bug: /contact requested signed_ips. Remove test.fail() when that request is gone.',
  );
  test.info().annotations.push({
    type: 'privacy-guard',
    description:
      signedIpsRequests.length > 0
        ? `signed_ips requested (${signedIpsRequests.length})`
        : 'no signed_ips request',
  });
  console.log(`[privacy] signed_ips requests: ${signedIpsRequests.length}`);
  expect(signedIpsRequests, 'contact must not request signed_ips').toEqual([]);
});
