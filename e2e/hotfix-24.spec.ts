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
const OWNER_EMAIL = 'qa+hotfix24@example.com';
const OWNER_PASSWORD = 'Preview-Hotfix24-Only';
const PROBE_IP = '203.0.113.77';
const SPOOF_IP = '203.0.113.88';

type CaseResult = {
  name: string;
  ok: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  evidence: string;
};

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

test.describe('PR 24 security hotfix', () => {
  test.skip(
    process.env.E2E_HOTFIX !== '1',
    'E2E_HOTFIX=1 runs this file against the preview Supabase only',
  );

  test('preview lockdown', async ({ page, request }) => {
    test.setTimeout(240_000);
    const results: CaseResult[] = [];
    const record = (
      name: string,
      ok: boolean,
      severity: CaseResult['severity'],
      evidence: string,
    ) => {
      results.push({ name, ok, severity: ok ? 'none' : severity, evidence });
      console.log(`[hotfix] ${ok ? 'PASS' : 'FAIL'} ${name} :: ${evidence}`);
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

    let owner: Session | null = null;
    let ownerId = '';
    let ownerBlocker = '';
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
          false,
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
          false,
          'low',
          `anonymous session unavailable (${anonymousError || 'no token'}), so this half was not called`,
        );
      }

      await caseClientBundle(request, baseURL, record);
      await casePublicRpcShape(anon, discovered.supabaseUrl, discovered.anonKey, '', record);

      const signup = await signUpOwner(anon, discovered.supabaseUrl, discovered.anonKey);
      owner = signup.session;
      ownerBlocker = signup.blocker;
      ownerId = owner?.user?.id ?? '';
      if (ownerBlocker) {
        record('4 owner signup', false, 'high', ownerBlocker);
      } else if (!owner?.access_token || !ownerId) {
        ownerBlocker = 'signup returned no session and no confirmation error';
        record('4 owner signup', false, 'high', ownerBlocker);
      } else {
        record('4 owner signup', true, 'none', `signed in; uid ${ownerId}`);
      }

      let studentReady = false;
      if (owner?.access_token && ownerId) {
        studentReady = await ensureStudent(page, owner, ownerId, baseURL, record);
        if (studentReady) {
          await casePublicRpcShape(
            anon,
            discovered.supabaseUrl,
            discovered.anonKey,
            ownerId,
            record,
          );
        }
      }

      await caseFeedbackWall(page, baseURL, record);

      if (!studentReady) {
        record(
          '2 board, sign, already-signed',
          false,
          'high',
          ownerBlocker || 'no preview board could be created for the throwaway owner',
        );
        record(
          '8 GET /api/signatures IP',
          false,
          'medium',
          'skipped the probe comparison because no board was signed',
        );
      } else {
        await caseBoardAndSign(
          page,
          request,
          baseURL,
          ownerId,
          anonymous,
          anonymousError,
          record,
        );
      }

      await caseStorage(
        discovered.supabaseUrl,
        discovered.anonKey,
        owner,
        ownerId,
        ownerBlocker,
        record,
      );

      if (owner?.access_token && ownerId && studentReady) {
        await caseDashboard(page, baseURL, owner, ownerId, record);
      } else {
        record(
          '5 dashboard',
          false,
          'high',
          ownerBlocker || 'owner session or board was not available',
        );
      }
    } finally {
      await anon.dispose();
    }

    const failed = results.filter((item) => !item.ok);
    console.log(`[hotfix] ${results.length - failed.length} passed, ${failed.length} failed`);
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

async function caseBoardAndSign(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
  studentId: string,
  anonymous: Session | null,
  anonymousError: string,
  record: (name: string, ok: boolean, severity: CaseResult['severity'], evidence: string) => void,
): Promise<void> {
  const errors = collectConsole(page);
  const response = await page.goto(new URL(`/${studentId}`, baseURL).href, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  const wall = await isLoginWall(page, status);
  const heading = await page.getByText("Sign-Off", { exact: false }).first().isVisible().catch(() => false);
  const before = await signatureProbe(request, studentId);
  let signEvidence = anonymousError || 'no anonymous session';
  let signed = false;
  let secondRefused = false;
  if (anonymous?.access_token) {
    const first = await postSignature(request, studentId, anonymous.access_token);
    signEvidence = `first ${snippet(first.status, first.body)}`;
    signed = first.status === 201;
    const second = await postSignature(request, studentId, anonymous.access_token);
    signEvidence += `; second ${snippet(second.status, second.body)}`;
    secondRefused = second.status === 409 || /already signed/i.test(second.body);
  }
  const after = await signatureProbe(request, studentId);
  const boardOk = !wall && status === 200 && heading;
  const signOk = signed && secondRefused;
  record(
    '2 board, sign, already-signed',
    boardOk && signOk,
    wall ? 'critical' : 'high',
    `board HTTP ${status} heading=${heading} loginWall=${wall}; ${signEvidence}; console=${errors.join('; ') || 'none'}`,
  );

  const leaked =
    before.ips.length > 0 || after.ips.length > 0 || before.bodyHasIp || after.bodyHasIp;
  const queryProbes = before.queryDiffers || after.queryDiffers;
  const headerProbes = signed && after.spoofDiffers;
  record(
    '8 GET /api/signatures IP',
    !leaked && !queryProbes && !headerProbes && before.status < 500 && after.status < 500,
    leaked ? 'critical' : 'high',
    `before ${before.evidence}; after ${after.evidence}`,
  );
}

async function caseStorage(
  supabaseUrl: string,
  anonKey: string,
  owner: Session | null,
  ownerId: string,
  ownerBlocker: string,
  record: (name: string, ok: boolean, severity: CaseResult['severity'], evidence: string) => void,
): Promise<void> {
  const loggedOut = await newRequest.newContext({
    extraHTTPHeaders: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  const lines: string[] = [];
  let ok = true;
  try {
    const rejected = await storagePut(
      loggedOut,
      supabaseUrl,
      'profile-photos/00000000-0000-4000-8000-000000000024/qa.jpg',
      tinyJpeg(),
      'image/jpeg',
    );
    lines.push(`logged-out jpeg ${snippet(rejected.status, rejected.body)}`);
    if (rejected.status < 300) ok = false;

    if (!owner?.access_token || !ownerId) {
      lines.push(`owner uploads not run (${ownerBlocker || 'no session'})`);
      ok = false;
    } else {
      const authed = await newRequest.newContext({
        extraHTTPHeaders: { apikey: anonKey, Authorization: `Bearer ${owner.access_token}` },
      });
      try {
        const big = Buffer.alloc(5 * 1024 * 1024 + 1);
        big[0] = 0xff;
        big[1] = 0xd8;
        big[2] = 0xff;
        const over = await storagePut(
          authed,
          supabaseUrl,
          `profile-photos/${ownerId}/too-big.jpg`,
          big,
          'image/jpeg',
        );
        lines.push(`over-5mb ${snippet(over.status, over.body)}`);
        if (over.status < 300) ok = false;

        const txt = await storagePut(
          authed,
          supabaseUrl,
          `profile-photos/${ownerId}/note.txt`,
          Buffer.from('not an image'),
          'text/plain',
        );
        const svg = await storagePut(
          authed,
          supabaseUrl,
          `profile-photos/${ownerId}/photo.svg`,
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
          'image/svg+xml',
        );
        const exe = await storagePut(
          authed,
          supabaseUrl,
          `profile-photos/${ownerId}/photo.exe`,
          Buffer.from('MZ not-an-image'),
          'application/octet-stream',
        );
        lines.push(`txt ${snippet(txt.status, txt.body)}`);
        lines.push(`svg ${snippet(svg.status, svg.body)}`);
        lines.push(`exe ${snippet(exe.status, exe.body)}`);
        if (txt.status < 300 || svg.status < 300 || exe.status < 300) ok = false;

        const jpeg = await storagePut(
          authed,
          supabaseUrl,
          `profile-photos/${ownerId}/qa.jpg`,
          tinyJpeg(),
          'image/jpeg',
        );
        const png = await storagePut(
          authed,
          supabaseUrl,
          `profile-photos/${ownerId}/qa.png`,
          tinyPng(),
          'image/png',
        );
        lines.push(`owner jpeg ${snippet(jpeg.status, jpeg.body)}`);
        lines.push(`owner png ${snippet(png.status, png.body)}`);
        if (jpeg.status >= 300 || png.status >= 300) ok = false;
      } finally {
        await authed.dispose();
      }
    }
  } finally {
    await loggedOut.dispose();
  }
  record('4 storage', ok, 'high', lines.join(' | '));
}

async function caseDashboard(
  page: Page,
  baseURL: string,
  owner: Session,
  ownerId: string,
  record: (name: string, ok: boolean, severity: CaseResult['severity'], evidence: string) => void,
): Promise<void> {
  const errors = collectConsole(page);
  const signatureUrls: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/rest/v1/signatures')) {
      signatureUrls.push(`HTTP ${response.status()} ${redact(url.split('?')[0])}`);
    }
  });
  await page.addInitScript(
    ([key, raw]) => {
      localStorage.setItem(key, raw);
    },
    [`sb-${PREVIEW_REF}-auth-token`, JSON.stringify(owner)] as const,
  );
  const response = await page.goto(new URL('/dashboard', baseURL).href, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  const wall = await isLoginWall(page, status);
  const heading = await page.getByRole('heading', { name: 'Take a closer look.' }).isVisible({ timeout: 20_000 }).catch(() => false);
  const consoleErrors = errors.join('; ');
  record(
    '5 dashboard',
    !wall && status === 200 && heading && consoleErrors.length === 0,
    wall ? 'critical' : 'medium',
    `HTTP ${status} heading=${heading} loginWall=${wall} uid=${ownerId} signatures=${signatureUrls.join(',') || 'no signatures response yet'} console=${consoleErrors || 'none'}`,
  );
}

async function ensureStudent(
  page: Page,
  owner: Session,
  ownerId: string,
  baseURL: string,
  record: (name: string, ok: boolean, severity: CaseResult['severity'], evidence: string) => void,
): Promise<boolean> {
  await page.addInitScript(
    ([key, raw, name]) => {
      localStorage.setItem(key, raw);
      localStorage.setItem('signup_name', name);
    },
    [`sb-${PREVIEW_REF}-auth-token`, JSON.stringify(owner), 'QA Hotfix24'] as const,
  );
  const response = await page.goto(new URL('/dashboard', baseURL).href, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  const heading = await page.getByRole('heading', { name: 'Take a closer look.' }).isVisible({ timeout: 20_000 }).catch(() => false);
  record(
    '5 dashboard creates board',
    status === 200 && heading,
    'high',
    `HTTP ${status} heading=${heading} uid=${ownerId}`,
  );
  return status === 200 && heading;
}

async function signUpOwner(
  api: APIRequestContext,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ session: Session | null; blocker: string }> {
  const headers = { ...authHeaders(anonKey, null), 'content-type': 'application/json' };
  const created = await api.post(`${supabaseUrl}/auth/v1/signup`, {
    headers,
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD, data: { full_name: 'QA Hotfix24' } },
  });
  const createdBody = await created.text();
  const createdSession = sessionFrom(createdBody);
  if (createdSession?.access_token && createdSession.user?.id) {
    return { session: createdSession, blocker: '' };
  }
  const signedIn = await api.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers,
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  const signedBody = await signedIn.text();
  const session = sessionFrom(signedBody);
  if (session?.access_token && session.user?.id) return { session, blocker: '' };
  const message = redact(`${snippet(created.status(), createdBody)}; sign-in ${snippet(signedIn.status(), signedBody)}`);
  if (/confirm/i.test(createdBody) || /confirm/i.test(signedBody)) {
    return { session: null, blocker: `email confirmation blocks sign-in. ${message}` };
  }
  return { session: null, blocker: message };
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
  accessToken: string,
): Promise<{ status: number; body: string }> {
  const response = await request.post('/api/signatures', {
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    data: {
      studentId,
      signatureImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      signatoryName: 'QA Hotfix Signer',
      signatoryNote: 'preview hotfix check',
      position: { x: 0.12, y: 0.34 },
    },
  });
  return { status: response.status(), body: await response.text() };
}

async function signatureProbe(request: APIRequestContext, studentId: string): Promise<{
  status: number;
  evidence: string;
  ips: string[];
  bodyHasIp: boolean;
  queryDiffers: boolean;
  spoofDiffers: boolean;
}> {
  const plain = await request.get(`/api/signatures?studentId=${encodeURIComponent(studentId)}`);
  const plainBody = await plain.text();
  const withQuery = await request.get(
    `/api/signatures?studentId=${encodeURIComponent(studentId)}&ip=${PROBE_IP}&p_ip=${PROBE_IP}`,
  );
  const queryBody = await withQuery.text();
  const spoofed = await request.get(`/api/signatures?studentId=${encodeURIComponent(studentId)}`, {
    headers: { 'x-forwarded-for': SPOOF_IP, 'x-real-ip': SPOOF_IP },
  });
  const spoofBody = await spoofed.text();
  const blobs = [plainBody, queryBody, spoofBody];
  const ips = blobs.flatMap((body) => body.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []);
  const plainFlag = readAlready(plainBody);
  const queryFlag = readAlready(queryBody);
  const spoofFlag = readAlready(spoofBody);
  return {
    status: plain.status(),
    ips,
    bodyHasIp: ips.length > 0 || blobs.some((body) => body.includes(PROBE_IP) || body.includes(SPOOF_IP)),
    queryDiffers: plainFlag !== null && queryFlag !== null && plainFlag !== queryFlag,
    spoofDiffers: plainFlag !== null && spoofFlag !== null && plainFlag !== spoofFlag,
    evidence: `plain ${snippet(plain.status(), plainBody)}; query ${snippet(withQuery.status(), queryBody)}; x-forwarded-for ${snippet(spoofed.status(), spoofBody)}`,
  };
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

function tinyPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}
