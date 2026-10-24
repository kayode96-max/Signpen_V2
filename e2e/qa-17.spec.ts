import { expect, test, type APIRequestContext, type APIResponse, type Page, type TestInfo } from '@playwright/test';
import { measurePage, publishProjectSamples } from './perf-baseline';
import { collectConsole, horizontalOverflow } from './support';

/**
 * QA for PR #17 after it was rebased on #26. UI signing writes a signature,
 * so the file runs only when E2E_QA17=1. Other smoke runs skip it.
 * `boardUrl` is not on this branch; src/lib/public/board-url.test.mjs stays skipped.
 */

const BOARD_ID = process.env.TEST_BOARD_ID?.trim() || '512025e9-9b28-40a8-8322-8a01711aa4bc';
const TOTAL_CAP = 1_048_576;
const FILE_CAP = 307_200;
const MAIN_LOCAL_GATED = 4_406_735;

const PAGES: { path: '/' | '/contact' | '/login'; ready: (page: Page) => ReturnType<Page['getByText']> }[] = [
  { path: '/', ready: (page) => page.getByRole('heading', { name: /Your Digital Yearbook, Reimagined/i }) },
  { path: '/contact', ready: (page) => page.getByRole('heading', { name: /Drop a Review, Comment, or Message/i }) },
  { path: '/login', ready: (page) => page.getByText('Welcome Back', { exact: true }) },
];

function qa17(testInfo: TestInfo): void {
  testInfo.skip(process.env.E2E_QA17 !== '1', 'E2E_QA17=1 runs this file against the #17 preview');
}

function refuseProduction(): string {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  const host = new URL(baseURL).hostname.toLowerCase();
  if (host === 'signpen.xyz' || host === 'www.signpen.xyz' || host.endsWith('.signpen.xyz')) {
    throw new Error('Refusing to run against production signpen.xyz');
  }
  return baseURL;
}

test('7 mixed-case redirect and unknown 404', async ({ request }, testInfo) => {
  qa17(testInfo);
  test.skip(testInfo.project.name !== 'chromium', 'API redirects are checked once');
  const baseURL = refuseProduction();
  // Follow the protection-cookie redirect once so later maxRedirects:0 reads are the app.
  await request.get('/');
  const mixed = BOARD_ID.toUpperCase();
  const query = 'from=QR';
  const pageRedirect = await getApp(request, `/${mixed}?${query}`, baseURL);
  const apiRedirect = await getApp(request, `/api/boards/${mixed}/signatures?${query}`, baseURL);
  const pageLocation = locationPath(pageRedirect.headers().location ?? '', baseURL);
  const apiLocation = locationPath(apiRedirect.headers().location ?? '', baseURL);
  const unknown = '00000000-0000-4000-8000-00000000017a';
  const unknownApi = await getApp(request, `/api/boards/${unknown}/signatures`, baseURL);
  const unknownPage = await getApp(request, `/${unknown}`, baseURL);
  const slugApi = await getApp(request, '/api/boards/qa-unknown-2026/signatures', baseURL);
  const slugPage = await getApp(request, '/qa-unknown-2026', baseURL);
  const slugRedirect = await getApp(request, '/api/boards/QA-UNKNOWN-2026/signatures?from=QR', baseURL);
  const evidence = [
    `page ${pageRedirect.status()} -> ${pageLocation || 'no location'} cache=${pageRedirect.headers()['cache-control'] || 'absent'}`,
    `api ${apiRedirect.status()} -> ${apiLocation || 'no location'} cache=${apiRedirect.headers()['cache-control'] || 'absent'}`,
    `unknown uuid api ${unknownApi.status()} cache=${unknownApi.headers()['cache-control'] || 'absent'}`,
    `unknown uuid page ${unknownPage.status()} cache=${unknownPage.headers()['cache-control'] || 'absent'}`,
    `slug api ${slugApi.status()} cache=${slugApi.headers()['cache-control'] || 'absent'}`,
    `slug page ${slugPage.status()} cache=${slugPage.headers()['cache-control'] || 'absent'}`,
    `upper slug ${slugRedirect.status()} -> ${locationPath(slugRedirect.headers().location ?? '', baseURL) || 'no location'}`,
    'boardUrl unit test stays skipped on this branch: src/lib/public/student-public.ts does not export boardUrl',
  ].join(' | ');
  console.log(`[qa17] 7 ${evidence}`);
  expect(pageRedirect.status(), evidence).toBe(308);
  expect(pageLocation, evidence).toBe(`/${BOARD_ID}?${query}`);
  expect(apiRedirect.status(), evidence).toBe(308);
  expect(apiLocation, evidence).toBe(`/api/boards/${BOARD_ID}/signatures?${query}`);
  expect((apiRedirect.headers()['cache-control'] ?? '').toLowerCase(), evidence).not.toContain('s-maxage');
  expect(apiRedirect.headers()['cache-control'] ?? '', evidence).toContain('max-age=60');
  for (const response of [unknownApi, unknownPage, slugApi, slugPage]) {
    const cache = (response.headers()['cache-control'] ?? '').toLowerCase();
    expect(response.status(), evidence).toBe(404);
    expect(cache, evidence).toContain('no-store');
    expect(cache, evidence).not.toContain('s-maxage');
  }
  expect(slugRedirect.status(), evidence).toBe(308);
  expect(locationPath(slugRedirect.headers().location ?? '', baseURL), evidence).toBe(
    '/api/boards/qa-unknown-2026/signatures?from=QR',
  );
});

test('9 pass the phone stays hidden', async ({ page }, testInfo) => {
  qa17(testInfo);
  test.skip(testInfo.project.name !== 'chromium', 'checked once on the board page');
  const baseURL = refuseProduction();
  const response = await page.goto(new URL(`/${BOARD_ID}`, baseURL).href, { waitUntil: 'domcontentloaded' });
  const html = await page.content();
  const visible = await page.getByText(/pass the phone/i).count();
  const evidence = `HTTP ${response?.status() ?? 0} visible=${visible} sourceMatch=${/pass the phone/i.test(html)}`;
  console.log(`[qa17] 9 ${evidence}`);
  expect(response?.status(), evidence).toBe(200);
  expect(html, evidence).not.toMatch(/pass the phone/i);
  expect(visible, evidence).toBe(0);
});

test('8 smoke pages and contact overflow', async ({ page, isMobile }, testInfo) => {
  qa17(testInfo);
  const lines: string[] = [];
  const failures: string[] = [];
  for (const { path, ready } of PAGES) {
    const consoleErrors = collectConsole(page);
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    await ready(page).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    const visible = await ready(page).isVisible().catch(() => false);
    await page.waitForTimeout(1500);
    let overflow = 'n/a';
    if (isMobile) {
      const layout = await horizontalOverflow(page);
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      const delta = widths.scroll - widths.client;
      overflow = layout.overflow
        ? `OVERFLOW delta=${delta}px scroll=${widths.scroll} client=${widths.client} ${layout.offenders.join('; ') || 'no element past the viewport'}`
        : `none delta=${delta}px`;
      if (layout.overflow) failures.push(`${path} ${overflow}`);
    }
    const errors = consoleErrors.errors();
    if (status !== 200) failures.push(`${path} HTTP ${status}`);
    if (!visible) failures.push(`${path} ready text missing`);
    if (errors.length > 0) failures.push(`${path} console ${errors.join('; ')}`);
    lines.push(`${path} HTTP ${status} ready=${visible} overflow=${overflow} console=${errors.length}`);
  }
  const evidence = `${testInfo.project.name} ${lines.join(' | ')}`;
  console.log(`[qa17] 8 ${evidence}`);
  expect(failures, `${evidence} :: ${failures.join(' || ')}`).toEqual([]);
});

test('6 UI signing on the board', async ({ page }, testInfo) => {
  qa17(testInfo);
  test.skip(testInfo.project.name === 'iPhone 12', 'signing is Chromium and Pixel 5');
  test.setTimeout(180_000);
  const baseURL = refuseProduction();
  const project = testInfo.project.name;
  let bearer = false;
  let postStatus = 0;
  let postError = '';
  let signatureId = '';
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !req.url().includes('/api/signatures')) return;
    const header = req.headers().authorization ?? '';
    bearer = /^bearer\s+\S{10,}/i.test(header);
  });
  page.on('response', async (response) => {
    const req = response.request();
    if (req.method() !== 'POST' || !response.url().includes('/api/signatures')) return;
    postStatus = response.status();
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== 'object') return;
    const parsed = body as { signature_id?: unknown; error?: unknown };
    if (typeof parsed.signature_id === 'string') signatureId = parsed.signature_id;
    if (typeof parsed.error === 'string') postError = parsed.error.slice(0, 180);
  });

  const response = await page.goto(new URL(`/${BOARD_ID}`, baseURL).href, { waitUntil: 'domcontentloaded' });
  expect(response?.status() ?? 0, 'board page').toBe(200);
  await dismissInstructions(page);
  const phone = await page.getByText(/pass the phone/i).count();
  const opened = await openSigningDialog(page);
  expect(opened.ok, `${project} ${opened.evidence} passThePhone=${phone}`).toBe(true);
  const name = `QA-17-${project.replace(/\s+/g, '')}-${Date.now()}`;
  const form = page.getByRole('dialog').filter({ hasText: 'Before you sign' });
  // The visible labels are not wired with htmlFor, so the placeholders are the fields.
  await form.getByPlaceholder('Jane Doe').fill(name);
  await form.getByPlaceholder('Wishing you all the best!').fill('preview ui check');
  const openShirt = page.getByRole('button', { name: /Open T-Shirt|Continue/ });
  const label = (await openShirt.textContent()) ?? '';
  if (/Continue/i.test(label)) {
    const evidence = `${project} Turnstile challenge is required before drawing (${label.trim()})`;
    console.log(`[qa17] BLOCKED 6 ${evidence}`);
    test.skip(true, evidence);
    return;
  }
  await openShirt.click();
  const drawError = await drawAndSubmit(page);
  const sent = page.getByText(/Your signature has been sent to/i);
  const failedToast = page.getByText(/Submission Failed|We couldn't save your signature/i);
  await Promise.race([
    sent.waitFor({ state: 'visible', timeout: 25_000 }),
    failedToast.waitFor({ state: 'visible', timeout: 25_000 }),
  ]).catch(() => undefined);
  const success = await sent.isVisible().catch(() => false);
  const signedAt = new Date().toISOString();
  const userId = await anonUserId(page);
  if (postStatus === 201) {
    console.log(
      `[qa17] SIGNATURE utc=${signedAt} anonUserId=${userId || 'none'} signatureId=${signatureId || 'none'} studentId=${BOARD_ID} name=${name} project=${project} bearer=${bearer}`,
    );
  }
  const reloadGet = page
    .waitForResponse(
      (res) => res.url().includes('/api/signatures?studentId=') && res.request().method() === 'GET',
      { timeout: 20_000 },
    )
    .catch(() => null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloadResponse = await reloadGet;
  const reloadAuth = reloadResponse?.request().headers().authorization ?? '';
  const reloadBearer = /^bearer\s+\S{10,}/i.test(reloadAuth);
  await dismissInstructions(page);
  await page.getByRole('button', { name: 'Leave Your Signature' }).click();
  const already = page.getByText("You've already signed this shirt.");
  const again = page.getByRole('dialog').filter({ hasText: 'Before you sign' });
  await Promise.race([
    already.waitFor({ state: 'visible', timeout: 10_000 }),
    again.waitFor({ state: 'visible', timeout: 10_000 }),
  ]).catch(() => undefined);
  const alreadyVisible = await already.isVisible().catch(() => false);
  const evidence = [
    `project=${project}`,
    `draw=${drawError || 'opened'}`,
    `success=${success}`,
    `post=${postStatus}`,
    `bearer=${bearer}`,
    `reloadBearer=${reloadBearer}`,
    `alreadySignedVisible=${alreadyVisible}`,
    `utc=${signedAt}`,
    `anonUserId=${userId || 'none'}`,
    `signatureId=${signatureId || 'none'}`,
    `passThePhone=${phone}`,
  ].join(' ');
  console.log(`[qa17] 6 ${evidence} postError=${postError || 'none'}`);
  if (postStatus === 503 && /service role|not configured|SUPABASE_SERVICE_ROLE_KEY/i.test(postError)) {
    console.log(`[qa17] BLOCKED 6 ${project} service role key is not configured; no signature was created`);
    return;
  }
  expect(drawError, evidence).toBe('');
  expect(success, evidence).toBe(true);
  expect(postStatus, evidence).toBe(201);
  expect(bearer, evidence).toBe(true);
  expect(reloadBearer, evidence).toBe(true);
  expect(alreadyVisible, evidence).toBe(true);
});

test('10 gated slow 3G landing', async ({ browser, browserName }, testInfo) => {
  qa17(testInfo);
  test.skip(testInfo.project.name !== 'chromium', 'desktop Chromium Slow 3G is the comparable row');
  test.setTimeout(420_000);
  const baseURL = refuseProduction();
  const projectUse = testInfo.project.use;
  const sample = await measurePage({
    browser,
    browserName,
    project: testInfo.project.name,
    options: {
      userAgent: projectUse.userAgent,
      viewport: projectUse.viewport ?? undefined,
      deviceScaleFactor: projectUse.deviceScaleFactor,
      isMobile: projectUse.isMobile,
      hasTouch: projectUse.hasTouch,
      extraHTTPHeaders: projectUse.extraHTTPHeaders,
      baseURL: projectUse.baseURL,
    },
    target: { page: '/', path: '/', url: new URL('/', baseURL).href },
  });
  const overTotal = sample.firstViewBytes > TOTAL_CAP;
  const overFile = sample.largestFirstViewFileBytes > FILE_CAP;
  // TODO: flip this back to a failing assertion once PR #18 is on main.
  // Until then, match #25: log the numbers and caps, write them to the results
  // JSON, and emit a GitHub Actions warning when over cap. Do not fail the job
  // on the byte caps. A measurement error is still a real failure.
  const evidence = [
    `preview=${baseURL}`,
    `env=github-actions-preview`,
    `mainLocalGated=${MAIN_LOCAL_GATED}`,
    `firstViewBytes=${sample.firstViewBytes}`,
    `inclusive=${sample.inclusiveFirstViewBytes}`,
    `lazy=${sample.lazyBytes}`,
    `largest=${sample.largestFirstViewFileBytes}`,
    `fcpMs=${sample.fcpMs ?? 'n/a'}`,
    `transferred=${sample.transferredBytes}`,
    `requests=${sample.requestCount}`,
    `throttling=${sample.throttling}`,
    `cpu=${sample.cpuThrottle ?? 'n/a'}`,
    `error=${sample.error ?? 'none'}`,
    `overTotal=${overTotal}`,
    `overFile=${overFile}`,
    `caps total<=${TOTAL_CAP} file<=${FILE_CAP} (report-only until #18 is on main, FCP not gated)`,
  ].join(' ');
  console.log(`[qa17] 10 ${evidence}`);
  const baseline = await publishProjectSamples({
    project: testInfo.project.name,
    samples: [sample],
    baseURL,
    enforced: false,
    budgets: { fcpMs: 5000, firstViewBytes: TOTAL_CAP, firstViewFileBytes: FILE_CAP },
  });
  await testInfo.attach('perf-baseline.json', {
    body: `${JSON.stringify(baseline, null, 2)}\n`,
    contentType: 'application/json',
  });
  if (overTotal || overFile) {
    console.log(
      `::warning file=e2e/qa-17.spec.ts,line=237::Gated Slow 3G first view is over cap until #18 is on main: firstViewBytes=${sample.firstViewBytes} (cap ${TOTAL_CAP}) largestFile=${sample.largestFirstViewFileBytes} (cap ${FILE_CAP})`,
    );
  }
  expect(sample.error, evidence).toBeUndefined();
});

function locationPath(location: string, baseURL: string): string {
  if (!location) return '';
  const url = new URL(location, baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  return `${url.pathname}${url.search}`;
}

/**
 * The bypass header can answer with a 307 back to the same path so the
 * protection cookie can be stored. That hop is not the app redirect.
 */
async function getApp(request: APIRequestContext, path: string, baseURL: string): Promise<APIResponse> {
  const first = await request.get(path, { maxRedirects: 0 });
  const location = locationPath(first.headers().location ?? '', baseURL);
  const requested = locationPath(path, baseURL);
  const cookieHop = (first.status() === 307 || first.status() === 302) && location === requested;
  if (!cookieHop) return first;
  return request.get(path, { maxRedirects: 0 });
}

async function dismissInstructions(page: Page): Promise<void> {
  const gotIt = page.getByRole('button', { name: 'Got it!' });
  const appeared = await gotIt.waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false);
  if (!appeared) return;
  await gotIt.click();
  await gotIt.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
}

async function openSigningDialog(page: Page): Promise<{ ok: boolean; evidence: string }> {
  const button = page.getByRole('button', { name: 'Leave Your Signature' });
  await button.scrollIntoViewIfNeeded().catch(() => undefined);
  try {
    await button.click({ force: true, timeout: 20_000 });
  } catch (error) {
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240);
    return { ok: false, evidence: `click failed ${error instanceof Error ? error.message.split('\n')[0] : 'unknown'} body=${text}` };
  }
  const dialog = page.getByRole('dialog').filter({ hasText: 'Before you sign' });
  const appeared = await dialog.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (appeared) return { ok: true, evidence: '' };
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 280);
  return { ok: false, evidence: `Before you sign dialog did not open. body=${text}` };
}

async function drawAndSubmit(page: Page): Promise<string> {
  const shirt = page.getByRole('dialog').filter({ hasText: 'Sign the T-Shirt' });
  const opened = await shirt.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
  if (!opened) return 'Sign the T-Shirt dialog did not open';
  const loading = shirt.getByText('Loading 3D Model');
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: 45_000 }).catch(() => undefined);
  }
  const webgl = await page.getByText(/webgl/i).count();
  if (webgl > 0) return 'WebGL context was not available';
  const canvas = shirt.locator('canvas').first();
  if (!(await canvas.isVisible().catch(() => false))) return 'shirt canvas is not visible';
  const box = await canvas.boundingBox();
  if (!box || box.width < 20 || box.height < 20) return `shirt canvas box ${box ? `${box.width}x${box.height}` : 'missing'}`;
  const fractions: Array<[number, number]> = [
    [0.5, 0.42],
    [0.5, 0.55],
    [0.4, 0.48],
    [0.6, 0.48],
    [0.5, 0.32],
  ];
  const draw = page.getByRole('dialog').filter({ hasText: 'Draw Your Signature' });
  for (const [x, y] of fractions) {
    await canvas.click({ position: { x: Math.round(box.width * x), y: Math.round(box.height * y) }, force: true });
    if (await draw.isVisible().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  if (!(await draw.isVisible().catch(() => false))) {
    const spot = await page.getByText('Spot Taken').isVisible().catch(() => false);
    return spot ? 'shirt clicks hit Spot Taken only' : 'draw dialog did not open after shirt clicks';
  }
  await draw.getByRole('button', { name: 'Text' }).click();
  await draw.locator('canvas').click({ position: { x: 80, y: 80 }, force: true });
  await draw.getByRole('button', { name: 'Place on Shirt' }).click();
  const submit = shirt.getByRole('button', { name: 'Done & Submit' });
  const enabled = await expect(submit)
    .toBeEnabled({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!enabled) return 'Done & Submit stayed disabled';
  await submit.click();
  return '';
}

async function anonUserId(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.includes('auth-token')) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '') as { user?: { id?: string } };
        if (parsed.user?.id) return parsed.user.id;
      } catch {
        // Session storage is not the user id. Ignore unparsable entries.
      }
    }
    return '';
  });
}
