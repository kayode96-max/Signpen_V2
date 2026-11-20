/**
 * Raycast the original shirt and print the UV under the default camera.
 * Used once to place auto-suggested spots on the front panel.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FileLoader } from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const model = path.resolve(process.argv[2] || 'public/model/tshirt.gltf');
const source = JSON.parse(fs.readFileSync(model, 'utf8'));
for (const material of source.materials ?? []) {
  delete material.pbrMetallicRoughness?.baseColorTexture;
  delete material.normalTexture;
  delete material.emissiveTexture;
  delete material.occlusionTexture;
  delete material.extensions;
}
delete source.images;
delete source.textures;
delete source.extensionsUsed;
delete source.extensionsRequired;
const binUri = source.buffers?.[0]?.uri;
if (binUri && !binUri.startsWith('data:')) {
  const binPath = path.resolve(path.dirname(model), binUri);
  fs.copyFileSync(binPath, '/tmp/scene.bin');
  source.buffers[0].uri = 'scene.bin';
}
const stripped = path.join('/tmp', 'tshirt-probe.gltf');
fs.writeFileSync(stripped, JSON.stringify(source));
const url = pathToFileURL(stripped).href;
globalThis.self = globalThis;

FileLoader.prototype.load = function loadLocal(fileUrl, onLoad, _onProgress, onError) {
  try {
    const filePath = fileUrl.startsWith('file:') ? fileURLToPath(fileUrl) : fileUrl;
    const buf = fs.readFileSync(filePath);
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    onLoad(arrayBuffer);
  } catch (error) {
    console.error('local load failed', fileUrl, error);
    if (onError) onError(error);
    else throw error;
  }
};

const loader = new GLTFLoader();
const gltf = await loader.loadAsync(url);
const modelRoot = gltf.scene;

const box = new THREE.Box3().setFromObject(modelRoot);
const center = new THREE.Vector3();
box.getCenter(center);
modelRoot.position.sub(center);
const pivot = new THREE.Group();
pivot.add(modelRoot);
pivot.scale.setScalar(2.5);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
camera.position.set(0, 0.5, 3.5);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);
pivot.updateMatrixWorld(true);

const meshes = [];
pivot.traverse((child) => {
  if (child.isMesh) meshes.push(child);
});

const raycaster = new THREE.Raycaster();
const samples = [];
for (let iy = 0; iy <= 6; iy++) {
  for (let ix = 0; ix <= 6; ix++) {
    const ndcX = -0.45 + (ix / 6) * 0.9;
    const ndcY = -0.35 + (iy / 6) * 0.7;
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length || !hits[0].uv) continue;
    samples.push({
      ndcX: Number(ndcX.toFixed(3)),
      ndcY: Number(ndcY.toFixed(3)),
      mesh: hits[0].object.name,
      uvx: Number(hits[0].uv.x.toFixed(4)),
      uvy: Number(hits[0].uv.y.toFixed(4)),
      posY: Number(((1 - hits[0].uv.y) * 100).toFixed(2)),
      posX: Number((hits[0].uv.x * 100).toFixed(2)),
    });
  }
}
console.log(JSON.stringify(samples, null, 2));
