import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { AssetDefinition } from '../types/building';
import { buildAsset3DGroup } from '../engine/assetModels3D';

/**
 * Single shared offscreen WebGL thumbnailer so the entire app NEVER creates
 * per-hover WebGL contexts (eliminates WebGL context loss & console warning storm!).
 */
const thumbCache = new Map<string, string>();
let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedScene: THREE.Scene | null = null;
let sharedCamera: THREE.PerspectiveCamera | null = null;

function ensureThumbnailer(): boolean {
  if (sharedRenderer) return true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 132;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(180, 132, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.25));
    const key = new THREE.DirectionalLight(0xfffbeb, 1.35);
    key.position.set(4, 7, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe0f2fe, 0.55);
    fill.position.set(-4, 3, -3);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(34, 180 / 132, 0.05, 80);

    sharedRenderer = renderer;
    sharedScene = scene;
    sharedCamera = camera;
    return true;
  } catch {
    return false;
  }
}

function disposeGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

function renderAssetThumbnail(def: AssetDefinition): string {
  const cached = thumbCache.get(def.id);
  if (cached) return cached;
  if (!ensureThumbnailer() || !sharedRenderer || !sharedScene || !sharedCamera) return '';

  const model = buildAsset3DGroup(def.id, def.defaultWidth, def.defaultDepth, def.defaultHeight, {});
  sharedScene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const radius = Math.max(0.4, size.length() * 0.52);

  sharedCamera.position.set(
    center.x + radius * 1.45,
    center.y + radius * 1.05,
    center.z + radius * 1.6
  );
  sharedCamera.lookAt(center);
  sharedRenderer.clear();
  sharedRenderer.render(sharedScene, sharedCamera);

  const url = sharedRenderer.domElement.toDataURL('image/png');
  sharedScene.remove(model);
  disposeGroup(model);
  thumbCache.set(def.id, url);
  return url;
}

interface Asset3DPreviewGridProps {
  assets: AssetDefinition[];
  onPlace: (def: AssetDefinition) => void;
  canDragDrop2D?: boolean;
  onStartDragAsset?: (assetId: string) => void;
  onEndDragAsset?: () => void;
}

export const Asset3DPreviewGrid: React.FC<Asset3DPreviewGridProps> = ({
  assets,
  onPlace,
  canDragDrop2D = false,
  onStartDragAsset,
  onEndDragAsset,
}) => {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const next: Record<string, string> = {};
    // Generate missing thumbnails cleanly in micro-batches so UI stays 60fps
    const missing = assets.filter((a) => !thumbCache.has(a.id));
    for (const a of assets) {
      const hit = thumbCache.get(a.id);
      if (hit) next[a.id] = hit;
    }
    if (Object.keys(next).length > 0) {
      setThumbs((prev) => ({ ...prev, ...next }));
    }

    if (missing.length === 0) return;

    let idx = 0;
    let rafId = 0;
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
    <div className="flex-1 overflow-y-auto studio-scroll p-2.5 grid grid-cols-2 gap-2 content-start">
      {assets.map((def) => {
        const src = thumbs[def.id];
        return (
          <button
            key={def.id}
            type="button"
            draggable={canDragDrop2D}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', def.id);
              onStartDragAsset?.(def.id);
            }}
            onDragEnd={() => onEndDragAsset?.()}
            onClick={() => onPlace(def)}
            title={def.description}
            className="group flex flex-col items-stretch rounded-md border border-[#e2e8f0] bg-white hover:border-[#1d4ed8] transition-colors overflow-hidden text-left"
          >
            <div className="relative h-20 w-full bg-[#f8fafc] flex items-center justify-center overflow-hidden border-b border-[#f1f5f9]">
              {src ? (
                <img
                  src={src}
                  alt={def.name}
                  className="h-full w-full object-contain p-1 group-hover:scale-105 transition-transform duration-150"
                  draggable={false}
                />
              ) : (
                <div className="h-7 w-7 rounded bg-[#e2e8f0]" />
              )}
            </div>
            <div className="px-2 py-1.5">
              <div className="text-[11px] font-medium text-[#0f172a] leading-tight truncate">
                {def.name}
              </div>
              <div className="text-[10px] font-mono tabular-nums text-[#64748b] mt-0.5">
                {(def.defaultWidth / 0.3048).toFixed(1)}&apos; × {(def.defaultDepth / 0.3048).toFixed(1)}&apos;
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
