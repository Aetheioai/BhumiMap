import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  FlipHorizontal2,
  Lock,
  Magnet,
  Maximize2,
  Minus,
  Plus,
  RotateCw,
  Scissors,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  AreaPoly,
  Beam,
  BlueprintAnnotation,
  BuildingProject,
  ExperienceMode,
  PhysicsReport,
  Pillar,
  PlacedAsset,
  RulerChain,
  SelectionTarget,
  Slab,
  SlabCutout,
  Story,
  SurveyUnderlay,
  ToolMode,
  Vec2,
  Wall,
  WallOpening,
} from '../types/building';
import { getAssetDefinition } from '../engine/assets';
import {
  AssetHarmonyResult,
  evaluateAssetConflicts,
  findUpperSlabNeedingCutout,
  solveAssetPlacement,
} from '../engine/assetHarmony';
import {
  applyConnectedJointMove,
  buildOffsetWall,
  buildSpatialSnapIndex,
  CadSnapResult,
  computeCadSnap,
  computeTrimOrExtend,
  ConnectedEndpoint,
  findConnectedWallJoints,
  getBlueprintSettings,
  selectElementsInMarquee,
  splitWallAtDistance,
} from '../engine/cad2d';
import {
  ActiveDraftState,
  Camera2D,
  MarqueeState,
  OverlayHoverState,
  renderInteractiveOverlayLayer,
  renderStaticBlueprintLayer,
  ROTATE_HANDLE_OFFSET_PX,
  UnderlayCalibOverlay,
} from '../engine/canvas2dRenderer';
import {
  getWallArcLength,
  isCurvedWall,
  pointAtWallOffset,
  pointToWallDist,
} from '../engine/geometryKernel';
import { formatLength, ft, inch } from '../engine/units';

export interface Canvas2DHandle {
  exportPng: () => string | null;
  resetView: () => void;
  clearMeasurements: () => void;
  zoomBy: (factor: number) => void;
  startUnderlayCalibration: () => void;
}

interface Canvas2DProps {
  project: BuildingProject;
  activeStory: Story;
  lowerStory?: Story;
  physics: PhysicsReport;
  experienceMode: ExperienceMode;
  tool: ToolMode;
  snapEnabled: boolean;
  boxSelectMode?: boolean;
  heatmapMode: boolean;
  showDimensions: boolean;
  showSetbacks: boolean;
  selection: SelectionTarget | null;
  multiSelection: SelectionTarget[];
  placingAssetId?: string | null;
  placingAssetRotation?: number;
  placingAssetFlipX?: boolean;
  onCancelPlaceAsset?: () => void;
  onPlaceAssetAt?: (
    assetId: string,
    x: number,
    z: number,
    rotation: number,
    flipX?: boolean
  ) => void;
  onSelect: (target: SelectionTarget | null) => void;
  onMultiSelect: (targets: SelectionTarget[]) => void;
  onMoveMultiSelection: (dx: number, dz: number, commit?: boolean) => void;
  onExitTool?: () => void;
  onDragStateChange?: (dragging: boolean) => void;
  onUpdateUnderlay: (underlay: SurveyUnderlay | undefined) => void;
  onAddRoom: (rect: { x: number; z: number; width: number; depth: number }) => void;
  onAddWall: (wall: Wall) => void;
  onUpdateWall: (wallId: string, patch: Partial<Wall>, commit?: boolean) => void;
  onReplaceWalls: (walls: Wall[], commit?: boolean, reDetectRooms?: boolean) => void;
  onAddPillar: (pillar: Pillar) => void;
  onUpdatePillar: (pillarId: string, patch: Partial<Pillar>, commit?: boolean) => void;
  onAddBeam: (beam: Beam) => void;
  onUpdateBeam: (beamId: string, patch: Partial<Beam>, commit?: boolean) => void;
  onAddSlab: (slab: Slab) => void;
  onUpdateSlab: (slabId: string, patch: Partial<Slab>, commit?: boolean) => void;
  onAddCutout: (slabId: string, cutout: SlabCutout) => void;
  onUpdateCutout: (
    slabId: string,
    cutoutId: string,
    patch: Partial<SlabCutout>,
    commit?: boolean
  ) => void;
  onAddOpening: (wallId: string, opening: WallOpening) => void;
  onUpdateOpening: (
    wallId: string,
    openingId: string,
    patch: Partial<WallOpening>,
    commit?: boolean
  ) => void;
  onAddAsset: (asset: PlacedAsset) => void;
  onUpdateAsset: (assetId: string, patch: Partial<PlacedAsset>, commit?: boolean) => void;
  onDeleteAsset?: (assetId: string) => void;
  onDuplicateAsset?: () => void;
  onAddCompanionAsset?: (hostAsset: PlacedAsset) => void;
  onCutUpperSlabForStair?: (asset: PlacedAsset) => void;
  onAddAnnotation: (ann: BlueprintAnnotation) => void;
  onUpdateAnnotation: (annId: string, patch: Partial<BlueprintAnnotation>, commit?: boolean) => void;
  onBeginDragHistory: () => void;
  draggingAssetId: string | null;
  onEndAssetDrop: () => void;
}

type DragKind =
  | 'pan'
  | 'empty-pan'
  | 'right-pan'
  | 'marquee'
  | 'multi-move'
  | 'pillar'
  | 'asset'
  | 'asset-rotate'
  | 'slab'
  | 'slab-nw'
  | 'slab-ne'
  | 'slab-sw'
  | 'slab-se'
  | 'cutout'
  | 'cutout-nw'
  | 'cutout-ne'
  | 'cutout-sw'
  | 'cutout-se'
  | 'wall-p1'
  | 'wall-p2'
  | 'wall-body'
  | 'wall-curve'
  | 'beam-p1'
  | 'beam-p2'
  | 'beam-body'
  | 'opening'
  | 'ann-body'
  | 'ann-p1'
  | 'ann-p2';

const DRAG_DEADZONE_PX = 7;
const DRAFT_DRAG_COMMIT_PX = 14;

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTypedLengthMeters(raw: string, unit: 'imperial' | 'metric'): number | null {
  const s = raw.trim();
  if (!s) return null;
  const ftIn = s.match(/^(\d+(?:\.\d+)?)\s*['-]\s*(\d+(?:\.\d+)?)?"?$/);
  if (ftIn) {
    const f = parseFloat(ftIn[1]);
    const i = ftIn[2] ? parseFloat(ftIn[2]) : 0;
    return f * 0.3048 + i * 0.0254;
  }
  const num = parseFloat(s);
  if (!Number.isFinite(num) || num <= 0.05) return null;
  return unit === 'imperial' ? num * 0.3048 : num;
}

function sameTarget(a: SelectionTarget | null, b: SelectionTarget | null): boolean {
  if (!a || !b) return false;
  return a.type === b.type && a.id === b.id && a.storyIndex === b.storyIndex;
}

export const Canvas2D = forwardRef<Canvas2DHandle, Canvas2DProps>(function Canvas2D(props, ref) {
  const {
    project,
    activeStory,
    lowerStory,
    physics,
    experienceMode,
    tool,
    snapEnabled,
    boxSelectMode = false,
    heatmapMode,
    showDimensions,
    showSetbacks,
    selection,
    multiSelection,
    placingAssetId = null,
    placingAssetRotation = 0,
    placingAssetFlipX = false,
    onCancelPlaceAsset,
    onPlaceAssetAt,
    onSelect,
    onMultiSelect,
    onMoveMultiSelection,
    onExitTool,
    onDragStateChange,
    onUpdateUnderlay,
    onAddRoom,
    onAddWall,
    onUpdateWall,
    onReplaceWalls,
    onAddPillar,
    onUpdatePillar,
    onAddBeam,
    onUpdateBeam,
    onAddSlab,
    onUpdateSlab,
    onAddCutout,
    onUpdateCutout,
    onAddOpening,
    onUpdateOpening,
    onAddAsset,
    onUpdateAsset,
    onDeleteAsset,
    onDuplicateAsset,
    onAddCompanionAsset,
    onCutUpperSlabForStair,
    onAddAnnotation,
    onUpdateAnnotation,
    onBeginDragHistory,
    draggingAssetId,
    onEndAssetDrop,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const coordReadoutRef = useRef<HTMLSpanElement>(null);

  const settings = useMemo(() => getBlueprintSettings(project), [project]);
  const snapIndex = useMemo(
    () => buildSpatialSnapIndex(activeStory, lowerStory, project.plot),
    [activeStory, lowerStory, project.plot]
  );

  // Camera & viewport size in refs for lock-free 60fps rendering
  const camRef = useRef<Camera2D>({ offsetX: 80, offsetY: 80, scale: 34 });
  const sizeRef = useRef<{ w: number; h: number }>({ w: 800, h: 600 });
  const hasFittedRef = useRef(false);

  // Interactive 60fps overlay refs (ZERO React re-render on pointer move!)
  const hoverRef = useRef<OverlayHoverState>({ target: null, handle: null });
  const snapRef = useRef<CadSnapResult | null>(null);
  const assetHarmonyRef = useRef<AssetHarmonyResult | null>(null);
  const activeAssetFootprintRef = useRef<{
    x: number;
    z: number;
    width: number;
    depth: number;
    rotation: number;
  } | null>(null);
  const draftRef = useRef<ActiveDraftState | null>(null);
  const marqueeRef = useRef<MarqueeState | null>(null);
  const cursorWorldRef = useRef<Vec2 | null>(null);
  const typedInputRef = useRef<string>('');
  const typedFieldRef = useRef<'length' | 'angle'>('length');
  const spaceHeldRef = useRef<boolean>(false);

  const [rulers, setRulers] = useState<RulerChain[]>([]);
  const [areas, setAreas] = useState<AreaPoly[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [camTick, setCamTick] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);

  // Inline note/callout creator popover state
  const [notePrompt, setNotePrompt] = useState<{
    screenX: number;
    screenY: number;
    world: Vec2;
    kind: 'note' | 'callout';
    text: string;
  } | null>(null);

  // Survey underlay cached HTMLImageElement + 2-point calibration state
  const [underlayImg, setUnderlayImg] = useState<HTMLImageElement | null>(null);
  const [calibState, setCalibState] = useState<{
    active: boolean;
    pointA: Vec2 | null;
    pointB: Vec2 | null;
    lengthText: string;
  } | null>(null);
  const calibRef = useRef<UnderlayCalibOverlay | null>(null);

  useEffect(() => {
    if (!project.underlay?.dataUrl) {
      setUnderlayImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setUnderlayImg(img);
    img.src = project.underlay.dataUrl;
  }, [project.underlay?.dataUrl]);

  const showTempNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  // Latest props ref so rAF callbacks never read stale closures
  const latestRef = useRef({
    project,
    activeStory,
    lowerStory,
    physics,
    settings,
    experienceMode,
    tool,
    snapEnabled,
    heatmapMode,
    showDimensions,
    showSetbacks,
    selection,
    multiSelection,
    underlayImg,
    rulers,
    areas,
    placingAssetId,
    placingAssetRotation,
    placingAssetFlipX,
    draggingAssetId,
  });
  latestRef.current = {
    project,
    activeStory,
    lowerStory,
    physics,
    settings,
    experienceMode,
    tool,
    snapEnabled,
    heatmapMode,
    showDimensions,
    showSetbacks,
    selection,
    multiSelection,
    underlayImg,
    rulers,
    areas,
    placingAssetId,
    placingAssetRotation,
    placingAssetFlipX,
    draggingAssetId,
  };

  // Coalesced dual-layer rAF schedulers
  const staticRafRef = useRef<number | null>(null);
  const overlayRafRef = useRef<number | null>(null);

  const flushOverlay = useCallback(() => {
    overlayRafRef.current = null;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { w, h } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = latestRef.current;
    renderInteractiveOverlayLayer({
      ctx,
      width: w,
      height: h,
      cam: camRef.current,
      project: L.project,
      story: L.activeStory,
      tool: L.tool,
      selection: L.selection,
      multiSelection: L.multiSelection,
      hover: hoverRef.current,
      snap: snapRef.current,
      draft: draftRef.current,
      marquee: marqueeRef.current,
      cursorWorld: cursorWorldRef.current,
      typedInput: typedInputRef.current,
      typedField: typedFieldRef.current,
      placingAssetId: L.placingAssetId ?? L.draggingAssetId,
      placingAssetRotation: L.placingAssetRotation,
      placingAssetFlipX: L.placingAssetFlipX,
      assetHarmony: assetHarmonyRef.current,
      activeAssetFootprint: activeAssetFootprintRef.current,
      calibOverlay: calibRef.current,
    });
  }, []);

  const scheduleOverlay = useCallback(() => {
    if (overlayRafRef.current === null) {
      overlayRafRef.current = requestAnimationFrame(flushOverlay);
    }
  }, [flushOverlay]);

  const flushStatic = useCallback(() => {
    staticRafRef.current = null;
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { w, h } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = latestRef.current;
    renderStaticBlueprintLayer({
      ctx,
      width: w,
      height: h,
      cam: camRef.current,
      project: L.project,
      story: L.activeStory,
      lowerStory: L.lowerStory,
      physics: L.physics,
      settings: L.settings,
      experienceMode: L.experienceMode,
      heatmapMode: L.heatmapMode,
      showDimensions: L.showDimensions,
      showSetbacks: L.showSetbacks,
      selection: L.selection,
      multiSelection: L.multiSelection,
      underlayImage: L.underlayImg,
      rulers: L.rulers,
      areas: L.areas,
    });
  }, []);

  const scheduleStatic = useCallback(() => {
    if (staticRafRef.current === null) {
      staticRafRef.current = requestAnimationFrame(flushStatic);
    }
  }, [flushStatic]);

  const scheduleBoth = useCallback(() => {
    scheduleStatic();
    scheduleOverlay();
  }, [scheduleOverlay, scheduleStatic]);

  // Trigger static + overlay redraw whenever scene state updates
  useEffect(() => {
    scheduleBoth();
  }, [
    project,
    activeStory,
    lowerStory,
    physics,
    settings,
    heatmapMode,
    showDimensions,
    showSetbacks,
    selection,
    multiSelection,
    underlayImg,
    rulers,
    areas,
    tool,
    placingAssetId,
    placingAssetRotation,
    placingAssetFlipX,
    draggingAssetId,
    scheduleBoth,
  ]);

  // Clear harmony overlay when placement & catalog drag stop
  useEffect(() => {
    if (!placingAssetId && !draggingAssetId && !dragRef.current) {
      assetHarmonyRef.current = null;
      activeAssetFootprintRef.current = null;
      scheduleOverlay();
    }
  }, [placingAssetId, draggingAssetId, scheduleOverlay]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (staticRafRef.current !== null) cancelAnimationFrame(staticRafRef.current);
      if (overlayRafRef.current !== null) cancelAnimationFrame(overlayRafRef.current);
    };
  }, []);

  // Fit plan to viewport cleanly
  const fitPlanToView = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (w < 40 || h < 40) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    if (project.plot) {
      minX = Math.min(minX, project.plot.originX);
      maxX = Math.max(maxX, project.plot.originX + project.plot.width);
      minZ = Math.min(minZ, project.plot.originZ);
      maxZ = Math.max(maxZ, project.plot.originZ + project.plot.depth);
    }
    for (const s of activeStory.slabs) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x + s.width);
      minZ = Math.min(minZ, s.z);
      maxZ = Math.max(maxZ, s.z + s.depth);
    }
    for (const wall of activeStory.walls) {
      minX = Math.min(minX, wall.x1, wall.x2);
      maxX = Math.max(maxX, wall.x1, wall.x2);
      minZ = Math.min(minZ, wall.z1, wall.z2);
      maxZ = Math.max(maxZ, wall.z1, wall.z2);
    }

    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 12;
      minZ = 0;
      maxZ = 12;
    }

    const padM = 3.4;
    const worldW = Math.max(4, maxX - minX + padM * 2);
    const worldD = Math.max(4, maxZ - minZ + padM * 2);
    const availW = Math.max(120, w - 70);
    const availH = Math.max(120, h - 100);
    const nextScale = Math.max(12, Math.min(90, Math.min(availW / worldW, availH / worldD)));
    const midX = (minX + maxX) * 0.5;
    const midZ = (minZ + maxZ) * 0.5;

    camRef.current = {
      scale: nextScale,
      offsetX: w * 0.5 - midX * nextScale,
      offsetY: h * 0.5 - midZ * nextScale,
    };
    setCamTick((t) => t + 1);
    scheduleBoth();
  }, [activeStory.slabs, activeStory.walls, project.plot, scheduleBoth]);

  // ResizeObserver for crisp DPR sizing of both canvases
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(100, Math.floor(rect.width));
      const h = Math.max(100, Math.floor(rect.height));
      sizeRef.current = { w, h };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [baseCanvasRef.current, overlayCanvasRef.current]) {
        if (!c) continue;
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      if (!hasFittedRef.current) {
        hasFittedRef.current = true;
        fitPlanToView();
      } else {
        scheduleBoth();
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitPlanToView, scheduleBoth]);

  // Refit when loading a different project
  const lastProjIdRef = useRef<string>(project.id);
  useEffect(() => {
    if (project.id !== lastProjIdRef.current) {
      lastProjIdRef.current = project.id;
      fitPlanToView();
    }
  }, [fitPlanToView, project.id]);

  // Clear draft when switching tool
  useEffect(() => {
    draftRef.current = null;
    typedInputRef.current = '';
    typedFieldRef.current = 'length';
    scheduleOverlay();
  }, [tool, scheduleOverlay]);

  const zoomByFactor = useCallback(
    (factor: number, centerScreen?: { x: number; y: number }) => {
      const { w, h } = sizeRef.current;
      const cx = centerScreen ? centerScreen.x : w * 0.5;
      const cy = centerScreen ? centerScreen.y : h * 0.5;
      const c = camRef.current;
      const nextScale = Math.max(8, Math.min(180, c.scale * factor));
      const wx = (cx - c.offsetX) / c.scale;
      const wy = (cy - c.offsetY) / c.scale;
      camRef.current = {
        scale: nextScale,
        offsetX: cx - wx * nextScale,
        offsetY: cy - wy * nextScale,
      };
      setCamTick((t) => t + 1);
      scheduleBoth();
    },
    [scheduleBoth]
  );

  useImperativeHandle(
    ref,
    () => ({
      exportPng: () => baseCanvasRef.current?.toDataURL('image/png') ?? null,
      resetView: fitPlanToView,
      clearMeasurements: () => {
        setRulers([]);
        setAreas([]);
      },
      zoomBy: (f: number) => zoomByFactor(f),
      startUnderlayCalibration: () => {
        setCalibState({ active: true, pointA: null, pointB: null, lengthText: '' });
        calibRef.current = { pointA: null, pointB: null, cursor: null };
        scheduleOverlay();
      },
    }),
    [fitPlanToView, scheduleOverlay, zoomByFactor]
  );

  // Coordinate converters
  const screenToWorld = useCallback((sx: number, sy: number): Vec2 => {
    const c = camRef.current;
    return {
      x: (sx - c.offsetX) / c.scale,
      z: (sy - c.offsetY) / c.scale,
    };
  }, []);

  const worldToScreen = useCallback((wx: number, wz: number) => {
    const c = camRef.current;
    return {
      x: c.offsetX + wx * c.scale,
      y: c.offsetY + wz * c.scale,
    };
  }, []);

  // Native non-passive wheel zoom toward cursor
  useEffect(() => {
    const el = overlayCanvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomByFactor(factor, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomByFactor]);

  // Direct Handle Hit-Testing
  const hitTestHandle = useCallback(
    (sx: number, sy: number): { kind: DragKind; id: string; parentId?: string } | null => {
      if (!selection || multiSelection.length > 1 || tool !== 'select') return null;
      const HIT_R = 12;
      const near = (wx: number, wz: number) => {
        const p = worldToScreen(wx, wz);
        return Math.hypot(p.x - sx, p.y - sy) <= HIT_R;
      };

      if (selection.type === 'wall') {
        const w = activeStory.walls.find((x) => x.id === selection.id);
        if (w && !w.locked && !project.lockedLayers?.walls) {
          if (near(w.x1, w.z1)) return { kind: 'wall-p1', id: w.id };
          if (near(w.x2, w.z2)) return { kind: 'wall-p2', id: w.id };
          const mid = pointAtWallOffset(w, getWallArcLength(w) * 0.5);
          if (near(mid.x, mid.z)) return { kind: 'wall-curve', id: w.id };
        }
      } else if (selection.type === 'beam') {
        const b = activeStory.beams.find((x) => x.id === selection.id);
        if (b && !b.locked && !project.lockedLayers?.beams) {
          if (near(b.x1, b.z1)) return { kind: 'beam-p1', id: b.id };
          if (near(b.x2, b.z2)) return { kind: 'beam-p2', id: b.id };
        }
      } else if (selection.type === 'slab') {
        const sl = activeStory.slabs.find((x) => x.id === selection.id);
        if (sl && !sl.locked && !project.lockedLayers?.slabs) {
          if (near(sl.x, sl.z)) return { kind: 'slab-nw', id: sl.id };
          if (near(sl.x + sl.width, sl.z)) return { kind: 'slab-ne', id: sl.id };
          if (near(sl.x, sl.z + sl.depth)) return { kind: 'slab-sw', id: sl.id };
          if (near(sl.x + sl.width, sl.z + sl.depth)) return { kind: 'slab-se', id: sl.id };
        }
      } else if (selection.type === 'cutout' && selection.parentSlabId) {
        const sl = activeStory.slabs.find((x) => x.id === selection.parentSlabId);
        const cut = sl?.cutouts?.find((c) => c.id === selection.id);
        if (sl && cut && !sl.locked && !project.lockedLayers?.slabs) {
          if (near(cut.x, cut.z)) return { kind: 'cutout-nw', id: cut.id, parentId: sl.id };
          if (near(cut.x + cut.width, cut.z)) return { kind: 'cutout-ne', id: cut.id, parentId: sl.id };
          if (near(cut.x, cut.z + cut.depth)) return { kind: 'cutout-sw', id: cut.id, parentId: sl.id };
          if (near(cut.x + cut.width, cut.z + cut.depth)) return { kind: 'cutout-se', id: cut.id, parentId: sl.id };
        }
      } else if (selection.type === 'asset') {
        const a = activeStory.assets.find((x) => x.id === selection.id);
        if (a && !a.locked) {
          const c = worldToScreen(a.x, a.z);
          const topDist = a.depth * camRef.current.scale * 0.5 + ROTATE_HANDLE_OFFSET_PX;
          const rx = c.x + Math.sin(a.rotation) * topDist;
          const ry = c.y - Math.cos(a.rotation) * topDist;
          if (Math.hypot(rx - sx, ry - sy) <= HIT_R + 2) {
            return { kind: 'asset-rotate', id: a.id };
          }
        }
      } else if (selection.type === 'annotation') {
        const an = (activeStory.annotations ?? []).find((x) => x.id === selection.id);
        if (an && !an.locked) {
          if (near(an.x1, an.z1)) return { kind: 'ann-p1', id: an.id };
          if (an.x2 !== undefined && an.z2 !== undefined && near(an.x2, an.z2)) {
            return { kind: 'ann-p2', id: an.id };
          }
        }
      }
      return null;
    },
    [activeStory, multiSelection.length, project.lockedLayers, selection, tool, worldToScreen]
  );

  // Layer-aware Element Hit-Testing
  const hitTestElement = useCallback(
    (wPt: Vec2): SelectionTarget | null => {
      const tolM = Math.max(0.16, 10 / Math.max(12, camRef.current.scale));
      const layers = settings.layers;

      // 1. Annotations (topmost)
      if (layers.annotations) {
        for (let i = (activeStory.annotations ?? []).length - 1; i >= 0; i--) {
          const an = activeStory.annotations![i];
          if (Math.hypot(wPt.x - an.x1, wPt.z - an.z1) <= tolM * 1.4) {
            return { type: 'annotation', id: an.id, storyIndex: activeStory.index };
          }
          if (an.x2 !== undefined && an.z2 !== undefined) {
            if (Math.hypot(wPt.x - an.x2, wPt.z - an.z2) <= tolM * 1.4) {
              return { type: 'annotation', id: an.id, storyIndex: activeStory.index };
            }
          }
        }
      }

      // 2. Pillars
      if (layers.structure) {
        for (let i = activeStory.pillars.length - 1; i >= 0; i--) {
          const p = activeStory.pillars[i];
          const hw = Math.max(p.width * 0.5, tolM * 0.7);
          const hd = Math.max(p.depth * 0.5, tolM * 0.7);
          if (Math.abs(wPt.x - p.x) <= hw && Math.abs(wPt.z - p.z) <= hd) {
            return { type: 'pillar', id: p.id, storyIndex: activeStory.index };
          }
        }
      }

      // 3. Openings on Walls
      if (layers.openings) {
        for (const w of activeStory.walls) {
          const hit = pointToWallDist(wPt.x, wPt.z, w);
          if (hit.dist <= w.thickness * 0.5 + tolM) {
            for (const op of w.openings) {
              if (hit.alongDist >= op.offset - 0.08 && hit.alongDist <= op.offset + op.width + 0.08) {
                return {
                  type: 'opening',
                  id: op.id,
                  parentWallId: w.id,
                  storyIndex: activeStory.index,
                };
              }
            }
          }
        }
      }

      // 4. Walls
      if (layers.walls) {
        let bestWall: { id: string; d: number } | null = null;
        for (const w of activeStory.walls) {
          const hit = pointToWallDist(wPt.x, wPt.z, w);
          const thresh = w.thickness * 0.5 + tolM;
          if (hit.dist <= thresh && (!bestWall || hit.dist < bestWall.d)) {
            bestWall = { id: w.id, d: hit.dist };
          }
        }
        if (bestWall) {
          return { type: 'wall', id: bestWall.id, storyIndex: activeStory.index };
        }
      }

      // 5. Furniture & Assets (oriented local space test)
      if (layers.furniture) {
        for (let i = activeStory.assets.length - 1; i >= 0; i--) {
          const a = activeStory.assets[i];
          const dx = wPt.x - a.x;
          const dz = wPt.z - a.z;
          const c = Math.cos(-a.rotation);
          const s = Math.sin(-a.rotation);
          const lx = dx * c - dz * s;
          const lz = dx * s + dz * c;
          if (Math.abs(lx) <= a.width * 0.5 + 0.06 && Math.abs(lz) <= a.depth * 0.5 + 0.06) {
            return { type: 'asset', id: a.id, storyIndex: activeStory.index };
          }
        }
      }

      // 6. Beams
      if (layers.structure) {
        for (const bm of activeStory.beams) {
          const dx = bm.x2 - bm.x1;
          const dz = bm.z2 - bm.z1;
          const lenSq = dx * dx + dz * dz;
          if (lenSq < 1e-4) continue;
          const t = Math.max(0, Math.min(1, ((wPt.x - bm.x1) * dx + (wPt.z - bm.z1) * dz) / lenSq));
          const px = bm.x1 + t * dx;
          const pz = bm.z1 + t * dz;
          if (Math.hypot(wPt.x - px, wPt.z - pz) <= bm.width * 0.5 + tolM) {
            return { type: 'beam', id: bm.id, storyIndex: activeStory.index };
          }
        }
      }

      // 7. Slab Cutouts
      for (const sl of activeStory.slabs) {
        for (const cut of sl.cutouts ?? []) {
          if (
            wPt.x >= cut.x &&
            wPt.x <= cut.x + cut.width &&
            wPt.z >= cut.z &&
            wPt.z <= cut.z + cut.depth
          ) {
            return {
              type: 'cutout',
              id: cut.id,
              parentSlabId: sl.id,
              storyIndex: activeStory.index,
            };
          }
        }
      }

      // 8. Rooms (prefer smaller room when nested)
      if (layers.rooms) {
        let bestRoom: { id: string; area: number } | null = null;
        for (const r of activeStory.rooms) {
          if (wPt.x >= r.x && wPt.x <= r.x + r.width && wPt.z >= r.z && wPt.z <= r.z + r.depth) {
            const area = r.width * r.depth;
            if (!bestRoom || area < bestRoom.area) bestRoom = { id: r.id, area };
          }
        }
        if (bestRoom) {
          return { type: 'room', id: bestRoom.id, storyIndex: activeStory.index };
        }
      }

      // 9. Slabs (edge or interior)
      for (let i = activeStory.slabs.length - 1; i >= 0; i--) {
        const sl = activeStory.slabs[i];
        if (
          wPt.x >= sl.x &&
          wPt.x <= sl.x + sl.width &&
          wPt.z >= sl.z &&
          wPt.z <= sl.z + sl.depth
        ) {
          return { type: 'slab', id: sl.id, storyIndex: activeStory.index };
        }
      }

      return null;
    },
    [activeStory, settings.layers]
  );

  // Nearest wall helper for door/window/split/offset/trim tools
  const findNearestWallHit = useCallback(
    (wPt: Vec2, maxDistM = 0.55) => {
      let best: { wall: Wall; alongDist: number; closest: Vec2; dist: number } | null = null;
      for (const w of activeStory.walls) {
        const res = pointToWallDist(wPt.x, wPt.z, w);
        const limit = Math.max(maxDistM, w.thickness * 0.65 + 0.25);
        if (res.dist <= limit && (!best || res.dist < best.dist)) {
          best = { wall: w, alongDist: res.alongDist, closest: res.closest, dist: res.dist };
        }
      }
      return best;
    },
    [activeStory.walls]
  );

  // Active drag state ref
  const dragRef = useRef<{
    kind: DragKind;
    id: string;
    parentId?: string;
    startScreen: { x: number; y: number };
    startWorld: Vec2;
    lastWorld: Vec2;
    startCam: Camera2D;
    started: boolean;
    origWall?: Wall;
    connectedJoints?: ConnectedEndpoint[];
    origWallsSnapshot?: Wall[];
    origBeam?: Beam;
    origSlab?: Slab;
    origCutout?: SlabCutout;
    origAsset?: PlacedAsset;
    origPillar?: Pillar;
    origOpening?: WallOpening;
    origAnn?: BlueprintAnnotation;
  } | null>(null);

  // Multi-touch pinch state
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ dist: number; scale: number; mid: { x: number; y: number } } | null>(
    null
  );

  // Spacebar pan + Dynamic Typed Length / Angle Keyboard Listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' && !e.repeat) {
        spaceHeldRef.current = true;
        setCursorStyle('grab');
        return;
      }

      const draft = draftRef.current;
      if (!draft) return;

      if (e.key === 'Escape') {
        draftRef.current = null;
        typedInputRef.current = '';
        typedFieldRef.current = 'length';
        scheduleOverlay();
        return;
      }

      if (e.key === 'Tab' && (draft.tool === 'wall' || draft.tool === 'curved-wall' || draft.tool === 'beam')) {
        e.preventDefault();
        typedFieldRef.current = typedFieldRef.current === 'length' ? 'angle' : 'length';
        typedInputRef.current = '';
        scheduleOverlay();
        return;
      }

      if (e.key === 'Backspace' && typedInputRef.current.length > 0) {
        e.preventDefault();
        typedInputRef.current = typedInputRef.current.slice(0, -1);
        scheduleOverlay();
        return;
      }

      if (e.key === 'Enter' && typedInputRef.current.length > 0) {
        e.preventDefault();
        const raw = typedInputRef.current;
        typedInputRef.current = '';

        if (draft.tool === 'offset-wall' && draft.offsetSourceWall) {
          const distM = parseTypedLengthMeters(raw, project.unitSystem);
          if (distM && distM >= 0.15) {
            const sign = (draft.offsetSignedDist ?? 1) >= 0 ? 1 : -1;
            const offsetWall = buildOffsetWall(draft.offsetSourceWall, sign * distM);
            if (offsetWall) {
              onAddWall(offsetWall);
            }
          }
          draftRef.current = null;
          scheduleOverlay();
          return;
        }

        if (draft.tool === 'wall' || draft.tool === 'curved-wall' || draft.tool === 'beam') {
          const dx = draft.current.x - draft.start.x;
          const dz = draft.current.z - draft.start.z;
          let len = Math.hypot(dx, dz) || 1;
          let ang = Math.atan2(dz, dx);

          if (typedFieldRef.current === 'angle') {
            const deg = parseFloat(raw);
            if (Number.isFinite(deg)) {
              ang = (deg * Math.PI) / 180;
              draft.current = {
                x: Number((draft.start.x + Math.cos(ang) * len).toFixed(4)),
                z: Number((draft.start.z + Math.sin(ang) * len).toFixed(4)),
              };
              typedFieldRef.current = 'length';
              scheduleOverlay();
              return;
            }
          } else {
            const parsedLen = parseTypedLengthMeters(raw, project.unitSystem);
            if (parsedLen) {
              len = parsedLen;
              const x2 = Number((draft.start.x + Math.cos(ang) * len).toFixed(4));
              const z2 = Number((draft.start.z + Math.sin(ang) * len).toFixed(4));
              if (draft.tool === 'beam') {
                onAddBeam({
                  id: makeId('bm'),
                  x1: draft.start.x,
                  z1: draft.start.z,
                  x2,
                  z2,
                  width: inch(10),
                  depth: inch(15),
                  material: 'rcc',
                });
                draftRef.current = null;
              } else {
                onAddWall({
                  id: makeId('w'),
                  x1: draft.start.x,
                  z1: draft.start.z,
                  x2,
                  z2,
                  curveOffset: draft.tool === 'curved-wall' ? ft(1, 6) : 0,
                  thickness: inch(5),
                  height: null,
                  material: 'brick-1st',
                  role: 'partition',
                  openings: [],
                });
                // Continue wall chain seamlessly from new endpoint!
                draftRef.current = {
                  tool: draft.tool,
                  start: { x: x2, z: z2 },
                  current: { x: x2, z: z2 },
                };
              }
              scheduleOverlay();
            }
          }
        }
        return;
      }

      if (/^[0-9.'"-]$/.test(e.key)) {
        e.preventDefault();
        typedInputRef.current = (typedInputRef.current + e.key).slice(0, 12);
        scheduleOverlay();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        setCursorStyle('default');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onAddBeam, onAddWall, project.unitSystem, scheduleOverlay]);

  // ========================================================================
  // POINTER HANDLERS (60FPS REF-DRIVEN)
  // ========================================================================

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = overlayCanvasRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    activePointersRef.current.set(e.pointerId, { x: sx, y: sy });
    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchStartRef.current = {
        dist: Math.max(10, dist),
        scale: camRef.current.scale,
        mid: { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 },
      };
      dragRef.current = null;
      return;
    }

    const rawWorld = screenToWorld(sx, sy);

    // Survey Underlay 2-Point Calibration Mode
    if (calibState?.active) {
      if (!calibState.pointA) {
        const next = { ...calibState, pointA: rawWorld };
        setCalibState(next);
        calibRef.current = { pointA: rawWorld, pointB: null, cursor: rawWorld };
      } else if (!calibState.pointB) {
        const next = { ...calibState, pointB: rawWorld };
        setCalibState(next);
        calibRef.current = { pointA: calibState.pointA, pointB: rawWorld, cursor: rawWorld };
      }
      scheduleOverlay();
      return;
    }

    // Right-click: cancel active draft or start right-click pan
    if (e.button === 2) {
      if (draftRef.current) {
        if (draftRef.current.tool === 'ruler' && (draftRef.current.points?.length ?? 0) >= 2) {
          setRulers((prev) => [...prev, { id: makeId('rl'), points: draftRef.current!.points! }]);
        } else if (draftRef.current.tool === 'area' && (draftRef.current.points?.length ?? 0) >= 3) {
          setAreas((prev) => [...prev, { id: makeId('ar'), points: draftRef.current!.points! }]);
        }
        draftRef.current = null;
        typedInputRef.current = '';
        scheduleOverlay();
        return;
      }
      dragRef.current = {
        kind: 'right-pan',
        id: '',
        startScreen: { x: sx, y: sy },
        startWorld: rawWorld,
        lastWorld: rawWorld,
        startCam: { ...camRef.current },
        started: true,
      };
      setCursorStyle('grabbing');
      return;
    }

    // Middle-click, Spacebar, or Pan tool
    if (e.button === 1 || spaceHeldRef.current || tool === 'pan') {
      dragRef.current = {
        kind: 'pan',
        id: '',
        startScreen: { x: sx, y: sy },
        startWorld: rawWorld,
        lastWorld: rawWorld,
        startCam: { ...camRef.current },
        started: true,
      };
      setCursorStyle('grabbing');
      return;
    }

    const activeSnap = computeCadSnap(rawWorld, snapIndex, camRef.current.scale, project.gridSnap, {
      enabled: snapEnabled && !e.altKey,
      anchor: draftRef.current?.start ?? null,
      orthoShift: e.shiftKey,
    });
    const pt: Vec2 = { x: activeSnap.x, z: activeSnap.z };

    // Ghost Catalog Asset Stamping Mode (powered by Asset Harmony Engine)
    if (placingAssetId && onPlaceAssetAt) {
      const def = getAssetDefinition(placingAssetId);
      if (def) {
        const res = solveAssetPlacement(
          {
            assetId: def.id,
            x: rawWorld.x,
            z: rawWorld.z,
            width: def.defaultWidth,
            depth: def.defaultDepth,
            height: def.defaultHeight,
            rotation: placingAssetRotation,
            elevationY: def.defaultElevationY,
          },
          activeStory,
          {
            snapEnabled: snapEnabled && !e.altKey,
            gridStepM: project.gridSnap || 0.1524,
          }
        );
        onPlaceAssetAt(placingAssetId, res.x, res.z, res.rotation, placingAssetFlipX);
      } else {
        onPlaceAssetAt(placingAssetId, pt.x, pt.z, placingAssetRotation, placingAssetFlipX);
      }
      return;
    }

    // Pro Tool: Split Wall
    if (tool === 'split-wall') {
      const wallHit = findNearestWallHit(rawWorld, 0.5);
      if (wallHit) {
        const res = splitWallAtDistance(activeStory.walls, wallHit.wall.id, wallHit.alongDist);
        if (res.ok && res.walls) {
          onReplaceWalls(res.walls, true, false);
          showTempNotice('Wall split cleanly.');
        } else if (res.reason) {
          showTempNotice(res.reason);
        }
      }
      return;
    }

    // Pro Tool: Trim / Extend Wall
    if (tool === 'trim-wall') {
      const wallHit = findNearestWallHit(rawWorld, 0.5);
      if (wallHit) {
        const preview = computeTrimOrExtend(activeStory.walls, wallHit.wall.id, wallHit.alongDist);
        if (preview) {
          onReplaceWalls(preview.nextWalls, true, true);
          showTempNotice(preview.mode === 'trim' ? 'Wall segment trimmed.' : 'Wall extended to boundary.');
        } else {
          showTempNotice('No intersecting boundary wall found to trim or extend.');
        }
      }
      return;
    }

    // Pro Tool: Offset Parallel Wall
    if (tool === 'offset-wall') {
      if (draftRef.current?.tool === 'offset-wall' && draftRef.current.offsetSourceWall) {
        const dist = draftRef.current.offsetSignedDist ?? 0;
        const nextWall = buildOffsetWall(draftRef.current.offsetSourceWall, dist);
        if (nextWall) {
          onAddWall(nextWall);
          showTempNotice(`Parallel wall placed at ${formatLength(Math.abs(dist), project.unitSystem)}.`);
        }
        draftRef.current = null;
        typedInputRef.current = '';
        scheduleOverlay();
        return;
      }
      const wallHit = findNearestWallHit(rawWorld, 0.55);
      if (wallHit && !isCurvedWall(wallHit.wall)) {
        draftRef.current = {
          tool: 'offset-wall',
          start: wallHit.closest,
          current: rawWorld,
          offsetSourceWall: wallHit.wall,
          offsetSignedDist: ft(10),
        };
        typedInputRef.current = '';
        scheduleOverlay();
      } else {
        showTempNotice('Click a straight wall first, then drag or type offset distance.');
      }
      return;
    }

    // Pro Tool: Note / Callout Annotation
    if (tool === 'note') {
      setNotePrompt({
        screenX: Math.min(Math.max(sx, 120), sizeRef.current.w - 140),
        screenY: Math.min(Math.max(sy, 72), sizeRef.current.h - 140),
        world: pt,
        kind: 'callout',
        text: '',
      });
      return;
    }

    // Pro Tool: Custom Linear Dimension Line (3-click: P1 -> P2 -> Offset)
    if (tool === 'dim-line') {
      const d = draftRef.current;
      if (!d) {
        draftRef.current = { tool: 'dim-line', start: pt, current: pt };
      } else if (!d.dimSecond) {
        if (Math.hypot(pt.x - d.start.x, pt.z - d.start.z) >= 0.15) {
          draftRef.current = { ...d, dimSecond: pt, current: pt };
        }
      } else {
        const dx = d.dimSecond.x - d.start.x;
        const dz = d.dimSecond.z - d.start.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const signedOff = (rawWorld.x - d.start.x) * nx + (rawWorld.z - d.start.z) * nz;
        onAddAnnotation({
          id: makeId('ann'),
          kind: 'dimension',
          x1: d.start.x,
          z1: d.start.z,
          x2: d.dimSecond.x,
          z2: d.dimSecond.z,
          offset: Number((Math.abs(signedOff) < 0.15 ? 0.5 : signedOff).toFixed(3)),
          text: '',
        });
        draftRef.current = null;
      }
      scheduleOverlay();
      return;
    }

    // Pillar placement
    if (tool === 'pillar') {
      onAddPillar({
        id: makeId('col'),
        label: `C${activeStory.pillars.length + 1}`,
        x: pt.x,
        z: pt.z,
        width: inch(12),
        depth: inch(12),
        shape: 'square',
        grade: 'rcc-3500',
        rotation: 0,
      });
      return;
    }

    // Door / Window placement on hovered wall
    if (tool === 'door' || tool === 'window') {
      const wallHit = findNearestWallHit(rawWorld, 0.55);
      if (wallHit) {
        const w = wallHit.wall;
        const wLen = getWallArcLength(w);
        const opW = tool === 'door' ? ft(3) : ft(5);
        const clampedW = Math.min(opW, Math.max(0.5, wLen - 0.16));
        const offset = Math.max(
          0.08,
          Math.min(Math.max(0.08, wLen - clampedW - 0.08), wallHit.alongDist - clampedW * 0.5)
        );
        onAddOpening(w.id, {
          id: makeId('op'),
          kind: tool === 'door' ? 'door-single' : 'window-casement',
          offset: Number(offset.toFixed(3)),
          width: Number(clampedW.toFixed(3)),
          height: tool === 'door' ? ft(7) : ft(4, 6),
          sillHeight: tool === 'door' ? 0 : ft(2, 6),
          swing: 1,
          openRatio: 0.35,
          hasChajja: tool === 'window',
          hasGrill: tool === 'window',
        });
      } else {
        showTempNotice('Click directly on a wall to insert a door or window.');
      }
      return;
    }

    // Ruler / Area multi-point drafting
    if (tool === 'ruler' || tool === 'area') {
      const d = draftRef.current;
      if (!d || !d.points) {
        draftRef.current = { tool, start: pt, current: pt, points: [pt] };
      } else {
        const last = d.points[d.points.length - 1];
        if (Math.hypot(pt.x - last.x, pt.z - last.z) >= 0.08) {
          draftRef.current = { ...d, current: pt, points: [...d.points, pt] };
        }
      }
      scheduleOverlay();
      return;
    }

    // Two-point drafting tools: wall, curved-wall, beam, room, slab, cutout
    if (
      tool === 'wall' ||
      tool === 'curved-wall' ||
      tool === 'beam' ||
      tool === 'room' ||
      tool === 'slab' ||
      tool === 'cutout'
    ) {
      const d = draftRef.current;
      if (d && d.tool === tool) {
        const dist = Math.hypot(pt.x - d.start.x, pt.z - d.start.z);
        if (dist >= 0.2) {
          commitTwoPointDraft(tool, d.start, pt);
          if (tool === 'wall') {
            // Continuous wall chaining!
            draftRef.current = { tool, start: pt, current: pt };
          } else {
            draftRef.current = null;
          }
          typedInputRef.current = '';
          scheduleOverlay();
          return;
        }
      }
      draftRef.current = { tool, start: pt, current: pt };
      typedInputRef.current = '';
      typedFieldRef.current = 'length';
      scheduleOverlay();
      return;
    }

    // ======================================================================
    // SELECT MODE: Handles -> Multi-Move -> Element -> Marquee / Empty Pan
    // ======================================================================
    const handleHit = hitTestHandle(sx, sy);
    if (handleHit) {
      onBeginDragHistory();
      onDragStateChange?.(true);
      const w = activeStory.walls.find((x) => x.id === handleHit.id);
      const b = activeStory.beams.find((x) => x.id === handleHit.id);
      const sl = activeStory.slabs.find((x) => x.id === (handleHit.parentId ?? handleHit.id));
      const cut = sl?.cutouts?.find((c) => c.id === handleHit.id);
      const a = activeStory.assets.find((x) => x.id === handleHit.id);
      const an = (activeStory.annotations ?? []).find((x) => x.id === handleHit.id);

      let connectedJoints: ConnectedEndpoint[] | undefined;
      if (w && (handleHit.kind === 'wall-p1' || handleHit.kind === 'wall-p2')) {
        const jx = handleHit.kind === 'wall-p1' ? w.x1 : w.x2;
        const jz = handleHit.kind === 'wall-p1' ? w.z1 : w.z2;
        connectedJoints = e.altKey
          ? [{ wallId: w.id, end: handleHit.kind === 'wall-p1' ? 'p1' : 'p2' }]
          : findConnectedWallJoints(activeStory.walls, jx, jz);
      }

      dragRef.current = {
        kind: handleHit.kind,
        id: handleHit.id,
        parentId: handleHit.parentId,
        startScreen: { x: sx, y: sy },
        startWorld: rawWorld,
        lastWorld: rawWorld,
        startCam: { ...camRef.current },
        started: true,
        origWall: w ? { ...w } : undefined,
        connectedJoints,
        origWallsSnapshot: connectedJoints ? activeStory.walls.map((x) => ({ ...x })) : undefined,
        origBeam: b ? { ...b } : undefined,
        origSlab: sl ? { ...sl } : undefined,
        origCutout: cut ? { ...cut } : undefined,
        origAsset: a ? { ...a } : undefined,
        origAnn: an ? { ...an } : undefined,
      };
      setCursorStyle('grabbing');
      return;
    }

    const hit = hitTestElement(rawWorld);
    if (hit) {
      // Shift+Click toggles item in multi-selection
      if (e.shiftKey) {
        const base = multiSelection.length > 0 ? multiSelection : selection ? [selection] : [];
        const exists = base.some((t) => sameTarget(t, hit));
        const next = exists ? base.filter((t) => !sameTarget(t, hit)) : [...base, hit];
        onMultiSelect(next);
        onSelect(next[next.length - 1] ?? null);
        return;
      }

      // Clicking an item already inside multi-selection starts group move!
      if (multiSelection.length > 1 && multiSelection.some((t) => sameTarget(t, hit))) {
        onBeginDragHistory();
        dragRef.current = {
          kind: 'multi-move',
          id: 'multi',
          startScreen: { x: sx, y: sy },
          startWorld: rawWorld,
          lastWorld: rawWorld,
          startCam: { ...camRef.current },
          started: false,
        };
        return;
      }

      // Normal single selection + arm drag with deadzone
      onMultiSelect([hit]);
      onSelect(hit);

      const locked = project.lockedLayers ?? {};
      if (hit.type === 'wall') {
        const w = activeStory.walls.find((x) => x.id === hit.id);
        if (w && !w.locked && !locked.walls) {
          onBeginDragHistory();
          dragRef.current = {
            kind: 'wall-body',
            id: w.id,
            startScreen: { x: sx, y: sy },
            startWorld: rawWorld,
            lastWorld: rawWorld,
            startCam: { ...camRef.current },
            started: false,
            origWall: { ...w },
          };
        }
      } else if (hit.type === 'pillar') {
        const p = activeStory.pillars.find((x) => x.id === hit.id);
        if (p && !p.locked && !locked.pillars) {
          onBeginDragHistory();
          dragRef.current = {
            kind: 'pillar',
            id: p.id,
            startScreen: { x: sx, y: sy },
            startWorld: rawWorld,
            lastWorld: rawWorld,
            startCam: { ...camRef.current },
            started: false,
            origPillar: { ...p },
          };
        }
      } else if (hit.type === 'beam') {
        const b = activeStory.beams.find((x) => x.id === hit.id);
        if (b && !b.locked && !locked.beams) {
          onBeginDragHistory();
          dragRef.current = {
            kind: 'beam-body',
            id: b.id,
            startScreen: { x: sx, y: sy },
            startWorld: rawWorld,
            lastWorld: rawWorld,
            startCam: { ...camRef.current },
            started: false,
            origBeam: { ...b },
          };
        }
      } else if (hit.type === 'asset') {
        const a = activeStory.assets.find((x) => x.id === hit.id);
        if (a && !a.locked) {
          onBeginDragHistory();
          dragRef.current = {
            kind: 'asset',
            id: a.id,
            startScreen: { x: sx, y: sy },
            startWorld: rawWorld,
            lastWorld: rawWorld,
            startCam: { ...camRef.current },
            started: false,
            origAsset: { ...a },
          };
        }
      } else if (hit.type === 'slab') {
        const sl = activeStory.slabs.find((x) => x.id === hit.id);
        if (sl && !sl.locked && !locked.slabs) {
          onBeginDragHistory();
          dragRef.current = {
            kind: 'slab',
            id: sl.id,
            startScreen: { x: sx, y: sy },
            startWorld: rawWorld,
            lastWorld: rawWorld,
            startCam: { ...camRef.current },
            started: false,
            origSlab: { ...sl },
          };
        }
      } else if (hit.type === 'cutout' && hit.parentSlabId) {
        const sl = activeStory.slabs.find((x) => x.id === hit.parentSlabId);
        const cut = sl?.cutouts?.find((c) => c.id === hit.id);
        if (sl && cut && !sl.locked && !locked.slabs) {
          onBeginDragHistory();
          dragRef.current = {
            kind: 'cutout',
            id: cut.id,
            parentId: sl.id,
            startScreen: { x: sx, y: sy },
            startWorld: rawWorld,
            lastWorld: rawWorld,
            startCam: { ...camRef.current },
            started: false,
            origCutout: { ...cut },
          };
        }
      } else if (hit.type === 'opening' && hit.parentWallId) {
        const w = activeStory.walls.find((x) => x.id === hit.parentWallId);
        const op = w?.openings.find((o) => o.id === hit.id);
        if (w && op && !w.locked && !locked.walls) {
          onBeginDragHistory();
          dragRef.current = {
            kind: 'opening',
            id: op.id,
            parentId: w.id,
            startScreen: { x: sx, y: sy },
            startWorld: rawWorld,
            lastWorld: rawWorld,
            startCam: { ...camRef.current },
            started: false,
            origWall: { ...w },
            origOpening: { ...op },
          };
        }
      } else if (hit.type === 'annotation') {
        const an = (activeStory.annotations ?? []).find((x) => x.id === hit.id);
        if (an && !an.locked) {
          onBeginDragHistory();
          dragRef.current = {
            kind: 'ann-body',
            id: an.id,
            startScreen: { x: sx, y: sy },
            startWorld: rawWorld,
            lastWorld: rawWorld,
            startCam: { ...camRef.current },
            started: false,
            origAnn: { ...an },
          };
        }
      }
      return;
    }

    // Empty canvas click: Marquee box if Shift or Box Select mode active, otherwise Empty Pan
    if (e.shiftKey || boxSelectMode) {
      dragRef.current = {
        kind: 'marquee',
        id: '',
        startScreen: { x: sx, y: sy },
        startWorld: rawWorld,
        lastWorld: rawWorld,
        startCam: { ...camRef.current },
        started: true,
      };
      marqueeRef.current = {
        startScreen: { x: sx, y: sy },
        currentScreen: { x: sx, y: sy },
        startWorld: rawWorld,
        currentWorld: rawWorld,
        crossing: false,
      };
      scheduleOverlay();
      return;
    }

    onSelect(null);
    onMultiSelect([]);
    dragRef.current = {
      kind: 'empty-pan',
      id: '',
      startScreen: { x: sx, y: sy },
      startWorld: rawWorld,
      lastWorld: rawWorld,
      startCam: { ...camRef.current },
      started: false,
    };
  };

  const commitTwoPointDraft = useCallback(
    (activeTool: ToolMode, a: Vec2, b: Vec2) => {
      if (activeTool === 'wall' || activeTool === 'curved-wall') {
        onAddWall({
          id: makeId('w'),
          x1: a.x,
          z1: a.z,
          x2: b.x,
          z2: b.z,
          curveOffset: activeTool === 'curved-wall' ? ft(1, 6) : 0,
          thickness: inch(5),
          height: null,
          material: 'brick-1st',
          role: 'partition',
          openings: [],
        });
      } else if (activeTool === 'beam') {
        onAddBeam({
          id: makeId('bm'),
          x1: a.x,
          z1: a.z,
          x2: b.x,
          z2: b.z,
          width: inch(10),
          depth: inch(15),
          material: 'rcc',
        });
      } else if (activeTool === 'room') {
        const x = Math.min(a.x, b.x);
        const z = Math.min(a.z, b.z);
        const width = Math.abs(b.x - a.x);
        const depth = Math.abs(b.z - a.z);
        if (width >= 0.8 && depth >= 0.8) {
          onAddRoom({ x, z, width, depth });
        }
      } else if (activeTool === 'slab') {
        const x = Math.min(a.x, b.x);
        const z = Math.min(a.z, b.z);
        const width = Math.abs(b.x - a.x);
        const depth = Math.abs(b.z - a.z);
        if (width >= 0.6 && depth >= 0.6) {
          onAddSlab({
            id: makeId('sl'),
            label: `Slab ${activeStory.slabs.length + 1}`,
            x,
            z,
            width,
            depth,
            thickness: activeStory.slabThickness,
            type: 'floor',
            cutouts: [],
          });
        }
      } else if (activeTool === 'cutout') {
        const x = Math.min(a.x, b.x);
        const z = Math.min(a.z, b.z);
        const width = Math.abs(b.x - a.x);
        const depth = Math.abs(b.z - a.z);
        const cx = x + width * 0.5;
        const cz = z + depth * 0.5;
        const host = activeStory.slabs.find(
          (sl) => cx >= sl.x && cx <= sl.x + sl.width && cz >= sl.z && cz <= sl.z + sl.depth
        );
        if (host && width >= 0.4 && depth >= 0.4) {
          onAddCutout(host.id, {
            id: makeId('cut'),
            label: 'Stair / Void',
            x,
            z,
            width,
            depth,
          });
        } else {
          showTempNotice('Draw cutout inside an existing floor slab.');
        }
      }
    },
    [activeStory.slabThickness, activeStory.slabs, onAddBeam, onAddCutout, onAddRoom, onAddSlab, onAddWall, showTempNotice]
  );

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = overlayCanvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // 2-finger pinch zoom
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: sx, y: sy });
      if (activePointersRef.current.size === 2 && pinchStartRef.current) {
        const pts = Array.from(activePointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const ratio = dist / pinchStartRef.current.dist;
        const targetScale = Math.max(8, Math.min(180, pinchStartRef.current.scale * ratio));
        const factor = targetScale / camRef.current.scale;
        zoomByFactor(factor, pinchStartRef.current.mid);
        return;
      }
    }

    const rawWorld = screenToWorld(sx, sy);
    cursorWorldRef.current = rawWorld;

    // Update calibration cursor
    if (calibState?.active && calibRef.current) {
      calibRef.current = { ...calibRef.current, cursor: rawWorld };
      scheduleOverlay();
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      const movePx = Math.hypot(sx - drag.startScreen.x, sy - drag.startScreen.y);
      if (!drag.started) {
        if (movePx < DRAG_DEADZONE_PX) return;
        drag.started = true;
        setIsInteracting(true);
        if (drag.kind !== 'empty-pan' && drag.kind !== 'pan' && drag.kind !== 'right-pan') {
          onDragStateChange?.(true);
        }
      }

      if (drag.kind === 'pan' || drag.kind === 'empty-pan' || drag.kind === 'right-pan') {
        camRef.current = {
          ...drag.startCam,
          offsetX: drag.startCam.offsetX + (sx - drag.startScreen.x),
          offsetY: drag.startCam.offsetY + (sy - drag.startScreen.y),
        };
        setCursorStyle('grabbing');
        scheduleBoth();
        return;
      }

      if (drag.kind === 'marquee') {
        marqueeRef.current = {
          startScreen: drag.startScreen,
          currentScreen: { x: sx, y: sy },
          startWorld: drag.startWorld,
          currentWorld: rawWorld,
          crossing: sx < drag.startScreen.x,
        };
        scheduleOverlay();
        return;
      }

      const snap = computeCadSnap(rawWorld, snapIndex, camRef.current.scale, project.gridSnap, {
        enabled: snapEnabled && !e.altKey,
        excludeWallId:
          drag.kind === 'wall-p1' || drag.kind === 'wall-p2' || drag.kind === 'wall-body'
            ? drag.id
            : null,
        orthoShift: e.shiftKey,
      });
      snapRef.current = snap;

      const step = snapEnabled && !e.altKey ? project.gridSnap || 0.1524 : 0.005;
      const quant = (v: number) => Number((Math.round(v / step) * step).toFixed(4));

      if (drag.kind === 'multi-move') {
        const dx = quant(rawWorld.x - drag.lastWorld.x);
        const dz = quant(rawWorld.z - drag.lastWorld.z);
        if (Math.abs(dx) > 1e-4 || Math.abs(dz) > 1e-4) {
          drag.lastWorld = { x: drag.lastWorld.x + dx, z: drag.lastWorld.z + dz };
          onMoveMultiSelection(dx, dz, false);
        }
        return;
      }

      if (drag.kind === 'wall-p1' || drag.kind === 'wall-p2') {
        if (drag.connectedJoints && drag.origWallsSnapshot) {
          const nextWalls = applyConnectedJointMove(
            drag.origWallsSnapshot,
            drag.connectedJoints,
            snap.x,
            snap.z
          );
          onReplaceWalls(nextWalls, false, false);
        }
      } else if (drag.kind === 'wall-body' && drag.origWall) {
        const dx = quant(rawWorld.x - drag.startWorld.x);
        const dz = quant(rawWorld.z - drag.startWorld.z);
        onUpdateWall(
          drag.id,
          {
            x1: Number((drag.origWall.x1 + dx).toFixed(4)),
            z1: Number((drag.origWall.z1 + dz).toFixed(4)),
            x2: Number((drag.origWall.x2 + dx).toFixed(4)),
            z2: Number((drag.origWall.z2 + dz).toFixed(4)),
          },
          false
        );
      } else if (drag.kind === 'wall-curve' && drag.origWall) {
        const w = drag.origWall;
        const dx = w.x2 - w.x1;
        const dz = w.z2 - w.z1;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const mx = (w.x1 + w.x2) * 0.5;
        const mz = (w.z1 + w.z2) * 0.5;
        const bulge = (rawWorld.x - mx) * nx + (rawWorld.z - mz) * nz;
        const snappedBulge = Math.abs(bulge) < 0.08 ? 0 : Number(bulge.toFixed(3));
        onUpdateWall(drag.id, { curveOffset: snappedBulge }, false);
      } else if (drag.kind === 'pillar' && drag.origPillar) {
        onUpdatePillar(drag.id, { x: snap.x, z: snap.z }, false);
      } else if (drag.kind === 'beam-p1') {
        onUpdateBeam(drag.id, { x1: snap.x, z1: snap.z }, false);
      } else if (drag.kind === 'beam-p2') {
        onUpdateBeam(drag.id, { x2: snap.x, z2: snap.z }, false);
      } else if (drag.kind === 'beam-body' && drag.origBeam) {
        const dx = quant(rawWorld.x - drag.startWorld.x);
        const dz = quant(rawWorld.z - drag.startWorld.z);
        onUpdateBeam(
          drag.id,
          {
            x1: Number((drag.origBeam.x1 + dx).toFixed(4)),
            z1: Number((drag.origBeam.z1 + dz).toFixed(4)),
            x2: Number((drag.origBeam.x2 + dx).toFixed(4)),
            z2: Number((drag.origBeam.z2 + dz).toFixed(4)),
          },
          false
        );
      } else if (drag.kind === 'asset' && drag.origAsset) {
        const a = drag.origAsset;
        const dx = rawWorld.x - drag.startWorld.x;
        const dz = rawWorld.z - drag.startWorld.z;
        const harmony = solveAssetPlacement(
          {
            id: a.id,
            assetId: a.assetId,
            x: a.x + dx,
            z: a.z + dz,
            width: a.width,
            depth: a.depth,
            height: a.height,
            rotation: a.rotation,
            elevationY: a.elevationY,
          },
          activeStory,
          {
            snapEnabled: snapEnabled && !e.altKey,
            gridStepM: project.gridSnap || 0.1524,
            excludeAssetId: a.id,
          }
        );
        assetHarmonyRef.current = harmony;
        activeAssetFootprintRef.current = {
          x: harmony.x,
          z: harmony.z,
          width: a.width,
          depth: a.depth,
          rotation: harmony.rotation,
        };
        onUpdateAsset(drag.id, { x: harmony.x, z: harmony.z, rotation: harmony.rotation }, false);
      } else if (drag.kind === 'asset-rotate' && drag.origAsset) {
        const a = drag.origAsset;
        let ang = Math.atan2(rawWorld.x - a.x, -(rawWorld.z - a.z));
        if (!e.altKey) {
          const degStep = e.shiftKey ? 5 : 15;
          ang = (Math.round(((ang * 180) / Math.PI) / degStep) * degStep * Math.PI) / 180;
        }
        const rot = Number(ang.toFixed(4));
        const conflicts = evaluateAssetConflicts(
          { ...a, rotation: rot },
          activeStory,
          a.id
        );
        assetHarmonyRef.current = conflicts.hasConflict
          ? {
              x: a.x,
              z: a.z,
              rotation: rot,
              snapped: false,
              snapKind: 'none',
              snapLabel: null,
              snappedWallId: null,
              snappedPartnerId: null,
              guides: [],
              conflicts,
            }
          : null;
        activeAssetFootprintRef.current = {
          x: a.x,
          z: a.z,
          width: a.width,
          depth: a.depth,
          rotation: rot,
        };
        onUpdateAsset(drag.id, { rotation: rot }, false);
      } else if (drag.kind === 'opening' && drag.origWall && drag.origOpening && drag.parentId) {
        const hit = pointToWallDist(rawWorld.x, rawWorld.z, drag.origWall);
        const wLen = getWallArcLength(drag.origWall);
        const halfW = drag.origOpening.width * 0.5;
        const nextOff = Math.max(
          0.06,
          Math.min(Math.max(0.06, wLen - drag.origOpening.width - 0.06), hit.alongDist - halfW)
        );
        onUpdateOpening(drag.parentId, drag.id, { offset: Number(nextOff.toFixed(3)) }, false);
      } else if (drag.kind === 'slab' && drag.origSlab) {
        const dx = quant(rawWorld.x - drag.startWorld.x);
        const dz = quant(rawWorld.z - drag.startWorld.z);
        onUpdateSlab(
          drag.id,
          { x: Number((drag.origSlab.x + dx).toFixed(4)), z: Number((drag.origSlab.z + dz).toFixed(4)) },
          false
        );
      } else if (
        (drag.kind === 'slab-nw' ||
          drag.kind === 'slab-ne' ||
          drag.kind === 'slab-sw' ||
          drag.kind === 'slab-se') &&
        drag.origSlab
      ) {
        const o = drag.origSlab;
        let x0 = o.x;
        let z0 = o.z;
        let x1 = o.x + o.width;
        let z1 = o.z + o.depth;
        if (drag.kind === 'slab-nw' || drag.kind === 'slab-sw') x0 = Math.min(x1 - 0.5, snap.x);
        if (drag.kind === 'slab-ne' || drag.kind === 'slab-se') x1 = Math.max(x0 + 0.5, snap.x);
        if (drag.kind === 'slab-nw' || drag.kind === 'slab-ne') z0 = Math.min(z1 - 0.5, snap.z);
        if (drag.kind === 'slab-sw' || drag.kind === 'slab-se') z1 = Math.max(z0 + 0.5, snap.z);
        onUpdateSlab(
          drag.id,
          {
            x: Number(x0.toFixed(4)),
            z: Number(z0.toFixed(4)),
            width: Number((x1 - x0).toFixed(4)),
            depth: Number((z1 - z0).toFixed(4)),
          },
          false
        );
      } else if (drag.kind === 'cutout' && drag.origCutout && drag.parentId) {
        const dx = quant(rawWorld.x - drag.startWorld.x);
        const dz = quant(rawWorld.z - drag.startWorld.z);
        onUpdateCutout(
          drag.parentId,
          drag.id,
          {
            x: Number((drag.origCutout.x + dx).toFixed(4)),
            z: Number((drag.origCutout.z + dz).toFixed(4)),
          },
          false
        );
      } else if (
        (drag.kind === 'cutout-nw' ||
          drag.kind === 'cutout-ne' ||
          drag.kind === 'cutout-sw' ||
          drag.kind === 'cutout-se') &&
        drag.origCutout &&
        drag.parentId
      ) {
        const o = drag.origCutout;
        let x0 = o.x;
        let z0 = o.z;
        let x1 = o.x + o.width;
        let z1 = o.z + o.depth;
        if (drag.kind === 'cutout-nw' || drag.kind === 'cutout-sw') x0 = Math.min(x1 - 0.4, snap.x);
        if (drag.kind === 'cutout-ne' || drag.kind === 'cutout-se') x1 = Math.max(x0 + 0.4, snap.x);
        if (drag.kind === 'cutout-nw' || drag.kind === 'cutout-ne') z0 = Math.min(z1 - 0.4, snap.z);
        if (drag.kind === 'cutout-sw' || drag.kind === 'cutout-se') z1 = Math.max(z0 + 0.4, snap.z);
        onUpdateCutout(
          drag.parentId,
          drag.id,
          {
            x: Number(x0.toFixed(4)),
            z: Number(z0.toFixed(4)),
            width: Number((x1 - x0).toFixed(4)),
            depth: Number((z1 - z0).toFixed(4)),
          },
          false
        );
      } else if (drag.kind === 'ann-body' && drag.origAnn) {
        const dx = quant(rawWorld.x - drag.startWorld.x);
        const dz = quant(rawWorld.z - drag.startWorld.z);
        onUpdateAnnotation(
          drag.id,
          {
            x1: Number((drag.origAnn.x1 + dx).toFixed(4)),
            z1: Number((drag.origAnn.z1 + dz).toFixed(4)),
            x2: drag.origAnn.x2 !== undefined ? Number((drag.origAnn.x2 + dx).toFixed(4)) : undefined,
            z2: drag.origAnn.z2 !== undefined ? Number((drag.origAnn.z2 + dz).toFixed(4)) : undefined,
          },
          false
        );
      } else if (drag.kind === 'ann-p1') {
        onUpdateAnnotation(drag.id, { x1: snap.x, z1: snap.z }, false);
      } else if (drag.kind === 'ann-p2') {
        onUpdateAnnotation(drag.id, { x2: snap.x, z2: snap.z }, false);
      }

      scheduleOverlay();
      return;
    }

    // Live Asset Harmony ghost preview when stamping an asset from the catalog
    if (placingAssetId) {
      const def = getAssetDefinition(placingAssetId);
      if (def) {
        const harmony = solveAssetPlacement(
          {
            assetId: def.id,
            x: rawWorld.x,
            z: rawWorld.z,
            width: def.defaultWidth,
            depth: def.defaultDepth,
            height: def.defaultHeight,
            rotation: placingAssetRotation,
            elevationY: def.defaultElevationY,
          },
          activeStory,
          {
            snapEnabled: snapEnabled && !e.altKey,
            gridStepM: project.gridSnap || 0.1524,
          }
        );
        assetHarmonyRef.current = harmony;
        activeAssetFootprintRef.current = null;
        snapRef.current = null;

        if (coordReadoutRef.current) {
          const tag = harmony.conflicts.hasConflict
            ? ` · ${harmony.conflicts.primaryMessage}`
            : harmony.snapLabel
            ? ` · ${harmony.snapLabel}`
            : '';
          coordReadoutRef.current.textContent = `X ${formatLength(harmony.x, project.unitSystem)}  Y ${formatLength(harmony.z, project.unitSystem)}${tag}`;
        }
        hoverRef.current = { target: null, handle: null };
        setCursorStyle('crosshair');
        scheduleOverlay();
        return;
      }
    } else {
      assetHarmonyRef.current = null;
      activeAssetFootprintRef.current = null;
    }

    // No active drag: only compute OSNAP guides when actively drafting or using a drawing/measure tool
    const needsSnapGuides =
      draftRef.current !== null ||
      (tool !== 'select' && tool !== 'pan');

    const snap = needsSnapGuides
      ? computeCadSnap(rawWorld, snapIndex, camRef.current.scale, project.gridSnap, {
          enabled: snapEnabled && !e.altKey,
          anchor: draftRef.current?.start ?? null,
          orthoShift: e.shiftKey,
        })
      : null;
    snapRef.current = snap;

    // Update coordinate readout directly via DOM ref (zero React re-render!)
    if (coordReadoutRef.current) {
      const rx = snap ? snap.x : rawWorld.x;
      const rz = snap ? snap.z : rawWorld.z;
      const snapTxt = snap && snap.label && snap.kind !== 'none' ? ` · ${snap.label}` : '';
      coordReadoutRef.current.textContent = `X ${formatLength(rx, project.unitSystem)}  Y ${formatLength(rz, project.unitSystem)}${snapTxt}`;
    }

    // Update active drafting rubberband
    if (draftRef.current) {
      if (draftRef.current.tool === 'offset-wall' && draftRef.current.offsetSourceWall) {
        const src = draftRef.current.offsetSourceWall;
        const dx = src.x2 - src.x1;
        const dz = src.z2 - src.z1;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const rawOff = (rawWorld.x - src.x1) * nx + (rawWorld.z - src.z1) * nz;
        const step = snapEnabled && !e.altKey ? project.gridSnap || 0.1524 : 0.025;
        const snappedOff = Math.round(rawOff / step) * step;
        draftRef.current = {
          ...draftRef.current,
          current: rawWorld,
          offsetSignedDist: Math.abs(snappedOff) < 0.2 ? (rawOff >= 0 ? 0.2 : -0.2) : snappedOff,
        };
      } else {
        const pt = snap ?? rawWorld;
        draftRef.current = {
          ...draftRef.current,
          current: { x: pt.x, z: pt.z },
        };
      }
    }

    // Update hover previews by active tool
    if (tool === 'split-wall' || tool === 'door' || tool === 'window') {
      const wallHit = findNearestWallHit(rawWorld, 0.55);
      let splitBlocked = false;
      if (tool === 'split-wall' && wallHit) {
        splitBlocked = wallHit.wall.openings.some(
          (o) => wallHit.alongDist >= o.offset - 0.04 && wallHit.alongDist <= o.offset + o.width + 0.04
        );
      }
      hoverRef.current = { target: null, handle: null, wallSnap: wallHit, splitBlocked };
      setCursorStyle(wallHit ? 'crosshair' : 'default');
    } else if (tool === 'trim-wall') {
      const wallHit = findNearestWallHit(rawWorld, 0.55);
      const trimPreview = wallHit
        ? computeTrimOrExtend(activeStory.walls, wallHit.wall.id, wallHit.alongDist)
        : null;
      hoverRef.current = { target: null, handle: null, wallSnap: wallHit, trimPreview };
      setCursorStyle(trimPreview ? 'pointer' : 'crosshair');
    } else if (tool === 'select' && !placingAssetId) {
      const hHit = hitTestHandle(sx, sy);
      if (hHit) {
        hoverRef.current = { target: selection, handle: hHit.kind };
        setCursorStyle(hHit.kind === 'asset-rotate' ? 'grab' : 'move');
      } else {
        const elHit = hitTestElement(rawWorld);
        hoverRef.current = { target: elHit, handle: null };
        setCursorStyle(boxSelectMode ? 'crosshair' : elHit ? 'pointer' : 'default');
      }
    } else {
      hoverRef.current = { target: null, handle: null };
      setCursorStyle(tool === 'pan' ? 'grab' : 'crosshair');
    }

    scheduleOverlay();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = overlayCanvasRef.current;
    if (el && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }

    // Commit click-drag drafting if dragged past threshold
    const d = draftRef.current;
    if (
      d &&
      (d.tool === 'wall' ||
        d.tool === 'curved-wall' ||
        d.tool === 'beam' ||
        d.tool === 'room' ||
        d.tool === 'slab' ||
        d.tool === 'cutout')
    ) {
      const p1 = worldToScreen(d.start.x, d.start.z);
      const p2 = worldToScreen(d.current.x, d.current.z);
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) >= DRAFT_DRAG_COMMIT_PX) {
        commitTwoPointDraft(d.tool, d.start, d.current);
        draftRef.current = null;
        typedInputRef.current = '';
        scheduleOverlay();
      }
    }

    const drag = dragRef.current;
    dragRef.current = null;
    assetHarmonyRef.current = null;
    activeAssetFootprintRef.current = null;
    setIsInteracting(false);

    if (!drag) {
      scheduleOverlay();
      return;
    }

    if (drag.kind === 'pan' || drag.kind === 'empty-pan' || drag.kind === 'right-pan') {
      if (drag.started) setCamTick((t) => t + 1);
      setCursorStyle('default');
      scheduleOverlay();
      return;
    }

    if (drag.kind === 'marquee' && marqueeRef.current) {
      const m = marqueeRef.current;
      marqueeRef.current = null;
      const rectWorld = {
        minX: Math.min(m.startWorld.x, m.currentWorld.x),
        maxX: Math.max(m.startWorld.x, m.currentWorld.x),
        minZ: Math.min(m.startWorld.z, m.currentWorld.z),
        maxZ: Math.max(m.startWorld.z, m.currentWorld.z),
      };
      if (Math.hypot(m.currentScreen.x - m.startScreen.x, m.currentScreen.y - m.startScreen.y) >= 6) {
        const hits = selectElementsInMarquee(activeStory, rectWorld, m.crossing, settings.layers);
        onMultiSelect(hits);
        onSelect(hits[0] ?? null);
      }
      scheduleOverlay();
      return;
    }

    if (drag.started) {
      // Commit final drag state to atomic Undo history
      if (drag.kind === 'multi-move') {
        onMoveMultiSelection(0, 0, true);
      } else if (drag.kind === 'wall-p1' || drag.kind === 'wall-p2') {
        onReplaceWalls(activeStory.walls, true, true);
      } else if (drag.kind === 'wall-body' || drag.kind === 'wall-curve') {
        const w = activeStory.walls.find((x) => x.id === drag.id);
        if (w) onUpdateWall(w.id, { x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2, curveOffset: w.curveOffset }, true);
      } else if (drag.kind === 'pillar') {
        const p = activeStory.pillars.find((x) => x.id === drag.id);
        if (p) onUpdatePillar(p.id, { x: p.x, z: p.z }, true);
      } else if (drag.kind === 'beam-p1' || drag.kind === 'beam-p2' || drag.kind === 'beam-body') {
        const b = activeStory.beams.find((x) => x.id === drag.id);
        if (b) onUpdateBeam(b.id, { x1: b.x1, z1: b.z1, x2: b.x2, z2: b.z2 }, true);
      } else if (drag.kind === 'asset' || drag.kind === 'asset-rotate') {
        const a = activeStory.assets.find((x) => x.id === drag.id);
        if (a) onUpdateAsset(a.id, { x: a.x, z: a.z, rotation: a.rotation }, true);
      } else if (drag.kind === 'opening' && drag.parentId) {
        const w = activeStory.walls.find((x) => x.id === drag.parentId);
        const op = w?.openings.find((o) => o.id === drag.id);
        if (op) onUpdateOpening(drag.parentId, op.id, { offset: op.offset }, true);
      } else if (drag.kind.startsWith('slab')) {
        const sl = activeStory.slabs.find((x) => x.id === drag.id);
        if (sl) onUpdateSlab(sl.id, { x: sl.x, z: sl.z, width: sl.width, depth: sl.depth }, true);
      } else if (drag.kind.startsWith('cutout') && drag.parentId) {
        const sl = activeStory.slabs.find((x) => x.id === drag.parentId);
        const cut = sl?.cutouts?.find((c) => c.id === drag.id);
        if (cut) onUpdateCutout(drag.parentId, cut.id, { x: cut.x, z: cut.z, width: cut.width, depth: cut.depth }, true);
      } else if (drag.kind.startsWith('ann')) {
        const an = (activeStory.annotations ?? []).find((x) => x.id === drag.id);
        if (an) onUpdateAnnotation(an.id, { x1: an.x1, z1: an.z1, x2: an.x2, z2: an.z2 }, true);
      }
      onDragStateChange?.(false);
    }

    setCursorStyle('default');
    scheduleOverlay();
  };

  const handleDoubleClick = () => {
    const d = draftRef.current;
    if (!d) return;
    if (d.tool === 'ruler' && (d.points?.length ?? 0) >= 2) {
      setRulers((prev) => [...prev, { id: makeId('rl'), points: d.points! }]);
      draftRef.current = null;
      scheduleBoth();
    } else if (d.tool === 'area' && (d.points?.length ?? 0) >= 3) {
      setAreas((prev) => [...prev, { id: makeId('ar'), points: d.points! }]);
      draftRef.current = null;
      scheduleBoth();
    }
  };

  // Drag & Drop from Asset Catalog with Live Asset Harmony Ghost Preview
  const handleDragOver = (e: React.DragEvent) => {
    if (!draggingAssetId) return;
    e.preventDefault();
    const el = overlayCanvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rawWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    cursorWorldRef.current = rawWorld;
    const def = getAssetDefinition(draggingAssetId);
    if (def) {
      assetHarmonyRef.current = solveAssetPlacement(
        {
          assetId: def.id,
          x: rawWorld.x,
          z: rawWorld.z,
          width: def.defaultWidth,
          depth: def.defaultDepth,
          height: def.defaultHeight,
          rotation: 0,
          elevationY: def.defaultElevationY,
        },
        activeStory,
        {
          snapEnabled: snapEnabled && !e.altKey,
          gridStepM: project.gridSnap || 0.1524,
        }
      );
      activeAssetFootprintRef.current = null;
      scheduleOverlay();
    }
  };

  const handleDragLeave = () => {
    if (!draggingAssetId) return;
    assetHarmonyRef.current = null;
    activeAssetFootprintRef.current = null;
    cursorWorldRef.current = null;
    scheduleOverlay();
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!draggingAssetId) return;
    e.preventDefault();
    const el = overlayCanvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rawWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const def = getAssetDefinition(draggingAssetId);
    if (def) {
      const res = solveAssetPlacement(
        {
          assetId: def.id,
          x: rawWorld.x,
          z: rawWorld.z,
          width: def.defaultWidth,
          depth: def.defaultDepth,
          height: def.defaultHeight,
          rotation: 0,
          elevationY: def.defaultElevationY,
        },
        activeStory,
        {
          snapEnabled: snapEnabled && !e.altKey,
          gridStepM: project.gridSnap || 0.1524,
        }
      );
      onAddAsset({
        id: makeId('ast'),
        assetId: def.id,
        label: def.name,
        x: res.x,
        z: res.z,
        width: def.defaultWidth,
        depth: def.defaultDepth,
        height: def.defaultHeight,
        rotation: res.rotation,
        elevationY: def.defaultElevationY,
      });
    }
    assetHarmonyRef.current = null;
    activeAssetFootprintRef.current = null;
    onEndAssetDrop();
    scheduleOverlay();
  };

  // Survey Underlay 2-Point Scale Calibration
  const applyUnderlayCalibration = () => {
    if (!calibState?.pointA || !calibState?.pointB || !project.underlay) return;
    const measuredM = Math.hypot(
      calibState.pointB.x - calibState.pointA.x,
      calibState.pointB.z - calibState.pointA.z
    );
    const targetM = parseTypedLengthMeters(calibState.lengthText, project.unitSystem);
    if (!targetM || measuredM < 0.05) {
      showTempNotice('Enter a valid positive real-world length.');
      return;
    }
    const factor = targetM / measuredM;
    const u = project.underlay;
    onUpdateUnderlay({
      ...u,
      widthM: Number((u.widthM * factor).toFixed(4)),
      heightM: Number((u.heightM * factor).toFixed(4)),
    });
    setCalibState(null);
    calibRef.current = null;
    scheduleBoth();
    showTempNotice(`Underlay calibrated (${formatLength(targetM, project.unitSystem)}).`);
  };

  const commitNotePrompt = () => {
    if (!notePrompt) return;
    const clean = notePrompt.text.trim();
    if (clean) {
      onAddAnnotation({
        id: makeId('ann'),
        kind: notePrompt.kind,
        x1: notePrompt.world.x,
        z1: notePrompt.world.z,
        x2: notePrompt.kind === 'callout' ? Number((notePrompt.world.x + 1.1).toFixed(3)) : undefined,
        z2: notePrompt.kind === 'callout' ? Number((notePrompt.world.z - 0.8).toFixed(3)) : undefined,
        text: clean,
      });
    }
    setNotePrompt(null);
    onExitTool?.();
  };

  // Anchored Floating Quick-Action Toolbar for Single Selected Asset
  const floatingAssetToolbar = useMemo(() => {
    void camTick;
    if (
      !selection ||
      selection.type !== 'asset' ||
      multiSelection.length > 1 ||
      tool !== 'select' ||
      placingAssetId ||
      draggingAssetId ||
      isInteracting
    ) {
      return null;
    }
    const asset = activeStory.assets.find((a) => a.id === selection.id);
    if (!asset) return null;

    const def = getAssetDefinition(asset.assetId);
    const { w: vw, h: vh } = sizeRef.current;
    const c = camRef.current;
    const sx = c.offsetX + asset.x * c.scale;
    const sy = c.offsetY + asset.z * c.scale;
    const cos = Math.abs(Math.cos(asset.rotation));
    const sin = Math.abs(Math.sin(asset.rotation));
    const halfH = ((asset.width * sin + asset.depth * cos) * c.scale) * 0.5;

    // Position cleanly above the asset (avoiding the top rotate handle) or flip below if close to top edge
    const preferTop = sy - halfH - ROTATE_HANDLE_OFFSET_PX - 38;
    const placeBelow = preferTop < 12;
    const topPx = placeBelow
      ? Math.min(vh - 54, sy + halfH + 14)
      : Math.max(10, preferTop);
    const leftPx = Math.max(145, Math.min(vw - 145, sx));

    const conflicts = evaluateAssetConflicts(asset, activeStory, asset.id);
    const upperCutout = findUpperSlabNeedingCutout(asset, project, activeStory.index);

    return {
      asset,
      def,
      leftPx,
      topPx,
      placeBelow,
      conflicts,
      upperCutout,
    };
  }, [
    activeStory,
    camTick,
    draggingAssetId,
    isInteracting,
    multiSelection.length,
    placingAssetId,
    project,
    selection,
    tool,
  ]);

  const handleSnapSelectedAssetToWall = (asset: PlacedAsset) => {
    if (asset.locked) return;
    const res = solveAssetPlacement(
      {
        id: asset.id,
        assetId: asset.assetId,
        x: asset.x,
        z: asset.z,
        width: asset.width,
        depth: asset.depth,
        height: asset.height,
        rotation: asset.rotation,
        elevationY: asset.elevationY,
      },
      activeStory,
      {
        snapEnabled: true,
        gridStepM: project.gridSnap || 0.1524,
        excludeAssetId: asset.id,
        wallSnapRadiusM: 3.5,
        companionSnapRadiusM: 1.4,
      }
    );
    if (res.snapped) {
      onUpdateAsset(asset.id, { x: res.x, z: res.z, rotation: res.rotation }, true);
      if (res.snapLabel) showTempNotice(res.snapLabel);
    } else {
      showTempNotice('Move closer to a wall or matching item to snap.');
    }
  };

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative w-full h-full overflow-hidden bg-white select-none"
    >
      {/* Layer 1: Cached Static Blueprint Sheet Canvas */}
      <canvas
        ref={baseCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Layer 2: 60fps Live Interactive Overlay Canvas */}
      <canvas
        ref={overlayCanvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: cursorStyle, touchAction: 'none' }}
        className="absolute inset-0 w-full h-full"
      />

      {/* Floating Quick-Action Asset Toolbar (anchored directly to selected asset) */}
      {floatingAssetToolbar && (
        <div
          style={{
            left: floatingAssetToolbar.leftPx,
            top: floatingAssetToolbar.topPx,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none"
        >
          <div className="pointer-events-auto flex items-center gap-0.5 bg-white border border-slate-200/95 rounded-lg shadow-md px-1 py-1 text-slate-700">
            <button
              type="button"
              disabled={floatingAssetToolbar.asset.locked}
              onClick={() =>
                onUpdateAsset(
                  floatingAssetToolbar.asset.id,
                  {
                    rotation:
                      (floatingAssetToolbar.asset.rotation + Math.PI / 2) % (Math.PI * 2),
                  },
                  true
                )
              }
              title="Rotate 90° (R)"
              aria-label="Rotate 90 degrees"
              className="p-1.5 rounded-md hover:bg-slate-100 hover:text-slate-950 disabled:opacity-35 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={floatingAssetToolbar.asset.locked}
              onClick={() =>
                onUpdateAsset(
                  floatingAssetToolbar.asset.id,
                  { flipX: !floatingAssetToolbar.asset.flipX },
                  true
                )
              }
              title="Flip horizontal"
              aria-label="Flip horizontal"
              className={`p-1.5 rounded-md disabled:opacity-35 transition-colors ${
                floatingAssetToolbar.asset.flipX
                  ? 'bg-blue-50 text-blue-700'
                  : 'hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={floatingAssetToolbar.asset.locked}
              onClick={() => handleSnapSelectedAssetToWall(floatingAssetToolbar.asset)}
              title="Smart snap to nearest wall or partner"
              aria-label="Smart snap to wall"
              className="p-1.5 rounded-md hover:bg-blue-50 hover:text-blue-700 disabled:opacity-35 transition-colors"
            >
              <Magnet className="w-3.5 h-3.5" />
            </button>

            {floatingAssetToolbar.def?.quickCompanion && onAddCompanionAsset && (
              <>
                <span className="w-px h-4 bg-slate-200 mx-0.5" />
                <button
                  type="button"
                  onClick={() => onAddCompanionAsset(floatingAssetToolbar.asset)}
                  title={`Auto-place aligned ${floatingAssetToolbar.def.quickCompanion.buttonLabel}`}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>{floatingAssetToolbar.def.quickCompanion.buttonLabel}</span>
                </button>
              </>
            )}

            {floatingAssetToolbar.upperCutout && onCutUpperSlabForStair && (
              <>
                <span className="w-px h-4 bg-slate-200 mx-0.5" />
                <button
                  type="button"
                  onClick={() => onCutUpperSlabForStair(floatingAssetToolbar.asset)}
                  title="Cut stair/lift opening in the slab directly above"
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 transition-colors whitespace-nowrap"
                >
                  <Scissors className="w-3 h-3 shrink-0" />
                  <span>Cut upper slab</span>
                </button>
              </>
            )}

            <span className="w-px h-4 bg-slate-200 mx-0.5" />
            {onDuplicateAsset && (
              <button
                type="button"
                onClick={onDuplicateAsset}
                title="Duplicate (Ctrl+D)"
                aria-label="Duplicate asset"
                className="p-1.5 rounded-md hover:bg-slate-100 hover:text-slate-950 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onUpdateAsset(
                  floatingAssetToolbar.asset.id,
                  { locked: !floatingAssetToolbar.asset.locked },
                  true
                )
              }
              title={floatingAssetToolbar.asset.locked ? 'Unlock (L)' : 'Lock position (L)'}
              aria-label={floatingAssetToolbar.asset.locked ? 'Unlock asset' : 'Lock asset'}
              className={`p-1.5 rounded-md transition-colors ${
                floatingAssetToolbar.asset.locked
                  ? 'bg-amber-50 text-amber-700'
                  : 'hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              {floatingAssetToolbar.asset.locked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Unlock className="w-3.5 h-3.5" />
              )}
            </button>
            {onDeleteAsset && (
              <button
                type="button"
                onClick={() => onDeleteAsset(floatingAssetToolbar.asset.id)}
                title="Delete (Del)"
                aria-label="Delete asset"
                className="p-1.5 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {floatingAssetToolbar.conflicts.hasConflict &&
            floatingAssetToolbar.conflicts.primaryMessage && (
              <div
                className={`pointer-events-none flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium shadow-xs ${
                  floatingAssetToolbar.conflicts.severity === 'critical'
                    ? 'bg-red-600 text-white'
                    : 'bg-amber-500 text-white'
                }`}
              >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{floatingAssetToolbar.conflicts.primaryMessage}</span>
              </div>
            )}
        </div>
      )}

      {/* Bottom-Right Minimal Zoom, Fit & Clear Measurements Controls */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1">
        {(rulers.length > 0 || areas.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setRulers([]);
              setAreas([]);
            }}
            title="Clear ruler & area measurements"
            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-red-700 bg-white/95 hover:bg-red-50 border border-slate-200 rounded-lg shadow-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
        <div className="flex items-center bg-white/95 border border-slate-200 rounded-lg shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => zoomByFactor(1 / 1.25)}
            title="Zoom out"
            aria-label="Zoom out"
            className="p-1.5 text-slate-700 hover:bg-slate-100 border-r border-slate-200 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={fitPlanToView}
            title="Fit plan to screen (F)"
            aria-label="Fit plan to screen"
            className="p-1.5 text-slate-700 hover:bg-slate-100 border-r border-slate-200 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => zoomByFactor(1.25)}
            title="Zoom in"
            aria-label="Zoom in"
            className="p-1.5 text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2-Point Survey Underlay Scale Calibration Banner */}
      {calibState?.active && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white rounded-xl shadow-lg px-3.5 py-2.5 flex flex-wrap items-center gap-2 text-xs max-w-[calc(100%-1.5rem)]">
          {!calibState.pointA ? (
            <span>Step 1 of 3: Click the start of a known edge on your survey image</span>
          ) : !calibState.pointB ? (
            <span>Step 2 of 3: Click the end of that known edge</span>
          ) : (
            <>
              <span>Step 3: Real length ({project.unitSystem === 'imperial' ? "e.g. 40' or 40'6\"" : 'meters'}):</span>
              <input
                type="text"
                autoFocus
                value={calibState.lengthText}
                onChange={(e) => setCalibState({ ...calibState, lengthText: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyUnderlayCalibration();
                  if (e.key === 'Escape') {
                    setCalibState(null);
                    calibRef.current = null;
                    scheduleOverlay();
                  }
                }}
                placeholder={project.unitSystem === 'imperial' ? "40'" : '12.2'}
                className="w-24 px-2 py-1 text-xs font-mono text-slate-900 bg-white rounded border border-slate-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={applyUnderlayCalibration}
                className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded"
              >
                <Check className="w-3.5 h-3.5" />
                Apply
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setCalibState(null);
              calibRef.current = null;
              scheduleOverlay();
            }}
            className="p-1 text-slate-400 hover:text-white rounded"
            aria-label="Cancel calibration"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Inline Floating Note / Callout Popover */}
      {notePrompt && (
        <div
          style={{ left: notePrompt.screenX, top: notePrompt.screenY }}
          className="absolute -translate-x-1/2 -translate-y-1/2 z-30 bg-white border border-slate-300 rounded-xl shadow-lg p-2.5 w-60 space-y-2"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-md text-[11px]">
              <button
                type="button"
                onClick={() => setNotePrompt({ ...notePrompt, kind: 'callout' })}
                className={`px-2 py-0.5 rounded font-medium ${
                  notePrompt.kind === 'callout' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Leader callout
              </button>
              <button
                type="button"
                onClick={() => setNotePrompt({ ...notePrompt, kind: 'note' })}
                className={`px-2 py-0.5 rounded font-medium ${
                  notePrompt.kind === 'note' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Plain note
              </button>
            </div>
            <button
              type="button"
              onClick={() => setNotePrompt(null)}
              className="p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            type="text"
            autoFocus
            value={notePrompt.text}
            onChange={(e) => setNotePrompt({ ...notePrompt, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNotePrompt();
              if (e.key === 'Escape') setNotePrompt(null);
            }}
            placeholder="e.g. 5&quot; brick parapet, Sump pit..."
            className="w-full px-2 py-1.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600 focus:outline-none"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setNotePrompt(null)}
              className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitNotePrompt}
              className="px-2.5 py-1 text-[11px] font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded"
            >
              Place
            </button>
          </div>
        </div>
      )}

      {/* Non-Blocking Inline CAD Tool Feedback Notice */}
      {notice && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-md">
          {notice}
        </div>
      )}

      {/* Quiet Zero-React-Render Coordinate & OSNAP Readout (shown in Pro CAD or when actively drawing/placing) */}
      {(experienceMode === 'engineer' || tool !== 'select' || Boolean(placingAssetId)) && (
        <div className="pointer-events-none hidden sm:block absolute bottom-3 left-3 z-10 text-[11px] font-mono tabular-nums text-slate-500 bg-white/90 px-2 py-0.5 rounded border border-slate-200/80">
          <span ref={coordReadoutRef}>Ready · Snap {snapEnabled ? 'On' : 'Off'}</span>
        </div>
      )}
    </div>
  );
});
