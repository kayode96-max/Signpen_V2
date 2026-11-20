/**
 * Time from opening a board link to a usable draw pad.
 * Same conditions as the design audit: 360x740, Slow 3G (400 kbps, 400 ms),
 * 4x CPU. The board RPC is mocked. Every non-GET is aborted.
 *
 *   FLOW=legacy BASE=http://127.0.0.1:3010 node scripts/measure-draw-pad.mjs
 *   FLOW=draw-first BASE=http://127.0.0.1:3000 node scripts/measure-draw-pad.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const FLOW = process.env.FLOW || 'draw-first';
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const FAKE = '00000000-0000-4000-8000-0000000a0d17';
const outPath = process.env.OUT || `e2e/results/draw-pad-${FLOW}.json`;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; TECNO KF6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
});

await context.route('**/*', async (route) => {
  const request = route.request();
  const url = request.url();
  const method = request.method();
  const studentRpc = url.includes('/rest/v1/rpc/get_student_public');
  if (studentRpc) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: FAKE,
        name: 'Adaeze Okafor',
        profilePhotoUrl: '',
        pageSettings: {
          pageHeading: "Sign Adaeze's Grad Shirt!",
          pageSubheading: 'UNILAG Class of 2026 — leave me a message',
          backgroundImageUrl: '',
        },
        popupMessageConfig: { title: 'Thank you!', message: 'Your message means a lot.' },
      }),
    });
  }
  if (url.includes('/rest/v1/signatures')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }
  if (url.includes('/api/signatures/challenge')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' });
  }
  if (url.includes('supabase.co') && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  }
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    console.log('BLOCKED', method, url.slice(0, 140));
    return route.abort();
  }
  return route.continue();
});

const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 400,
  downloadThroughput: (400 * 1024) / 8,
  uploadThroughput: (400 * 1024) / 8,
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

const t0 = Date.now();
const stamp = () => Date.now() - t0;
page.on('response', (response) => {
  const url = response.url();
  if (/scene\.bin|\.glb|tshirt/.test(url)) {
    console.log('asset', response.status(), url.split('/').slice(-2).join('/'), 'ms', stamp());
  }
});
await page.goto(`${BASE}/${FAKE}`, { waitUntil: 'commit', timeout: 180000 });
const cta = page.getByRole('button', { name: 'Leave Your Signature' });
await cta.waitFor({ timeout: 180000 });
await page.waitForFunction(() => {
  return [...document.querySelectorAll('button')].some((button) => (
    button.offsetParent && button.innerText.includes('Leave Your Signature') && !button.disabled
  ));
}, null, { timeout: 180000 });
const ctaReady = stamp();

if (FLOW === 'legacy') {
  await cta.click();
  await page.getByPlaceholder('Jane Doe').fill('Audit Tester');
  await page.getByPlaceholder('Wishing you all the best!').fill('Congrats!');
  await page.getByRole('button', { name: 'Open T-Shirt' }).click();
  await page.waitForSelector('text=Sign the T-Shirt', { timeout: 180000 });
  const shirtCanvas = page.locator('[role=dialog] canvas').first();
  await shirtCanvas.waitFor({ state: 'visible', timeout: 180000 });
  const box = await shirtCanvas.boundingBox();
  if (!box) throw new Error('shirt canvas has no box');
  const drawHeading = page.getByRole('heading', { name: 'Draw Your Signature', exact: true });
  let opened = false;
  // A touch tap is treated as a drag, so the shirt ignores it. Dispatch one
  // click at a point on the canvas, and keep trying until the model can be hit.
  // The uncompressed 4.5 MB buffer can take around two minutes on this throttle.
  for (let attempt = 0; attempt < 240 && !opened; attempt += 1) {
    if (attempt % 20 === 0) console.log('click attempt', attempt, 'ms', stamp());
    const x = box.x + box.width * (0.42 + (attempt % 3) * 0.08);
    const y = box.y + box.height * (0.38 + (attempt % 5) * 0.06);
    await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      const target = hit?.closest('canvas')?.parentElement ?? hit;
      if (!target) return;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new MouseEvent('mouseup', opts));
      target.dispatchEvent(new MouseEvent('click', opts));
    }, { x, y });
    opened = await drawHeading.waitFor({ timeout: 700 }).then(() => true).catch(() => false);
  }
  if (!opened) throw new Error('legacy draw pad did not open');
} else {
  await cta.click();
  await page.getByRole('heading', { name: 'Draw Your Signature', exact: true }).waitFor({ timeout: 180000 });
}

await page.waitForFunction(() => {
  const heading = [...document.querySelectorAll('h2, [role=heading]')].find((node) => node.textContent?.trim() === 'Draw Your Signature');
  const dialog = heading?.closest('[role=dialog]');
  const pad = dialog?.querySelector('[data-testid="draw-pad"]');
  const canvas = pad?.querySelector('canvas') || dialog?.querySelector('canvas');
  if (!canvas) return false;
  const box = canvas.getBoundingClientRect();
  const style = getComputedStyle(canvas);
  return box.width > 40 && box.height > 40 && style.visibility !== 'hidden' && style.pointerEvents !== 'none';
}, null, { timeout: 30000 });
const drawReady = stamp();

const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => ({
  name: entry.name,
  transferSize: entry.transferSize,
  encodedBodySize: entry.encodedBodySize,
  decodedBodySize: entry.decodedBodySize,
})));
const shirt = resources.filter((entry) => /scene\.bin|tshirt|\.glb|meshopt|texture/i.test(entry.name));

const result = {
  flow: FLOW,
  base: BASE,
  throttling: '400kbps 400ms rtt 4x cpu 360x740',
  ctaReadyMs: ctaReady,
  drawReadyMs: drawReady,
  shirtResources: shirt,
};
fs.mkdirSync('e2e/results', { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: process.env.SHOT || `e2e/results/draw-pad-${FLOW}.png` });
await browser.close();
