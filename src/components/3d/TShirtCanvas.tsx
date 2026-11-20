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
 *    A new placement replaces this signer's in-progress one only when accepted.
 *  • Exposes `clearAll()` and `undoLast()` for the current signer's placements.
 *    Signatures already on the shirt are left in place.
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
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SHIRT_MODEL_URL } from '@/lib/shirt/asset';
import { canvasDrawSize, shirtIntroScale, shirtIntroSettled, type ShirtIntro } from '@/lib/shirt/intro';
import { readResponseBytes } from '@/lib/shirt/bytes';
import {
  clearSessionPlacements,
  commitSessionPlacement,
  overlapsPlacement,
  texturePointFromUv,
  undoSessionPlacement,
  type ShirtPlacement,
} from './placement-history';

// ─── Public API exposed via ref ────────────────────────────────────────────
export interface TShirtCanvasRef {
  /**
   * Bake this signer's signature at the given UV.
   * Replaces their in-progress placement when the spot is free.
   * Returns false and leaves the shirt unchanged when it is not.
   */
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
  /** Remove the current signer's latest placement. Existing signatures stay. */
  undoLast: () => boolean;
  /** Remove the current signer's placements. Existing signatures stay. */
  clearAll: () => void;
  /** Returns a PNG data-URL of the current canvas */
  getScreenshot: () => string;
}

export interface ExistingSignature {
  signatureImageUrl: string;
  position: { x: number; y: number };
  name?: string;
  note?: string;
}

interface TShirtCanvasProps {
  /** Called whenever the user clicks on the shirt surface; receives normalised UV {x, y} */
  onShirtClick?: (uv: { x: number; y: number }) => void;
  /** Called when the user clicks on an existing signature */
  onExistingSignatureClick?: () => void;
  /** Called when hovering over a signature */
  onHoverSignature?: (sig: ExistingSignature | null, x: number, y: number) => void;
  /** Pre-existing signatures to bake in on load */
  existingSignatures?: ExistingSignature[];
  /** Whether clicking is disabled (read-only / gallery mode) */
  readOnly?: boolean;
  className?: string;
  /** Override the compressed shirt. Defaults to the hashed public GLB. */
  modelUrl?: string;
  /** Already-downloaded GLB. When set, the canvas does not fetch again. */
  modelBuffer?: ArrayBuffer | null;
  onProgress?: (progress: { loadedBytes: number; totalBytes: number | null }) => void;
  onReady?: () => void;
  onModelError?: (message: string) => void;
  /**
   * `grow` is the dashboard and first appearance (1.5s).
   * `none` is a crossfade onto the flat shirt, which must start at full size.
   */
  intro?: ShirtIntro;
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
  ({ onShirtClick, onExistingSignatureClick, onHoverSignature, existingSignatures, readOnly = false, className, modelUrl = SHIRT_MODEL_URL, modelBuffer = null, onProgress, onReady, onModelError, intro = 'grow' }, ref) => {
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

    // Compositing state kept in refs.
    // `existing` entries are other people's signatures. `session` entries are
    // the signature the current signer is placing. Undo/Clear only drop session.
    const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const compositeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const compositeTextureRef = useRef<THREE.CanvasTexture | null>(null);
    const originalTextureRef = useRef<THREE.Texture | null>(null);
    const placedItemsRef = useRef<Array<ShirtPlacement<HTMLCanvasElement>>>([]);
    const isLoadedRef = useRef(false);
    // Track which existing sig URLs have already been baked in
    const loadedUrlsRef = useRef<Set<string>>(new Set());
    // All mesh parts of the shirt (used for full-surface raycasting)
    const shirtMeshesRef = useRef<THREE.Mesh[]>([]);
    const onProgressRef = useRef(onProgress);
    const onReadyRef = useRef(onReady);
    const onErrorRef = useRef(onModelError);
    const modelUrlRef = useRef(modelUrl);
    const modelBufferRef = useRef(modelBuffer);
    const introRef = useRef(intro);
    introRef.current = intro;
    onProgressRef.current = onProgress;
    onReadyRef.current = onReady;
    onErrorRef.current = onModelError;
    modelUrlRef.current = modelUrl;
    modelBufferRef.current = modelBuffer;

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
        const area = texturePointFromUv(uv, TEX_W, TEX_H);
        // Existing signatures count even before their images have been baked,
        // so an auto-placed mark cannot land on someone during the fade-in.
        const existingAreas = (existingSignaturesRef.current ?? []).flatMap((sig) => {
          const sigUv = toUvFromPercentPosition(sig.position);
          if (!sigUv) return [];
          return [{ area: texturePointFromUv(sigUv, TEX_W, TEX_H) }];
        });
        let latestSession = -1;
        for (let i = placedItemsRef.current.length - 1; i >= 0; i--) {
          if (placedItemsRef.current[i].kind === 'session') {
            latestSession = i;
            break;
          }
        }
        const baked = latestSession < 0
          ? placedItemsRef.current
          : placedItemsRef.current.filter((_, index) => index !== latestSession);
        if (overlapsPlacement([...baked, ...existingAreas], area, SIG_RADIUS)) return false;
        const result = commitSessionPlacement(
          placedItemsRef.current,
          { kind: 'session', canvas: sigCanvas, uv, size, area },
          SIG_RADIUS
        );
        if (!result.accepted) return false;
        placedItemsRef.current = result.placements;
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
            placedItemsRef.current.push({
              kind: 'existing',
              canvas: offscreen,
              uv,
              size,
              area: texturePointFromUv(uv, TEX_W, TEX_H),
            });
            redrawComposite();
            resolve();
          };
          img.onerror = () => resolve(); // skip on error
          img.src = url;
        });
      },

      undoLast() {
        const result = undoSessionPlacement(placedItemsRef.current);
        if (!result.removed) return false;
        placedItemsRef.current = result.placements;
        redrawComposite();
        return true;
      },

      clearAll() {
        const result = clearSessionPlacements(placedItemsRef.current);
        if (!result.removed) return;
        placedItemsRef.current = result.placements;
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
              placedItemsRef.current.push({
                kind: 'existing',
                canvas: offscreen,
                uv,
                size: { width: 340, height: 140 },
                area: texturePointFromUv(uv, TEX_W, TEX_H),
              });
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
      sceneRef.current = scene;

      // Camera
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 500;
      const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
      camera.position.set(0, 0.5, 3.5);
      cameraRef.current = camera;

      // Renderer
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch (error) {
        console.error('WebGL unavailable', error);
        onErrorRef.current?.('Could not start the 3D shirt.');
        return;
      }
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
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
      // glTF UVs use the top-left of the image. CanvasTexture flips by default.
      ct.flipY = false;
      ct.anisotropy = 16;
      compositeTextureRef.current = ct;

      // Load the compressed GLB. MeshoptDecoder's WASM is inlined in the
      // three.js module, so the decoder is served with our JS, not a CDN.
      const abort = new AbortController();
      let disposed = false;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const acceptModel = (gltf: { scene: THREE.Group }) => {
        if (disposed) return;
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

          if (!shirtMesh) {
            onErrorRef.current?.('The shirt model did not include a mesh.');
            return;
          }
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

          // Compute center of the loaded model
          const box = new THREE.Box3().setFromObject(model);
          const center = new THREE.Vector3();
          box.getCenter(center);

          // Shift the model so its true visual center is at (0,0,0)
          model.position.sub(center);

          // Wrap it in a pivot group
          const pivot = new THREE.Group();
          pivot.add(model);
          
          pivot.scale.setScalar(0);
          scene.add(pivot);

          // Adjust orbit controls to rotate exactly around this new center
          controls.target.set(0, 0, 0);

          const settleIntro = () => {
            if (disposed) return;
            pivot.scale.setScalar(shirtIntroScale('none', 0));
            isLoadedRef.current = true;
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
                      placedItemsRef.current.push({
                        kind: 'existing',
                        canvas: offscreen,
                        uv,
                        size: { width: 340, height: 140 },
                        area: texturePointFromUv(uv, TEX_W, TEX_H),
                      });
                      redrawComposite();
                      resolve();
                    };
                    img.onerror = () => resolve();
                    img.src = sig.signatureImageUrl;
                  });
                }
              };
              void bakeInitial();
            }
            onReadyRef.current?.();
          };

          if (introRef.current === 'none') {
            settleIntro();
          } else {
            const start = Date.now();
            const grow = () => {
              if (disposed) return;
              const elapsed = Date.now() - start;
              pivot.scale.setScalar(shirtIntroScale('grow', elapsed));
              if (!shirtIntroSettled('grow', elapsed)) requestAnimationFrame(grow);
              else settleIntro();
            };
            requestAnimationFrame(grow);
          }
      };

      void (async () => {
        try {
          await MeshoptDecoder.ready;
          let buffer = modelBufferRef.current;
          if (!buffer) {
            const response = await fetch(modelUrlRef.current, { signal: abort.signal });
            if (!response.ok) throw new Error(`Shirt download failed (${response.status})`);
            buffer = await readResponseBytes(response, (loadedBytes, totalBytes) => {
              onProgressRef.current?.({ loadedBytes, totalBytes });
            });
          }
          if (disposed) return;
          loader.parse(
            buffer,
            '',
            (gltf) => acceptModel(gltf),
            (err) => {
              console.error('GLTF load error', err);
              const message = err instanceof Error ? err.message : 'Could not read the 3D shirt.';
              onErrorRef.current?.(message);
            },
          );
        } catch (err) {
          if (disposed || (err instanceof DOMException && err.name === 'AbortError')) return;
          console.error('GLTF load error', err);
          const message = err instanceof Error ? err.message : 'Could not load the 3D shirt.';
          onErrorRef.current?.(message);
        }
      })();

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
        const size = canvasDrawSize(container.clientWidth, container.clientHeight);
        if (!size) return;
        const aspect = size.width / size.height;
        camera.aspect = aspect;

        // Dynamically scale the camera so the shirt fills the screen optimally.
        // If the screen is narrower than the shirt (aspect < 0.75), zoom out to fit the width.
        // If the screen is wider, cap the zoom at 1 so the height doesn't get chopped off.
        camera.zoom = Math.min(1, aspect / 0.75);

        camera.updateProjectionMatrix();

        // Update pixel ratio on every resize to perfectly catch browser zooming (Ctrl +)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
        renderer.setSize(size.width, size.height);
      };
      window.addEventListener('resize', onResize);
      const resizeObserver = new ResizeObserver(() => onResize());
      resizeObserver.observe(container);
      onResize();

      return () => {
        disposed = true;
        abort.abort();
        resizeObserver.disconnect();
        window.removeEventListener('resize', onResize);
        cancelAnimationFrame(rafRef.current);
        controls.dispose();
        renderer.dispose();
        container.removeChild(renderer.domElement);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Mouse Interaction ───────────────────────────────────────────────
    const currentHoveredUrlRef = useRef<string | null>(null);

    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!onHoverSignature || !existingSignaturesRef.current) return;
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
        const meshes = shirtMeshesRef.current.length > 0 ? shirtMeshesRef.current : (shirtMesh ? [shirtMesh] : []);
        const hits = raycasterRef.current.intersectObjects(meshes, false);
        
        let hovered: ExistingSignature | null = null;

        if (hits.length > 0 && hits[0].uv) {
          const hitUV = hits[0].uv;
          const w = 340 / TEX_W / 2;
          const h = 140 / TEX_H / 2;
          
          for (const sig of existingSignaturesRef.current) {
             const uv = toUvFromPercentPosition(sig.position);
             if (!uv) continue;
             if (Math.abs(hitUV.x - uv.x) < w && Math.abs(hitUV.y - uv.y) < h) {
               hovered = sig;
               break;
             }
          }
        }

        const hoverUrl = hovered?.signatureImageUrl || null;
        if (hoverUrl !== currentHoveredUrlRef.current) {
          currentHoveredUrlRef.current = hoverUrl;
          onHoverSignature(hovered, e.clientX, e.clientY);
          container.style.cursor = hovered ? 'help' : (readOnly ? 'grab' : 'crosshair');
        } else if (hovered) {
          onHoverSignature(hovered, e.clientX, e.clientY);
        }
      },
      [onHoverSignature, readOnly]
    );

    const handleMouseLeave = useCallback(() => {
      if (currentHoveredUrlRef.current !== null && onHoverSignature) {
        currentHoveredUrlRef.current = null;
        onHoverSignature(null, 0, 0);
      }
    }, [onHoverSignature]);

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
        const meshes = shirtMeshesRef.current.length > 0 ? shirtMeshesRef.current : (shirtMesh ? [shirtMesh] : []);
        const hits = raycasterRef.current.intersectObjects(meshes, false);
        if (hits.length > 0 && hits[0].uv) {
          const hitUV = hits[0].uv;
          const w = 340 / TEX_W / 2;
          const h = 140 / TEX_H / 2;
          let clickedExisting = false;
          
          for (const sig of existingSignaturesRef.current || []) {
            const sigUv = toUvFromPercentPosition(sig.position);
            if (!sigUv) continue;
            if (Math.abs(hitUV.x - sigUv.x) < w && Math.abs(hitUV.y - sigUv.y) < h) {
              clickedExisting = true;
              break;
            }
          }

          if (clickedExisting) {
            onExistingSignatureClick?.();
          } else {
            const uv = { x: hitUV.x, y: hitUV.y };
            onShirtClick?.(uv);
          }
        }
      },
      [onShirtClick, onExistingSignatureClick, readOnly]
    );

    return (
      <div
        ref={mountRef}
        onMouseDown={(e) => {
          pointerDownRef.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={className}
        style={{ width: '100%', height: '100%', cursor: readOnly ? 'grab' : 'crosshair' }}
      />
    );
  }
);

TShirtCanvas.displayName = 'TShirtCanvas';
export default TShirtCanvas;
