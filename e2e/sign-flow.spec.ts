import type { APIRequestContext } from '@playwright/test';
import { test } from './support';

/**
 * Placeholder for the write path. Not part of the read-only smoke.
 * A later change should open TEST_STUDENT_URL, sign, and assert the signature
 * was saved within 60 seconds. That needs a seeded graduate on the preview
 * Supabase project. Never point TEST_STUDENT_URL at production.
 *
 * Before any write, the deployment must be signpen-preview
 * (vackuntdjgfmxhwxjuqt). Production (signpen.xyz or the production Supabase)
 * aborts the test.
 */

const PREVIEW_SUPABASE_REF = 'vackuntdjgfmxhwxjuqt';
const PRODUCTION_SUPABASE_REF = 'avsguiynrukacgqnxwku';

function collectRefs(text: string, refs: Set<string>): void {
  for (const match of text.matchAll(/https:\/\/([a-z0-9-]+)\.supabase\.co/gi)) {
    refs.add(match[1].toLowerCase());
  }
}

async function supabaseRefs(request: APIRequestContext, pageUrl: string): Promise<Set<string>> {
  const origin = new URL(pageUrl).origin;
  const refs = new Set<string>();
  const seen = new Set<string>();
  const queue = [pageUrl];

  while (queue.length > 0 && seen.size < 25) {
    const target = queue.shift();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    const response = await request.get(target);
    const text = await response.text();
    collectRefs(text, refs);
    if (seen.size === 1) {
      for (const match of text.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)) {
        const next = new URL(match[1], target);
        if (next.origin === origin) queue.push(next.href);
      }
    }
  }

  return refs;
}

test('sign flow: link tap to signature saved within 60 seconds', async ({ request }) => {
  const studentUrl = process.env.TEST_STUDENT_URL?.trim();
  test.skip(
    !studentUrl,
    'Skipped: set TEST_STUDENT_URL to a seeded test graduate on the preview Supabase project.',
  );

  let target: URL;
  try {
    target = new URL(studentUrl!);
  } catch {
    throw new Error('TEST_STUDENT_URL must be an absolute URL on a preview deployment.');
  }
  const host = target.hostname.toLowerCase();
  if (host === 'signpen.xyz' || host === 'www.signpen.xyz' || host.endsWith('.signpen.xyz')) {
    throw new Error('Refusing to write against production signpen.xyz.');
  }

  const refs = await supabaseRefs(request, `${target.origin}/`);
  if (refs.has(PRODUCTION_SUPABASE_REF) || !refs.has(PREVIEW_SUPABASE_REF)) {
    const found = [...refs].join(', ') || 'none';
    throw new Error(
      `Refusing to write. Supabase refs on this deployment: ${found}. Writes require ${PREVIEW_SUPABASE_REF}.`,
    );
  }

  test.setTimeout(60_000);
  test.fixme(true, 'Placeholder. The 60-second sign flow is not implemented in this read-only suite.');
});
