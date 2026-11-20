/**
 * Rebuild the public shirt GLB from assets/model-source.
 *
 * Geometry: weld + meshopt simplify + quantization + EXT_meshopt_compression.
 * Textures: WebP (browser-native, so no KTX2/Basis transcoder).
 * Draco is not used: its WASM decoder is about 1.4 MB and would miss the
 * 500 KB budget on its own. The meshopt decoder ships inside three.js
 * (self-hosted, no CDN) and is counted in src/generated/shirt-asset.json.
 *
 *   node scripts/compress-shirt.mjs
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  meshopt,
  prune,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets/model-source/tshirt.gltf');
const outDir = path.join(root, 'public/model');
const manifestPath = path.join(root, 'src/generated/shirt-asset.json');
const decoderPath = path.join(
  root,
  'node_modules/three/examples/jsm/libs/meshopt_decoder.module.js',
);

const ratio = Number(process.env.SHIRT_SIMPLIFY_RATIO || '0.35');
const error = Number(process.env.SHIRT_SIMPLIFY_ERROR || '0.002');
const textureSize = Number(process.env.SHIRT_TEXTURE_SIZE || '1024');

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const document = await io.read(source);
const beforeTris = countTriangles(document);
console.log(`source triangles: ${beforeTris}`);

for (const material of document.getRoot().listMaterials()) {
  // The specular map is a flat white image. A factor keeps the highlight
  // without shipping a third texture.
  const specular = material.getExtension('KHR_materials_specular');
  if (specular && typeof specular.setSpecularTexture === 'function') {
    specular.setSpecularTexture(null);
  }
}

await document.transform(
  dedup(),
  weld({ tolerance: 0.0001 }),
  simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: true }),
  prune(),
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [textureSize, textureSize],
    quality: 75,
  }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);

const afterTris = countTriangles(document);
const glb = await io.writeBinary(document);
const hash = createHash('sha256').update(glb).digest('hex').slice(0, 10);
const filename = `tshirt.${hash}.glb`;

fs.mkdirSync(outDir, { recursive: true });
for (const entry of fs.readdirSync(outDir)) {
  if (/^tshirt\.[a-f0-9]+\.glb$/i.test(entry)) {
    fs.rmSync(path.join(outDir, entry));
  }
}
fs.writeFileSync(path.join(outDir, filename), glb);

const decoderBytes = fs.statSync(decoderPath).size;
const manifest = {
  publicPath: `/model/${filename}`,
  bytes: glb.byteLength,
  hash,
  triangles: afterTris,
  simplify: { ratio, error, textureSize },
  decoder: {
    file: 'node_modules/three/examples/jsm/libs/meshopt_decoder.module.js',
    bytes: decoderBytes,
    note: 'Imported by TShirtCanvas from three.js. WASM is inlined, so nothing is fetched from a CDN.',
  },
  totalBytes: glb.byteLength + decoderBytes,
};
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`triangles: ${beforeTris} -> ${afterTris}`);
console.log(`glb: ${glb.byteLength} bytes (${filename})`);
console.log(`decoder: ${decoderBytes} bytes`);
console.log(`total raw: ${manifest.totalBytes} bytes`);

function countTriangles(doc) {
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const count = indices ? indices.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0);
      triangles += Math.floor(count / 3);
    }
  }
  return triangles;
}
