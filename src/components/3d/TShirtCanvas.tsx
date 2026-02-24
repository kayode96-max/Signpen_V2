'use client';

/**
 * TShirtCanvas – React wrapper around a Three.js 3-D t-shirt scene.
 *
 * Responsibilities:
 *  • Owns the Three.js renderer lifecycle (create → animate → dispose).
 *  • Loads the GLTF model from /model/tshirt.gltf (served by Next.js public/).
 *  • Composites signature images onto the shirt texture via an offscreen canvas.
 *  • Exposes `onShirtClick(uv)` so parent components can show a signature dialog.
 *  • Exposes `addSignature(canvas, uv)` so the parent can bake a drawn signature.
 *  • Exposes `clearAll()` and `undoLast()` for toolbar buttons.
 *  • Exposes `getScreenshot()` → data-URL for download / save.
 */

import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ─── Public API exposed via ref ────────────────────────────────────────────
export interface TShirtCanvasRef {
  /** Bake a signature canvas image onto the shirt at the given UV position */
  addSignature: (
    sigCanvas: HTMLCanvasElement,
    uv: { x: number; y: number },
    size?: { width: number; height: number }
  ) => boolean;
  /** Bake a signature from a remote URL onto the shirt (for existing Firestore sigs) */
  addSignatureFromUrl: (
    url: string,
    position: { x: number; y: number },
    size?: { width: number; height: number }
  ) => Promise<void>;
  /** Remove the last item placed on the shirt */
  undoLast: () => boolean;
  /** Remove all items placed on the shirt */
  clearAll: () => void;
  /** Returns a PNG data-URL of the current canvas */
  getScreenshot: () => string;
}

export interface ExistingSignature {
  signatureImageUrl: string;
  position: { x: number; y: number };
}

interface TShirtCanvasProps {
  /** Called whenever the user clicks on the shirt surface; receives normalised UV {x, y} */
  onShirtClick?: (uv: { x: number; y: number }) => void;
  /** Pre-existing signatures to bake in on load */
  existingSignatures?: ExistingSignature[];
  /** Whether clicking is disabled (read-only / gallery mode) */
  readOnly?: boolean;
  className?: string;
}

// ─── Texture dimensions ─────────────────────────────────────────────────────
const TEX_W = 2048;
const TEX_H = 2048;
const SIG_RADIUS = 150; // minimum pixel distance between signatures
const toUvFromPercentPosition = (
  position?: { x?: number; y?: number } | null
): { x: number; y: number } | null => {
  if (!position) return null;
  if (typeof position.x !== 'number' || typeof position.y !== 'number') return null;
  return {
    x: THREE.MathUtils.clamp(position.x / 100, 0, 1),
    y: THREE.MathUtils.clamp(1 - position.y / 100, 0, 1),
  };
};

// ─── Component ──────────────────────────────────────────────────────────────
const TShirtCanvas = forwardRef<TShirtCanvasRef, TShirtCanvasProps>(
  ({ onShirtClick, existingSignatures, readOnly = false, className }, ref) => {
    const mountRef = useRef<HTMLDivElement>(null);

    // Three.js objects kept in refs so they don't cause re-renders
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const shirtMeshRef = useRef<THREE.Mesh | null>(null);
    const modelRef = useRef<THREE.Group | null>(null);
    const raycasterRef = useRef(new THREE.Raycaster());
    const mouseRef = useRef(new THREE.Vector2());
    const rafRef = useRef<number>(0);
    const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

    // Compositing state kept in refs
    const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const compositeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const compositeTextureRef = useRef<THREE.CanvasTexture | null>(null);
    const originalTextureRef = useRef<THREE.Texture | null>(null);
    const placedItemsRef = useRef<
      Array<{
        canvas: HTMLCanvasElement;
        uv: { x: number; y: number };
        size: { width: number; height: number };
      }>
    >([]);
    const signedAreasRef = useRef<Array<{ x: number; y: number }>>([]);
    const isLoadedRef = useRef(false);
    // Track which existing sig URLs have already been baked in
    const loadedUrlsRef = useRef<Set<string>>(new Set());
    // All mesh parts of the shirt (used for full-surface raycasting)
    const shirtMeshesRef = useRef<THREE.Mesh[]>([]);

    // ── Compositing helpers ────────────────────────────────────────────────
    const redrawComposite = useCallback(() => {
      const ctx = compositeCtxRef.current;
      const tex = compositeTextureRef.current;
      if (!ctx || !tex) return;

      ctx.clearRect(0, 0, TEX_W, TEX_H);

      // Draw original shirt texture as base
      const orig = originalTextureRef.current;
      if (orig?.image) {
        try {
          ctx.drawImage(orig.image, 0, 0, TEX_W, TEX_H);
        } catch {
          ctx.fillStyle = '#f5f5f0';
          ctx.fillRect(0, 0, TEX_W, TEX_H);
        }
      } else {
        ctx.fillStyle = '#f5f5f0';
        ctx.fillRect(0, 0, TEX_W, TEX_H);
      }

      // Draw each placed item
      for (const item of placedItemsRef.current) {
        const px = item.uv.x * TEX_W - item.size.width / 2;
        const py = (1 - item.uv.y) * TEX_H - item.size.height / 2;
        try {
          ctx.drawImage(item.canvas, px, py, item.size.width, item.size.height);
        } catch {/* skip if canvas was GC'd */}
      }

      tex.needsUpdate = true;
    }, []);

    // ── Public API ─────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      addSignature(sigCanvas, uv, size = { width: 280, height: 120 }) {
        // Check distance from existing signatures
        const px = uv.x * TEX_W;
        const py = (1 - uv.y) * TEX_H;
        for (const area of signedAreasRef.current) {
          const d = Math.hypot(px - area.x, py - area.y);
          if (d < SIG_RADIUS) return false;
        }
        placedItemsRef.current.push({ canvas: sigCanvas, uv, size });
        signedAreasRef.current.push({ x: px, y: py });
        redrawComposite();
        return true;
      },

      async addSignatureFromUrl(url, position, size = { width: 340, height: 140 }) {
        return new Promise<void>((resolve) => {
          const uv = toUvFromPercentPosition(position);
          if (!uv) {
            resolve();
            return;
          }
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const offscreen = document.createElement('canvas');
            offscreen.width = img.naturalWidth;
            offscreen.height = img.naturalHeight;
            const ctx = offscreen.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            const px = uv.x * TEX_W;
            const py = (1 - uv.y) * TEX_H;
            placedItemsRef.current.push({ canvas: offscreen, uv, size });
            signedAreasRef.current.push({ x: px, y: py });
            redrawComposite();
            resolve();
          };
          img.onerror = () => resolve(); // skip on error
          img.src = url;
        });
      },

      undoLast() {
        if (placedItemsRef.current.length === 0) return false;
        placedItemsRef.current.pop();
        signedAreasRef.current.pop();
        redrawComposite();
        return true;
      },

      clearAll() {
        placedItemsRef.current = [];
        signedAreasRef.current = [];
        redrawComposite();
      },

      getScreenshot() {
        const renderer = rendererRef.current;
        if (!renderer) return '';
        renderer.render(sceneRef.current!, cameraRef.current!);
        return renderer.domElement.toDataURL('image/png');
      },
    }));

    // ── Bake in new existingSignatures whenever they arrive ────────────────
    const existingSignaturesRef = useRef(existingSignatures);
    useEffect(() => {
      existingSignaturesRef.current = existingSignatures;
    });

    useEffect(() => {
      if (!existingSignatures || existingSignatures.length === 0) return;
      if (!isLoadedRef.current) return; // wait for model to finish loading
      const bake = async () => {
        for (const sig of existingSignatures) {
          if (!sig?.signatureImageUrl) continue;
          if (loadedUrlsRef.current.has(sig.signatureImageUrl)) continue;
          const uv = toUvFromPercentPosition(sig.position);
          if (!uv) continue;
          loadedUrlsRef.current.add(sig.signatureImageUrl);
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const offscreen = document.createElement('canvas');
              offscreen.width = img.naturalWidth;
              offscreen.height = img.naturalHeight;
              const ctx = offscreen.getContext('2d')!;
              ctx.drawImage(img, 0, 0);
              const px = uv.x * TEX_W;
              const py = (1 - uv.y) * TEX_H;
              placedItemsRef.current.push({ canvas: offscreen, uv, size: { width: 340, height: 140 } });
              signedAreasRef.current.push({ x: px, y: py });
              redrawComposite();
              resolve();
            };
            img.onerror = () => resolve();
            img.src = sig.signatureImageUrl;
          });
        }
      };
      bake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existingSignatures]);

    // ── Scene setup ────────────────────────────────────────────────────────
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x111111);
      sceneRef.current = scene;

      // Camera
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 500;
      const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
      camera.position.set(0, 0.5, 4.5);
      cameraRef.current = camera;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Controls – only horizontal rotation
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 2.5;
      controls.maxDistance = 8;
      controls.target.set(0, 0.5, 0);
      controls.minPolarAngle = Math.PI / 2;
      controls.maxPolarAngle = Math.PI / 2;
      controlsRef.current = controls;

      // Lighting
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(6, 12, 8);
      key.castShadow = true;
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x87ceeb, 0.6);
      fill.position.set(-8, 6, 5);
      scene.add(fill);
      const back = new THREE.DirectionalLight(0xffffff, 0.4);
      back.position.set(0, 5, -6);
      scene.add(back);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.6));

      // Composite canvas / texture
      const cc = document.createElement('canvas');
      cc.width = TEX_W;
      cc.height = TEX_H;
      compositeCanvasRef.current = cc;
      const ctx = cc.getContext('2d', { willReadFrequently: false, alpha: true })!;
      compositeCtxRef.current = ctx;
      ctx.fillStyle = '#f5f5f0';
      ctx.fillRect(0, 0, TEX_W, TEX_H);
      const ct = new THREE.CanvasTexture(cc);
      ct.colorSpace = THREE.SRGBColorSpace;
      ct.anisotropy = 16;
      compositeTextureRef.current = ct;

      // Load GLTF model
      const loader = new GLTFLoader();
      loader.load(
        '/model/tshirt.gltf',
        (gltf) => {
          const model = gltf.scene;
          modelRef.current = model;

          shirtMeshesRef.current = [];
          let shirtMesh: THREE.Mesh | null = null;
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              shirtMeshesRef.current.push(mesh); // collect every part for raycasting
              if (!shirtMesh) shirtMesh = mesh;
              if (child.name === 'Object_4' || (mesh.material as THREE.MeshStandardMaterial)?.name === 'material') {
                shirtMesh = mesh;
              }
            }
          });

          if (!shirtMesh) return;
          shirtMeshRef.current = shirtMesh;

          // Capture original texture from the primary mesh, then apply composite
          // to ALL mesh parts so the full shirt surface updates correctly.
          const mat = (shirtMesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
          const applyCompositeToAll = () => {
            redrawComposite();
            for (const m of shirtMeshesRef.current) {
              const mMat = m.material as THREE.MeshStandardMaterial;
              mMat.map = ct;
              mMat.needsUpdate = true;
            }
          };
          if (mat.map) {
            originalTextureRef.current = mat.map;
            if (mat.map.image?.complete ?? false) {
              applyCompositeToAll();
            } else {
              mat.map.image?.addEventListener?.('load', applyCompositeToAll);
              // fallback after short delay
              setTimeout(applyCompositeToAll, 800);
            }
          } else {
            applyCompositeToAll();
          }

          model.position.set(0, 0, 0);
          model.scale.set(0, 0, 0);
          scene.add(model);

          // Grow animation
          const start = Date.now();
          const dur = 1500;
          const grow = () => {
            const t = Math.min((Date.now() - start) / dur, 1);
            const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            model.scale.setScalar(1.8 * e);
            if (t < 1) requestAnimationFrame(grow);
            else {
              isLoadedRef.current = true;
              // Bake any existing signatures that arrived before the model was ready
              const sigs = existingSignaturesRef.current;
              if (sigs && sigs.length > 0) {
                const bakeInitial = async () => {
                  for (const sig of sigs) {
                    if (!sig?.signatureImageUrl) continue;
                    if (loadedUrlsRef.current.has(sig.signatureImageUrl)) continue;
                    const uv = toUvFromPercentPosition(sig.position);
                    if (!uv) continue;
                    loadedUrlsRef.current.add(sig.signatureImageUrl);
                    await new Promise<void>((resolve) => {
                      const img = new Image();
                      img.crossOrigin = 'anonymous';
                      img.onload = () => {
                        const offscreen = document.createElement('canvas');
                        offscreen.width = img.naturalWidth;
                        offscreen.height = img.naturalHeight;
                        const ctx = offscreen.getContext('2d')!;
                        ctx.drawImage(img, 0, 0);
                        const px = uv.x * TEX_W;
                        const py = (1 - uv.y) * TEX_H;
                        placedItemsRef.current.push({ canvas: offscreen, uv, size: { width: 340, height: 140 } });
                        signedAreasRef.current.push({ x: px, y: py });
                        redrawComposite();
                        resolve();
                      };
                      img.onerror = () => resolve();
                      img.src = sig.signatureImageUrl;
                    });
                  }
                };
                bakeInitial();
              }
            }
          };
          requestAnimationFrame(grow);
        },
        undefined,
        (err) => console.error('GLTF load error', err)
      );

      // Animation loop
      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Resize handler
      const onResize = () => {
        if (!container) return;
        const nw = container.clientWidth;
        const nh = container.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener('resize', onResize);

      return () => {
        window.removeEventListener('resize', onResize);
        cancelAnimationFrame(rafRef.current);
        controls.dispose();
        renderer.dispose();
        container.removeChild(renderer.domElement);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Click → UV detection ───────────────────────────────────────────────
    const handleCanvasClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (readOnly) return;
        if (pointerDownRef.current) {
          const dx = e.clientX - pointerDownRef.current.x;
          const dy = e.clientY - pointerDownRef.current.y;
          if (Math.hypot(dx, dy) > 6) return;
        }
        const container = mountRef.current;
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        const shirtMesh = shirtMeshRef.current;
        if (!container || !renderer || !camera || !shirtMesh) return;

        const rect = container.getBoundingClientRect();
        mouseRef.current.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );

        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        // Intersect against ALL mesh parts so the full shirt surface is clickable
        const meshes = shirtMeshesRef.current.length > 0 ? shirtMeshesRef.current : (shirtMesh ? [shirtMesh] : []);
        const hits = raycasterRef.current.intersectObjects(meshes, false);
        if (hits.length > 0 && hits[0].uv) {
          const uv = { x: hits[0].uv.x, y: hits[0].uv.y };
          onShirtClick?.(uv);
        }
      },
      [onShirtClick, readOnly]
    );

    return (
      <div
        ref={mountRef}
        onMouseDown={(e) => {
          pointerDownRef.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={handleCanvasClick}
        className={className}
        style={{ width: '100%', height: '100%', cursor: readOnly ? 'grab' : 'crosshair' }}
      />
    );
  }
);

TShirtCanvas.displayName = 'TShirtCanvas';
export default TShirtCanvas;
