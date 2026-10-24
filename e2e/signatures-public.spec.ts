import { expect, test } from './support';

/**
 * Placeholder for the preview RPC `signatures_public(p_id)`.
 * `get_board_signatures(p_id)` is an alias and must match.
 *
 * Contract, once a preview project exposes the functions:
 * - Hidden rows are left out of the response entirely.
 * - Private rows are included with `is_private: true` and `signatoryNote: null`.
 *   They keep signatoryName, the drawing (`signatureImageUrl`), and placement
 *   (`position.x`, `position.y`).
 * - No row includes signer ids, device or IP fields, or the raw
 *   `private_by_signer` / `hidden_by_owner` flags.
 *
 * A separate case guards the board id leak: an anon client must not list
 * signatures across boards without that board's id or slug.
 *
 * Every case stays `test.fixme`. They are skipped unless SUPABASE_PREVIEW_URL
 * is set. Read-only GET only. The anon key and the Vercel bypass secret are
 * not logged, and the bypass header is not forwarded to Supabase.
 */

const RPCS = ['signatures_public', 'get_board_signatures'] as const;

const FORBIDDEN_FIELDS = new Set([
  'ip',
  'ipaddress',
  'clientip',
  'signedip',
  'useragent',
  'device',
  'deviceid',
  'devicetype',
  'privatebysigner',
  'hiddenbyowner',
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/** Signer account ids. The signature row id and the board id are not signer ids. */
function isSignerIdField(normalized: string): boolean {
  if (normalized === 'id' || normalized === 'studentid' || normalized === 'signatureid') return false;
  return (
    normalized === 'signerid' ||
    normalized === 'signatoryid' ||
    normalized === 'userid' ||
    normalized === 'uid' ||
    normalized === 'useruid' ||
    normalized === 'authuid' ||
    normalized === 'authuserid' ||
    normalized.endsWith('signerid') ||
    normalized.endsWith('signatoryid') ||
    normalized.endsWith('userid')
  );
}

function forbiddenFields(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) forbiddenFields(entry, found);
    return found;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalizedKey(key);
      if (
        FORBIDDEN_FIELDS.has(normalized) ||
        normalized.endsWith('ipaddress') ||
        normalized.endsWith('useragent') ||
        isSignerIdField(normalized)
      ) {
        found.push(key);
      }
      forbiddenFields(child, found);
    }
  }
  return found;
}

export function rowsOf(body: unknown): Record<string, unknown>[] {
  const list = Array.isArray(body)
    ? body
    : body !== null && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: unknown[] }).data
      : body !== null && typeof body === 'object' && Array.isArray((body as { rows?: unknown }).rows)
        ? (body as { rows: unknown[] }).rows
        : [];
  return list.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object');
}

/**
 * Hidden rows are absent. Private rows keep the signer's name, drawing, and
 * placement, with `signatoryNote: null` and `is_private: true`. Signer ids,
 * device and IP fields, and the raw privacy flags are forbidden on every row.
 */
export function assertSignaturesPublic(body: unknown): void {
  expect(forbiddenFields(body), 'signer id, device, IP, or raw privacy flag').toEqual([]);
  for (const row of rowsOf(body)) {
    if (row.is_private !== true) continue;
    expect(row.signatoryNote, 'signatoryNote').toBeNull();
    expect(typeof row.signatoryName, 'signatoryName').toBe('string');
    expect(row.signatoryName, 'signatoryName').not.toBe('');
    expect(typeof row.signatureImageUrl, 'signatureImageUrl').toBe('string');
    expect(row.signatureImageUrl, 'signatureImageUrl').not.toBe('');
    const position = row.position as { x?: unknown; y?: unknown } | null | undefined;
    expect(typeof position?.x, 'position.x').toBe('number');
    expect(typeof position?.y, 'position.y').toBe('number');
  }
}

/** A 2xx body with one or more signature rows is a cross-board list. */
export function isCrossBoardSignatureList(status: number, body: unknown): boolean {
  if (status < 200 || status >= 300) return false;
  return rowsOf(body).length > 0;
}

function projectOrigin(preview: string): string {
  const url = new URL(preview);
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.origin;
}

function rpcUrl(preview: string, rpc: (typeof RPCS)[number], boardId?: string): string {
  const url = new URL(`/rest/v1/rpc/${rpc}`, projectOrigin(preview));
  if (boardId) url.searchParams.set('p_id', boardId);
  return url.toString();
}

function unscopedSignaturesUrl(preview: string): string {
  const url = new URL('/rest/v1/signatures', projectOrigin(preview));
  url.searchParams.set('select', '*');
  return url.toString();
}

function boardIdFromEnv(): string | undefined {
  const explicit = process.env.TEST_BOARD_ID?.trim();
  if (explicit) return explicit;
  const student = process.env.TEST_STUDENT_URL?.trim();
  if (!student) return undefined;
  try {
    const segment = new URL(student, 'http://localhost:3000').pathname.split('/').filter(Boolean)[0];
    return segment || undefined;
  } catch {
    return undefined;
  }
}

function anonHeaders(): Record<string, string> {
  const key = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!key) {
    throw new Error('Set SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY. The value is not logged.');
  }
  return {
    accept: 'application/json',
    apikey: key,
    authorization: `Bearer ${key}`,
  };
}

function skipWithoutPreview(): string | undefined {
  const preview = process.env.SUPABASE_PREVIEW_URL?.trim();
  test.skip(
    !preview,
    'Skipped: set SUPABASE_PREVIEW_URL to a preview Supabase project. Do not point this at production.',
  );
  return preview || undefined;
}

test('signatures_public(p_id) and its get_board_signatures alias omit hidden rows and null private notes', async ({
  playwright,
}) => {
  const preview = skipWithoutPreview();
  test.fixme(
    true,
    'Placeholder for signatures_public(p_id) and the get_board_signatures alias. Hidden rows are omitted. Private rows return is_private true, signatoryNote null, and keep signatoryName, signatureImageUrl, and position. No signer ids, device or IP fields, or private_by_signer / hidden_by_owner flags.',
  );
  if (!preview) return;

  const boardId = boardIdFromEnv();
  expect(boardId, 'Set TEST_BOARD_ID or TEST_STUDENT_URL to the preview board id or slug.').toBeTruthy();
  const api = await playwright.request.newContext({ extraHTTPHeaders: anonHeaders() });
  try {
    for (const rpc of RPCS) {
      const response = await api.get(rpcUrl(preview, rpc, boardId));
      expect(response.ok(), rpc).toBe(true);
      assertSignaturesPublic(await response.json());
    }
  } finally {
    await api.dispose();
  }
});

test('anon client cannot list signatures across boards without a board id or slug', async ({ playwright }) => {
  const preview = skipWithoutPreview();
  test.fixme(
    true,
    'Board id leak: an anon client must not list signatures across boards without the board id or slug. Unscoped signatures, signatures_public without p_id, and get_board_signatures without p_id must not return rows.',
  );
  if (!preview) return;

  const api = await playwright.request.newContext({ extraHTTPHeaders: anonHeaders() });
  try {
    const unscoped = await api.get(unscopedSignaturesUrl(preview));
    const unscopedBody: unknown = await unscoped.json().catch(() => null);
    expect(isCrossBoardSignatureList(unscoped.status(), unscopedBody), 'unscoped signatures list').toBe(false);

    for (const rpc of RPCS) {
      const missingId = await api.get(rpcUrl(preview, rpc));
      const missingBody: unknown = await missingId.json().catch(() => null);
      expect(isCrossBoardSignatureList(missingId.status(), missingBody), `${rpc} without p_id`).toBe(false);
    }
  } finally {
    await api.dispose();
  }
});
