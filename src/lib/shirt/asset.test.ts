import { readFileSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import asset from '@/generated/shirt-asset.json';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BUDGET = 500 * 1024;

function brotliSize(bytes: Buffer): number {
  return brotliCompressSync(bytes, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
}

describe('compressed shirt asset', () => {
  it('keeps the model plus the meshopt decoder under 500 KB raw and brotli', () => {
    const glb = readFileSync(path.join(root, 'public', asset.publicPath));
    const decoder = readFileSync(path.join(root, asset.decoder.file));
    expect(glb.byteLength).toBe(asset.bytes);
    expect(decoder.byteLength).toBe(asset.decoder.bytes);
    expect(glb.byteLength + decoder.byteLength).toBeLessThan(BUDGET);
    expect(brotliSize(glb) + brotliSize(decoder)).toBeLessThan(BUDGET);
  });

  it('is served immutable from the content-hashed path', () => {
    const config = readFileSync(path.join(root, 'next.config.ts'), 'utf8');
    expect(asset.publicPath).toMatch(/^\/model\/tshirt\.[a-f0-9]+\.glb$/);
    expect(config).toContain('shirtAsset.publicPath');
    expect(config).toContain('public, max-age=31536000, immutable');
    const source = readFileSync(path.join(root, 'assets/model-source/tshirt.gltf'), 'utf8');
    expect(source).toContain('scene.bin');
  });
});
