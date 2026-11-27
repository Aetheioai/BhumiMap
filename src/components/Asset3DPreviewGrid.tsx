import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Plus } from 'lucide-react';
import { AssetDefinition, UnitSystem } from '../types/building';
import { buildAsset3DGroup } from '../engine/assetModels3D';
import { formatLength } from '../engine/units';

/**
 * Single shared offscreen Studio WebGL thumbnailer:
 * - Uses RoomEnvironment PBR reflections + 3-point warm/cool studio lighting
 * - Adds a subtle radial contact shadow disc so furniture sits grounded in the preview
 * - Uses per-asset tuned camera angles so flat/recessed items (ponds, hatches) and tall items frame cleanly
 * - Never creates per-card WebGL contexts (zero context-loss storms)
 */
const thumbCache = new Map<string, string>();
let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedScene: THREE.Scene | null = null;
let sharedCamera: THREE.PerspectiveCamera | null = null;
let sharedShadowDisc: THREE.Mesh | null = null;

const THUMB_W = 264;
const THUMB_H = 192;

function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.08)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ensureThumbnailer(): boolean {
  if (sharedRenderer) return true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(THUMB_W, THUMB_H, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();

    // Studio PBR environment for crisp chrome, glass, ceramic & satin teak highlights
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Balanced 3-point studio lighting
    scene.add(new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 0.95));
    const key = new THREE.DirectionalLight(0xfffaf0, 1.55);
    key.position.set(5, 8, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdbeafe, 0.65);
    fill.position.set(-5, 4, -4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(-2, 5, -6);
    scene.add(rim);

    // Reusable soft contact shadow grounding disc
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI * 0.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: createContactShadowTexture(),
      transparent: true,
      depthWrite: false,
    });
    const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDisc.position.y = -0.004;
    scene.add(shadowDisc);

    const camera = new THREE.PerspectiveCamera(32, THUMB_W / THUMB_H, 0.04, 100);

    sharedRenderer = renderer;
    sharedScene = scene;
    sharedCamera = camera;
    sharedShadowDisc = shadowDisc;
    return true;
  } catch {
    return false;
  }
}

function disposeGroup(group: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry && !mesh.geometry.userData?.sharedGeo) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) {
        if (!mats.has(m)) {
          mats.add(m);
          m.dispose();
        }
      }
    }
  });
}

const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

function renderAssetThumbnail(def: AssetDefinition): string {
  const cached = thumbCache.get(def.id);
  if (cached) return cached;
  if (!ensureThumbnailer() || !sharedRenderer || !sharedScene || !sharedCamera) return '';

  const model = buildAsset3DGroup(def.id, def.defaultWidth, def.defaultDepth, def.defaultHeight, {});
  sharedScene.add(model);

  _box.setFromObject(model);
  _box.getCenter(_center);
  _box.getSize(_size);

  // Position contact shadow cleanly under floor-standing objects (skip ceiling/recessed)
  if (sharedShadowDisc) {
    const showShadow = def.elevationBand !== 'ceiling' && !def.isRecessed;
    sharedShadowDisc.visible = showShadow;
    if (showShadow) {
      sharedShadowDisc.position.set(_center.x, _box.min.y - 0.004, _center.z);
      sharedShadowDisc.scale.set(
        Math.max(0.5, _size.x * 1.48),
        1,
        Math.max(0.5, _size.z * 1.48)
      );
    }
  }

  const yaw = ((def.previewCamera?.yawDeg ?? 35) * Math.PI) / 180;
  const pitch = ((def.previewCamera?.pitchDeg ?? 27) * Math.PI) / 180;
  const zoom = def.previewCamera?.zoom ?? 1.08;

  // Tight bounding-sphere framing tailored to camera FOV & aspect ratio
  const radius = Math.max(0.28, _size.length() * 0.5);
  const vFov = THREE.MathUtils.degToRad(sharedCamera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * sharedCamera.aspect);
  const limitingFov = Math.min(vFov, hFov);
  const dist = (radius / Math.sin(limitingFov * 0.5)) / zoom;

  const horiz = Math.cos(pitch) * dist;
  sharedCamera.position.set(
    _center.x + Math.sin(yaw) * horiz,
    _center.y + Math.sin(pitch) * dist,
    _center.z + Math.cos(yaw) * horiz
  );
  sharedCamera.lookAt(_center);

  sharedRenderer.clear();
  sharedRenderer.render(sharedScene, sharedCamera);

  const url = sharedRenderer.domElement.toDataURL('image/png');
  sharedScene.remove(model);
  disposeGroup(model);
  thumbCache.set(def.id, url);
  return url;
}

/** Crisp architectural SVG silhouette placeholder while WebGL thumbnails warm up */
const AssetSilhouetteFallback: React.FC<{ def: AssetDefinition }> = ({ def }) => (
  <svg
    viewBox="0 0 64 48"
    className="w-12 h-9 text-slate-300"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden="true"
  >
    {def.isStair ? (
      <>
        <rect x="12" y="8" width="40" height="32" rx="2" />
        <path d="M12 16h40M12 24h40M12 32h40M32 36V12m0 0l-5 5m5-5l5 5" />
      </>
    ) : def.category === 'bedroom' ? (
      <>
        <rect x="14" y="10" width="36" height="28" rx="2" />
        <rect x="18" y="14" width="12" height="7" rx="1" />
        <rect x="34" y="14" width="12" height="7" rx="1" />
        <path d="M14 25h36" />
      </>
    ) : def.category === 'bath' ? (
      <>
        <rect x="20" y="10" width="24" height="8" rx="1.5" />
        <ellipse cx="32" cy="29" rx="11" ry="10" />
      </>
    ) : (
      <>
        <rect x="12" y="12" width="40" height="24" rx="2" />
        <path d="M12 20h40M26 20v16M38 20v16" />
      </>
    )}
  </svg>
);

interface Asset3DPreviewGridProps {
  assets: AssetDefinition[];
  unit: UnitSystem;
  activeAssetId?: string | null;
  onSelectToPlace: (def: AssetDefinition) => void;
  onQuickPlace?: (def: AssetDefinition) => void;
  canDragDrop2D?: boolean;
  onStartDragAsset?: (assetId: string) => void;
  onEndDragAsset?: () => void;
}

export const Asset3DPreviewGrid: React.FC<Asset3DPreviewGridProps> = ({
  assets,
  unit,
  activeAssetId = null,
  onSelectToPlace,
  onQuickPlace,
  canDragDrop2D = false,
  onStartDragAsset,
  onEndDragAsset,
}) => {
  const [thumbs, setThumbs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const a of assets) {
      const hit = thumbCache.get(a.id);
      if (hit) initial[a.id] = hit;
    }
    return initial;
  });

  useEffect(() => {
    let cancelled = false;
    const cachedBatch: Record<string, string> = {};
    const missing: AssetDefinition[] = [];

    for (const a of assets) {
      const hit = thumbCache.get(a.id);
      if (hit) {
        cachedBatch[a.id] = hit;
      } else {
        missing.push(a);
      }
    }

    if (Object.keys(cachedBatch).length > 0) {
      setThumbs((prev) => ({ ...prev, ...cachedBatch }));
    }

    if (missing.length === 0) return;

    let idx = 0;
    let rafId = 0;

    // Render 4 studio thumbnails per animation frame so all 44 appear smoothly in ~180ms
    const step = () => {
      if (cancelled) return;
      const batchEnd = Math.min(idx + 4, missing.length);
      const batchMap: Record<string, string> = {};
      for (; idx < batchEnd; idx++) {
        const def = missing[idx];
        const url = renderAssetThumbnail(def);
        if (url) batchMap[def.id] = url;
      }
      if (Object.keys(batchMap).length > 0) {
        setThumbs((prev) => ({ ...prev, ...batchMap }));
      }
      if (idx < missing.length) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [assets]);

  return (
    /* Dedicated scroll viewport separate from CSS Grid so cards NEVER compress vertically */
    <div className="flex-1 min-h-0 overflow-y-auto studio-scroll">
      <div className="p-2.5 grid grid-cols-2 gap-2.5">
        {assets.map((def) => {
          const src = thumbs[def.id];
          const isActive = activeAssetId === def.id;
          return (
            <div
              key={def.id}
              draggable={canDragDrop2D}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', def.id);
                e.dataTransfer.effectAllowed = 'copy';
                onStartDragAsset?.(def.id);
              }}
              onDragEnd={() => onEndDragAsset?.()}
              className={`group relative flex flex-col shrink-0 rounded-lg border bg-white transition-[border-color,box-shadow] duration-150 overflow-hidden text-left ${
                isActive
                  ? 'border-blue-600 ring-2 ring-blue-600/20'
                  : 'border-slate-200 hover:border-blue-500'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectToPlace(def)}
                title={`${def.name} — ${def.description}`}
                className="flex flex-col items-stretch text-left w-full focus-visible:outline-none"
              >
                <div className="relative h-[88px] w-full shrink-0 bg-[#f8fafc] flex items-center justify-center overflow-hidden border-b border-slate-100">
                  {src ? (
                    <img
                      src={src}
                      alt={def.name}
                      className="h-full w-full object-contain p-1.5 transition-transform duration-150 ease-out group-hover:scale-[1.06]"
                      draggable={false}
                    />
                  ) : (
                    <AssetSilhouetteFallback def={def} />
                  )}
                </div>
                <div className="px-2 py-2 flex flex-col gap-0.5 bg-white">
                  <div className="text-[11.5px] font-semibold text-slate-900 leading-snug line-clamp-1">
                    {def.name}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500 leading-tight">
                    {formatLength(def.defaultWidth, unit)} × {formatLength(def.defaultDepth, unit)}
                  </div>
                </div>
              </button>

              {canDragDrop2D && onQuickPlace && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickPlace(def);
                  }}
                  title="Quick-place onto active floor"
                  aria-label={`Quick place ${def.name}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md bg-white/95 hover:bg-blue-700 hover:text-white text-slate-600 border border-slate-200 shadow-xs transition-[opacity,background-color,color] duration-150"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
