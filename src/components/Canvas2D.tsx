import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AreaPoly,
  Beam,
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
  ToolMode,
  Vec2,
  Wall,
  WallOpening,
} from '../types/building';
import { getAssetDefinition } from '../engine/assets';
import {
  computeActualPlotSetbacks,
  computeRequiredRajukRules,
  computeStructuralGrid,
  getBnbcConfig,
  getWallArcLength,
  isCurvedWall,
  pointAtWallOffset,
  pointToWallDist,
  sampleWallPolyline,
  snapAssetToNearestWall,
} from '../engine/geometryKernel';
import {
  formatArea,
  formatBanglaLandSummary,
  formatLength,
  ft,
  getGridSpec,
  inch,
} from '../engine/units';

export interface Canvas2DHandle {
  exportPng: () => string | null;
  resetView: () => void;
  clearMeasurements: () => void;
}

interface Canvas2DProps {
  project: BuildingProject;
  activeStory: Story;
  lowerStory?: Story;
  physics: PhysicsReport;
  experienceMode: ExperienceMode;
  tool: ToolMode;
  heatmapMode: boolean;
  showDimensions: boolean;
  showSetbacks: boolean;
  selection: SelectionTarget | null;
  compact?: boolean;
  inspectorOpen?: boolean;
  onSelect: (target: SelectionTarget | null) => void;
  onAddRoom: (rect: { x: number; z: number; width: number; depth: number }) => void;
  onAddWall: (wall: Wall) => void;
  onUpdateWall: (wallId: string, patch: Partial<Wall>, commit?: boolean) => void;
  onAddPillar: (pillar: Pillar) => void;
  onUpdatePillar: (pillarId: string, patch: Partial<Pillar>, commit?: boolean) => void;
  onAddBeam: (beam: Beam) => void;
  onAddSlab: (slab: Slab) => void;
  onUpdateSlab: (slabId: string, patch: Partial<Slab>, commit?: boolean) => void;
  onAddCutout: (slabId: string, cutout: SlabCutout) => void;
  onAddOpening: (wallId: string, opening: WallOpening) => void;
  onAddAsset: (asset: PlacedAsset) => void;
  onUpdateAsset: (assetId: string, patch: Partial<PlacedAsset>, commit?: boolean) => void;
  onBeginDragHistory: () => void;
  draggingAssetId: string | null;
  onEndAssetDrop: () => void;
}

interface SnapResult {
  x: number;
  z: number;
  snappedTo: 'point' | 'axis' | 'grid' | 'none';
  guideFrom?: Vec2;
}

const DRAG_DEADZONE_PX = 6;

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function polygonArea(pts: Vec2[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

function polygonPerimeter(pts: Vec2[]): number {
  if (pts.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/** Parse typed architectural length input like "12.5", "12'6", "12-6" into meters */
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
  if (!Number.isFinite(num) || num <= 0.1) return null;
  return unit === 'imperial' ? num * 0.3048 : num;
}

/** Clean CAD 2D architectural symbols for every Bangladeshi asset */
function drawAssetSymbol2D(
  ctx: CanvasRenderingContext2D,
  asset: PlacedAsset,
  scale: number,
  selected: boolean
): void {
  const def = getAssetDefinition(asset.assetId);
  const w = asset.width * scale;
  const d = asset.depth * scale;
  const hw = w / 2;
  const hd = d / 2;
  const id = asset.assetId;

  ctx.save();
  ctx.fillStyle = selected ? 'rgba(29, 78, 216, 0.14)' : 'rgba(248, 250, 252, 0.92)';
  ctx.strokeStyle = selected ? '#1d4ed8' : '#334155';
  ctx.lineWidth = selected ? 1.8 : 1.1;

  if (id === 'pukur-pond') {
    ctx.fillStyle = '#bae6fd';
    ctx.strokeStyle = selected ? '#1d4ed8' : '#0284c7';
    ctx.fillRect(-hw, -hd, w, d);
    ctx.strokeRect(-hw, -hd, w, d);
    // Stepped ghat lines on south side
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-hw * 0.38, hd - i * (d * 0.08));
      ctx.lineTo(hw * 0.38, hd - i * (d * 0.08));
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (id === 'tree-coconut' || id === 'tree-mango') {
    ctx.fillStyle = id === 'tree-mango' ? 'rgba(34, 197, 94, 0.24)' : 'rgba(22, 163, 74, 0.22)';
    ctx.strokeStyle = selected ? '#1d4ed8' : '#15803d';
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(hw, hd), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(hw, hd) * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#78350f';
    ctx.fill();
    ctx.restore();
    return;
  }

  // Base footprint rectangle
  ctx.fillRect(-hw, -hd, w, d);
  ctx.strokeRect(-hw, -hd, w, d);

  if (def?.isStair) {
    // Draw authentic CAD staircase treads + UP direction arrow
    ctx.strokeStyle = selected ? '#1d4ed8' : '#64748b';
    ctx.lineWidth = 0.85;
    if (id === 'stair-u-dogleg') {
      const landD = d * 0.32;
      // Mid-landing line at -hd + landD
      ctx.beginPath();
      ctx.moveTo(-hw, -hd + landD);
      ctx.lineTo(hw, -hd + landD);
      ctx.moveTo(0, -hd + landD);
      ctx.lineTo(0, hd);
      ctx.stroke();
      const steps = 8;
      const runH = (d - landD) / steps;
      for (let i = 1; i < steps; i++) {
        const y = -hd + landD + i * runH;
        ctx.beginPath();
        ctx.moveTo(-hw, y);
        ctx.lineTo(hw, y);
        ctx.stroke();
      }
      // UP arrow
      ctx.strokeStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.moveTo(-hw * 0.5, hd - 5);
      ctx.lineTo(-hw * 0.5, -hd + landD * 0.5);
      ctx.lineTo(hw * 0.5, -hd + landD * 0.5);
      ctx.lineTo(hw * 0.5, hd - 5);
      ctx.stroke();
    } else {
      const steps = 10;
      for (let i = 1; i < steps; i++) {
        const y = -hd + (i / steps) * d;
        ctx.beginPath();
        ctx.moveTo(-hw, y);
        ctx.lineTo(hw, y);
        ctx.stroke();
      }
      ctx.strokeStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.moveTo(0, hd - 4);
      ctx.lineTo(0, -hd + 4);
      ctx.stroke();
    }
  } else if (id === 'elevator-shaft') {
    ctx.beginPath();
    ctx.moveTo(-hw, -hd);
    ctx.lineTo(hw, hd);
    ctx.moveTo(hw, -hd);
    ctx.lineTo(-hw, hd);
    ctx.stroke();
  } else if (id.startsWith('bed-')) {
    // Headboard + 2 pillows
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-hw + 2, -hd + 2, w - 4, d * 0.24);
    ctx.strokeRect(-hw + 3, -hd + 3, w * 0.44, d * 0.18);
    if (w > 24) ctx.strokeRect(hw - w * 0.44 - 3, -hd + 3, w * 0.44, d * 0.18);
    // Blanket fold line
    ctx.beginPath();
    ctx.moveTo(-hw, -hd + d * 0.36);
    ctx.lineTo(hw, -hd + d * 0.36);
    ctx.stroke();
  } else if (id.startsWith('sofa-') || id === 'diwan-segun') {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-hw, -hd, w, d * 0.25);
    ctx.strokeRect(-hw, -hd, w, d * 0.25);
  } else if (id.startsWith('dining-')) {
    // Table + chair notches
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(-hw * 0.72, -hd * 0.62, w * 0.72, d * 0.62);
    ctx.strokeRect(-hw * 0.72, -hd * 0.62, w * 0.72, d * 0.62);
  } else if (id === 'wc-commode' || id === 'wc-bengali-pan') {
    ctx.beginPath();
    ctx.ellipse(0, hd * 0.12, hw * 0.65, hd * 0.58, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id.startsWith('car-') || id === 'cng-autorickshaw' || id === 'motorcycle') {
    // Windshield & cabin lines
    ctx.strokeRect(-hw * 0.8, -hd * 0.38, w * 0.8, d * 0.52);
  } else if (id === 'kitchen-counter-l' || id === 'kitchen-counter-straight') {
    // Burner circles + sink square
    ctx.beginPath();
    ctx.arc(-hw * 0.35, 0, Math.min(hw, hd) * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(hw * 0.12, -hd * 0.34, w * 0.28, d * 0.68);
  }

  ctx.restore();
}

export const Canvas2D = forwardRef<Canvas2DHandle, Canvas2DProps>(function Canvas2D(
  {
    project,
    activeStory,
    lowerStory,
    physics,
    experienceMode,
    tool,
    heatmapMode,
    showDimensions,
    showSetbacks,
    selection,
    compact = false,
    inspectorOpen = false,
    onSelect,
    onAddRoom,
    onAddWall,
    onUpdateWall,
    onAddPillar,
    onUpdatePillar,
    onAddBeam,
    onAddSlab,
    onUpdateSlab,
    onAddCutout,
    onAddOpening,
    onAddAsset,
    onUpdateAsset,
    onBeginDragHistory,
    draggingAssetId,
    onEndAssetDrop,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const showRulers = experienceMode === 'engineer';
  const rulerTop = showRulers ? 24 : 0;
  const rulerLeft = showRulers ? 34 : 0;

  const [view, setView] = useState({ scale: 42, offsetX: 110, offsetY: 90 });
  const [cursorWorld, setCursorWorld] = useState<Vec2 | null>(null);
  const cursorWorldRef = useRef<Vec2 | null>(null);
  const coordHudRef = useRef<HTMLDivElement>(null);
  const coordTextRef = useRef<HTMLSpanElement>(null);
  const [snapInfo, setSnapInfo] = useState<SnapResult | null>(null);
  const [rulers, setRulers] = useState<RulerChain[]>([]);
  const [activeRuler, setActiveRuler] = useState<Vec2[]>([]);
  const [areas, setAreas] = useState<AreaPoly[]>([]);
  const [activeArea, setActiveArea] = useState<Vec2[]>([]);
  const [typedLength, setTypedLength] = useState('');
  const [lockToast, setLockToast] = useState<string | null>(null);

  const [draftStart, setDraftStart] = useState<Vec2 | null>(null);
  const [draftEnd, setDraftEnd] = useState<Vec2 | null>(null);

  const dragRef = useRef<{
    kind: 'pan' | 'pillar' | 'asset' | 'slab' | 'wall-p1' | 'wall-p2' | 'wall-body' | 'wall-curve';
    id?: string;
    startScreenX: number;
    startScreenY: number;
    startWorldX: number;
    startWorldZ: number;
    origX: number;
    origZ: number;
    origX2?: number;
    origZ2?: number;
    origCurve?: number;
    origOffsetX?: number;
    origOffsetY?: number;
    active: boolean;
    historyStarted: boolean;
    bypassDeadzone?: boolean;
  } | null>(null);

  const spacePressedRef = useRef(false);
  const shiftPressedRef = useRef(false);
  const altPressedRef = useRef(false);

  const flashLockToast = useCallback((msg: string) => {
    setLockToast(msg);
    window.setTimeout(() => {
      setLockToast((prev) => (prev === msg ? null : prev));
    }, 1800);
  }, []);

  const fitToStory = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const usableW = Math.max(160, rect.width - rulerLeft);
    const usableH = Math.max(160, rect.height - rulerTop - 74);

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const expand = (x: number, z: number) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    };

    if (project.plot) {
      expand(project.plot.originX, project.plot.originZ);
      expand(project.plot.originX + project.plot.width, project.plot.originZ + project.plot.depth);
    }
    activeStory.slabs.forEach((s) => {
      expand(s.x, s.z);
      expand(s.x + s.width, s.z + s.depth);
    });
    activeStory.walls.forEach((w) => {
      expand(w.x1, w.z1);
      expand(w.x2, w.z2);
    });
    activeStory.pillars.forEach((p) => expand(p.x, p.z));

    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = ft(34);
      minZ = 0;
      maxZ = ft(44);
    }

    const spanX = Math.max(5, maxX - minX + 4.4);
    const spanZ = Math.max(5, maxZ - minZ + 4.8);
    const scale = Math.max(12, Math.min(88, Math.min(usableW / spanX, usableH / spanZ)));
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    setView({
      scale,
      offsetX: usableW / 2 - cx * scale,
      offsetY: usableH / 2 - cz * scale + 10,
    });
  }, [activeStory, project.plot, rulerLeft, rulerTop]);

  const lastProjIdRef = useRef<string>('');
  useEffect(() => {
    if (lastProjIdRef.current !== project.id) {
      lastProjIdRef.current = project.id;
      const t = window.setTimeout(fitToStory, 30);
      return () => clearTimeout(t);
    }
  }, [project.id, fitToStory]);

  const prevCompactRef = useRef(compact);
  useEffect(() => {
    if (prevCompactRef.current !== compact) {
      prevCompactRef.current = compact;
      const t = window.setTimeout(fitToStory, 45);
      return () => clearTimeout(t);
    }
  }, [compact, fitToStory]);

  useImperativeHandle(ref, () => ({
    exportPng: () => {
      const canvas = canvasRef.current;
      return canvas ? canvas.toDataURL('image/png') : null;
    },
    resetView: fitToStory,
    clearMeasurements: () => {
      setRulers([]);
      setActiveRuler([]);
      setAreas([]);
      setActiveArea([]);
    },
  }));

  const screenToWorld = useCallback(
    (sx: number, sy: number): Vec2 => ({
      x: (sx - rulerLeft - view.offsetX) / view.scale,
      z: (sy - rulerTop - view.offsetY) / view.scale,
    }),
    [view, rulerLeft, rulerTop]
  );

  const worldToScreen = useCallback(
    (wx: number, wz: number): { x: number; y: number } => ({
      x: rulerLeft + view.offsetX + wx * view.scale,
      y: rulerTop + view.offsetY + wz * view.scale,
    }),
    [view, rulerLeft, rulerTop]
  );

  const snapWorld = useCallback(
    (raw: Vec2, anchor?: Vec2): SnapResult => {
      let tx = raw.x;
      let tz = raw.z;

      // Shift Ortho Lock (0 / 45 / 90 deg) when drawing from an anchor
      if (anchor && shiftPressedRef.current) {
        const dx = tx - anchor.x;
        const dz = tz - anchor.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
          const ang = Math.atan2(dz, dx);
          const snappedAng = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
          tx = anchor.x + Math.cos(snappedAng) * dist;
          tz = anchor.z + Math.sin(snappedAng) * dist;
        }
      }

      const snap = Math.max(0.05, project.gridSnap || inch(6));
      const ptTol = Math.max(0.22, 11 / view.scale);

      // 1. OSNAP to existing wall endpoints, pillar centers, and lower-story pillars
      const snapPts: Vec2[] = [];
      for (const p of activeStory.pillars) snapPts.push({ x: p.x, z: p.z });
      if (lowerStory) {
        for (const p of lowerStory.pillars) snapPts.push({ x: p.x, z: p.z });
      }
      for (const w of activeStory.walls) {
        snapPts.push({ x: w.x1, z: w.z1 });
        snapPts.push({ x: w.x2, z: w.z2 });
      }

      let bestPt: Vec2 | null = null;
      let bestDist = ptTol;
      for (const pt of snapPts) {
        const d = Math.hypot(pt.x - tx, pt.z - tz);
        if (d < bestDist) {
          bestDist = d;
          bestPt = pt;
        }
      }
      if (bestPt) {
        return { x: bestPt.x, z: bestPt.z, snappedTo: 'point', guideFrom: anchor };
      }

      // 2. Orthogonal alignment to anchor if within soft threshold
      if (anchor) {
        const axisTol = Math.max(0.16, 8 / view.scale);
        if (Math.abs(tx - anchor.x) < axisTol) {
          return {
            x: anchor.x,
            z: Math.round(tz / snap) * snap,
            snappedTo: 'axis',
            guideFrom: anchor,
          };
        }
        if (Math.abs(tz - anchor.z) < axisTol) {
          return {
            x: Math.round(tx / snap) * snap,
            z: anchor.z,
            snappedTo: 'axis',
            guideFrom: anchor,
          };
        }
      }

      // 3. Grid snap
      return {
        x: Math.round(tx / snap) * snap,
        z: Math.round(tz / snap) * snap,
        snappedTo: 'grid',
        guideFrom: anchor,
      };
    },
    [activeStory.pillars, activeStory.walls, lowerStory, project.gridSnap, view.scale]
  );

  // Keyboard modifiers & live direct numeric length typing while drafting
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') spacePressedRef.current = true;
      if (e.key === 'Shift') shiftPressedRef.current = true;
      if (e.key === 'Alt') altPressedRef.current = true;

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      if (e.key === 'Escape') {
        setDraftStart(null);
        setDraftEnd(null);
        setTypedLength('');
        setActiveRuler([]);
        setActiveArea([]);
        return;
      }

      // Direct numeric typing while drafting a wall, curved wall, or beam
      if (draftStart && (tool === 'wall' || tool === 'curved-wall' || tool === 'beam')) {
        if (/^[0-9.'"-]$/.test(e.key)) {
          e.preventDefault();
          setTypedLength((prev) => (prev.length < 10 ? prev + e.key : prev));
        } else if (e.key === 'Backspace' && typedLength.length > 0) {
          e.preventDefault();
          setTypedLength((prev) => prev.slice(0, -1));
        } else if (e.key === 'Enter' && typedLength.length > 0) {
          e.preventDefault();
          const lenM = parseTypedLengthMeters(typedLength, project.unitSystem);
          if (lenM && lenM >= 0.3) {
            const refEnd = draftEnd ?? cursorWorldRef.current ?? { x: draftStart.x + 1, z: draftStart.z };
            const dx = refEnd.x - draftStart.x;
            const dz = refEnd.z - draftStart.z;
            const ang = Math.hypot(dx, dz) > 0.01 ? Math.atan2(dz, dx) : 0;
            const ex = Number((draftStart.x + Math.cos(ang) * lenM).toFixed(4));
            const ez = Number((draftStart.z + Math.sin(ang) * lenM).toFixed(4));
            if (tool === 'beam') {
              onAddBeam({
                id: makeId('bm'),
                x1: draftStart.x,
                z1: draftStart.z,
                x2: ex,
                z2: ez,
                width: inch(10),
                depth: inch(18),
                material: 'rcc',
              });
            } else {
              onAddWall({
                id: makeId('w'),
                x1: draftStart.x,
                z1: draftStart.z,
                x2: ex,
                z2: ez,
                curveOffset: tool === 'curved-wall' ? ft(1, 6) : 0,
                thickness: inch(5),
                height: null,
                material: 'brick-1st',
                role: 'partition',
                openings: [],
              });
            }
            setDraftStart({ x: ex, z: ez });
            setDraftEnd({ x: ex, z: ez });
          }
          setTypedLength('');
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spacePressedRef.current = false;
      if (e.key === 'Shift') shiftPressedRef.current = false;
      if (e.key === 'Alt') altPressedRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [draftEnd, draftStart, onAddBeam, onAddWall, project.unitSystem, tool, typedLength]);

  // Clear in-progress drafting on tool change
  useEffect(() => {
    setDraftStart(null);
    setDraftEnd(null);
    setTypedLength('');
  }, [tool]);

  // Hit-testing with priority: Selected handles -> Pillars -> Assets -> Openings -> Walls -> Cutouts -> Slabs
  const hitTest = useCallback(
    (
      world: Vec2,
      screen: { x: number; y: number }
    ): {
      target: SelectionTarget;
      handle?: 'wall-p1' | 'wall-p2' | 'wall-curve' | 'move-handle';
    } | null => {
      const tolWorld = Math.max(0.24, 12 / view.scale);

      // 0. Check handles on currently selected element FIRST!
      if (selection && selection.storyIndex === activeStory.index) {
        if (selection.type === 'wall') {
          const w = activeStory.walls.find((item) => item.id === selection.id);
          if (w) {
            const p1s = worldToScreen(w.x1, w.z1);
            const p2s = worldToScreen(w.x2, w.z2);
            const midPt = pointAtWallOffset(w, getWallArcLength(w) * 0.5);
            const mids = worldToScreen(midPt.x, midPt.z);
            if (Math.hypot(screen.x - p1s.x, screen.y - p1s.y) <= 10) {
              return { target: selection, handle: 'wall-p1' };
            }
            if (Math.hypot(screen.x - p2s.x, screen.y - p2s.y) <= 10) {
              return { target: selection, handle: 'wall-p2' };
            }
            if (Math.hypot(screen.x - mids.x, screen.y - mids.y) <= 11) {
              return { target: selection, handle: 'wall-curve' };
            }
          }
        }
        if (selection.type === 'asset') {
          const a = activeStory.assets.find((item) => item.id === selection.id);
          if (a) {
            const sc = worldToScreen(a.x, a.z);
            if (Math.hypot(screen.x - sc.x, screen.y - sc.y) <= 11) {
              return { target: selection, handle: 'move-handle' };
            }
          }
        }
        if (selection.type === 'pillar') {
          const p = activeStory.pillars.find((item) => item.id === selection.id);
          if (p) {
            const sc = worldToScreen(p.x, p.z);
            if (Math.hypot(screen.x - sc.x, screen.y - sc.y) <= 11) {
              return { target: selection, handle: 'move-handle' };
            }
          }
        }
      }

      // 1. Pillars
      for (const p of activeStory.pillars) {
        const r = Math.max(p.width, p.depth) * 0.65 + 0.14;
        if (Math.hypot(world.x - p.x, world.z - p.z) <= r) {
          return { target: { type: 'pillar', id: p.id, storyIndex: activeStory.index } };
        }
      }

      // 2. Assets (reverse order so top-most picks first)
      for (let i = activeStory.assets.length - 1; i >= 0; i--) {
        const a = activeStory.assets[i];
        const dx = world.x - a.x;
        const dz = world.z - a.z;
        const c = Math.cos(-a.rotation);
        const s = Math.sin(-a.rotation);
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        if (Math.abs(lx) <= a.width / 2 + 0.08 && Math.abs(lz) <= a.depth / 2 + 0.08) {
          return { target: { type: 'asset', id: a.id, storyIndex: activeStory.index } };
        }
      }

      // 3. Openings on walls
      for (const w of activeStory.walls) {
        const hit = pointToWallDist(world.x, world.z, w);
        if (hit.dist <= Math.max(w.thickness * 0.8, tolWorld)) {
          for (const op of w.openings) {
            if (Math.abs(hit.alongDist - op.offset) <= op.width * 0.55) {
              return {
                target: {
                  type: 'opening',
                  id: op.id,
                  parentWallId: w.id,
                  storyIndex: activeStory.index,
                },
              };
            }
          }
          return { target: { type: 'wall', id: w.id, storyIndex: activeStory.index } };
        }
      }

      // 4. Beams (Engineer mode)
      if (experienceMode === 'engineer') {
        for (const b of activeStory.beams) {
          const fakeWall: Wall = {
            id: b.id,
            x1: b.x1,
            z1: b.z1,
            x2: b.x2,
            z2: b.z2,
            thickness: b.width,
            height: null,
            material: 'rcc',
            role: 'load-bearing',
            openings: [],
          };
          if (pointToWallDist(world.x, world.z, fakeWall).dist <= tolWorld * 0.85) {
            return { target: { type: 'beam', id: b.id, storyIndex: activeStory.index } };
          }
        }
      }

      // 5. Slab cutouts
      for (const sl of activeStory.slabs) {
        for (const cut of sl.cutouts ?? []) {
          if (
            world.x >= cut.x &&
            world.x <= cut.x + cut.width &&
            world.z >= cut.z &&
            world.z <= cut.z + cut.depth
          ) {
            return {
              target: {
                type: 'cutout',
                id: cut.id,
                parentSlabId: sl.id,
                storyIndex: activeStory.index,
              },
            };
          }
        }
      }

      // 6. Slabs
      for (let i = activeStory.slabs.length - 1; i >= 0; i--) {
        const sl = activeStory.slabs[i];
        if (
          world.x >= sl.x &&
          world.x <= sl.x + sl.width &&
          world.z >= sl.z &&
          world.z <= sl.z + sl.depth
        ) {
          return { target: { type: 'slab', id: sl.id, storyIndex: activeStory.index } };
        }
      }

      return null;
    },
    [activeStory, experienceMode, selection, view.scale, worldToScreen]
  );

  // Pointer Down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const rawWorld = screenToWorld(sx, sy);

    // Middle mouse, Space+Click, or Pan tool
    if (e.button === 1 || spacePressedRef.current || tool === 'pan') {
      dragRef.current = {
        kind: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startWorldX: rawWorld.x,
        startWorldZ: rawWorld.z,
        origX: 0,
        origZ: 0,
        origOffsetX: view.offsetX,
        origOffsetY: view.offsetY,
        active: true,
        historyStarted: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    // SELECT TOOL — Frontier Precision: Click ALWAYS strictly selects first; NEVER moves on first click!
    if (tool === 'select') {
      const hit = hitTest(rawWorld, { x: sx, y: sy });
      if (!hit) {
        onSelect(null);
        return;
      }

      const alreadySelected =
        selection !== null &&
        selection.type === hit.target.type &&
        selection.id === hit.target.id &&
        selection.storyIndex === hit.target.storyIndex;

      if (!alreadySelected) {
        // Strict first-click select only — zero unintended movement!
        onSelect(hit.target);
        return;
      }

      // Already selected — allow dragging past 6px deadzone (or immediate via handle), respecting locks!
      const layers = project.lockedLayers ?? {};
      if (hit.target.type === 'wall') {
        const w = activeStory.walls.find((x) => x.id === hit.target.id);
        if (!w) return;
        if (w.locked || layers.walls) {
          flashLockToast('Wall is locked (press L to unlock)');
          return;
        }
        const kind =
          hit.handle === 'wall-p1'
            ? 'wall-p1'
            : hit.handle === 'wall-p2'
            ? 'wall-p2'
            : hit.handle === 'wall-curve'
            ? 'wall-curve'
            : 'wall-body';
        dragRef.current = {
          kind,
          id: w.id,
          startScreenX: e.clientX,
          startScreenY: e.clientY,
          startWorldX: rawWorld.x,
          startWorldZ: rawWorld.z,
          origX: w.x1,
          origZ: w.z1,
          origX2: w.x2,
          origZ2: w.z2,
          origCurve: w.curveOffset ?? 0,
          active: false,
          historyStarted: false,
          bypassDeadzone: hit.handle !== undefined,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (hit.target.type === 'pillar') {
        const p = activeStory.pillars.find((x) => x.id === hit.target.id);
        if (!p) return;
        if (p.locked || layers.pillars) {
          flashLockToast('Column is locked (press L to unlock)');
          return;
        }
        dragRef.current = {
          kind: 'pillar',
          id: p.id,
          startScreenX: e.clientX,
          startScreenY: e.clientY,
          startWorldX: rawWorld.x,
          startWorldZ: rawWorld.z,
          origX: p.x,
          origZ: p.z,
          active: false,
          historyStarted: false,
          bypassDeadzone: hit.handle === 'move-handle',
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (hit.target.type === 'asset') {
        const a = activeStory.assets.find((x) => x.id === hit.target.id);
        if (!a) return;
        if (a.locked) {
          flashLockToast('Item is locked (press L to unlock)');
          return;
        }
        dragRef.current = {
          kind: 'asset',
          id: a.id,
          startScreenX: e.clientX,
          startScreenY: e.clientY,
          startWorldX: rawWorld.x,
          startWorldZ: rawWorld.z,
          origX: a.x,
          origZ: a.z,
          active: false,
          historyStarted: false,
          bypassDeadzone: hit.handle === 'move-handle',
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (hit.target.type === 'slab') {
        const sl = activeStory.slabs.find((x) => x.id === hit.target.id);
        if (!sl) return;
        if (sl.locked || layers.slabs) {
          flashLockToast('Slab is locked (press L to unlock)');
          return;
        }
        dragRef.current = {
          kind: 'slab',
          id: sl.id,
          startScreenX: e.clientX,
          startScreenY: e.clientY,
          startWorldX: rawWorld.x,
          startWorldZ: rawWorld.z,
          origX: sl.x,
          origZ: sl.z,
          active: false,
          historyStarted: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }

    const snapped = snapWorld(rawWorld, draftStart ?? undefined);

    // PILLAR PLACEMENT
    if (tool === 'pillar') {
      const idx = activeStory.pillars.length + 1;
      onAddPillar({
        id: makeId('col'),
        label: `C${idx}`,
        x: snapped.x,
        z: snapped.z,
        width: inch(12),
        depth: inch(12),
        shape: 'square',
        grade: 'rcc-3500',
        rotation: 0,
      });
      return;
    }

    // DOOR / WINDOW PLACEMENT ON NEAREST WALL (WORKS ON BOTH STRAIGHT & CURVED WALLS!)
    if (tool === 'door' || tool === 'window') {
      let bestWall: Wall | null = null;
      let bestDist = 0.65;
      let bestAlong = 0;
      for (const w of activeStory.walls) {
        const res = pointToWallDist(rawWorld.x, rawWorld.z, w);
        if (res.dist < bestDist) {
          bestDist = res.dist;
          bestWall = w;
          bestAlong = res.alongDist;
        }
      }
      if (bestWall) {
        const wLen = getWallArcLength(bestWall);
        const opWidth = tool === 'door' ? ft(3, 4) : ft(4, 6);
        const safeOffset = Math.max(opWidth * 0.55, Math.min(wLen - opWidth * 0.55, bestAlong));
        if (wLen >= opWidth + 0.3) {
          onAddOpening(bestWall.id, {
            id: makeId(tool === 'door' ? 'dr' : 'win'),
            kind: tool === 'door' ? 'door-single' : 'window-casement',
            offset: Number(safeOffset.toFixed(3)),
            width: opWidth,
            height: tool === 'door' ? ft(7) : ft(4, 6),
            sillHeight: tool === 'door' ? 0 : ft(2, 6),
            swing: 1,
            openRatio: tool === 'door' ? 0.35 : 0,
            hasChajja: tool === 'window' && bestWall.thickness >= inch(8),
            hasGrill: tool === 'window',
          });
        }
      }
      return;
    }

    // RULER & AREA POLYGON MEASUREMENT TOOLS
    if (tool === 'ruler') {
      setActiveRuler((prev) => [...prev, { x: snapped.x, z: snapped.z }]);
      return;
    }
    if (tool === 'area') {
      setActiveArea((prev) => [...prev, { x: snapped.x, z: snapped.z }]);
      return;
    }

    // TWO-POINT DRAFTING: Wall, Curved Wall, Beam, Room, Slab, Cutout
    if (
      tool === 'wall' ||
      tool === 'curved-wall' ||
      tool === 'beam' ||
      tool === 'room' ||
      tool === 'slab' ||
      tool === 'cutout'
    ) {
      if (!draftStart) {
        setDraftStart({ x: snapped.x, z: snapped.z });
        setDraftEnd({ x: snapped.x, z: snapped.z });
        setTypedLength('');
      } else {
        const dx = snapped.x - draftStart.x;
        const dz = snapped.z - draftStart.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= 0.3) {
          if (tool === 'wall' || tool === 'curved-wall') {
            onAddWall({
              id: makeId('w'),
              x1: draftStart.x,
              z1: draftStart.z,
              x2: snapped.x,
              z2: snapped.z,
              curveOffset: tool === 'curved-wall' ? Math.min(ft(2, 6), Math.max(ft(1), dist * 0.22)) : 0,
              thickness: inch(5),
              height: null,
              material: 'brick-1st',
              role: 'partition',
              openings: [],
            });
            // Chain walls smoothly; stop chain on curved walls so user can adjust arc immediately
            if (tool === 'wall') {
              setDraftStart({ x: snapped.x, z: snapped.z });
              setDraftEnd({ x: snapped.x, z: snapped.z });
              setTypedLength('');
              return;
            }
          } else if (tool === 'beam') {
            onAddBeam({
              id: makeId('bm'),
              x1: draftStart.x,
              z1: draftStart.z,
              x2: snapped.x,
              z2: snapped.z,
              width: inch(10),
              depth: inch(18),
              material: 'rcc',
            });
          } else if (tool === 'room') {
            const x = Math.min(draftStart.x, snapped.x);
            const z = Math.min(draftStart.z, snapped.z);
            const width = Math.abs(dx);
            const depth = Math.abs(dz);
            if (width >= 0.9 && depth >= 0.9) {
              onAddRoom({ x, z, width, depth });
            }
          } else if (tool === 'slab') {
            const x = Math.min(draftStart.x, snapped.x);
            const z = Math.min(draftStart.z, snapped.z);
            const width = Math.abs(dx);
            const depth = Math.abs(dz);
            if (width >= 0.6 && depth >= 0.6) {
              onAddSlab({
                id: makeId('sl'),
                label: 'Floor Slab',
                x,
                z,
                width,
                depth,
                thickness: activeStory.slabThickness,
                type: 'floor',
                cutouts: [],
              });
            }
          } else if (tool === 'cutout') {
            const x = Math.min(draftStart.x, snapped.x);
            const z = Math.min(draftStart.z, snapped.z);
            const width = Math.abs(dx);
            const depth = Math.abs(dz);
            if (width >= 0.5 && depth >= 0.5) {
              const cx = x + width * 0.5;
              const cz = z + depth * 0.5;
              const targetSlab =
                activeStory.slabs.find(
                  (sl) =>
                    cx >= sl.x && cx <= sl.x + sl.width && cz >= sl.z && cz <= sl.z + sl.depth
                ) ?? activeStory.slabs[0];
              if (targetSlab) {
                onAddCutout(targetSlab.id, {
                  id: makeId('cut'),
                  label: 'Stair / Void Cutout',
                  x,
                  z,
                  width,
                  depth,
                });
              }
            }
          }
        }
        setDraftStart(null);
        setDraftEnd(null);
        setTypedLength('');
      }
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const rawWorld = screenToWorld(sx, sy);
    cursorWorldRef.current = rawWorld;
    if (coordHudRef.current && coordTextRef.current) {
      coordHudRef.current.style.display = 'block';
      coordTextRef.current.textContent = `X ${formatLength(rawWorld.x, project.unitSystem)} · Y ${formatLength(rawWorld.z, project.unitSystem)}`;
    }
    if (activeRuler.length > 0 || activeArea.length > 0) {
      setCursorWorld(rawWorld);
    }

    const drag = dragRef.current;
    if (drag) {
      if (drag.kind === 'pan') {
        setView((v) => ({
          ...v,
          offsetX: (drag.origOffsetX ?? v.offsetX) + (e.clientX - drag.startScreenX),
          offsetY: (drag.origOffsetY ?? v.offsetY) + (e.clientY - drag.startScreenY),
        }));
        return;
      }

      // Enforce 6px deadzone so slight click jitter NEVER moves elements!
      if (!drag.active) {
        const pxDist = Math.hypot(e.clientX - drag.startScreenX, e.clientY - drag.startScreenY);
        if (!drag.bypassDeadzone && pxDist < DRAG_DEADZONE_PX) return;
        drag.active = true;
      }

      if (!drag.historyStarted) {
        drag.historyStarted = true;
        onBeginDragHistory();
      }

      const snap = Math.max(0.05, project.gridSnap || inch(6));
      const dWorldX = rawWorld.x - drag.startWorldX;
      const dWorldZ = rawWorld.z - drag.startWorldZ;

      if (drag.kind === 'pillar' && drag.id) {
        const sn = snapWorld({ x: drag.origX + dWorldX, z: drag.origZ + dWorldZ });
        onUpdatePillar(drag.id, { x: sn.x, z: sn.z }, false);
      } else if (drag.kind === 'asset' && drag.id) {
        const asset = activeStory.assets.find((a) => a.id === drag.id);
        let nx = Math.round((drag.origX + dWorldX) / (snap * 0.5)) * (snap * 0.5);
        let nz = Math.round((drag.origZ + dWorldZ) / (snap * 0.5)) * (snap * 0.5);
        let rot = asset?.rotation ?? 0;

        // Smart Wall-Snapping for wallSnappable furniture (hold Alt to disable)
        if (asset && !altPressedRef.current) {
          const def = getAssetDefinition(asset.assetId);
          if (def?.wallSnappable) {
            const snapped = snapAssetToNearestWall(
              nx,
              nz,
              asset.width,
              asset.depth,
              rot,
              activeStory,
              0.45
            );
            if (snapped.snappedWallId) {
              nx = snapped.x;
              nz = snapped.z;
              rot = snapped.rotation;
            }
          }
        }
        onUpdateAsset(drag.id, { x: nx, z: nz, rotation: rot }, false);
      } else if (drag.kind === 'slab' && drag.id) {
        const nx = Math.round((drag.origX + dWorldX) / snap) * snap;
        const nz = Math.round((drag.origZ + dWorldZ) / snap) * snap;
        onUpdateSlab(drag.id, { x: nx, z: nz }, false);
      } else if (drag.kind === 'wall-p1' && drag.id) {
        const sn = snapWorld(rawWorld, { x: drag.origX2 ?? drag.origX, z: drag.origZ2 ?? drag.origZ });
        onUpdateWall(drag.id, { x1: sn.x, z1: sn.z }, false);
      } else if (drag.kind === 'wall-p2' && drag.id) {
        const sn = snapWorld(rawWorld, { x: drag.origX, z: drag.origZ });
        onUpdateWall(drag.id, { x2: sn.x, z2: sn.z }, false);
      } else if (drag.kind === 'wall-body' && drag.id) {
        const dx = Math.round(dWorldX / snap) * snap;
        const dz = Math.round(dWorldZ / snap) * snap;
        onUpdateWall(
          drag.id,
          {
            x1: drag.origX + dx,
            z1: drag.origZ + dz,
            x2: (drag.origX2 ?? drag.origX) + dx,
            z2: (drag.origZ2 ?? drag.origZ) + dz,
          },
          false
        );
      } else if (drag.kind === 'wall-curve' && drag.id) {
        // Compute perpendicular signed bulge offset from chord midpoint
        const x1 = drag.origX;
        const z1 = drag.origZ;
        const x2 = drag.origX2 ?? x1;
        const z2 = drag.origZ2 ?? z1;
        const mx = (x1 + x2) * 0.5;
        const mz = (z1 + z2) * 0.5;
        const chord = Math.max(0.1, Math.hypot(x2 - x1, z2 - z1));
        const nx = -(z2 - z1) / chord;
        const nz = (x2 - x1) / chord;
        let bulge = (rawWorld.x - mx) * nx + (rawWorld.z - mz) * nz;
        // Snap cleanly to 0 (perfectly straight) within 10 cm
        if (Math.abs(bulge) < 0.1) bulge = 0;
        bulge = Math.max(-chord * 0.48, Math.min(chord * 0.48, bulge));
        onUpdateWall(drag.id, { curveOffset: Number(bulge.toFixed(3)) }, false);
      }
      return;
    }

    const sn = snapWorld(rawWorld, draftStart ?? undefined);
    setSnapInfo(sn);
    if (draftStart) {
      setDraftEnd({ x: sn.x, z: sn.z });
    }
  };

  // Pointer Up
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!drag || !drag.active || drag.kind === 'pan') return;

    // Commit history on drag release
    if (drag.kind === 'pillar' && drag.id) {
      const p = activeStory.pillars.find((x) => x.id === drag.id);
      if (p) onUpdatePillar(drag.id, { x: p.x, z: p.z }, true);
    } else if (drag.kind === 'asset' && drag.id) {
      const a = activeStory.assets.find((x) => x.id === drag.id);
      if (a) onUpdateAsset(drag.id, { x: a.x, z: a.z, rotation: a.rotation }, true);
    } else if (drag.kind === 'slab' && drag.id) {
      const sl = activeStory.slabs.find((x) => x.id === drag.id);
      if (sl) onUpdateSlab(drag.id, { x: sl.x, z: sl.z }, true);
    } else if (
      (drag.kind === 'wall-p1' ||
        drag.kind === 'wall-p2' ||
        drag.kind === 'wall-body' ||
        drag.kind === 'wall-curve') &&
      drag.id
    ) {
      const w = activeStory.walls.find((x) => x.id === drag.id);
      if (w) {
        onUpdateWall(
          drag.id,
          { x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2, curveOffset: w.curveOffset ?? 0 },
          true
        );
      }
    }
  };

  // Double-click completes ruler/area chain or stops wall chaining
  const handleDoubleClick = () => {
    if (tool === 'ruler' && activeRuler.length >= 2) {
      setRulers((prev) => [...prev, { id: makeId('rul'), points: activeRuler }]);
      setActiveRuler([]);
    } else if (tool === 'area' && activeArea.length >= 3) {
      setAreas((prev) => [...prev, { id: makeId('ar'), points: activeArea }]);
      setActiveArea([]);
    } else if (draftStart) {
      setDraftStart(null);
      setDraftEnd(null);
      setTypedLength('');
    }
  };

  // Cursor-centered smooth wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = screenToWorld(sx, sy);
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setView((prev) => {
      const nextScale = Math.max(10, Math.min(180, prev.scale * factor));
      return {
        scale: nextScale,
        offsetX: sx - rulerLeft - before.x * nextScale,
        offsetY: sy - rulerTop - before.z * nextScale,
      };
    });
  };

  // Asset drag-and-drop from LeftDock onto 2D Plan
  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    if (draggingAssetId) e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const assetId = draggingAssetId || e.dataTransfer.getData('text/plain');
    if (!assetId) return;
    const def = getAssetDefinition(assetId);
    if (!def) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const sn = snapWorld(world);
    let placed: PlacedAsset = {
      id: makeId('ast'),
      assetId: def.id,
      label: def.name,
      x: sn.x,
      z: sn.z,
      width: def.defaultWidth,
      depth: def.defaultDepth,
      height: def.defaultHeight,
      rotation: 0,
      elevationY: def.defaultElevationY,
    };
    if (def.wallSnappable) {
      const wallSnap = snapAssetToNearestWall(
        placed.x,
        placed.z,
        placed.width,
        placed.depth,
        placed.rotation,
        activeStory,
        0.65
      );
      if (wallSnap.snappedWallId) {
        placed = { ...placed, x: wallSnap.x, z: wallSnap.z, rotation: wallSnap.rotation };
      }
    }
    onAddAsset(placed);
    onEndAssetDrop();
  };

  // =========================================================================
  // MAIN 2D ARCHITECTURAL CAD RENDERER
  // =========================================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(100, container.clientWidth);
    const cssH = Math.max(100, container.clientHeight);
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Crisp architectural drafting sheet background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);

    // Clip drawing area below rulers
    ctx.save();
    ctx.beginPath();
    ctx.rect(rulerLeft, rulerTop, cssW - rulerLeft, cssH - rulerTop);
    ctx.clip();

    // 2. Subtle architectural grid
    const grid = getGridSpec(project.unitSystem);
    const topLeftW = screenToWorld(rulerLeft, rulerTop);
    const botRightW = screenToWorld(cssW, cssH);

    const drawGridLines = (step: number, stroke: string, lineWidth: number) => {
      if (step * view.scale < 8) return;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      const startX = Math.floor(topLeftW.x / step) * step;
      for (let x = startX; x <= botRightW.x; x += step) {
        const s = worldToScreen(x, 0).x;
        ctx.moveTo(s, rulerTop);
        ctx.lineTo(s, cssH);
      }
      const startZ = Math.floor(topLeftW.z / step) * step;
      for (let z = startZ; z <= botRightW.z; z += step) {
        const s = worldToScreen(0, z).y;
        ctx.moveTo(rulerLeft, s);
        ctx.lineTo(cssW, s);
      }
      ctx.stroke();
    };
    drawGridLines(grid.minor, '#f1f5f9', 0.8);
    drawGridLines(grid.major, '#e2e8f0', 1.0);

    // 3. Plot Boundary, Road Orientation & RAJUK Setback Envelope
    if (project.plot) {
      const plot = project.plot;
      const p0 = worldToScreen(plot.originX, plot.originZ);
      const pw = plot.width * view.scale;
      const pd = plot.depth * view.scale;

      // Subtle grass/plot fill
      ctx.fillStyle = plot.landContext === 'village' ? '#f2f8ee' : '#f8fafc';
      ctx.fillRect(p0.x, p0.y, pw, pd);

      // Road strip along plot.roadSide (parametric N/S/E/W!)
      const roadW = Math.max(36, 4.5 * view.scale);
      ctx.fillStyle = '#334155';
      let rLabelX = p0.x + pw / 2;
      let rLabelY = p0.y + pd + roadW / 2;
      if (plot.roadSide === 'south') {
        ctx.fillRect(p0.x - 24, p0.y + pd, pw + 48, roadW);
      } else if (plot.roadSide === 'north') {
        ctx.fillRect(p0.x - 24, p0.y - roadW, pw + 48, roadW);
        rLabelY = p0.y - roadW / 2;
      } else if (plot.roadSide === 'east') {
        ctx.fillRect(p0.x + pw, p0.y - 24, roadW, pd + 48);
        rLabelX = p0.x + pw + roadW / 2;
        rLabelY = p0.y + pd / 2;
      } else {
        ctx.fillRect(p0.x - roadW, p0.y - 24, roadW, pd + 48);
        rLabelX = p0.x - roadW / 2;
        rLabelY = p0.y + pd / 2;
      }
      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `ROAD (${plot.roadSide.toUpperCase()})`,
        rLabelX,
        rLabelY
      );

      // Plot boundary outline
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(p0.x, p0.y, pw, pd);

      // RAJUK Legal Setback Envelope (shows safe neighbor buffer)
      if (showSetbacks) {
        const req = computeRequiredRajukRules(plot, getBnbcConfig(project), project.stories.length);
        const sb = req.requiredSetbacks;
        let sbMinX = plot.originX + sb.left;
        let sbMaxX = plot.originX + plot.width - sb.right;
        let sbMinZ = plot.originZ + sb.rear;
        let sbMaxZ = plot.originZ + plot.depth - sb.front;
        if (plot.roadSide === 'north') {
          sbMinZ = plot.originZ + sb.front;
          sbMaxZ = plot.originZ + plot.depth - sb.rear;
        } else if (plot.roadSide === 'east') {
          sbMinX = plot.originX + sb.rear;
          sbMaxX = plot.originX + plot.width - sb.front;
          sbMinZ = plot.originZ + sb.left;
          sbMaxZ = plot.originZ + plot.depth - sb.right;
        } else if (plot.roadSide === 'west') {
          sbMinX = plot.originX + sb.front;
          sbMaxX = plot.originX + plot.width - sb.rear;
          sbMinZ = plot.originZ + sb.left;
          sbMaxZ = plot.originZ + plot.depth - sb.right;
        }
        const s0 = worldToScreen(sbMinX, sbMinZ);
        const sw = Math.max(0, (sbMaxX - sbMinX) * view.scale);
        const sd = Math.max(0, (sbMaxZ - sbMinZ) * view.scale);

        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = physics.rajuk.setbacksOk ? '#16a34a' : '#dc2626';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(s0.x, s0.y, sw, sd);
        ctx.restore();

        // Plot dimension labels
        if (showDimensions) {
          ctx.fillStyle = '#475569';
          ctx.font = '500 10px "IBM Plex Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(
            `Plot ${formatLength(plot.width, project.unitSystem)} × ${formatLength(plot.depth, project.unitSystem)} (${physics.rajuk.plotKatha.toFixed(2)} Katha)`,
            p0.x + pw / 2,
            p0.y - 10
          );
        }
      }
    }

    // 4. AutoCAD Structural Gridlines (A, B, C... / 1, 2, 3...)
    const structGrid = computeStructuralGrid(activeStory);
    if (structGrid.xLines.length > 0 || structGrid.zLines.length > 0) {
      const { buildingBounds } = computeActualPlotSetbacks(project);
      const pad = 1.8;
      ctx.save();
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.34)';
      ctx.lineWidth = 0.85;
      ctx.setLineDash([8, 4, 2, 4]);

      for (const xl of structGrid.xLines) {
        const top = worldToScreen(xl.coord, buildingBounds.minZ - pad);
        const bot = worldToScreen(xl.coord, buildingBounds.maxZ + pad);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bot.x, bot.y);
        ctx.stroke();

        // Grid Bubble A, B, C
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(top.x, top.y - 11, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#334155';
        ctx.font = '600 9.5px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(xl.label, top.x, top.y - 11);
        ctx.setLineDash([8, 4, 2, 4]);
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.34)';
      }

      for (const zl of structGrid.zLines) {
        const left = worldToScreen(buildingBounds.minX - pad, zl.coord);
        const right = worldToScreen(buildingBounds.maxX + pad, zl.coord);
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();

        // Grid Bubble 1, 2, 3
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(left.x - 11, left.y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#334155';
        ctx.font = '600 9.5px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(zl.label, left.x - 11, left.y);
        ctx.setLineDash([8, 4, 2, 4]);
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.34)';
      }
      ctx.restore();
    }

    // 5. Lower-story ghost column alignment guides (when editing G+1 and above)
    if (lowerStory) {
      ctx.save();
      ctx.strokeStyle = 'rgba(29, 78, 216, 0.25)';
      ctx.setLineDash([3, 3]);
      for (const p of lowerStory.pillars) {
        const sc = worldToScreen(p.x, p.z);
        const rw = p.width * view.scale;
        const rd = p.depth * view.scale;
        ctx.strokeRect(sc.x - rw / 2, sc.y - rd / 2, rw, rd);
      }
      ctx.restore();
    }

    // 6. Slabs + True Cutout Holes (with CAD diagonal void cross-hatch)
    for (const sl of activeStory.slabs) {
      const p0 = worldToScreen(sl.x, sl.z);
      const sw = sl.width * view.scale;
      const sd = sl.depth * view.scale;
      const isSel = selection?.type === 'slab' && selection.id === sl.id;
      const phys = physics.elements[sl.id];

      let fill = sl.type === 'balcony' ? '#f1f5f9' : '#ffffff';
      if (heatmapMode && phys) {
        fill =
          phys.status === 'critical'
            ? 'rgba(220, 38, 38, 0.14)'
            : phys.status === 'warning'
            ? 'rgba(217, 119, 6, 0.14)'
            : 'rgba(22, 163, 74, 0.10)';
      }

      ctx.fillStyle = fill;
      ctx.strokeStyle = isSel ? '#1d4ed8' : sl.type === 'balcony' ? '#64748b' : '#cbd5e1';
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.fillRect(p0.x, p0.y, sw, sd);
      ctx.strokeRect(p0.x, p0.y, sw, sd);

      // Draw slab cutouts (stairwell/lift/duplex voids)
      for (const cut of sl.cutouts ?? []) {
        const c0 = worldToScreen(cut.x, cut.z);
        const cw = cut.width * view.scale;
        const cd = cut.depth * view.scale;
        const cutSel = selection?.type === 'cutout' && selection.id === cut.id;

        ctx.save();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(c0.x, c0.y, cw, cd);
        ctx.strokeStyle = cutSel ? '#1d4ed8' : '#0ea5e9';
        ctx.lineWidth = cutSel ? 2 : 1.2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(c0.x, c0.y, cw, cd);
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y);
        ctx.lineTo(c0.x + cw, c0.y + cd);
        ctx.moveTo(c0.x + cw, c0.y);
        ctx.lineTo(c0.x, c0.y + cd);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 7. Room Labels & Area Tags
    for (const rm of activeStory.rooms) {
      const c = worldToScreen(rm.x + rm.width / 2, rm.z + rm.depth / 2);
      ctx.save();
      ctx.fillStyle = '#334155';
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rm.name, c.x, c.y - 6);
      ctx.fillStyle = '#64748b';
      ctx.font = '500 9.5px "IBM Plex Mono", monospace';
      ctx.fillText(
        `${formatLength(rm.width, project.unitSystem)} × ${formatLength(rm.depth, project.unitSystem)}`,
        c.x,
        c.y + 7
      );
      ctx.restore();
    }

    // 8. Beams (dashed overhead lines in Engineer mode or Heatmap mode)
    if (experienceMode === 'engineer' || heatmapMode) {
      for (const b of activeStory.beams) {
        const p1 = worldToScreen(b.x1, b.z1);
        const p2 = worldToScreen(b.x2, b.z2);
        const isSel = selection?.type === 'beam' && selection.id === b.id;
        const phys = physics.elements[b.id];
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = isSel
          ? '#1d4ed8'
          : heatmapMode && phys
          ? phys.status === 'critical'
            ? '#dc2626'
            : phys.status === 'warning'
            ? '#d97706'
            : '#16a34a'
          : '#64748b';
        ctx.lineWidth = Math.max(1.4, b.width * view.scale * 0.25);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 9. Placed Assets (44 Bangladeshi Functional Symbols)
    for (const asset of activeStory.assets) {
      const sc = worldToScreen(asset.x, asset.z);
      const isSel = selection?.type === 'asset' && selection.id === asset.id;
      ctx.save();
      ctx.translate(sc.x, sc.y);
      ctx.rotate(asset.rotation);
      drawAssetSymbol2D(ctx, asset, view.scale, isSel);
      ctx.restore();

      // Dedicated Move Handle on selected asset
      if (isSel) {
        ctx.save();
        ctx.fillStyle = '#1d4ed8';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 10. Walls (Straight & Curved Arc Walls!) + Openings + Dimension Chains
    for (const w of activeStory.walls) {
      const isSel = selection?.type === 'wall' && selection.id === w.id;
      const phys = physics.elements[w.id];
      const pts = sampleWallPolyline(w, isCurvedWall(w) ? 20 : 1);
      const strokeW = Math.max(3, w.thickness * view.scale);

      let strokeColor = w.role === 'load-bearing' ? '#1e293b' : '#475569';
      if (w.material === 'exposed-brick') strokeColor = '#8c3c28';
      if (heatmapMode && phys) {
        strokeColor =
          phys.status === 'critical'
            ? '#dc2626'
            : phys.status === 'warning'
            ? '#d97706'
            : '#16a34a';
      }
      if (isSel) strokeColor = '#1d4ed8';

      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const sp = worldToScreen(pts[i].x, pts[i].z);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      }
      ctx.stroke();
      ctx.restore();

      // Openings on wall (works on both straight and curved walls!)
      for (const op of w.openings) {
        const pt = pointAtWallOffset(w, op.offset);
        const sc = worldToScreen(pt.x, pt.z);
        const opSel = selection?.type === 'opening' && selection.id === op.id;
        const opW = op.width * view.scale;

        ctx.save();
        ctx.translate(sc.x, sc.y);
        ctx.rotate(pt.angle);
        // White gap across wall thickness
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-opW / 2, -strokeW / 2 - 1, opW, strokeW + 2);

        if (op.kind.startsWith('window')) {
          ctx.strokeStyle = opSel ? '#1d4ed8' : '#0284c7';
          ctx.lineWidth = 1.6;
          ctx.strokeRect(-opW / 2, -strokeW * 0.35, opW, strokeW * 0.7);
          ctx.beginPath();
          ctx.moveTo(-opW / 2, 0);
          ctx.lineTo(opW / 2, 0);
          ctx.stroke();
        } else if (op.kind === 'shutter-shop') {
          ctx.strokeStyle = opSel ? '#1d4ed8' : '#475569';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 2]);
          ctx.beginPath();
          ctx.moveTo(-opW / 2, 0);
          ctx.lineTo(opW / 2, 0);
          ctx.stroke();
        } else if (op.kind === 'door-sliding') {
          ctx.strokeStyle = opSel ? '#1d4ed8' : '#0f766e';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(-opW / 2, -2);
          ctx.lineTo(opW * 0.1, -2);
          ctx.moveTo(-opW * 0.1, 2);
          ctx.lineTo(opW / 2, 2);
          ctx.stroke();
        } else if (op.kind !== 'arch-opening') {
          // Hinged door leaf + quarter-circle swing arc
          const swingDir = op.swing || 1;
          ctx.strokeStyle = opSel ? '#1d4ed8' : '#92400e';
          ctx.lineWidth = 1.6;
          if (op.kind === 'door-double') {
            const half = opW / 2;
            ctx.beginPath();
            ctx.moveTo(-half, 0);
            ctx.lineTo(-half, swingDir * half);
            ctx.moveTo(half, 0);
            ctx.lineTo(half, swingDir * half);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(146, 64, 14, 0.38)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(-half, 0, half, swingDir > 0 ? 0 : -Math.PI / 2, swingDir > 0 ? Math.PI / 2 : 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(half, 0, half, swingDir > 0 ? Math.PI / 2 : Math.PI, swingDir > 0 ? Math.PI : Math.PI * 1.5);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(-opW / 2, 0);
            ctx.lineTo(-opW / 2, swingDir * opW);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(146, 64, 14, 0.38)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(
              -opW / 2,
              0,
              opW,
              swingDir > 0 ? 0 : -Math.PI / 2,
              swingDir > 0 ? Math.PI / 2 : 0
            );
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Live wall length label when selected or showDimensions active
      const wLen = getWallArcLength(w);
      if ((showDimensions && wLen >= 1.5) || isSel) {
        const mid = pointAtWallOffset(w, wLen * 0.5);
        const ms = worldToScreen(mid.x, mid.z);
        ctx.save();
        ctx.fillStyle = isSel ? '#1d4ed8' : '#475569';
        ctx.font = '600 9.5px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const nx = -Math.sin(mid.angle);
        const nz = Math.cos(mid.angle);
        const label = isCurvedWall(w)
          ? `⌒ ${formatLength(wLen, project.unitSystem)}`
          : formatLength(wLen, project.unitSystem);
        ctx.fillText(label, ms.x + nx * 13, ms.y + nz * 13);
        ctx.restore();
      }

      // Selected wall handles: P1, P2, and Cyan Arc-Curve Bulge Handle!
      if (isSel) {
        const p1s = worldToScreen(w.x1, w.z1);
        const p2s = worldToScreen(w.x2, w.z2);
        const mid = pointAtWallOffset(w, wLen * 0.5);
        const mids = worldToScreen(mid.x, mid.z);
        ctx.save();
        for (const h of [p1s, p2s]) {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#1d4ed8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(h.x, h.y, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        // Cyan Arc-Bend Handle at midpoint
        ctx.fillStyle = '#0ea5e9';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(mids.x, mids.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 11. Pillars / Columns (RCC & Circular)
    for (const p of activeStory.pillars) {
      const sc = worldToScreen(p.x, p.z);
      const pw = Math.max(7, p.width * view.scale);
      const pd = Math.max(7, p.depth * view.scale);
      const isSel = selection?.type === 'pillar' && selection.id === p.id;
      const phys = physics.elements[p.id];

      let fill = '#0f172a';
      if (heatmapMode && phys) {
        fill =
          phys.status === 'critical'
            ? '#dc2626'
            : phys.status === 'warning'
            ? '#d97706'
            : '#16a34a';
      }
      if (isSel) fill = '#1d4ed8';

      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = isSel ? '#93c5fd' : '#ffffff';
      ctx.lineWidth = isSel ? 2 : 1;
      if (p.shape === 'circular') {
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, pw / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(sc.x - pw / 2, sc.y - pd / 2, pw, pd);
        ctx.strokeRect(sc.x - pw / 2, sc.y - pd / 2, pw, pd);
      }

      if (experienceMode === 'engineer' || isSel) {
        ctx.fillStyle = '#1e293b';
        ctx.font = '600 9px "IBM Plex Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(p.label, sc.x + pw / 2 + 3, sc.y - pd / 2 - 2);
      }
      ctx.restore();
    }

    // 12. Draft Preview (Straight Wall, Curved Wall, Beam, Room, Slab, Cutout)
    if (draftStart && draftEnd) {
      const p1 = worldToScreen(draftStart.x, draftStart.z);
      const p2 = worldToScreen(draftEnd.x, draftEnd.z);
      const dx = draftEnd.x - draftStart.x;
      const dz = draftEnd.z - draftStart.z;
      const dist = Math.hypot(dx, dz);

      ctx.save();
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      if (tool === 'room' || tool === 'slab' || tool === 'cutout') {
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        ctx.fillStyle =
          tool === 'cutout' ? 'rgba(14, 165, 233, 0.16)' : 'rgba(29, 78, 216, 0.10)';
        ctx.fillRect(x, y, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
        ctx.strokeRect(x, y, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
        ctx.setLineDash([]);
        ctx.fillStyle = '#1d4ed8';
        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          `${formatLength(Math.abs(dx), project.unitSystem)} × ${formatLength(Math.abs(dz), project.unitSystem)}`,
          (p1.x + p2.x) / 2,
          (p1.y + p2.y) / 2
        );
      } else if (tool === 'curved-wall') {
        const previewWall: Wall = {
          id: 'preview',
          x1: draftStart.x,
          z1: draftStart.z,
          x2: draftEnd.x,
          z2: draftEnd.z,
          curveOffset: Math.min(ft(2, 6), Math.max(ft(1), dist * 0.22)),
          thickness: inch(5),
          height: null,
          material: 'brick-1st',
          role: 'partition',
          openings: [],
        };
        const pts = sampleWallPolyline(previewWall, 18);
        ctx.beginPath();
        pts.forEach((pt, idx) => {
          const sp = worldToScreen(pt.x, pt.z);
          if (idx === 0) ctx.moveTo(sp.x, sp.y);
          else ctx.lineTo(sp.x, sp.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#0284c7';
        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          typedLength ? `Length: ${typedLength} (Enter)` : `Arc ${formatLength(getWallArcLength(previewWall), project.unitSystem)}`,
          (p1.x + p2.x) / 2,
          (p1.y + p2.y) / 2 - 14
        );
      } else {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#1d4ed8';
        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          typedLength ? `Length: ${typedLength} (Enter)` : formatLength(dist, project.unitSystem),
          (p1.x + p2.x) / 2,
          (p1.y + p2.y) / 2 - 12
        );
      }
      ctx.restore();
    }

    // 13. Ruler & Area Measurement Overlays
    const drawChain = (pts: Vec2[], closed: boolean) => {
      if (pts.length < 2) return;
      ctx.save();
      ctx.strokeStyle = closed ? '#0f766e' : '#b45309';
      ctx.fillStyle = closed ? 'rgba(15, 118, 110, 0.12)' : 'transparent';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      pts.forEach((pt, idx) => {
        const sp = worldToScreen(pt.x, pt.z);
        if (idx === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      });
      if (closed) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
      const mid = pts[Math.floor(pts.length / 2)];
      const ms = worldToScreen(mid.x, mid.z);
      ctx.fillStyle = closed ? '#0f766e' : '#b45309';
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      if (closed && pts.length >= 3) {
        const aM2 = polygonArea(pts);
        const land = formatBanglaLandSummary(aM2);
        ctx.fillText(`${formatArea(aM2, project.unitSystem)} (${land.shotok})`, ms.x, ms.y);
      } else {
        ctx.fillText(formatLength(polygonPerimeter(pts), project.unitSystem), ms.x, ms.y - 10);
      }
      ctx.restore();
    };
    rulers.forEach((r) => drawChain(r.points, false));
    if (activeRuler.length > 0 && cursorWorld) drawChain([...activeRuler, cursorWorld], false);
    areas.forEach((a) => drawChain(a.points, true));
    if (activeArea.length > 0 && cursorWorld) drawChain([...activeArea, cursorWorld], true);

    // 14. OSNAP Cursor Marker
    if (snapInfo && tool !== 'select' && tool !== 'pan') {
      const sp = worldToScreen(snapInfo.x, snapInfo.z);
      ctx.save();
      ctx.strokeStyle = snapInfo.snappedTo === 'point' ? '#16a34a' : '#1d4ed8';
      ctx.lineWidth = 1.6;
      if (snapInfo.snappedTo === 'point') {
        ctx.strokeRect(sp.x - 5, sp.y - 5, 10, 10);
      } else {
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore(); // end main viewport clip

    // 15. Engineer CAD Rulers along top & left edges
    if (showRulers) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, cssW, rulerTop);
      ctx.fillRect(0, 0, rulerLeft, cssH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rulerTop + 0.5);
      ctx.lineTo(cssW, rulerTop + 0.5);
      ctx.moveTo(rulerLeft + 0.5, 0);
      ctx.lineTo(rulerLeft + 0.5, cssH);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '500 9px "IBM Plex Mono", monospace';
      const step = grid.major;
      const sx0 = Math.floor(topLeftW.x / step) * step;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let x = sx0; x <= botRightW.x; x += step) {
        const px = worldToScreen(x, 0).x;
        if (px < rulerLeft + 12 || px > cssW - 12) continue;
        ctx.fillText(formatLength(x, project.unitSystem), px, rulerTop / 2);
      }
      const sz0 = Math.floor(topLeftW.z / step) * step;
      ctx.textAlign = 'right';
      for (let z = sz0; z <= botRightW.z; z += step) {
        const py = worldToScreen(0, z).y;
        if (py < rulerTop + 12 || py > cssH - 12) continue;
        ctx.fillText(formatLength(z, project.unitSystem), rulerLeft - 4, py);
      }
    }

    ctx.restore();
  }, [
    activeArea,
    activeRuler,
    activeStory,
    areas,
    cursorWorld,
    draftEnd,
    draftStart,
    experienceMode,
    heatmapMode,
    lowerStory,
    physics,
    project,
    rulerLeft,
    rulerTop,
    rulers,
    screenToWorld,
    selection,
    showDimensions,
    showRulers,
    showSetbacks,
    snapInfo,
    tool,
    typedLength,
    view,
    worldToScreen,
  ]);

  const cursorClass =
    tool === 'pan' || spacePressedRef.current
      ? 'cursor-grab'
      : tool === 'select'
      ? 'cursor-default'
      : 'cursor-crosshair';

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-white select-none">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          if (coordHudRef.current) coordHudRef.current.style.display = 'none';
        }}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`block w-full h-full touch-none ${cursorClass}`}
      />

      {/* Quiet Coordinate & Active Drafting Hint */}
      <div
        ref={coordHudRef}
        style={{ display: 'none' }}
        className={`pointer-events-none absolute top-2 right-3 max-w-[calc(100%-1.5rem)] truncate bg-white/95 border border-slate-200 rounded-md px-2 py-1 text-[11px] font-mono tabular-nums text-slate-600 transition-all ${
          inspectorOpen && !compact ? 'md:right-[368px]' : ''
        }`}
      >
        <span ref={coordTextRef} />
        {draftStart && (tool === 'wall' || tool === 'curved-wall' || tool === 'beam') && (
          <span className="ml-2 text-blue-700">
            {typedLength ? `Input: ${typedLength} ↵` : 'Type length + Enter · Shift Ortho'}
          </span>
        )}
      </div>

      {/* Lock Feedback Notice */}
      {lockToast && (
        <div className="pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded-md shadow-md">
          {lockToast}
        </div>
      )}
    </div>
  );
});
