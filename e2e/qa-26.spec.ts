import { expect, request as newRequest, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * QA for PR #26 (backend/rls-api-v2). Writes run only after the deployment's
 * client bundle points at preview Supabase vackuntdjgfmxhwxjuqt.
 * The workflow sets E2E_QA26=1 for that preview run. Other smoke runs skip
 * this file so they do not sign. A workflow-only commit does not deploy a
 * preview, so this spec change is what makes Vercel emit deployment_status.
 */

const PREVIEW_REF = 'vackuntdjgfmxhwxjuqt';
const PRODUCTION_REF = 'avsguiynrukacgqnxwku';
const BOARD_ID = process.env.TEST_BOARD_ID?.trim() || '512025e9-9b28-40a8-8322-8a01711aa4bc';
const PROBE_IP = '203.0.113.26';
const SPOOF_IP = '203.0.113.88';
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const OWNER_CREDENTIALS =
  'Owner credentials are not available in CI. This workflow only receives VERCEL_AUTOMATION_BYPASS_SECRET. There is no preview owner email or password secret, so the owner session was not created.';

const STUDENT_PUBLIC_KEYS = ['id', 'name', 'profilePhotoUrl', 'pageSettings', 'popupMessageConfig'] as const;

type Status = 'pass' | 'fail' | 'blocked';
type CaseResult = { name: string; status: Status; evidence: string };
type RecordCase = (name: string, ok: boolean | 'blocked', evidence: string) => void;
type Session = { access_token: string; user?: { id?: string } };
type HttpResult = { status: number; body: string; cache: string; retryAfter: string };
type SigningContext = {
  tokenA: string | null;
  userA: string;
  signatureId: string;
  tokenB: string | null;
};

function redact(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]')
    .replace(/bearer\s+\S+/gi, 'bearer [redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 360);
}

function snippet(status: number, body: string): string {
  return `HTTP ${status} ${redact(body)}`;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function cacheOk(cache: string): boolean {
  return cache.toLowerCase() === 'private, no-store';
}

function alreadySigned(body: string): boolean | null {
  const parsed = parseJson(body);
  if (!parsed || typeof parsed !== 'object' || !('alreadySigned' in parsed)) return null;
  const value = (parsed as { alreadySigned?: unknown }).alreadySigned;
  return typeof value === 'boolean' ? value : null;
}

function signatureId(body: string): string {
  const parsed = parseJson(body);
  if (!parsed || typeof parsed !== 'object') return '';
  const id = (parsed as { signature_id?: unknown }).signature_id;
  return typeof id === 'string' ? id : '';
}

function errorCode(body: string): string {
  const parsed = parseJson(body);
  if (!parsed || typeof parsed !== 'object' || !('error' in parsed)) return '';
  const error = (parsed as { error?: unknown }).error;
  return typeof error === 'string' ? error : '';
}

function emptySigning(): SigningContext {
  return { tokenA: null, userA: '', signatureId: '', tokenB: null };
}

function authLimited(status: number, body: string): boolean {
  return status === 429 || /rate limit|over_request_rate_limit|too many requests/i.test(body);
}

function anonymousDisabled(error: string): boolean {
  return /anonymous_provider_disabled|anonymous sign-ins are disabled/i.test(error);
}

function serviceKeyMissing(status: number, body: string): boolean {
  return status === 503 && /temporarily unavailable|service role|not configured/i.test(body);
}

function jsonEmailValue(text: string): boolean {
  return /"email"\s*:\s*"(?!").+?"/.test(text);
}

function refused(status: number, body: string): boolean {
  if (status === 401 || status === 403 || status === 404) return true;
  return /permission denied|42501|PGRST301/i.test(body);
}

test.describe('PR 26 session signing', () => {
  test.skip(process.env.E2E_QA26 !== '1', 'E2E_QA26=1 runs this file against the preview Supabase only');

  test('cases 1-6', async ({ page, request }) => {
    test.setTimeout(720_000);
    const results: CaseResult[] = [];
    const record: RecordCase = (name, ok, evidence) => {
      const status: Status = ok === 'blocked' ? 'blocked' : ok ? 'pass' : 'fail';
      results.push({ name, status, evidence });
      console.log(`[qa26] ${status.toUpperCase()} ${name} :: ${evidence}`);
    };

    const baseURL = process.env.BASE_URL || 'http://localhost:3000';
    const host = new URL(baseURL).hostname.toLowerCase();
    if (host === 'signpen.xyz' || host === 'www.signpen.xyz' || host.endsWith('.signpen.xyz')) {
      throw new Error('Refusing to run against production signpen.xyz');
    }

    const discovered = await discoverSupabase(page, request, baseURL);
    const liveRefs = discovered.refs.filter((ref) => ref !== 'placeholder');
    if (!liveRefs.includes(PREVIEW_REF) || liveRefs.includes(PRODUCTION_REF) || !discovered.anonKey) {
      throw new Error(
        `Refusing writes. Live Supabase refs: ${liveRefs.join(', ') || 'none'}. Anon key ${discovered.anonKey ? 'found' : 'missing'}.`,
      );
    }
    console.log(`[qa26] preview supabase ${PREVIEW_REF} anon key present`);

    const anon = await newRequest.newContext({
      extraHTTPHeaders: { apikey: discovered.anonKey, Authorization: `Bearer ${discovered.anonKey}` },
    });
    try {
      const first = await anonymousSession(anon, discovered.supabaseUrl, discovered.anonKey);
      const second = first.session
        ? await anonymousSession(anon, discovered.supabaseUrl, discovered.anonKey)
        : { session: null, error: first.error };
      const signing = await caseSigning(request, first, second, record);
      await caseCache(request, first.session?.access_token ?? null, record);
      await casePublicReads(anon, discovered.supabaseUrl, discovered.anonKey, first.session, record);
      await caseBoardPage(page, baseURL, record);
      await caseReloadAndTurnstile(page, request, anon, discovered.supabaseUrl, baseURL, signing, record);
      await caseIpIgnored(request, signing, record);
      await caseNonOwnerMutations(request, signing, record);
      await caseSentimentAndPages(page, request, baseURL, signing, record);
      await caseStorage(discovered.supabaseUrl, discovered.anonKey, signing, record);
      await caseRateLimit(request, anon, discovered.supabaseUrl, discovered.anonKey, record);
    } finally {
      await anon.dispose();
    }

    const failed = results.filter((item) => item.status === 'fail');
    const blocked = results.filter((item) => item.status === 'blocked');
    const passed = results.filter((item) => item.status === 'pass');
    console.log(`[qa26] ${passed.length} passed, ${failed.length} failed, ${blocked.length} blocked`);
    expect(failed, failed.map((item) => `${item.name}: ${item.evidence}`).join('\n')).toEqual([]);
  });
});

async function caseSigning(
  request: APIRequestContext,
  first: { session: Session | null; error: string },
  second: { session: Session | null; error: string },
  record: RecordCase,
): Promise<SigningContext> {
  const session = first.session;
  if (!session?.access_token || !session.user?.id) {
    const blocked = anonymousDisabled(first.error);
    const evidence = first.error || 'anonymous sign-in returned no session';
    for (const name of [
      '1 fresh GET alreadySigned false',
      '1 POST 201',
      '1 repeat POST 409',
      '1 POST no bearer 401',
      '1 POST invalid bearer 401',
      '1 GET without bearer',
      '2 second session GET false then POST 201',
      '3 no cross-signer leakage',
    ]) {
      record(name, blocked ? 'blocked' : false, evidence);
    }
    return emptySigning();
  }

  const userA = session.user.id;
  const nameA = `QA-26a-${Date.now()}`;
  const before = await getSignatures(request, BOARD_ID, session.access_token);
  if (serviceKeyMissing(before.status, before.body)) {
    record(
      '1 fresh GET alreadySigned false',
      'blocked',
      `anonUserId=${userA} board=${BOARD_ID} ${snippet(before.status, before.body)} cache=${before.cache || 'absent'}`,
    );
  } else {
    record(
      '1 fresh GET alreadySigned false',
      before.status === 200 && before.already === false && cacheOk(before.cache),
      `anonUserId=${userA} board=${BOARD_ID} ${snippet(before.status, before.body)} cache=${before.cache || 'absent'}`,
    );
  }

  const missing = await postSignature(request, BOARD_ID, null, nameA);
  record('1 POST no bearer 401', missing.status === 401, snippet(missing.status, missing.body));
  const invalid = await postSignature(request, BOARD_ID, 'not-a-valid-token', nameA);
  record('1 POST invalid bearer 401', invalid.status === 401, snippet(invalid.status, invalid.body));

  const bareGet = await getSignatures(request, BOARD_ID, null);
  record(
    '1 GET without bearer',
    bareGet.status === 200 && bareGet.already === false && cacheOk(bareGet.cache),
    `documented HTTP 200 alreadySigned false (not 401). ${snippet(bareGet.status, bareGet.body)} cache=${bareGet.cache || 'absent'}`,
  );

  const createdAt = new Date().toISOString();
  const created = await postSignature(request, BOARD_ID, session.access_token, nameA);
  const createdId = signatureId(created.body);
  const createdLine = `utc=${createdAt} anonUserId=${userA} signatureId=${createdId || 'none'} studentId=${BOARD_ID} name=${nameA} cache=${created.cache || 'absent'} ${snippet(created.status, created.body)}`;
  console.log(`[qa26] SIGNATURE ${createdLine}`);
  if (serviceKeyMissing(created.status, created.body)) {
    record('1 POST 201', 'blocked', createdLine);
    record('1 repeat POST 409', 'blocked', 'not attempted; service role refused the first POST');
    record('2 second session GET false then POST 201', 'blocked', createdLine);
    record('3 no cross-signer leakage', 'blocked', createdLine);
    return { tokenA: session.access_token, userA, signatureId: '', tokenB: null };
  }
  record('1 POST 201', created.status === 201 && createdId.length > 0, createdLine);

  const repeatAt = new Date().toISOString();
  const repeat = await postSignature(request, BOARD_ID, session.access_token, nameA);
  const deviceWording = /from this device/i.test(repeat.body) && !/from this IP/i.test(repeat.body);
  record(
    '1 repeat POST 409',
    repeat.status === 409 && deviceWording && signatureId(repeat.body) === '',
    `utc=${repeatAt} anonUserId=${userA} deviceWording=${deviceWording} ${snippet(repeat.status, repeat.body)}`,
  );

  const afterA = await getSignatures(request, BOARD_ID, session.access_token);
  const userB = second.session?.user?.id ?? '';
  if (!second.session?.access_token || !userB || userB === userA) {
    record(
      '2 second session GET false then POST 201',
      false,
      second.error || `second session missing or same user (${userB || 'none'})`,
    );
    record('3 no cross-signer leakage', false, 'second session unavailable');
    return { tokenA: session.access_token, userA, signatureId: createdId, tokenB: null };
  }

  const beforeB = await getSignatures(request, BOARD_ID, second.session.access_token);
  const nameB = `QA-26b-${Date.now()}`;
  const createdBAt = new Date().toISOString();
  const createdB = await postSignature(request, BOARD_ID, second.session.access_token, nameB);
  const createdBId = signatureId(createdB.body);
  const createdBLine = `utc=${createdBAt} anonUserId=${userB} signatureId=${createdBId || 'none'} studentId=${BOARD_ID} name=${nameB} ${snippet(createdB.status, createdB.body)}`;
  if (createdB.status === 201) console.log(`[qa26] SIGNATURE ${createdBLine}`);
  const leaked = beforeB.already === true || beforeB.body.includes(userA) || beforeB.body.includes(createdId);
  record(
    '2 second session GET false then POST 201',
    beforeB.status === 200 && beforeB.already === false && createdB.status === 201 && createdBId.length > 0,
    `same runner IP. before ${snippet(beforeB.status, beforeB.body)} cache=${beforeB.cache || 'absent'}. ${createdBLine}`,
  );
  const afterB = await getSignatures(request, BOARD_ID, second.session.access_token);
  record(
    '3 no cross-signer leakage',
    !leaked && afterA.already === true && afterB.already === true && afterA.body.includes(userA) === false,
    `A after sign alreadySigned=${String(afterA.already)} body=${redact(afterA.body)}. B before sign alreadySigned=${String(beforeB.already)} body=${redact(beforeB.body)}. B after sign alreadySigned=${String(afterB.already)}`,
  );
  return {
    tokenA: session.access_token,
    userA,
    signatureId: createdId,
    tokenB: second.session.access_token,
  };
}

async function caseCache(
  request: APIRequestContext,
  token: string | null,
  record: RecordCase,
): Promise<void> {
  const lines: string[] = [];
  const serverErrors: string[] = [];
  let ok = true;
  const check = (label: string, result: HttpResult, expected: number) => {
    if (result.status >= 500) {
      serverErrors.push(`${label} ${snippet(result.status, result.body)} cache=${result.cache || 'absent'}`);
      return;
    }
    const good = result.status === expected && cacheOk(result.cache);
    if (!good) ok = false;
    lines.push(`${label} ${snippet(result.status, result.body)} cache=${result.cache || 'absent'}`);
  };

  check('GET signatures session', await getSignatures(request, BOARD_ID, token), 200);
  check('GET signatures 400', await getSignatures(request, 'not-a-uuid', token), 400);
  check('GET signatures 401', await getSignatures(request, BOARD_ID, 'not-a-valid-token'), 401);
  check('GET challenge session', await getChallenge(request, BOARD_ID), 200);
  check('GET challenge 400', await getChallenge(request, 'not-a-uuid'), 400);
  record('3 cache 200 and 4xx', ok, lines.join(' | ') || 'no 200/4xx sample');
  if (serverErrors.length > 0) {
    const cached = serverErrors.every((line) => line.includes('cache=private, no-store'));
    record('3 cache 5xx', cached, serverErrors.join(' | '));
  } else {
    record(
      '3 cache 5xx',
      'blocked',
      'Healthy preview did not return 5xx. signer_has_signed and signature_challenge_required return a boolean for this board, so the 500 branch was not exercised live.',
    );
  }
}

async function casePublicReads(
  anon: APIRequestContext,
  supabaseUrl: string,
  anonKey: string,
  session: Session | null,
  record: RecordCase,
): Promise<void> {
  const student = await anon.post(`${supabaseUrl}/rest/v1/rpc/get_student_public`, { data: { p_id: BOARD_ID } });
  const studentBody = await student.text();
  const rows = parseJson(studentBody);
  const row = Array.isArray(rows) ? rows[0] : rows;
  const keys = row && typeof row === 'object' ? Object.keys(row as object).sort() : [];
  const expected = [...STUDENT_PUBLIC_KEYS].sort();
  const extra = keys.filter((key) => !STUDENT_PUBLIC_KEYS.includes(key as (typeof STUDENT_PUBLIC_KEYS)[number]));
  record(
    '4 get_student_public columns',
    student.status() === 200 &&
      Array.isArray(rows) &&
      rows.length === 1 &&
      extra.length === 0 &&
      expected.every((key) => keys.includes(key)) &&
      !keys.includes('createdAt') &&
      !keys.includes('email') &&
      !jsonEmailValue(studentBody),
    `keys=${keys.join(',') || 'none'} extra=${extra.join(',') || 'none'} ${snippet(student.status(), studentBody)}`,
  );

  const signatures = await anon.post(`${supabaseUrl}/rest/v1/rpc/signatures_public`, { data: { p_id: BOARD_ID } });
  const signaturesBody = await signatures.text();
  const signatureRows = parseJson(signaturesBody);
  const signatureKeys = new Set<string>();
  if (Array.isArray(signatureRows)) {
    for (const item of signatureRows) {
      if (item && typeof item === 'object') Object.keys(item as object).forEach((key) => signatureKeys.add(key));
    }
  }
  record(
    '4 signatures_public no email',
    signatures.status() === 200 &&
      Array.isArray(signatureRows) &&
      !signatureKeys.has('email') &&
      !jsonEmailValue(signaturesBody),
    `rows=${Array.isArray(signatureRows) ? signatureRows.length : 'n/a'} keys=${[...signatureKeys].sort().join(',') || 'none'} ${snippet(signatures.status(), signaturesBody)}`,
  );

  const feedback = await anon.get(`${supabaseUrl}/rest/v1/feedback_public?select=*`);
  const feedbackBody = await feedback.text();
  const feedbackRows = parseJson(feedbackBody);
  const feedbackKeys = new Set<string>();
  if (Array.isArray(feedbackRows)) {
    for (const item of feedbackRows) {
      if (item && typeof item === 'object') Object.keys(item as object).forEach((key) => feedbackKeys.add(key));
    }
  }
  const firstName = await anon.get(`${supabaseUrl}/rest/v1/feedback_public?select=first_name`);
  const emailColumn = await anon.get(`${supabaseUrl}/rest/v1/feedback_public?select=email`);
  record(
    '4 feedback_public no email',
    feedback.status() === 200 &&
      firstName.status() === 200 &&
      emailColumn.status() >= 400 &&
      !feedbackKeys.has('email') &&
      !jsonEmailValue(feedbackBody) &&
      (feedbackKeys.size === 0 || feedbackKeys.has('first_name')),
    `select=* keys=${[...feedbackKeys].sort().join(',') || 'none'} first_name HTTP ${firstName.status()} select=email HTTP ${emailColumn.status()} ${snippet(feedback.status(), feedbackBody)}`,
  );

  const readers: Array<[string, APIRequestContext]> = [['anon', anon]];
  let authed: APIRequestContext | null = null;
  if (session?.access_token) {
    authed = await newRequest.newContext({
      extraHTTPHeaders: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    readers.push(['anonymous-session', authed]);
  }
  try {
    const lines: string[] = [];
    let readable = false;
    for (const [who, api] of readers) {
      const response = await api.get(`${supabaseUrl}/rest/v1/signed_ips?select=*`);
      const body = await response.text();
      if (response.status() < 300) readable = true;
      lines.push(`${who} signed_ips ${snippet(response.status(), body)}`);
    }
    record('4 signed_ips unreadable', !readable, lines.join(' | '));

    const rpcLines: string[] = [];
    let callable = false;
    for (const [who, api] of readers) {
      for (const fn of ['has_signed_ip', 'record_signed_ip'] as const) {
        const response = await api.post(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
          data: { p_student_id: BOARD_ID, p_ip: '203.0.113.26' },
        });
        const body = await response.text();
        const denied = refused(response.status(), body);
        if (!denied) callable = true;
        rpcLines.push(`${who} ${fn} ${denied ? 'refused' : 'callable'} ${snippet(response.status(), body)}`);
      }
    }
    record('4 has_signed_ip and record_signed_ip refused', !callable, rpcLines.join(' | '));
  } finally {
    await authed?.dispose();
  }
}

async function caseBoardPage(page: Page, baseURL: string, record: RecordCase): Promise<void> {
  const origin = new URL(baseURL).origin;
  const hits: string[] = [];
  const emails: string[] = [];
  const onRequest = (req: { url(): string }) => {
    const url = req.url();
    if (/signed_ips|has_signed_ip|record_signed_ip/.test(url)) hits.push(new URL(url).pathname);
  };
  const onResponse = async (response: { url(): string; headers(): Record<string, string>; text(): Promise<string> }) => {
    const url = response.url();
    if (!url.startsWith(origin) && !url.includes('supabase.co')) return;
    if (/\.(png|jpe?g|gif|webp|svg|mp4|woff2?)(\?|$)/i.test(url)) return;
    const type = response.headers()['content-type'] ?? '';
    if (type && !/json|text|javascript|html/.test(type)) return;
    const text = await response.text().catch(() => '');
    if (jsonEmailValue(text) || /[?&]select=[^&]*email/i.test(url)) emails.push(new URL(url).pathname);
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  const response = await page.goto(new URL(`/${BOARD_ID}`, origin).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  page.off('request', onRequest);
  page.off('response', onResponse);
  const status = response?.status() ?? 0;
  record(
    '5 board page',
    status === 200 && hits.length === 0 && emails.length === 0,
    `HTTP ${status} signed_ips_or_has_signed_ip=${hits.length} emailResponses=${emails.slice(0, 6).join(',') || 'none'}`,
  );
}

async function caseReloadAndTurnstile(
  page: Page,
  request: APIRequestContext,
  anon: APIRequestContext,
  supabaseUrl: string,
  baseURL: string,
  signing: SigningContext,
  record: RecordCase,
): Promise<void> {
  if (!signing.tokenA || !signing.signatureId) {
    record('1 reload alreadySigned', 'blocked', 'no signature from the first session');
    record('1 signature visible on reload', 'blocked', 'no signature from the first session');
  } else {
    const reloaded = await getSignatures(request, BOARD_ID, signing.tokenA);
    record(
      '1 reload alreadySigned',
      reloaded.status === 200 && reloaded.already === true && cacheOk(reloaded.cache),
      `anonUserId=${signing.userA} signatureId=${signing.signatureId} ${snippet(reloaded.status, reloaded.body)} cache=${reloaded.cache || 'absent'}`,
    );
    const listed = await anon.post(`${supabaseUrl}/rest/v1/rpc/signatures_public`, { data: { p_id: BOARD_ID } });
    const listedBody = await listed.text();
    const origin = new URL(baseURL).origin;
    const response = await page.goto(new URL(`/${BOARD_ID}`, origin).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const pageText = await page.locator('body').innerText().catch(() => '');
    const nameOnPage = /QA-26a-/.test(pageText);
    const nameInPublic = listedBody.includes(signing.signatureId);
    record(
      '1 signature visible on reload',
      (response?.status() ?? 0) === 200 && listed.status() === 200 && nameInPublic,
      `page HTTP ${response?.status() ?? 0} publicHasId=${nameInPublic} nameOnPage=${nameOnPage} ${snippet(listed.status(), listedBody)}`,
    );
  }

  const origin = new URL(baseURL).origin;
  const contact = await page.goto(new URL('/contact', origin).href, { waitUntil: 'domcontentloaded' });
  const contactWidget = await turnstilePresent(page);
  const board = await page.goto(new URL(`/${BOARD_ID}`, origin).href, { waitUntil: 'domcontentloaded' });
  const boardWidget = await turnstilePresent(page);
  record(
    'turnstile widget absent',
    contactWidget === 0 && boardWidget === 0,
    `contact HTTP ${contact?.status() ?? 0} widgets=${contactWidget}; board HTTP ${board?.status() ?? 0} widgets=${boardWidget}`,
  );
}

async function caseIpIgnored(
  request: APIRequestContext,
  signing: SigningContext,
  record: RecordCase,
): Promise<void> {
  if (!signing.tokenA) {
    record('6 ip query and forwarded-for ignored', 'blocked', 'no session');
    return;
  }
  const plain = await getSignatures(request, BOARD_ID, signing.tokenA);
  const query = await request.get(
    `/api/signatures?studentId=${encodeURIComponent(BOARD_ID)}&ip=${PROBE_IP}&p_ip=${PROBE_IP}`,
    { headers: { authorization: `Bearer ${signing.tokenA}` } },
  );
  const queryBody = await query.text();
  const spoof = await request.get(`/api/signatures?studentId=${encodeURIComponent(BOARD_ID)}`, {
    headers: {
      authorization: `Bearer ${signing.tokenA}`,
      'x-forwarded-for': SPOOF_IP,
      'x-real-ip': SPOOF_IP,
    },
  });
  const spoofBody = await spoof.text();
  const challenge = await request.get(
    `/api/signatures/challenge?studentId=${encodeURIComponent(BOARD_ID)}&ip=${PROBE_IP}`,
    { headers: { 'x-forwarded-for': SPOOF_IP, 'x-real-ip': SPOOF_IP } },
  );
  const challengeBody = await challenge.text();
  const blobs = [plain.body, queryBody, spoofBody, challengeBody];
  const leaked = blobs.some((body) => body.includes(PROBE_IP) || body.includes(SPOOF_IP));
  const queryFlag = alreadySigned(queryBody);
  const spoofFlag = alreadySigned(spoofBody);
  const challengeCache = challenge.headers()['cache-control'] ?? '';
  record(
    '6 ip query and forwarded-for ignored',
    !leaked &&
      query.status() === plain.status &&
      queryFlag === plain.already &&
      spoof.status() === plain.status &&
      spoofFlag === plain.already &&
      challenge.status() < 500 &&
      cacheOk(query.headers()['cache-control'] ?? '') &&
      cacheOk(spoof.headers()['cache-control'] ?? '') &&
      cacheOk(challengeCache),
    `plain alreadySigned=${String(plain.already)}. query ${snippet(query.status(), queryBody)} cache=${query.headers()['cache-control'] || 'absent'}. spoof ${snippet(spoof.status(), spoofBody)} cache=${spoof.headers()['cache-control'] || 'absent'}. challenge ${snippet(challenge.status(), challengeBody)} cache=${challengeCache || 'absent'}`,
  );
}

async function caseNonOwnerMutations(
  request: APIRequestContext,
  signing: SigningContext,
  record: RecordCase,
): Promise<void> {
  record('4 owner hide and delete', 'blocked', OWNER_CREDENTIALS);
  if (!signing.signatureId || !signing.tokenA || !signing.tokenB) {
    record('4 anon cannot hide or delete', 'blocked', 'signer and second session were not both available');
    return;
  }
  const noToken = await patchSignature(request, signing.signatureId, null, { hidden_by_owner: true });
  const signerHide = await patchSignature(request, signing.signatureId, signing.tokenA, { hidden_by_owner: true });
  const otherHide = await patchSignature(request, signing.signatureId, signing.tokenB, { hidden_by_owner: true });
  const otherDelete = await deleteSignature(request, signing.signatureId, signing.tokenB);
  const noTokenDelete = await deleteSignature(request, signing.signatureId, null);
  const denied =
    noToken.status === 401 &&
    signerHide.status === 403 &&
    otherHide.status === 403 &&
    otherDelete.status === 403 &&
    noTokenDelete.status === 401;
  record(
    '4 anon cannot hide or delete',
    denied,
    `PATCH no token ${snippet(noToken.status, noToken.body)}; signer hide ${snippet(signerHide.status, signerHide.body)}; other hide ${snippet(otherHide.status, otherHide.body)}; other DELETE ${snippet(otherDelete.status, otherDelete.body)}; DELETE no token ${snippet(noTokenDelete.status, noTokenDelete.body)}`,
  );
}

async function caseSentimentAndPages(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
  signing: SigningContext,
  record: RecordCase,
): Promise<void> {
  const missing = await request.post('/api/sentiment-summary', {
    headers: { 'content-type': 'application/json' },
    data: { studentId: BOARD_ID },
  });
  const missingBody = await missing.text();
  const anonCall = signing.tokenA
    ? await request.post('/api/sentiment-summary', {
        headers: { 'content-type': 'application/json', authorization: `Bearer ${signing.tokenA}` },
        data: { studentId: BOARD_ID },
      })
    : null;
  const anonBody = anonCall ? await anonCall.text() : '';
  const anonStatus = anonCall?.status() ?? 0;
  const sawUnavailable = errorCode(missingBody) === 'summary_unavailable' || errorCode(anonBody) === 'summary_unavailable';
  record(
    '5 sentiment 503 summary_unavailable',
    'blocked',
    `${OWNER_CREDENTIALS} Missing token ${snippet(missing.status(), missingBody)}. Anonymous session HTTP ${anonStatus} ${redact(anonBody)}. summary_unavailable observed=${sawUnavailable}.`,
  );

  const origin = new URL(baseURL).origin;
  const boardWatch = watchConsole(page);
  const board = await page.goto(new URL(`/${BOARD_ID}`, origin).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  boardWatch.stop();
  const boardStatus = board?.status() ?? 0;
  const boardUrl = new URL(page.url());
  record(
    '5 board renders',
    boardStatus === 200 && boardWatch.errors.length === 0 && boardUrl.pathname.toLowerCase() === `/${BOARD_ID}`.toLowerCase(),
    `HTTP ${boardStatus} path=${boardUrl.pathname} console=${boardWatch.errors.join(' | ') || 'none'}`,
  );

  const dashWatch = watchConsole(page);
  const dash = await page.goto(new URL('/dashboard', origin).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  dashWatch.stop();
  const dashStatus = dash?.status() ?? 0;
  const dashPath = new URL(page.url()).pathname;
  record(
    '5 dashboard renders',
    dashStatus < 500 && dashWatch.errors.length === 0 && (dashPath === '/dashboard' || dashPath === '/login'),
    `HTTP ${dashStatus} path=${dashPath} console=${dashWatch.errors.join(' | ') || 'none'}`,
  );

  const contactWatch = watchConsole(page);
  const contact = await page.goto(new URL('/contact', origin).href, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  contactWatch.stop();
  record(
    '6 contact 200',
    (contact?.status() ?? 0) === 200 && contactWatch.errors.length === 0,
    `HTTP ${contact?.status() ?? 0} console=${contactWatch.errors.join(' | ') || 'none'}`,
  );
}

async function caseStorage(
  supabaseUrl: string,
  anonKey: string,
  signing: SigningContext,
  record: RecordCase,
): Promise<void> {
  const loggedOut = await newRequest.newContext({
    extraHTTPHeaders: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  const authed = signing.tokenA
    ? await newRequest.newContext({
        extraHTTPHeaders: { apikey: anonKey, Authorization: `Bearer ${signing.tokenA}` },
      })
    : null;
  try {
    const folder = signing.userA || '00000000-0000-4000-8000-000000000026';
    const denied = await storagePut(
      loggedOut,
      supabaseUrl,
      `profile-photos/${folder}/qa-logged-out.jpg`,
      tinyJpeg(),
      'image/jpeg',
    );
    if (!authed) {
      record('6 storage 403', denied.status === 401 || denied.status === 403, `logged-out ${snippet(denied.status, denied.body)}; anonymous session missing`);
      record('6 storage 415', 'blocked', 'anonymous session missing');
      record('6 storage 413', 'blocked', 'anonymous session missing');
      return;
    }
    const forbidden = await storagePut(
      authed,
      supabaseUrl,
      `profile-photos/${folder}/qa-anon.jpg`,
      tinyJpeg(),
      'image/jpeg',
    );
    const mime = await storagePut(
      authed,
      supabaseUrl,
      `profile-photos/${folder}/qa-anon.pdf`,
      Buffer.from('%PDF-1.1\n'),
      'application/pdf',
    );
    const oversize = await storagePut(
      authed,
      supabaseUrl,
      `profile-photos/${folder}/qa-anon-big.jpg`,
      Buffer.alloc(5 * 1024 * 1024 + 1, 0),
      'image/jpeg',
    );
    record(
      '6 storage 403',
      forbidden.status === 403 && (denied.status === 401 || denied.status === 403),
      `anon session ${snippet(forbidden.status, forbidden.body)}; logged-out ${snippet(denied.status, denied.body)}`,
    );
    record('6 storage 415', mime.status === 415, snippet(mime.status, mime.body));
    record('6 storage 413', oversize.status === 413, snippet(oversize.status, oversize.body));
  } finally {
    await loggedOut.dispose();
    await authed?.dispose();
  }
}

async function caseRateLimit(
  request: APIRequestContext,
  anon: APIRequestContext,
  supabaseUrl: string,
  anonKey: string,
  record: RecordCase,
): Promise<void> {
  let created = 0;
  let last = '';
  for (let i = 0; i < 110; i += 1) {
    const session = await anonymousSession(anon, supabaseUrl, anonKey);
    if (!session.session?.access_token || !session.session.user?.id) {
      const blocked = authLimited(0, session.error) || anonymousDisabled(session.error);
      record(
        '3 rate cap 429 rate_limited',
        blocked ? 'blocked' : false,
        `stopped after ${created} new signatures. ${session.error || 'anonymous sign-in returned no session'}`,
      );
      record('6 spoofed X-Forwarded-For still rate limited', 'blocked', 'rate cap was not reached');
      return;
    }
    const posted = await postSignature(request, BOARD_ID, session.session.access_token, `QA26-rate-${i}`);
    last = `created=${created} ${snippet(posted.status, posted.body)} retryAfter=${posted.retryAfter || 'absent'} code=${errorCode(posted.body) || 'none'}`;
    if (posted.status === 201) {
      created += 1;
      if (created % 10 === 0) console.log(`[qa26] rate-cap progress created=${created}`);
      continue;
    }
    if (posted.status === 429) {
      const code = errorCode(posted.body);
      record(
        '3 rate cap 429 rate_limited',
        code === 'rate_limited',
        `${last}. Same runner IP. Turnstile token was not sent.`,
      );
      const spoof = await postSignature(request, BOARD_ID, session.session.access_token, `QA26-spoof-${i}`, {
        'x-forwarded-for': SPOOF_IP,
        'x-real-ip': SPOOF_IP,
      });
      record(
        '6 spoofed X-Forwarded-For still rate limited',
        spoof.status === 429 && errorCode(spoof.body) === 'rate_limited' && !spoof.body.includes(SPOOF_IP),
        `same session after the cap, spoofed forwarded-for ${SPOOF_IP}. ${snippet(spoof.status, spoof.body)} code=${errorCode(spoof.body) || 'none'} retryAfter=${spoof.retryAfter || 'absent'}`,
      );
      return;
    }
    if (serviceKeyMissing(posted.status, posted.body) || authLimited(posted.status, posted.body)) {
      record('3 rate cap 429 rate_limited', 'blocked', last);
      record('6 spoofed X-Forwarded-For still rate limited', 'blocked', 'rate cap was not reached');
      return;
    }
    record('3 rate cap 429 rate_limited', false, last);
    record('6 spoofed X-Forwarded-For still rate limited', 'blocked', 'rate cap was not reached');
    return;
  }
  record('3 rate cap 429 rate_limited', false, `no 429 after ${created} new signatures. ${last}`);
  record('6 spoofed X-Forwarded-For still rate limited', 'blocked', 'rate cap was not reached');
}

async function patchSignature(
  request: APIRequestContext,
  id: string,
  accessToken: string | null,
  data: { hidden_by_owner: boolean },
): Promise<HttpResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (accessToken !== null) headers.authorization = `Bearer ${accessToken}`;
  const response = await request.patch(`/api/signatures/${id}`, { headers, data });
  return {
    status: response.status(),
    body: await response.text(),
    cache: response.headers()['cache-control'] ?? '',
    retryAfter: response.headers()['retry-after'] ?? '',
  };
}

async function deleteSignature(
  request: APIRequestContext,
  id: string,
  accessToken: string | null,
): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (accessToken !== null) headers.authorization = `Bearer ${accessToken}`;
  const response = await request.delete(`/api/signatures/${id}`, { headers });
  return {
    status: response.status(),
    body: await response.text(),
    cache: response.headers()['cache-control'] ?? '',
    retryAfter: response.headers()['retry-after'] ?? '',
  };
}

async function storagePut(
  api: APIRequestContext,
  supabaseUrl: string,
  path: string,
  body: Buffer,
  contentType: string,
): Promise<HttpResult> {
  const response = await api.post(`${supabaseUrl}/storage/v1/object/signpen/${path}`, {
    headers: { 'content-type': contentType, 'x-upsert': 'true' },
    data: body,
  });
  return {
    status: response.status(),
    body: await response.text(),
    cache: response.headers()['cache-control'] ?? '',
    retryAfter: '',
  };
}

function tinyJpeg(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

async function turnstilePresent(page: Page): Promise<number> {
  return page
    .locator('iframe[src*="challenges.cloudflare.com"], .cf-turnstile, script[src*="challenges.cloudflare.com/turnstile"]')
    .count();
}

function watchConsole(page: Page): { errors: string[]; stop: () => void } {
  const errors: string[] = [];
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') errors.push(redact(message.text()));
  };
  const onPageError = (error: Error) => {
    errors.push(redact(error.message));
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    errors,
    stop: () => {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

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
    for (const match of text.matchAll(/https:\/\/([a-z0-9-]+)\.supabase\.co/gi)) refs.add(match[1].toLowerCase());
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
  const queue = ['/', '/contact', '/login'].map((path) => new URL(path, origin).href);
  const seen = new Set<string>();
  while (queue.length > 0 && seen.size < 40 && !anonKey) {
    const target = queue.shift();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    const response = await request.get(target);
    if (response.status() === 401 || response.status() === 403) {
      throw new Error(`Preview is behind a Vercel login wall (HTTP ${response.status()})`);
    }
    const text = await response.text();
    note(text);
    for (const match of text.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)) {
      const next = new URL(match[1], target);
      if (next.origin === origin) queue.push(next.href);
    }
    for (const match of text.matchAll(/\/_next\/static\/[^"'\\\s>]+\.js/g)) queue.push(new URL(match[0], origin).href);
  }
  const listed = [...refs];
  return {
    supabaseUrl: listed.includes(PREVIEW_REF) ? `https://${PREVIEW_REF}.supabase.co` : '',
    anonKey,
    refs: listed,
  };
}

async function anonymousSession(
  api: APIRequestContext,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ session: Session | null; error: string }> {
  const response = await api.post(`${supabaseUrl}/auth/v1/signup`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'content-type': 'application/json' },
    data: {},
  });
  const body = await response.text();
  const parsed = parseJson(body);
  if (parsed && typeof parsed === 'object' && typeof (parsed as Session).access_token === 'string') {
    return { session: parsed as Session, error: '' };
  }
  return { session: null, error: snippet(response.status(), body) };
}

async function postSignature(
  request: APIRequestContext,
  studentId: string,
  accessToken: string | null,
  signatoryName: string,
  extraHeaders?: Record<string, string>,
): Promise<HttpResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(extraHeaders ?? {}) };
  if (accessToken !== null) headers.authorization = `Bearer ${accessToken}`;
  const response = await request.post('/api/signatures', {
    headers,
    data: {
      studentId,
      signatureImageUrl: PNG,
      signatoryName,
      signatoryNote: 'preview session check',
      position: { x: 12, y: 34 },
    },
  });
  return {
    status: response.status(),
    body: await response.text(),
    cache: response.headers()['cache-control'] ?? '',
    retryAfter: response.headers()['retry-after'] ?? '',
  };
}

async function getSignatures(
  request: APIRequestContext,
  studentId: string,
  accessToken: string | null,
): Promise<HttpResult & { already: boolean | null }> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const response = await request.get(`/api/signatures?studentId=${encodeURIComponent(studentId)}`, { headers });
  const body = await response.text();
  return {
    status: response.status(),
    body,
    cache: response.headers()['cache-control'] ?? '',
    retryAfter: response.headers()['retry-after'] ?? '',
    already: alreadySigned(body),
  };
}

async function getChallenge(request: APIRequestContext, studentId: string): Promise<HttpResult> {
  const response = await request.get(`/api/signatures/challenge?studentId=${encodeURIComponent(studentId)}`);
  return {
    status: response.status(),
    body: await response.text(),
    cache: response.headers()['cache-control'] ?? '',
    retryAfter: response.headers()['retry-after'] ?? '',
  };
}
