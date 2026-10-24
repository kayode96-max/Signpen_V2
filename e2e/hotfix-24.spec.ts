import { expect, request as newRequest, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Security checks for hotfix PR #24, against that PR's Vercel preview only.
 * Writes (signup, sign, storage) run only after the deployment's client bundle
 * points at preview Supabase vackuntdjgfmxhwxjuqt. Production is refused.
 *
 * The workflow sets E2E_HOTFIX=1 when this spec is selected. Other smoke runs
 * skip the file so they do not write.
 */

const PREVIEW_REF = 'vackuntdjgfmxhwxjuqt';
const PRODUCTION_REF = 'avsguiynrukacgqnxwku';
const PROBE_IP = '203.0.113.77';
const SPOOF_IP = '203.0.113.88';
/** Preview board named for this final run. Override with TEST_BOARD_ID. */
const BOARD_ID = process.env.TEST_BOARD_ID?.trim() || '512025e9-9b28-40a8-8322-8a01711aa4bc';

type CaseResult = {
  name: string;
  status: 'pass' | 'fail' | 'blocked';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  evidence: string;
};

type RecordCase = (
  name: string,
  ok: boolean | 'blocked',
  severity: CaseResult['severity'],
  evidence: string,
) => void;

type Session = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: { id?: string; email?: string; is_anonymous?: boolean };
};

function redact(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]')
    .replace(/bearer\s+\S+/gi, 'bearer [redacted]')
    .slice(0, 400);
}

function snippet(status: number, body: string): string {
  return `HTTP ${status} ${redact(body).replace(/\s+/g, ' ')}`;
}

function anonymousDisabled(error: string): boolean {
  return /anonymous_provider_disabled|anonymous sign-ins are disabled/i.test(error);
}

function serviceKeyMissing(status: number, body: string): boolean {
  return status === 503 && /temporarily unavailable|service role|not configured|SUPABASE_SERVICE_ROLE_KEY/i.test(body);
}

test.describe('PR 24 security hotfix', () => {
  test.skip(
    process.env.E2E_HOTFIX !== '1',
    'E2E_HOTFIX=1 runs this file against the preview Supabase only',
  );

  test('preview lockdown', async ({ page, request }) => {
    test.setTimeout(300_000);
    const results: CaseResult[] = [];
    const record: RecordCase = (name, ok, severity, evidence) => {
      const status = ok === 'blocked' ? 'blocked' : ok ? 'pass' : 'fail';
      results.push({ name, status, severity: status === 'pass' ? 'none' : severity, evidence });
      console.log(`[hotfix] ${status.toUpperCase()} ${name} :: ${evidence}`);
    };

    const baseURL = process.env.BASE_URL || 'http://localhost:3000';
    const appHost = new URL(baseURL).hostname.toLowerCase();
    if (
      appHost === 'signpen.xyz' ||
      appHost === 'www.signpen.xyz' ||
      appHost.endsWith('.signpen.xyz')
    ) {
      throw new Error('Refusing to run against production signpen.xyz');
    }

    const discovered = await discoverSupabase(page, request, baseURL);
    const liveRefs = discovered.refs.filter((ref) => ref !== 'placeholder');
    const previewOk = liveRefs.includes(PREVIEW_REF) && !liveRefs.includes(PRODUCTION_REF);
    if (!previewOk || !discovered.supabaseUrl || !discovered.anonKey) {
      throw new Error(
        `Refusing writes. Live Supabase refs: ${liveRefs.join(', ') || 'none'}. ` +
          `Anon key ${discovered.anonKey ? 'found' : 'missing'}. ` +
          'Writes require preview project vackuntdjgfmxhwxjuqt and must not see production.',
      );
    }
    console.log(
      `[hotfix] preview supabase ${PREVIEW_REF} anon key present; bypass follows Playwright headers`,
    );

    const anon = await newRequest.newContext({
      extraHTTPHeaders: {
        apikey: discovered.anonKey,
        Authorization: `Bearer ${discovered.anonKey}`,
      },
    });

    let anonymous: Session | null = null;
    let anonymousError = '';

    try {
      await caseColumnReads(anon, discovered.supabaseUrl, discovered.anonKey, null, record);
      const anonSignIn = await anonymousSession(anon, discovered.supabaseUrl, discovered.anonKey);
      anonymous = anonSignIn.session;
      anonymousError = anonSignIn.error;
      if (anonymous?.access_token) {
        const authed = await newRequest.newContext({
          extraHTTPHeaders: {
            apikey: discovered.anonKey,
            Authorization: `Bearer ${anonymous.access_token}`,
          },
        });
        try {
          await caseColumnReads(
            authed,
            discovered.supabaseUrl,
            discovered.anonKey,
            'anonymous-session',
            record,
          );
        } finally {
          await authed.dispose();
        }
      } else {
        record(
          '1 anon reads (anonymous session)',
          anonymousDisabled(anonymousError) ? 'blocked' : false,
          'low',
          anonymousError || 'anonymous sign-in returned no session',
        );
      }

      await caseRpcs(anon, discovered.supabaseUrl, 'no-session', record);
      if (anonymous?.access_token) {
        const authed = await newRequest.newContext({
          extraHTTPHeaders: {
            apikey: discovered.anonKey,
            Authorization: `Bearer ${anonymous.access_token}`,
          },
        });
        try {
          await caseRpcs(authed, discovered.supabaseUrl, 'anonymous-session', record);
        } finally {
          await authed.dispose();
        }
      } else {
        record(
          '7 RPCs (anonymous session)',
          anonymousDisabled(anonymousError) ? 'blocked' : false,
          'low',
          `anonymous session unavailable (${anonymousError || 'no token'}), so this half was not called`,
        );
      }

      await caseClientBundle(request, baseURL, record);
      await casePublicRpcShape(anon, discovered.supabaseUrl, discovered.anonKey, '', record);

      record(
        '4 owner signup',
        'blocked',
        'low',
        'skipped: owner password login is covered separately',
      );

      await caseFeedbackWall(page, baseURL, record);
      await caseStorageLoggedOut(discovered.supabaseUrl, discovered.anonKey, record);
      await caseAnonymousSigning(page, request, baseURL, anon, discovered.supabaseUrl, discovered.anonKey, anonymous, anonymousError, record);
      await caseDashboardLoggedOut(page, baseURL, record);
    } finally {
      await anon.dispose();
    }

    const failed = results.filter((item) => item.status === 'fail');
    const blocked = results.filter((item) => item.status === 'blocked');
    const passed = results.filter((item) => item.status === 'pass');
    console.log(`[hotfix] ${passed.length} passed, ${failed.length} failed, ${blocked.length} blocked`);
    expect(failed, failed.map((item) => `${item.name}: ${item.evidence}`).join('\n')).toEqual([]);
  });
});

async function discoverSupabase(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
): Promise<{ supabaseUrl: string; anonKey: string; refs: string[] }> {
  const origin = new URL(baseURL).origin;
  const refs = new Set<string>();
  let anonKey = '';
  const rememberKey = (value: string | undefined) => {
    if (!anonKey && value && value !== 'placeholder' && value.length > 20) anonKey = value;
  };
  const note = (text: string) => {
    for (const match of text.matchAll(/https:\/\/([a-z0-9-]+)\.supabase\.co/gi)) {
      refs.add(match[1].toLowerCase());
    }
    const jwt = text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
    const publishable = text.match(/sb_publishable_[A-Za-z0-9_-]{20,}/);
    rememberKey(jwt?.[0] ?? publishable?.[0]);
  };
  page.on('request', (req) => {
    const match = req.url().match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
    if (match) refs.add(match[1].toLowerCase());
    rememberKey(req.headers().apikey);
  });

  const contact = await page.goto(new URL('/contact', origin).href, { waitUntil: 'domcontentloaded' });
  if ((contact?.status() ?? 0) === 401 || (contact?.status() ?? 0) === 403) {
    throw new Error(`Preview is behind a Vercel login wall (HTTP ${contact?.status()})`);
  }
  note(await page.content());

  const queue = [new URL('/', origin).href, new URL('/contact', origin).href, new URL('/login', origin).href];
  const seen = new Set<string>();
  while (queue.length > 0 && seen.size < 40 && !anonKey) {
    const target = queue.shift();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    const response = await request.get(target, { maxRedirects: 5 });
    if (response.status() === 401 || response.status() === 403) {
      throw new Error(`Preview is behind a Vercel login wall (HTTP ${response.status()})`);
    }
    const text = await response.text();
    note(text);
    for (const match of text.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)) {
      const next = new URL(match[1], target);
      if (next.origin === origin) queue.push(next.href);
    }
    for (const match of text.matchAll(/\/_next\/static\/[^"'\\\s>]+\.js/g)) {
      queue.push(new URL(match[0], origin).href);
    }
  }

  const listed = [...refs];
  const supabaseUrl = listed.includes(PREVIEW_REF) ? `https://${PREVIEW_REF}.supabase.co` : '';
  return { supabaseUrl, anonKey, refs: listed };
}

async function caseColumnReads(
  api: APIRequestContext,
  supabaseUrl: string,
  anonKey: string,
  label: 'anonymous-session' | null,
  record: (name: string, ok: boolean, severity: CaseResult['severity'], evidence: string) => void,
): Promise<void> {
  const who = label ?? 'no-session';
  const reads: string[] = [];
  let emailLeak = false;
  let signedIpsRead = false;
  let signedIpsRows = false;

  const tables: Array<[string, string]> = [
    ['students', 'email'],
    ['students', '*'],
    ['feedback', 'email'],
    ['feedback', '*'],
    ['feedback_public', 'email'],
    ['feedback_public', '*'],
    ['signed_ips', '*'],
    ['signed_ips', 'ipHash,studentId'],
    ['signed_ips', 'ipAddress'],
  ];

  for (const [table, columns] of tables) {
    const response = await api.get(
      `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(columns)}`,
    );
    const body = await response.text();
    reads.push(`${table}?select=${columns} ${snippet(response.status(), body)}`);
    if (response.status() < 300) {
      const parsed = parseJson(body);
      if (table === 'signed_ips') {
        signedIpsRead = true;
        if (Array.isArray(parsed) && parsed.length > 0) signedIpsRows = true;
      } else if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (!row || typeof row !== 'object') continue;
          const email = (row as { email?: unknown }).email;
          if (typeof email === 'string' && email.length > 0) emailLeak = true;
        }
      }
    }
  }

  const openapi = await api.get(`${supabaseUrl}/rest/v1/`, {
    headers: { ...authHeaders(anonKey, null), Accept: 'application/openapi+json' },
  });
  const specText = await openapi.text();
  const rpcNames = openApiRpcNames(specText);
  reads.push(`openapi HTTP ${openapi.status()} rpcs: ${rpcNames.join(', ') || 'none'}`);

  const ok = !emailLeak && !signedIpsRead;
  record(
    `1 anon reads (${who})`,
    ok,
    signedIpsRows || emailLeak ? 'critical' : 'high',
    reads.join(' | '),
  );
}

async function caseRpcs(
  api: APIRequestContext,
  supabaseUrl: string,
  who: string,
  record: (name: string, ok: boolean, severity: CaseResult['severity'], evidence: string) => void,
): Promise<void> {
  const lines: string[] = [];
  let recordCallable = false;
  let hasCallable = false;
  for (const fn of ['record_signed_ip', 'has_signed_ip'] as const) {
    const response = await api.post(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      data: {
        p_student_id: '00000000-0000-4000-8000-000000000024',
        p_ip: '203.0.113.24',
      },
    });
    const body = await response.text();
    const refused = isPermissionDenied(response.status(), body);
    lines.push(`${fn} ${refused ? 'refused' : 'callable'} ${snippet(response.status(), body)}`);
    if (!refused && fn === 'record_signed_ip') recordCallable = true;
    if (!refused && fn === 'has_signed_ip') hasCallable = true;
  }
  const ok = !recordCallable && !hasCallable;
  record(
    `7 RPCs (${who})`,
    ok,
    recordCallable || hasCallable ? 'high' : 'none',
    lines.join(' | '),
  );
}

async function caseClientBundle(
  request: APIRequestContext,
  baseURL: string,
  record: (name: string, ok: boolean, severity: CaseResult['severity'], evidence: string) => void,
): Promise<void> {
  const origin = new URL(baseURL).origin;
  const queue = ['/', '/contact', '/login'].map((path) => new URL(path, origin).href);
  const seen = new Set<string>();
  const hits: string[] = [];
  while (queue.length > 0 && seen.size < 40) {
    const target = queue.shift();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    const response = await request.get(target);
    if (response.status() === 401 || response.status() === 403) {
      record('6 client signed_ips', false, 'critical', `Vercel login wall HTTP ${response.status()} for ${new URL(target).pathname}`);
      return;
    }
    const text = await response.text();
    if (target.includes('.js') && text.includes('signed_ips')) {
      hits.push(new URL(target).pathname);
    }
    if (seen.size <= 3) {
      for (const match of text.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)) {
        const next = new URL(match[1], target);
        if (next.origin === origin) queue.push(next.href);
      }
      for (const match of text.matchAll(/\/_next\/static\/[^"'\\\s>]+\.js/g)) {
        queue.push(new URL(match[0], origin).href);
      }
    }
  }
  record(
    '6 client signed_ips',
    hits.length === 0,
    'medium',
    hits.length === 0
      ? `no signed_ips string in ${seen.size} fetched app responses`
      : `string signed_ips in client chunks: ${hits.join(', ')}`,
  );
}

async function casePublicRpcShape(
  api: APIRequestContext,
  supabaseUrl: string,
  anonKey: string,
  studentId: string,
  record: (name: string, ok: boolean, severity: CaseResult['severity'], evidence: string) => void,
): Promise<void> {
  const openapi = await api.get(`${supabaseUrl}/rest/v1/`, {
    headers: { ...authHeaders(anonKey, null), Accept: 'application/openapi+json' },
  });
  const specText = await openapi.text();
  const argNames = openApiArgNames(specText, 'get_student_public');
  const id = studentId || '00000000-0000-4000-8000-000000000024';
  const attempts: string[] = [`openapi args: ${argNames.join(', ') || 'not listed'}`];
  let email = false;
  let worked: string | null = null;
  for (const arg of ['p_id', 'p_slug_or_id']) {
    const response = await api.post(`${supabaseUrl}/rest/v1/rpc/get_student_public`, {
      data: { [arg]: id },
    });
    const body = await response.text();
    attempts.push(`${arg} ${snippet(response.status(), body)}`);
    if (response.status() < 300) {
      worked = arg;
      if (/"email"\s*:/.test(body)) email = true;
    }
  }
  const name = studentId ? '9 get_student_public row' : '9 get_student_public args';
  record(
    name,
    !email,
    email ? 'critical' : 'none',
    `${attempts.join(' | ')}; accepted arg: ${worked ?? 'neither'}`,
  );
}

async function caseFeedbackWall(
  page: Page,
  baseURL: string,
  record: (name: string, ok: boolean, severity: CaseResult['severity'], evidence: string) => void,
): Promise<void> {
  const watched: string[] = [];
  const onRequest = (req: { url(): string }) => {
    const url = req.url();
    if (url.includes('signed_ips') || url.includes('select=email') || url.includes('feedback')) {
      watched.push(redact(url).slice(0, 180));
    }
  };
  page.on('request', onRequest);
  const errors = collectConsole(page);
  const response = await page.goto(new URL('/contact', baseURL).href, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  const wall = await isLoginWall(page, status);
  const heading = await page.getByRole('heading', { name: 'Drop a Review, Comment, or Message' }).isVisible().catch(() => false);
  page.off('request', onRequest);
  const signed = watched.filter((url) => url.includes('signed_ips'));
  const emailSelect = watched.filter((url) => url.includes('select=email'));
  const ok = !wall && status === 200 && heading && signed.length === 0 && emailSelect.length === 0;
  record(
    '3 feedback wall',
    ok,
    wall ? 'critical' : signed.length || emailSelect.length ? 'high' : 'medium',
    `HTTP ${status} heading=${heading} loginWall=${wall} signed_ips=${signed.length} select=email=${emailSelect.length} console=${errors.join('; ') || 'none'}`,
  );
}

async function caseStorageLoggedOut(
  supabaseUrl: string,
  anonKey: string,
  record: RecordCase,
): Promise<void> {
  const loggedOut = await newRequest.newContext({
    extraHTTPHeaders: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  try {
    const rejected = await storagePut(
      loggedOut,
      supabaseUrl,
      'profile-photos/00000000-0000-4000-8000-000000000024/qa.jpg',
      tinyJpeg(),
      'image/jpeg',
    );
    record('4 storage logged-out', rejected.status >= 300, 'high', snippet(rejected.status, rejected.body));
  } finally {
    await loggedOut.dispose();
  }
  record('4 storage owner', 'blocked', 'low', 'skipped: owner password login is covered separately');
}

async function anonymousSession(
  api: APIRequestContext,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ session: Session | null; error: string }> {
  const response = await api.post(`${supabaseUrl}/auth/v1/signup`, {
    headers: { ...authHeaders(anonKey, null), 'content-type': 'application/json' },
    data: {},
  });
  const body = await response.text();
  const session = sessionFrom(body);
  if (session?.access_token) return { session, error: '' };
  return { session: null, error: snippet(response.status(), body) };
}

async function postSignature(
  request: APIRequestContext,
  studentId: string,
  accessToken: string | null,
  signatoryName: string,
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (accessToken !== null) headers.authorization = `Bearer ${accessToken}`;
  const response = await request.post('/api/signatures', {
    headers,
    data: {
      studentId,
      signatureImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      signatoryName,
      signatoryNote: 'preview hotfix check',
      position: { x: 0.12, y: 0.34 },
    },
  });
  return { status: response.status(), body: await response.text() };
}

type SignatureGet = {
  status: number;
  body: string;
  cache: string;
  already: boolean | null;
};

function cacheHeaderOk(cache: string): boolean {
  const value = cache.toLowerCase();
  return value.includes('private') && value.includes('no-store') && !value.includes('s-maxage');
}

async function getSignatures(
  request: APIRequestContext,
  studentId: string | null,
  accessToken: string | null,
  extraHeaders?: Record<string, string>,
): Promise<SignatureGet> {
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const path = studentId
    ? `/api/signatures?studentId=${encodeURIComponent(studentId)}`
    : '/api/signatures';
  const response = await request.get(path, { headers });
  const body = await response.text();
  return {
    status: response.status(),
    body,
    cache: response.headers()['cache-control'] ?? '',
    already: readAlready(body),
  };
}

function signatureIdFrom(body: string): string {
  const parsed = parseJson(body);
  if (!parsed || typeof parsed !== 'object' || !('signature_id' in parsed)) return '';
  const id = (parsed as { signature_id?: unknown }).signature_id;
  return typeof id === 'string' ? id : '';
}

async function caseAnonymousSigning(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
  anonApi: APIRequestContext,
  supabaseUrl: string,
  anonKey: string,
  anonymous: Session | null,
  anonymousError: string,
  record: RecordCase,
): Promise<void> {
  const signatoryName = `QA-c005f05-${Date.now()}`;
  if (!anonymous?.access_token || !anonymous.user?.id) {
    const blocked = anonymousDisabled(anonymousError);
    const evidence = anonymousError || 'anonymous sign-in returned no session';
    record('1 anon sign-in', blocked ? 'blocked' : false, blocked ? 'low' : 'high', evidence);
    record('1 POST 201', blocked ? 'blocked' : false, 'high', `not attempted; ${evidence}`);
    record('1 second POST 409', blocked ? 'blocked' : false, 'high', `not attempted; ${evidence}`);
    record('1 POST no bearer 401', blocked ? 'blocked' : false, 'high', `not attempted; ${evidence}`);
    record('1 POST invalid bearer 401', blocked ? 'blocked' : false, 'high', `not attempted; ${evidence}`);
    record('2 fresh session not signed', blocked ? 'blocked' : false, 'high', `not attempted; ${evidence}`);
    record('2 signer session signed', blocked ? 'blocked' : false, 'high', `not attempted; ${evidence}`);
    record('2 fresh session after sign', blocked ? 'blocked' : false, 'high', `not attempted; ${evidence}`);
    record('2 ip and forwarded-for ignored', blocked ? 'blocked' : false, 'high', `not attempted; ${evidence}`);
    await recordCacheControl(request, null, record);
    record('4 board shows signature', blocked ? 'blocked' : false, 'high', `not attempted; ${evidence}`);
    return;
  }

  const anonUserId = anonymous.user.id;
  record('1 anon sign-in', true, 'none', `anon user id ${anonUserId}`);

  const before = await getSignatures(request, BOARD_ID, anonymous.access_token);
  record(
    '2 fresh session not signed',
    before.status === 200 && before.already === false,
    'high',
    `board ${BOARD_ID} ${snippet(before.status, before.body)} cache=${before.cache || 'absent'}`,
  );

  const missingAuth = await postSignature(request, BOARD_ID, null, signatoryName);
  record(
    '1 POST no bearer 401',
    missingAuth.status === 401,
    'high',
    snippet(missingAuth.status, missingAuth.body),
  );
  const invalidAuth = await postSignature(request, BOARD_ID, 'not-a-valid-token', signatoryName);
  record(
    '1 POST invalid bearer 401',
    invalidAuth.status === 401,
    'high',
    snippet(invalidAuth.status, invalidAuth.body),
  );

  const createdAt = new Date().toISOString();
  const first = await postSignature(request, BOARD_ID, anonymous.access_token, signatoryName);
  const signatureId = signatureIdFrom(first.body);
  const createdLine =
    `utc=${createdAt} anonUserId=${anonUserId} signatureId=${signatureId || 'none'} studentId=${BOARD_ID} name=${signatoryName} ${snippet(first.status, first.body)}`;
  console.log(`[hotfix] SIGNATURE ${createdLine}`);
  if (serviceKeyMissing(first.status, first.body)) {
    record('1 POST 201', 'blocked', 'low', createdLine);
    record('1 second POST 409', 'blocked', 'low', 'not attempted; service role refused the first POST');
    record('2 signer session signed', 'blocked', 'low', createdLine);
    record('2 fresh session after sign', 'blocked', 'low', createdLine);
    record('2 ip and forwarded-for ignored', 'blocked', 'low', createdLine);
    record('4 board shows signature', 'blocked', 'low', createdLine);
    await recordCacheControl(request, anonymous.access_token, record);
    return;
  }
  record('1 POST 201', first.status === 201 && signatureId.length > 0, 'high', createdLine);

  const secondAt = new Date().toISOString();
  const second = await postSignature(request, BOARD_ID, anonymous.access_token, signatoryName);
  const secondId = signatureIdFrom(second.body);
  if (second.status === 201) {
    console.log(
      `[hotfix] SIGNATURE utc=${secondAt} anonUserId=${anonUserId} signatureId=${secondId || 'none'} studentId=${BOARD_ID} name=${signatoryName} ${snippet(second.status, second.body)}`,
    );
  }
  record(
    '1 second POST 409',
    second.status === 409,
    'high',
    `utc=${secondAt} ${snippet(second.status, second.body)}`,
  );

  const after = await getSignatures(request, BOARD_ID, anonymous.access_token);
  const query = await request.get(
    `/api/signatures?studentId=${encodeURIComponent(BOARD_ID)}&ip=${PROBE_IP}&p_ip=${PROBE_IP}`,
    { headers: { authorization: `Bearer ${anonymous.access_token}` } },
  );
  const queryBody = await query.text();
  const spoof = await request.get(`/api/signatures?studentId=${encodeURIComponent(BOARD_ID)}`, {
    headers: {
      authorization: `Bearer ${anonymous.access_token}`,
      'x-forwarded-for': SPOOF_IP,
      'x-real-ip': SPOOF_IP,
    },
  });
  const spoofBody = await spoof.text();
  const blobs = [after.body, queryBody, spoofBody];
  const leakedIp =
    blobs.some((body) => body.includes(PROBE_IP) || body.includes(SPOOF_IP)) ||
    blobs.some((body) => /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(body));
  const queryFlag = readAlready(queryBody);
  const spoofFlag = readAlready(spoofBody);
  record(
    '2 signer session signed',
    after.status === 200 && after.already === true,
    'high',
    snippet(after.status, after.body),
  );
  record(
    '2 ip and forwarded-for ignored',
    !leakedIp && queryFlag === after.already && spoofFlag === after.already && query.status() < 500 && spoof.status() < 500,
    leakedIp ? 'critical' : 'high',
    `query ${snippet(query.status(), queryBody)}; x-forwarded-for ${snippet(spoof.status(), spoofBody)}`,
  );

  const other = await anonymousSession(anonApi, supabaseUrl, anonKey);
  if (!other.session?.access_token || !other.session.user?.id) {
    const blocked = anonymousDisabled(other.error);
    record(
      '2 fresh session after sign',
      blocked ? 'blocked' : false,
      blocked ? 'low' : 'high',
      other.error || 'second anonymous sign-in returned no session',
    );
  } else {
    const fresh = await getSignatures(request, BOARD_ID, other.session.access_token);
    console.log(
      `[hotfix] fresh anon after sign utc=${new Date().toISOString()} anonUserId=${other.session.user.id} alreadySigned=${String(fresh.already)} (no signature created for this user)`,
    );
    record(
      '2 fresh session after sign',
      fresh.status === 200 && fresh.already === false,
      'high',
      `anonUserId=${other.session.user.id} ${snippet(fresh.status, fresh.body)}. GET uses the caller IP, so a second user on this runner IP can still read alreadySigned true.`,
    );
  }

  await recordCacheControl(request, anonymous.access_token, record);
  await caseBoardShowsSignature(page, baseURL, signatoryName, record);
}

async function recordCacheControl(
  request: APIRequestContext,
  accessToken: string | null,
  record: RecordCase,
): Promise<void> {
  const missing = await getSignatures(request, null, accessToken);
  const ok200 = await getSignatures(request, BOARD_ID, accessToken);
  const bad = await getSignatures(request, 'not-a-uuid', accessToken);
  const rows = [
    { label: '4xx', item: missing, classOk: missing.status >= 400 && missing.status < 500 },
    { label: '200', item: ok200, classOk: ok200.status === 200 },
    { label: '5xx', item: bad, classOk: bad.status >= 500 },
  ];
  const evidence = rows
    .map((row) => `${row.label} HTTP ${row.item.status} cache=${row.item.cache || 'absent'} headerOk=${cacheHeaderOk(row.item.cache)}`)
    .join(' | ');
  const ok = rows.every((row) => row.classOk && cacheHeaderOk(row.item.cache));
  record('3 GET cache-control', ok, 'high', evidence);
}

async function caseBoardShowsSignature(
  page: Page,
  baseURL: string,
  signatoryName: string,
  record: RecordCase,
): Promise<void> {
  const watched: string[] = [];
  const emailHits: string[] = [];
  const onRequest = (req: { url(): string }) => {
    const url = req.url();
    if (/signed_ips|has_signed_ip/i.test(url)) watched.push(redact(url).slice(0, 180));
  };
  const onResponse = async (response: { url(): string; text(): Promise<string> }) => {
    const url = response.url();
    if (!/supabase\.co|\/api\//i.test(url)) return;
    const text = await response.text().catch(() => '');
    if (/"email"\s*:/.test(text)) emailHits.push(new URL(url).pathname);
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  const response = await page.goto(new URL(`/${BOARD_ID}`, baseURL).href, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  const wall = await isLoginWall(page, status);
  const visible = await page.getByText(signatoryName, { exact: false }).first().isVisible({ timeout: 20_000 }).catch(() => false);
  page.off('request', onRequest);
  page.off('response', onResponse);
  record(
    '4 board shows signature',
    !wall && status === 200 && visible && watched.length === 0 && emailHits.length === 0,
    wall || emailHits.length ? 'critical' : 'high',
    `HTTP ${status} nameVisible=${visible} loginWall=${wall} signed_ips_or_has_signed_ip=${watched.length} emailFields=${emailHits.join(',') || 'none'}`,
  );
}

async function caseDashboardLoggedOut(page: Page, baseURL: string, record: RecordCase): Promise<void> {
  const response = await page.goto(new URL('/dashboard', baseURL).href, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  const landed = await page
    .waitForURL(/\/login(?:[/?#]|$)/, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  const signIn = await page
    .getByRole('heading', { name: /welcome back|sign in|log in/i })
    .isVisible()
    .catch(() => false);
  const wall = await isLoginWall(page, status);
  record(
    '5 dashboard logged out',
    !wall && (landed || signIn),
    wall ? 'critical' : 'high',
    `document HTTP ${status} final=${new URL(page.url()).pathname} redirectedToLogin=${landed} signIn=${signIn} vercelWall=${wall}`,
  );
}

function readAlready(body: string): boolean | null {
  const parsed = parseJson(body);
  if (!parsed || typeof parsed !== 'object' || !('alreadySigned' in parsed)) return null;
  const value = (parsed as { alreadySigned?: unknown }).alreadySigned;
  return typeof value === 'boolean' ? value : null;
}

async function storagePut(
  api: APIRequestContext,
  supabaseUrl: string,
  path: string,
  body: Buffer,
  contentType: string,
): Promise<{ status: number; body: string }> {
  const response = await api.post(`${supabaseUrl}/storage/v1/object/signpen/${path}`, {
    headers: { 'content-type': contentType, 'x-upsert': 'true' },
    data: body,
  });
  return { status: response.status(), body: await response.text() };
}

function authHeaders(anonKey: string, token: string | null): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token ?? anonKey}`,
  };
}

function sessionFrom(body: string): Session | null {
  const parsed = parseJson(body);
  if (!parsed || typeof parsed !== 'object' || !('access_token' in parsed)) return null;
  const session = parsed as Session;
  if (typeof session.access_token !== 'string') return null;
  if (!session.expires_at && session.expires_in) {
    session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  }
  session.token_type = session.token_type || 'bearer';
  return session;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function isPermissionDenied(status: number, body: string): boolean {
  if (status === 401 || status === 403 || status === 404) return true;
  return /permission denied|42501|PGRST301|not found/i.test(body);
}

function openApiRpcNames(specText: string): string[] {
  const parsed = parseJson(specText);
  if (!parsed || typeof parsed !== 'object' || !('paths' in parsed)) return [];
  const paths = (parsed as { paths?: Record<string, unknown> }).paths ?? {};
  return Object.keys(paths)
    .filter((path) => path.startsWith('/rpc/'))
    .map((path) => path.slice('/rpc/'.length));
}

function openApiArgNames(specText: string, fn: string): string[] {
  const parsed = parseJson(specText);
  if (!parsed || typeof parsed !== 'object' || !('paths' in parsed)) return [];
  const paths = (parsed as { paths?: Record<string, unknown> }).paths ?? {};
  const node = paths[`/rpc/${fn}`];
  if (!node) return [];
  return collectNames(node).filter((name) => name.startsWith('p_'));
}

function collectNames(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectNames(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string') found.push(record.name);
  if (record.properties && typeof record.properties === 'object') {
    found.push(...Object.keys(record.properties as Record<string, unknown>));
  }
  for (const child of Object.values(record)) collectNames(child, found);
  return found;
}

function collectConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(redact(message.text()));
  });
  page.on('pageerror', (error) => {
    errors.push(redact(error.message));
  });
  return errors;
}

async function isLoginWall(page: Page, status: number): Promise<boolean> {
  if (status === 401 || status === 403) return true;
  const body = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  return body.includes('authentication required') || body.includes('vercel authentication');
}

function tinyJpeg(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}
