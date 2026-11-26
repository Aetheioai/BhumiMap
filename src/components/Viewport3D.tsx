import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BuildingProject, LightingPreset, PhysicsReport, SelectionTarget } from '../types/building';
import {
  buildBuildingScene,
  BuiltBuildingScene,
  disposeBuiltScene,
} from '../engine/threeBuilder';
import { getSkyBackdropTexture } from '../engine/textures3D';

export type CameraPreset = 'exterior' | 'street' | 'isometric' | 'front' | 'top' | 'corner';

export interface Viewport3DHandle {
  applyCameraPreset: (preset: CameraPreset) => void;
  exportSnapshotPng: () => string | null;
}

interface Viewport3DProps {
  project: BuildingProject;
  physics: PhysicsReport;
  viewMode: '2.5d' | '3d';
  lightingPreset: LightingPreset;
  showSiteContext: boolean;
  activeStoryIndex: number;
  showAllStories: boolean;
  showCeilingRoof: boolean;
  cutawayRatio: number;
  explodeGap: number; // meters between stories (0 = stacked normal)
  heatmapMode: boolean;
  xrayStructural: boolean;
  showSetbacks: boolean;
  selection: SelectionTarget | null;
  compact?: boolean;
  onSelect: (target: SelectionTarget | null) => void;
  onToggleOpening?: (storyIndex: number, wallId: string, openingId: string) => void;
  onMoveAsset?: (storyIndex: number, assetId: string, x: number, z: number) => void;
  onMovePillar?: (storyIndex: number, pillarId: string, x: number, z: number) => void;
}

const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const DRAG_DEADZONE_PX = 6;

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(function Viewport3D(
  {
    project,
    physics,
    viewMode,
    lightingPreset,
    showSiteContext,
    activeStoryIndex,
    showAllStories,
    showCeilingRoof,
    cutawayRatio,
    explodeGap,
    heatmapMode,
    xrayStructural,
    showSetbacks,
    selection,
    compact = false,
    onSelect,
    onToggleOpening,
    onMoveAsset,
    onMovePillar,
  },
  ref
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [contextLost, setContextLost] = useState(false);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onToggleOpeningRef = useRef(onToggleOpening);
  onToggleOpeningRef.current = onToggleOpening;
  const onMoveAssetRef = useRef(onMoveAsset);
  onMoveAssetRef.current = onMoveAsset;
  const onMovePillarRef = useRef(onMovePillar);
  onMovePillarRef.current = onMovePillar;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const projectRef = useRef(project);
  projectRef.current = project;
  const explodeGapRef = useRef(explodeGap);
  explodeGapRef.current = explodeGap;
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    hemi: THREE.HemisphereLight;
    keyLight: THREE.DirectionalLight;
    rimLight: THREE.DirectionalLight;
    ground: THREE.Mesh;
    gridHelper: THREE.GridHelper;
    perspCamera: THREE.PerspectiveCamera;
    orthoCamera: THREE.OrthographicCamera;
    activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    controls: OrbitControls;
    building: BuiltBuildingScene | null;
    isSoftwareGl: boolean;
    requestRender: () => void;
    setCameraGoal: (pos: THREE.Vector3, look: THREE.Vector3, orthoZoom?: number) => void;
    frustumSize: number;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const isLowPowerDevice =
      typeof navigator !== 'undefined' &&
      ((navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
        ((navigator as { deviceMemory?: number }).deviceMemory !== undefined &&
          ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4));
    const width = Math.max(100, container.clientWidth);
    const height = Math.max(100, container.clientHeight);
    const aspect = width / height;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.setSize(width, height);
    const maxDpr = isSoftwareGl ? 1 : isLowPowerDevice ? 1.5 : 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = getSkyBackdropTexture('daylight');
    scene.fog = new THREE.Fog(0xdbe8f5, 62, 165);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xf0f8ff, 0x94a3b8, 0.9);
    hemi.position.set(0, 42, 0);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfffaf0, 1.68);
    keyLight.position.set(24, 36, 24);
    keyLight.castShadow = !isSoftwareGl;
    const shadowSize = compact || isLowPowerDevice ? 1024 : 1536;
    keyLight.shadow.mapSize.width = shadowSize;
    keyLight.shadow.mapSize.height = shadowSize;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 120;
    keyLight.shadow.camera.left = -30;
    keyLight.shadow.camera.right = 30;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xcfe4ff, 0.5);
    rimLight.position.set(-22, 18, -20);
    scene.add(rimLight);

    // Wide ground plane aligned below road datum (-0.64m) to eliminate any Z-fighting with plot grass (-0.45m) or road (-0.60m)
    const groundGeo = new THREE.PlaneGeometry(260, 260);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xe3eaef,
      roughness: 0.95,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.64;
    ground.receiveShadow = true;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(96, 96, 0x94a3b8, 0xcbd5e1);
    gridHelper.position.set(6, -0.62, 6);
    const gridMats = Array.isArray(gridHelper.material) ? gridHelper.material : [gridHelper.material];
    gridMats.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.36;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -1;
    });
    scene.add(gridHelper);

    const perspCamera = new THREE.PerspectiveCamera(42, aspect, 0.1, 280);
    perspCamera.position.set(18, 14, 19);

    const frustumSize = 22;
    const orthoCamera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      -90,
      280
    );
    orthoCamera.position.set(24, 20, 24);
    orthoCamera.zoom = 1.0;
    orthoCamera.updateProjectionMatrix();

    const initialCamera = viewModeRef.current === '2.5d' ? orthoCamera : perspCamera;
    const controls = new OrbitControls(initialCamera, renderer.domElement);
    controls.target.set(5, 2.5, 5);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.015;
    controls.minDistance = 2.8;
    controls.maxDistance = 105;
    controls.update();

    let goalPos: THREE.Vector3 | null = null;
    let goalLook: THREE.Vector3 | null = null;
    let goalOrthoZoom: number | null = null;
    let lastTime = performance.now();
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 65);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 65);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        const eng = engineRef.current;
        let stillAnimating = false;

        if (eng) {
          if (eng.building) {
            const gap = explodeGapRef.current;
            for (const sg of eng.building.storyGroups) {
              const targetY = sg.baseY + sg.index * gap;
              if (Math.abs(sg.group.position.y - targetY) > 0.004) {
                sg.group.position.y = THREE.MathUtils.damp(sg.group.position.y, targetY, 9, dt);
                stillAnimating = true;
              } else {
                sg.group.position.y = targetY;
              }
            }
          }

          if (goalPos && goalLook) {
            const cam = eng.activeCamera;
            cam.position.x = THREE.MathUtils.damp(cam.position.x, goalPos.x, 7, dt);
            cam.position.y = THREE.MathUtils.damp(cam.position.y, goalPos.y, 7, dt);
            cam.position.z = THREE.MathUtils.damp(cam.position.z, goalPos.z, 7, dt);
            controls.target.x = THREE.MathUtils.damp(controls.target.x, goalLook.x, 7, dt);
            controls.target.y = THREE.MathUtils.damp(controls.target.y, goalLook.y, 7, dt);
            controls.target.z = THREE.MathUtils.damp(controls.target.z, goalLook.z, 7, dt);

            if (goalOrthoZoom !== null && cam instanceof THREE.OrthographicCamera) {
              cam.zoom = THREE.MathUtils.damp(cam.zoom, goalOrthoZoom, 7, dt);
              cam.updateProjectionMatrix();
            }

            if (
              cam.position.distanceTo(goalPos) < 0.05 &&
              controls.target.distanceTo(goalLook) < 0.05
            ) {
              cam.position.copy(goalPos);
              controls.target.copy(goalLook);
              goalPos = null;
              goalLook = null;
              goalOrthoZoom = null;
            } else {
              stillAnimating = true;
            }
          }

          const damped = controls.update();
          if (damped && controls.enableDamping) stillAnimating = true;

          renderer.render(scene, eng.activeCamera);
        }

        const done = () => {
          renderBusy = false;
          if (stillAnimating || renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    const setCameraGoal = (pos: THREE.Vector3, look: THREE.Vector3, orthoZoom?: number) => {
      if (isSoftwareGl) {
        const eng = engineRef.current;
        if (eng) {
          eng.activeCamera.position.copy(pos);
          controls.target.copy(look);
          if (orthoZoom !== undefined && eng.activeCamera instanceof THREE.OrthographicCamera) {
            eng.activeCamera.zoom = orthoZoom;
            eng.activeCamera.updateProjectionMatrix();
          }
          controls.update();
        }
        goalPos = null;
        goalLook = null;
        goalOrthoZoom = null;
        requestRender();
        return;
      }
      goalPos = pos.clone();
      goalLook = look.clone();
      goalOrthoZoom = orthoZoom ?? null;
      requestRender();
    };

    const onControlStart = () => {
      goalPos = null;
      goalLook = null;
      goalOrthoZoom = null;
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', requestRender);

    // Raycaster + Frontier-Precision Select-First + 6 px Drag Deadzone + Lock Respect + Interactive 3D Doors
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragHitPt = new THREE.Vector3();
    let downX = 0;
    let downY = 0;
    let pendingDrag: {
      target: SelectionTarget;
      root: THREE.Object3D;
      offsetX: number;
      offsetZ: number;
      active: boolean;
      moved: boolean;
    } | null = null;

    const isElementLocked = (target: SelectionTarget): boolean => {
      const proj = projectRef.current;
      const st = proj.stories.find((s) => s.index === target.storyIndex);
      if (!st) return true;
      if (target.type === 'pillar') {
        if (proj.lockedLayers?.pillars) return true;
        return Boolean(st.pillars.find((p) => p.id === target.id)?.locked);
      }
      if (target.type === 'asset') {
        return Boolean(st.assets.find((a) => a.id === target.id)?.locked);
      }
      return false;
    };

    const setPointerFromEvent = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      pendingDrag = null;
      if (e.button !== 0) return;

      const sel = selectionRef.current;
      const eng = engineRef.current;
      if (!sel || !eng || !eng.building) return;
      if (sel.type !== 'asset' && sel.type !== 'pillar') return;
      if (isElementLocked(sel)) return;

      setPointerFromEvent(e);
      raycaster.setFromCamera(pointer, eng.activeCamera);
      const hits = raycaster.intersectObjects(eng.building.clickables, true);
      if (hits.length === 0) return;

      const hitTarget = hits[0].object.userData.selectTarget as SelectionTarget | undefined;
      const dragRoot = hits[0].object.userData.dragRoot as THREE.Object3D | undefined;
      if (
        hitTarget &&
        dragRoot &&
        hitTarget.type === sel.type &&
        hitTarget.id === sel.id &&
        hitTarget.storyIndex === sel.storyIndex
      ) {
        const sg = eng.building.storyGroups.find((s) => s.index === sel.storyIndex);
        const planeY = sg ? sg.group.position.y : 0;
        dragPlane.constant = -planeY;
        if (raycaster.ray.intersectPlane(dragPlane, dragHitPt)) {
          pendingDrag = {
            target: hitTarget,
            root: dragRoot,
            offsetX: dragRoot.position.x - dragHitPt.x,
            offsetZ: dragRoot.position.z - dragHitPt.z,
            active: false,
            moved: false,
          };
          // Lock orbit immediately only while pointer is held on already-selected handle; actual move waits for 6 px deadzone!
          controls.enabled = false;
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pendingDrag) return;
      const distPx = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (!pendingDrag.active) {
        if (distPx < DRAG_DEADZONE_PX) return;
        pendingDrag.active = true;
        renderer.domElement.style.cursor = 'grabbing';
      }

      const eng = engineRef.current;
      if (!eng) return;
      setPointerFromEvent(e);
      raycaster.setFromCamera(pointer, eng.activeCamera);
      if (raycaster.ray.intersectPlane(dragPlane, dragHitPt)) {
        const snap = Math.max(0.05, projectRef.current.gridSnap || 0.1524);
        const nx = Math.round((dragHitPt.x + pendingDrag.offsetX) / snap) * snap;
        const nz = Math.round((dragHitPt.z + pendingDrag.offsetZ) / snap) * snap;
        if (
          Math.abs(nx - pendingDrag.root.position.x) > 0.001 ||
          Math.abs(nz - pendingDrag.root.position.z) > 0.001
        ) {
          pendingDrag.root.position.x = nx;
          pendingDrag.root.position.z = nz;
          pendingDrag.moved = true;
          requestRender();
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pendingDrag) {
        const finished = pendingDrag;
        pendingDrag = null;
        controls.enabled = true;
        renderer.domElement.style.cursor = '';
        if (finished.moved) {
          const finalX = Number(finished.root.position.x.toFixed(4));
          const finalZ = Number(finished.root.position.z.toFixed(4));
          if (finished.target.type === 'asset') {
            onMoveAssetRef.current?.(finished.target.storyIndex, finished.target.id, finalX, finalZ);
          } else if (finished.target.type === 'pillar') {
            onMovePillarRef.current?.(finished.target.storyIndex, finished.target.id, finalX, finalZ);
          }
          return;
        }
      }

      if (e.button !== 0) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;

      const eng = engineRef.current;
      if (!eng || !eng.building) return;
      setPointerFromEvent(e);
      raycaster.setFromCamera(pointer, eng.activeCamera);
      const hits = raycaster.intersectObjects(eng.building.clickables, true);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const target = hitObj.userData.selectTarget as SelectionTarget | undefined;
        // Interactive 3D door click: if already selected (or Alt/Shift clicked), toggle open/close!
        if (hitObj.userData.isInteractiveDoor && target?.parentWallId) {
          const curSel = selectionRef.current;
          const alreadySelected =
            curSel?.type === 'opening' &&
            curSel.id === target.id &&
            curSel.storyIndex === target.storyIndex;
          if (alreadySelected || e.detail >= 2) {
            onToggleOpeningRef.current?.(target.storyIndex, target.parentWallId, target.id);
          } else {
            onSelectRef.current(target);
          }
          return;
        }
        if (target) {
          onSelectRef.current(target);
          return;
        }
      }
      onSelectRef.current(null);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const ro = new ResizeObserver(() => {
      const w = Math.max(100, container.clientWidth);
      const h = Math.max(100, container.clientHeight);
      const asp = w / h;
      perspCamera.aspect = asp;
      perspCamera.updateProjectionMatrix();
      orthoCamera.left = (-frustumSize * asp) / 2;
      orthoCamera.right = (frustumSize * asp) / 2;
      orthoCamera.top = frustumSize / 2;
      orthoCamera.bottom = -frustumSize / 2;
      orthoCamera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    ro.observe(container);

    engineRef.current = {
      renderer,
      scene,
      hemi,
      keyLight,
      rimLight,
      ground,
      gridHelper,
      perspCamera,
      orthoCamera,
      activeCamera: initialCamera,
      controls,
      building: null,
      isSoftwareGl,
      requestRender,
      setCameraGoal,
      frustumSize,
    };

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      envTex.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      if (engineRef.current?.building) {
        disposeBuiltScene(engineRef.current.building);
      }
      renderer.dispose();
      engineRef.current = null;
    };
  }, []);

  // Lighting & Sky Preset updates
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    eng.scene.background = getSkyBackdropTexture(lightingPreset);
    const groundMat = eng.ground.material as THREE.MeshStandardMaterial;

    if (lightingPreset === 'daylight') {
      eng.scene.fog = new THREE.Fog(0xdbe8f5, 62, 165);
      eng.hemi.color.setHex(0xe8f4ff);
      eng.hemi.groundColor.setHex(0x9ea9b5);
      eng.hemi.intensity = 0.88;
      eng.keyLight.color.setHex(0xfff9ee);
      eng.keyLight.intensity = 1.72;
      eng.keyLight.position.set(24, 36, 24);
      eng.rimLight.color.setHex(0xbfe0ff);
      eng.rimLight.intensity = 0.52;
      eng.renderer.toneMappingExposure = 1.06;
      groundMat.color.setHex(0xdde5da);
      eng.gridHelper.visible = !showSiteContext;
    } else if (lightingPreset === 'golden') {
      eng.scene.fog = new THREE.Fog(0xf0d6bc, 58, 155);
      eng.hemi.color.setHex(0xffe1c2);
      eng.hemi.groundColor.setHex(0x8c7b6b);
      eng.hemi.intensity = 0.82;
      eng.keyLight.color.setHex(0xffb56b);
      eng.keyLight.intensity = 2.02;
      eng.keyLight.position.set(34, 16, 22);
      eng.rimLight.color.setHex(0x9ab8e8);
      eng.rimLight.intensity = 0.55;
      eng.renderer.toneMappingExposure = 1.04;
      groundMat.color.setHex(0xd9d2c7);
      eng.gridHelper.visible = !showSiteContext;
    } else {
      eng.scene.fog = new THREE.Fog(0xf0f4f8, 56, 145);
      eng.hemi.color.setHex(0xf8fafc);
      eng.hemi.groundColor.setHex(0xcbd5e1);
      eng.hemi.intensity = 1.05;
      eng.keyLight.color.setHex(0xffffff);
      eng.keyLight.intensity = 1.38;
      eng.keyLight.position.set(20, 30, 20);
      eng.rimLight.color.setHex(0xdbeafe);
      eng.rimLight.intensity = 0.45;
      eng.renderer.toneMappingExposure = 1.08;
      groundMat.color.setHex(0xf1f5f9);
      eng.gridHelper.visible = true;
    }
    eng.renderer.shadowMap.needsUpdate = true;
    eng.requestRender();
  }, [lightingPreset, showSiteContext]);

  const computeFramingDistance = (
    radius: number,
    cam: THREE.PerspectiveCamera | THREE.OrthographicCamera
  ): number => {
    if (cam instanceof THREE.PerspectiveCamera) {
      const vFov = THREE.MathUtils.degToRad(cam.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.45, cam.aspect));
      const limitingFov = Math.min(vFov, hFov);
      return (radius / Math.sin(limitingFov / 2)) * 1.12;
    }
    return radius * 2.2;
  };

  // Rebuild architectural building meshes with strict zero-leak disposal
  const lastProjectIdRef = useRef<string>('');
  const explodedView = explodeGap > 0.05;
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    if (eng.building) {
      eng.scene.remove(eng.building.root);
      disposeBuiltScene(eng.building);
      eng.building = null;
    }

    const maxStoryIdx = Math.max(0, ...project.stories.map((s) => s.index));
    const effectiveProject = showSiteContext
      ? project
      : { ...project, plot: undefined };

    const built = buildBuildingScene(effectiveProject, {
      activeStoryIndex,
      visibleMaxStoryIndex: showAllStories ? maxStoryIdx : activeStoryIndex,
      cutawayRatio,
      explodedView,
      heatmapMode,
      xrayStructural,
      showSetbacks,
      showCeilingRoof: showCeilingRoof && cutawayRatio >= 0.99,
      selected: selection,
      physics,
    });

    for (const sg of built.storyGroups) {
      sg.group.position.y = sg.baseY + sg.index * explodeGapRef.current;
    }

    eng.building = built;
    eng.scene.add(built.root);

    const c = built.boundsCenter;
    const r = built.boundsRadius;
    eng.keyLight.target.position.copy(c);
    eng.keyLight.target.updateMatrixWorld();
    const sBound = Math.max(22, r * 1.7);
    eng.keyLight.shadow.camera.left = -sBound;
    eng.keyLight.shadow.camera.right = sBound;
    eng.keyLight.shadow.camera.top = sBound;
    eng.keyLight.shadow.camera.bottom = -sBound;
    eng.keyLight.shadow.camera.updateProjectionMatrix();

    if (lastProjectIdRef.current !== project.id) {
      lastProjectIdRef.current = project.id;
      const d = computeFramingDistance(r, eng.activeCamera);
      const orthoZoom = Math.max(0.42, Math.min(1.25, 10.2 / r));
      _targetPos.set(c.x + d * 0.62, c.y + d * 0.44, c.z + d * 0.72);
      _targetLook.copy(c);
      eng.setCameraGoal(_targetPos, _targetLook, orthoZoom);
    }

    eng.renderer.shadowMap.needsUpdate = true;
    eng.requestRender();
  }, [
    project,
    physics,
    showSiteContext,
    activeStoryIndex,
    showAllStories,
    showCeilingRoof,
    cutawayRatio,
    explodedView,
    heatmapMode,
    xrayStructural,
    showSetbacks,
    selection,
  ]);

  useEffect(() => {
    engineRef.current?.requestRender();
  }, [explodeGap]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    const c = eng.building?.boundsCenter ?? new THREE.Vector3(5, 2.5, 5);
    const r = eng.building?.boundsRadius ?? 10;

    if (viewMode === '2.5d') {
      eng.activeCamera = eng.orthoCamera;
      eng.controls.object = eng.orthoCamera;
      const dist = r * 2.25;
      _targetPos.set(c.x + dist, c.y + dist * 0.85, c.z + dist);
      _targetLook.copy(c);
      const minSpan = Math.min(
        eng.orthoCamera.right - eng.orthoCamera.left,
        eng.orthoCamera.top - eng.orthoCamera.bottom
      );
      const zoom = Math.max(0.4, Math.min(1.25, (minSpan * 0.42) / Math.max(4, r)));
      eng.setCameraGoal(_targetPos, _targetLook, zoom);
    } else {
      eng.activeCamera = eng.perspCamera;
      eng.controls.object = eng.perspCamera;
      const d = computeFramingDistance(r, eng.perspCamera);
      _targetPos.set(c.x + d * 0.62, c.y + d * 0.44, c.z + d * 0.72);
      _targetLook.copy(c);
      eng.setCameraGoal(_targetPos, _targetLook);
    }
  }, [viewMode, compact]);

  useImperativeHandle(ref, () => ({
    applyCameraPreset: (preset: CameraPreset) => {
      const eng = engineRef.current;
      if (!eng) return;
      const c = eng.building?.boundsCenter ?? new THREE.Vector3(5, 2.5, 5);
      const r = eng.building?.boundsRadius ?? 10;

      switch (preset) {
        case 'street':
          _targetPos.set(c.x + r * 0.68, 2.2, c.z + r * 1.95);
          _targetLook.set(c.x, Math.max(2.4, c.y * 0.85), c.z);
          break;
        case 'isometric':
          _targetPos.set(c.x + r * 2.0, c.y + r * 1.65, c.z + r * 2.0);
          _targetLook.copy(c);
          break;
        case 'front':
          _targetPos.set(c.x, c.y + r * 0.25, c.z + r * 2.15);
          _targetLook.copy(c);
          break;
        case 'top':
          _targetPos.set(c.x, c.y + r * 2.45, c.z + 0.05);
          _targetLook.copy(c);
          break;
        case 'corner':
          _targetPos.set(c.x - r * 1.45, c.y + r * 0.68, c.z + r * 1.5);
          _targetLook.copy(c);
          break;
        case 'exterior':
        default:
          _targetPos.set(c.x + r * 1.5, c.y + r * 1.0, c.z + r * 1.75);
          _targetLook.copy(c);
          break;
      }
      eng.setCameraGoal(_targetPos, _targetLook, 1.0);
    },
    exportSnapshotPng: () => {
      const eng = engineRef.current;
      if (!eng) return null;
      eng.renderer.render(eng.scene, eng.activeCamera);
      return eng.renderer.domElement.toDataURL('image/png');
    },
  }));

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#eef3f8]">
      <div ref={mountRef} className="w-full h-full" />

      {contextLost && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f1f5f9] text-slate-700 p-6">
          <p className="text-sm font-semibold text-slate-900">3D graphics context paused</p>
          <p className="mt-1 text-xs text-slate-600">
            Switch back to 2D Plan or wait for WebGL to restore.
          </p>
        </div>
      )}
    </div>
  );
});
