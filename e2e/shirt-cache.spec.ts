import { expect, test } from './support';
import { SHIRT_MODEL_URL } from '../src/lib/shirt/asset';

/**
 * The hashed shirt GLB is cached for a year. The path is the same constant
 * the 3D canvas loads (`SHIRT_MODEL_URL`, from src/generated/shirt-asset.json).
 * Cache-Control is set in next.config.ts headers(), which `next start` and
 * Vercel both apply. There is no vercel.json.
 */

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

test('hashed shirt GLB is publicly immutable', async ({ request }) => {
  test.skip(test.info().project.name !== 'chromium', 'one header check is enough');
  const response = await request.get(SHIRT_MODEL_URL);
  const cacheControl = response.headers()['cache-control'] ?? '';
  const contentType = (response.headers()['content-type'] ?? '').split(';')[0]?.trim() ?? '';
  expect(response.status(), `${SHIRT_MODEL_URL} status`).toBe(200);
  expect(cacheControl, `${SHIRT_MODEL_URL} Cache-Control`).toBe(IMMUTABLE_CACHE);
  expect(contentType, `${SHIRT_MODEL_URL} Content-Type`).toBe('model/gltf-binary');
});
