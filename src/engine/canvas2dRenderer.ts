import {
  AreaPoly,
  BlueprintAnnotation,
  BlueprintSettings,
  BuildingProject,
  ExperienceMode,
  PhysicsReport,
  PlacedAsset,
  RulerChain,
  SelectionTarget,
  Story,
  ToolMode,
  Vec2,
  Wall,
} from '../types/building';
import { getAssetDefinition } from './assets';
import {
  CadSnapResult,
  computeExteriorChainMetrics,
  computeExteriorDimensionChains,
  computeRoomClearDimensions,
  computeScheduleData,
  computeWallPolygons,
  getTargetBounds,
  TrimExtendPreview,
} from './cad2d';
import {
  computeActualPlotSetbacks,
  computeRequiredRajukRules,
  computeStructuralGrid,
  getBnbcConfig,
  getWallArcLength,
  isCurvedWall,
  pointAtWallOffset,
  sampleWallPolyline,
} from './geometryKernel';
import { getPaperDimensionsMm } from './blueprintExport';
import { formatArea, formatLength, getGridSpec } from './units';

export interface Camera2D {
  offsetX: number; // screen px of world (0,0)
  offsetY: number;
  scale: number; // screen px per meter
}

export interface OverlayHoverState {
  target: SelectionTarget | null;
  handle: string | null;
  wallSnap?: { wall: Wall; alongDist: number; closest: Vec2; dist: number } | null;
  splitBlocked?: boolean;
  trimPreview?: TrimExtendPreview | null;
}

export interface ActiveDraftState {
  tool: ToolMode;
  start: Vec2;
  current: Vec2;
  /** Used by offset-wall tool: source wall & signed perpendicular offset */
  offsetSourceWall?: Wall;
  offsetSignedDist?: number;
  /** Used by dim-line 3-step placement (p1 -> p2 -> offset) */
  dimSecond?: Vec2;
  /** Multi-point ruler or area chain */
  points?: Vec2[];
}

export interface MarqueeState {
  startScreen: { x: number; y: number };
  currentScreen: { x: number; y: number };
  startWorld: Vec2;
  currentWorld: Vec2;
  crossing: boolean;
}

export interface UnderlayCalibOverlay {
  pointA: Vec2 | null;
  pointB: Vec2 | null;
  cursor: Vec2 | null;
}

export const ROTATE_HANDLE_OFFSET_PX = 22;

const patternCache = new Map<string, CanvasPattern | null>();

function getHatchPattern(
  ctx: CanvasRenderingContext2D,
  kind: 'brick' | 'brick-mono' | 'block' | 'wet' | 'cutout'
): CanvasPattern | null {
  const cached = patternCache.get(kind);
  if (cached !== undefined) return cached;

  const tile = document.createElement('canvas');
  const tctx = tile.getContext('2d');
  if (!tctx) return null;

  if (kind === 'brick' || kind === 'brick-mono') {
    tile.width = 10;
    tile.height = 10;
    tctx.fillStyle = kind === 'brick-mono' ? '#f8fafc' : '#e2e8f0';
    tctx.fillRect(0, 0, 10, 10);
    tctx.strokeStyle = kind === 'brick-mono' ? '#334155' : '#64748b';
    tctx.lineWidth = 1;
    tctx.beginPath();
    tctx.moveTo(0, 10);
    tctx.lineTo(10, 0);
    tctx.moveTo(-5, 5);
    tctx.lineTo(5, -5);
    tctx.moveTo(5, 15);
    tctx.lineTo(15, 5);
    tctx.stroke();
  } else if (kind === 'block') {
    tile.width = 12;
    tile.height = 12;
    tctx.fillStyle = '#f1f5f9';
    tctx.fillRect(0, 0, 12, 12);
    tctx.strokeStyle = '#94a3b8';
    tctx.lineWidth = 0.8;
    tctx.strokeRect(0.5, 0.5, 11, 11);
  } else if (kind === 'wet') {
    tile.width = 14;
    tile.height = 14;
    tctx.fillStyle = 'rgba(224, 242, 254, 0.35)';
    tctx.fillRect(0, 0, 14, 14);
    tctx.strokeStyle = 'rgba(14, 116, 144, 0.16)';
    tctx.lineWidth = 0.75;
    tctx.beginPath();
    tctx.moveTo(0, 0);
    tctx.lineTo(14, 0);
    tctx.moveTo(0, 0);
    tctx.lineTo(0, 14);
    tctx.stroke();
  } else if (kind === 'cutout') {
    tile.width = 12;
    tile.height = 12;
    tctx.strokeStyle = 'rgba(100, 116, 139, 0.38)';
    tctx.lineWidth = 0.9;
    tctx.beginPath();
    tctx.moveTo(0, 0);
    tctx.lineTo(12, 12);
    tctx.stroke();
  }

  const pat = ctx.createPattern(tile, 'repeat');
  patternCache.set(kind, pat);
  return pat;
}

function sameSelection(a: SelectionTarget | null, b: SelectionTarget | null): boolean {
  if (!a || !b) return false;
  return a.type === b.type && a.id === b.id && a.storyIndex === b.storyIndex;
}

function isTargetSelected(
  target: SelectionTarget,
  primary: SelectionTarget | null,
  multi: SelectionTarget[]
): boolean {
  if (sameSelection(primary, target)) return true;
  return multi.some((m) => sameSelection(m, target));
}

function utilizationColor(util?: number): string {
  if (util === undefined) return '#334155';
  if (util >= 1.0) return '#dc2626';
  if (util >= 0.8) return '#d97706';
  return '#15803d';
}

export function drawAssetSymbol2D(
  ctx: CanvasRenderingContext2D,
  asset: Pick<PlacedAsset, 'assetId' | 'width' | 'depth'>,
  scale: number,
  selected: boolean,
  hovered = false,
  ghost = false,
  mono = false
): void {
  const def = getAssetDefinition(asset.assetId);
  const w = asset.width * scale;
  const d = asset.depth * scale;
  const hw = w / 2;
  const hd = d / 2;
  const id = asset.assetId;

  ctx.save();
  if (ghost) ctx.globalAlpha = 0.72;
  ctx.fillStyle = selected
    ? 'rgba(29, 78, 216, 0.14)'
    : hovered
    ? 'rgba(29, 78, 216, 0.08)'
    : mono
    ? 'rgba(255, 255, 255, 0.9)'
    : 'rgba(248, 250, 252, 0.94)';
  ctx.strokeStyle =
    selected || ghost ? '#1d4ed8' : hovered ? '#2563eb' : mono ? '#1e293b' : '#334155';
  ctx.lineWidth = selected ? 1.8 : hovered || ghost ? 1.35 : 1.0;

  if (id === 'pukur-pond') {
    ctx.fillStyle = mono ? '#f1f5f9' : '#bae6fd';
    ctx.strokeStyle = selected ? '#1d4ed8' : mono ? '#334155' : '#0284c7';
    ctx.fillRect(-hw, -hd, w, d);
    ctx.strokeRect(-hw, -hd, w, d);
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
    ctx.fillStyle = mono
      ? 'rgba(226, 232, 240, 0.35)'
      : id === 'tree-mango'
      ? 'rgba(34, 197, 94, 0.22)'
      : 'rgba(22, 163, 74, 0.18)';
    ctx.strokeStyle = selected ? '#1d4ed8' : mono ? '#334155' : '#15803d';
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(hw, hd), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(hw, hd) * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = mono ? '#334155' : '#78350f';
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.fillRect(-hw, -hd, w, d);
  ctx.strokeRect(-hw, -hd, w, d);

  if (def?.isStair) {
    ctx.strokeStyle = selected ? '#1d4ed8' : '#64748b';
    ctx.lineWidth = 0.85;
    const steps = 10;
    for (let i = 1; i < steps; i++) {
      const y = -hd + (d * i) / steps;
      ctx.beginPath();
      ctx.moveTo(-hw, y);
      ctx.lineTo(hw, y);
      ctx.stroke();
    }
    ctx.strokeStyle = selected ? '#1d4ed8' : '#0f172a';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, hd * 0.35);
    ctx.lineTo(0, -hd * 0.35);
    ctx.lineTo(-w * 0.14, -hd * 0.18);
    ctx.moveTo(0, -hd * 0.35);
    ctx.lineTo(w * 0.14, -hd * 0.18);
    ctx.stroke();
  } else if (id.includes('bed')) {
    ctx.strokeStyle = selected ? '#1d4ed8' : '#64748b';
    ctx.lineWidth = 0.85;
    ctx.strokeRect(-hw * 0.86, -hd * 0.86, w * 0.38, d * 0.2);
    ctx.strokeRect(hw * 0.1, -hd * 0.86, w * 0.38, d * 0.2);
    ctx.beginPath();
    ctx.moveTo(-hw, -hd * 0.25);
    ctx.lineTo(hw, -hd * 0.25);
    ctx.stroke();
  } else if (id.includes('sofa')) {
    ctx.strokeStyle = selected ? '#1d4ed8' : '#64748b';
    ctx.lineWidth = 0.85;
    ctx.strokeRect(-hw, -hd, w, d * 0.28);
    ctx.beginPath();
    ctx.moveTo(0, -hd * 0.72);
    ctx.lineTo(0, hd);
    ctx.stroke();
  } else if (id.includes('dining')) {
    ctx.strokeStyle = selected ? '#1d4ed8' : '#64748b';
    ctx.lineWidth = 0.8;
    const chairs = 3;
    for (let i = 0; i < chairs; i++) {
      const cx = -hw * 0.65 + (w * 0.65 * i) / Math.max(1, chairs - 1);
      ctx.strokeRect(cx - w * 0.08, -hd - d * 0.14, w * 0.16, d * 0.12);
      ctx.strokeRect(cx - w * 0.08, hd + d * 0.02, w * 0.16, d * 0.12);
    }
  } else if (id.includes('lift')) {
    ctx.beginPath();
    ctx.moveTo(-hw, -hd);
    ctx.lineTo(hw, hd);
    ctx.moveTo(hw, -hd);
    ctx.lineTo(-hw, hd);
    ctx.stroke();
  } else if (id.includes('toilet') || id.includes('commode')) {
    ctx.strokeRect(-hw * 0.8, -hd * 0.9, w * 0.8, d * 0.28);
    ctx.beginPath();
    ctx.ellipse(0, hd * 0.18, hw * 0.62, hd * 0.52, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id.includes('kitchen') || id.includes('counter')) {
    ctx.strokeStyle = selected ? '#1d4ed8' : '#64748b';
    ctx.strokeRect(-hw * 0.78, -hd * 0.55, w * 0.34, d * 0.58);
    ctx.beginPath();
    ctx.arc(hw * 0.34, -hd * 0.12, Math.min(hw, hd) * 0.24, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ============================================================================
// LAYER 1: STATIC BLUEPRINT SHEET RENDERER
// ============================================================================

export interface StaticRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  cam: Camera2D;
  project: BuildingProject;
  story: Story;
  lowerStory?: Story;
  physics: PhysicsReport;
  settings: BlueprintSettings;
  experienceMode: ExperienceMode;
  heatmapMode: boolean;
  showDimensions: boolean;
  showSetbacks: boolean;
  selection: SelectionTarget | null;
  multiSelection: SelectionTarget[];
  underlayImage: HTMLImageElement | null;
  rulers: RulerChain[];
  areas: AreaPoly[];
}

export function renderStaticBlueprintLayer(p: StaticRenderParams): void {
  const {
    ctx,
    width,
    height,
    cam,
    project,
    story,
    lowerStory,
    physics,
    settings,
    experienceMode,
    heatmapMode,
    showDimensions,
    showSetbacks,
    selection,
    multiSelection,
    underlayImage,
    rulers,
    areas,
  } = p;

  const unit = project.unitSystem;
  const layers = settings.layers;
  const sheetMode = settings.sheetMode;
  const isMono = sheetMode === 'print';
  const isPres = sheetMode === 'presentation';
  const isProOrPrint = experienceMode === 'engineer' || isMono;
  const chainDetail: 'clean' | 'full' = isProOrPrint ? 'full' : 'clean';
  const chainsActive = settings.showExteriorChains && showDimensions && layers.dimensions;

  const w2sx = (x: number) => cam.offsetX + x * cam.scale;
  const w2sy = (z: number) => cam.offsetY + z * cam.scale;

  // 1. Drafting Paper Background
  ctx.fillStyle = isPres ? '#fafaf9' : '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 2. Adaptive Architectural Grid (whisper-quiet architectural graph paper)
  if (!isMono) {
    const grid = getGridSpec(unit);
    const minWX = (0 - cam.offsetX) / cam.scale;
    const maxWX = (width - cam.offsetX) / cam.scale;
    const minWZ = (0 - cam.offsetY) / cam.scale;
    const maxWZ = (height - cam.offsetY) / cam.scale;

    const showMinor = grid.minor * cam.scale >= 14;
    if (showMinor) {
      ctx.strokeStyle = isPres ? 'rgba(226, 232, 240, 0.24)' : 'rgba(226, 232, 240, 0.42)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const sx0 = Math.floor(minWX / grid.minor) * grid.minor;
      for (let x = sx0; x <= maxWX; x += grid.minor) {
        const px = Math.round(w2sx(x)) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
      }
      const sz0 = Math.floor(minWZ / grid.minor) * grid.minor;
      for (let z = sz0; z <= maxWZ; z += grid.minor) {
        const py = Math.round(w2sy(z)) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = isPres ? 'rgba(203, 213, 225, 0.34)' : 'rgba(203, 213, 225, 0.54)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    const mx0 = Math.floor(minWX / grid.major) * grid.major;
    for (let x = mx0; x <= maxWX; x += grid.major) {
      const px = Math.round(w2sx(x)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    const mz0 = Math.floor(minWZ / grid.major) * grid.major;
    for (let z = mz0; z <= maxWZ; z += grid.major) {
      const py = Math.round(w2sy(z)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();
  }

  // 3. Calibrated Survey / Sketch Underlay Image
  if (project.underlay && underlayImage && layers.underlay) {
    const u = project.underlay;
    ctx.save();
    ctx.globalAlpha = Math.max(0.08, Math.min(1, u.opacity));
    const ux = w2sx(u.originX);
    const uy = w2sy(u.originZ);
    const uw = u.widthM * cam.scale;
    const uh = u.heightM * cam.scale;
    if (Math.abs(u.rotation) > 1e-4) {
      ctx.translate(ux + uw * 0.5, uy + uh * 0.5);
      ctx.rotate(u.rotation);
      ctx.drawImage(underlayImage, -uw * 0.5, -uh * 0.5, uw, uh);
    } else {
      ctx.drawImage(underlayImage, ux, uy, uw, uh);
    }
    ctx.restore();
  }

  // 4. Plot Boundary, Road Apron & RAJUK Setbacks
  if (project.plot && showSetbacks && layers.setbacks) {
    const plot = project.plot;
    const px = w2sx(plot.originX);
    const py = w2sy(plot.originZ);
    const pw = plot.width * cam.scale;
    const pd = plot.depth * cam.scale;

    ctx.save();
    ctx.fillStyle = isMono ? 'rgba(248, 250, 252, 0.25)' : 'rgba(241, 245, 249, 0.38)';
    ctx.fillRect(px, py, pw, pd);
    ctx.strokeStyle = isMono ? '#334155' : 'rgba(71, 85, 105, 0.55)';
    ctx.lineWidth = 1.15;
    ctx.setLineDash([8, 4, 2, 4]);
    ctx.strokeRect(px, py, pw, pd);
    ctx.setLineDash([]);

    // Compute buildable setback box
    const bnbc = getBnbcConfig(project);
    const req = computeRequiredRajukRules(plot, bnbc, project.stories.length);
    const actual = computeActualPlotSetbacks(project);
    const sb = plot.setbacks;

    let sL = sb.left;
    let sR = sb.right;
    let sT = sb.rear;
    let sB = sb.front;
    if (plot.roadSide === 'north') {
      sT = sb.front;
      sB = sb.rear;
      sL = sb.right;
      sR = sb.left;
    } else if (plot.roadSide === 'east') {
      sR = sb.front;
      sL = sb.rear;
      sT = sb.right;
      sB = sb.left;
    } else if (plot.roadSide === 'west') {
      sL = sb.front;
      sR = sb.rear;
      sT = sb.left;
      sB = sb.right;
    }

    const bx = w2sx(plot.originX + sL);
    const by = w2sy(plot.originZ + sT);
    const bw = Math.max(0, (plot.width - sL - sR) * cam.scale);
    const bd = Math.max(0, (plot.depth - sT - sB) * cam.scale);

    const setbackOk =
      actual.actualSetbacks.front >= req.requiredSetbacks.front - 0.05 &&
      actual.actualSetbacks.rear >= req.requiredSetbacks.rear - 0.05 &&
      actual.actualSetbacks.left >= req.requiredSetbacks.left - 0.05 &&
      actual.actualSetbacks.right >= req.requiredSetbacks.right - 0.05;

    if (bw > 4 && bd > 4) {
      ctx.strokeStyle = isMono
        ? 'rgba(71, 85, 105, 0.6)'
        : setbackOk
        ? 'rgba(21, 128, 61, 0.52)'
        : 'rgba(220, 38, 38, 0.85)';
      ctx.lineWidth = setbackOk ? 0.95 : 1.3;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(bx, by, bw, bd);
      ctx.setLineDash([]);
    }

    // Road indicator strip
    const roadDepthPx = Math.max(18, Math.min(34, 1.4 * cam.scale));
    ctx.fillStyle = isMono ? '#f1f5f9' : '#e2e8f0';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.8;
    let rx = px;
    let ry = py + pd;
    let rw = pw;
    let rh = roadDepthPx;
    if (plot.roadSide === 'north') {
      ry = py - roadDepthPx;
    } else if (plot.roadSide === 'west') {
      rx = px - roadDepthPx;
      ry = py;
      rw = roadDepthPx;
      rh = pd;
    } else if (plot.roadSide === 'east') {
      rx = px + pw;
      ry = py;
      rw = roadDepthPx;
      rh = pd;
    }
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);

    ctx.fillStyle = '#475569';
    ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (plot.roadSide === 'north' || plot.roadSide === 'south') {
      ctx.fillText(`Access road (${plot.roadSide})`, rx + rw * 0.5, ry + rh * 0.5);
    } else {
      ctx.save();
      ctx.translate(rx + rw * 0.5, ry + rh * 0.5);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`Access road (${plot.roadSide})`, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // 5. Structural Gridlines (A, B, C / 1, 2, 3) — bubbles strictly outside exterior dimension chains
  if (layers.grid && story.pillars.length > 0) {
    const grid = computeStructuralGrid(story);
    const metrics = computeExteriorChainMetrics(story, settings.dimensionBasis, {
      scale: cam.scale,
      detail: chainDetail,
    });
    let minX = metrics.valid ? metrics.outer.minX : Infinity;
    let maxX = metrics.valid ? metrics.outer.maxX : -Infinity;
    let minZ = metrics.valid ? metrics.outer.minZ : Infinity;
    let maxZ = metrics.valid ? metrics.outer.maxZ : -Infinity;
    for (const col of story.pillars) {
      if (col.x < minX) minX = col.x;
      if (col.x > maxX) maxX = col.x;
      if (col.z < minZ) minZ = col.z;
      if (col.z > maxZ) maxZ = col.z;
    }

    const bubbleClearM = Math.max(0.58, 22 / cam.scale);
    const topPadM = (chainsActive && metrics.valid ? metrics.outermostOff.top : 0.4) + bubbleClearM;
    const leftPadM = (chainsActive && metrics.valid ? metrics.outermostOff.left : 0.4) + bubbleClearM;
    const tailPadM = 0.35;

    const topY = w2sy(minZ - topPadM);
    const botY = w2sy(maxZ + tailPadM);
    const leftX = w2sx(minX - leftPadM);
    const rightX = w2sx(maxX + tailPadM);

    ctx.save();
    for (const gx of grid.xLines) {
      const sx = w2sx(gx.coord);
      ctx.strokeStyle = isMono ? 'rgba(71, 85, 105, 0.32)' : 'rgba(148, 163, 184, 0.38)';
      ctx.lineWidth = 0.75;
      ctx.setLineDash([7, 4, 2, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, topY);
      ctx.lineTo(sx, botY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = isMono ? '#0f172a' : '#475569';
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.arc(sx, topY - 10, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 9.5px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gx.label, sx, topY - 9.5);
    }

    for (const gz of grid.zLines) {
      const sy = w2sy(gz.coord);
      ctx.strokeStyle = isMono ? 'rgba(71, 85, 105, 0.32)' : 'rgba(148, 163, 184, 0.38)';
      ctx.lineWidth = 0.75;
      ctx.setLineDash([7, 4, 2, 4]);
      ctx.beginPath();
      ctx.moveTo(leftX, sy);
      ctx.lineTo(rightX, sy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = isMono ? '#0f172a' : '#475569';
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.arc(leftX - 10, sy, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 9.5px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gz.label, leftX - 10, sy + 0.5);
    }
    ctx.restore();
  }

  // 6. Lower Story Onion-Skin Ghost Trace
  if (lowerStory && layers.lowerStory && !isMono) {
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (const w of lowerStory.walls) {
      ctx.beginPath();
      ctx.moveTo(w2sx(w.x1), w2sy(w.z1));
      ctx.lineTo(w2sx(w.x2), w2sy(w.z2));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#64748b';
    for (const col of lowerStory.pillars) {
      const cw = col.width * cam.scale;
      const cd = col.depth * cam.scale;
      ctx.fillRect(w2sx(col.x) - cw / 2, w2sy(col.z) - cd / 2, cw, cd);
    }
    ctx.restore();
  }

  // 7. Floor Slabs & Cutouts
  const cutoutPat = getHatchPattern(ctx, 'cutout');
  for (const sl of story.slabs) {
    const sel = isTargetSelected({ type: 'slab', id: sl.id, storyIndex: story.index }, selection, multiSelection);
    const sx = w2sx(sl.x);
    const sy = w2sy(sl.z);
    const sw = sl.width * cam.scale;
    const sd = sl.depth * cam.scale;

    ctx.save();
    ctx.fillStyle = sel
      ? 'rgba(29, 78, 216, 0.08)'
      : sl.type === 'balcony'
      ? isMono
        ? '#f8fafc'
        : 'rgba(241, 245, 249, 0.85)'
      : isPres
      ? '#ffffff'
      : 'rgba(255, 255, 255, 0.92)';
    ctx.strokeStyle = sel
      ? '#1d4ed8'
      : heatmapMode
      ? utilizationColor(physics.elements[sl.id]?.utilization)
      : isMono
      ? '#475569'
      : '#cbd5e1';
    ctx.lineWidth = sel ? 1.8 : 1.0;
    ctx.fillRect(sx, sy, sw, sd);
    ctx.strokeRect(sx, sy, sw, sd);

    for (const cut of sl.cutouts ?? []) {
      const cSel = isTargetSelected(
        { type: 'cutout', id: cut.id, parentSlabId: sl.id, storyIndex: story.index },
        selection,
        multiSelection
      );
      const cx = w2sx(cut.x);
      const cy = w2sy(cut.z);
      const cw = cut.width * cam.scale;
      const cd = cut.depth * cam.scale;
      ctx.fillStyle = cutoutPat ?? 'rgba(226, 232, 240, 0.5)';
      ctx.fillRect(cx, cy, cw, cd);
      ctx.strokeStyle = cSel ? '#1d4ed8' : '#64748b';
      ctx.lineWidth = cSel ? 1.8 : 1.0;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(cx, cy, cw, cd);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + cw, cy + cd);
      ctx.moveTo(cx + cw, cy);
      ctx.lineTo(cx, cy + cd);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 8. Room Zone Fills & Wet-Area Tile Hatches (labels are placed AFTER furniture for zero overlap)
  if (layers.rooms) {
    const wetPat = getHatchPattern(ctx, 'wet');
    for (const rm of story.rooms) {
      const sel = isTargetSelected({ type: 'room', id: rm.id, storyIndex: story.index }, selection, multiSelection);
      const lower = rm.name.toLowerCase();
      const isWet =
        lower.includes('bath') ||
        lower.includes('toilet') ||
        lower.includes('wc') ||
        lower.includes('kitchen') ||
        lower.includes('wash');

      ctx.save();
      const fillRoom = () => {
        if (rm.polygon && rm.polygon.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(w2sx(rm.polygon[0].x), w2sy(rm.polygon[0].z));
          for (let i = 1; i < rm.polygon.length; i++) {
            ctx.lineTo(w2sx(rm.polygon[i].x), w2sy(rm.polygon[i].z));
          }
          ctx.closePath();
          ctx.fill();
          if (sel) ctx.stroke();
        } else {
          ctx.fillRect(w2sx(rm.x), w2sy(rm.z), rm.width * cam.scale, rm.depth * cam.scale);
          if (sel) ctx.strokeRect(w2sx(rm.x), w2sy(rm.z), rm.width * cam.scale, rm.depth * cam.scale);
        }
      };

      if (sel) {
        ctx.fillStyle = 'rgba(29, 78, 216, 0.08)';
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 1.4;
        fillRoom();
      } else if (isWet && wetPat && !isMono) {
        ctx.fillStyle = wetPat;
        fillRoom();
      } else if (isPres) {
        ctx.fillStyle = lower.includes('bed')
          ? 'rgba(241, 245, 249, 0.65)'
          : lower.includes('living') || lower.includes('drawing') || lower.includes('dining')
          ? 'rgba(254, 249, 195, 0.35)'
          : 'rgba(248, 250, 252, 0.7)';
        fillRoom();
      }
      ctx.restore();
    }
  }

  // 9. Overhead Beams (shown in Pro CAD, Print Sheet, Stress Map, or when selected)
  if (layers.structure) {
    for (const bm of story.beams) {
      const sel = isTargetSelected({ type: 'beam', id: bm.id, storyIndex: story.index }, selection, multiSelection);
      if (!isProOrPrint && !heatmapMode && !sel) continue;
      ctx.save();
      ctx.strokeStyle = sel
        ? '#1d4ed8'
        : heatmapMode
        ? utilizationColor(physics.elements[bm.id]?.utilization)
        : isMono
        ? '#475569'
        : 'rgba(100, 116, 139, 0.52)';
      ctx.lineWidth = sel ? Math.max(2.6, bm.width * cam.scale * 0.75) : 1.15;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(w2sx(bm.x1), w2sy(bm.z1));
      ctx.lineTo(w2sx(bm.x2), w2sy(bm.z2));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // 10. Furniture & Architectural Assets
  if (layers.furniture) {
    for (const a of story.assets) {
      const sel = isTargetSelected({ type: 'asset', id: a.id, storyIndex: story.index }, selection, multiSelection);
      ctx.save();
      ctx.translate(w2sx(a.x), w2sy(a.z));
      ctx.rotate(a.rotation);
      if (a.flipX) ctx.scale(-1, 1);
      drawAssetSymbol2D(ctx, a, cam.scale, sel, false, false, isMono);
      ctx.restore();
    }
  }

  // 11. Mitered Architectural Walls with Material Poche / Hatch
  if (layers.walls) {
    const wallPolys = computeWallPolygons(story);
    const brickPat = getHatchPattern(ctx, isMono ? 'brick-mono' : 'brick');
    const blockPat = getHatchPattern(ctx, 'block');

    for (const wall of story.walls) {
      const sel = isTargetSelected({ type: 'wall', id: wall.id, storyIndex: story.index }, selection, multiSelection);
      const poly = wallPolys.get(wall.id);
      if (!poly) continue;

      ctx.save();
      let fillStyle: string | CanvasPattern = '#1e293b';
      if (sel) {
        fillStyle = 'rgba(29, 78, 216, 0.28)';
      } else if (heatmapMode) {
        fillStyle = utilizationColor(physics.elements[wall.id]?.utilization);
      } else if (isPres) {
        fillStyle = '#0f172a';
      } else if (wall.material === 'rcc' || wall.material === 'fair-concrete') {
        fillStyle = '#1e293b';
      } else if (wall.material === 'hollow-block' && blockPat) {
        fillStyle = blockPat;
      } else if (wall.material === 'gypsum-board') {
        fillStyle = '#ffffff';
      } else if (brickPat) {
        fillStyle = brickPat;
      }

      ctx.fillStyle = fillStyle;
      for (const q of poly.quads) {
        ctx.beginPath();
        ctx.moveTo(w2sx(q[0].x), w2sy(q[0].z));
        for (let i = 1; i < q.length; i++) {
          ctx.lineTo(w2sx(q[i].x), w2sy(q[i].z));
        }
        ctx.closePath();
        ctx.fill();
      }

      // Crisp heavy architectural cut outlines
      ctx.strokeStyle = sel
        ? '#1d4ed8'
        : heatmapMode
        ? utilizationColor(physics.elements[wall.id]?.utilization)
        : '#0f172a';
      ctx.lineWidth = sel ? 2.4 : isMono ? 2.0 : 1.75;
      ctx.lineCap = 'square';
      ctx.beginPath();
      for (const [a, b] of poly.outlineEdges) {
        ctx.moveTo(w2sx(a.x), w2sy(a.z));
        ctx.lineTo(w2sx(b.x), w2sy(b.z));
      }
      ctx.stroke();

      // Inline length pill ONLY on selected wall (hover readout lives in overlay — zero static clutter!)
      if (sel && showDimensions && layers.dimensions) {
        const lenM = getWallArcLength(wall);
        const mid = pointAtWallOffset(wall, lenM * 0.5);
        const offPx = wall.thickness * cam.scale * 0.5 + 14;
        const lx = w2sx(mid.x) + mid.nx * offPx;
        const ly = w2sy(mid.z) + mid.nz * offPx;
        const dispLen =
          settings.dimensionBasis === 'interior' ? Math.max(0.1, lenM - wall.thickness) : lenM;
        drawCanvasTag(ctx, lx, ly, formatLength(dispLen, unit), '#1d4ed8', '#ffffff');
      }

      ctx.restore();
    }
  }

  // 12. Doors & Windows (Architectural Plan Symbols)
  if (layers.openings) {
    for (const wall of story.walls) {
      const halfT = wall.thickness * 0.5 * cam.scale;
      for (const op of wall.openings) {
        const sel = isTargetSelected(
          { type: 'opening', id: op.id, parentWallId: wall.id, storyIndex: story.index },
          selection,
          multiSelection
        );
        const startPt = pointAtWallOffset(wall, op.offset);
        const wPx = op.width * cam.scale;

        ctx.save();
        ctx.translate(w2sx(startPt.x), w2sy(startPt.z));
        ctx.rotate(startPt.angle);

        const strokeMain = sel ? '#1d4ed8' : '#0f172a';
        const strokeSoft = sel ? '#2563eb' : isMono ? '#334155' : '#64748b';
        const strokeGlass = sel ? '#1d4ed8' : isMono ? '#0f172a' : '#0284c7';

        // Clear wall fill inside opening span
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, -halfT - 0.5, wPx, halfT * 2 + 1);

        if (op.kind === 'door-single') {
          const dir = op.swing;
          // Jamb ticks
          ctx.strokeStyle = strokeMain;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(0, -halfT);
          ctx.lineTo(0, halfT);
          ctx.moveTo(wPx, -halfT);
          ctx.lineTo(wPx, halfT);
          ctx.stroke();

          // Door leaf
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, dir * wPx);
          ctx.stroke();

          // 90-degree swing quadrant arc
          ctx.strokeStyle = strokeSoft;
          ctx.lineWidth = 1.0;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          if (dir > 0) {
            ctx.arc(0, 0, wPx, 0, Math.PI / 2, false);
          } else {
            ctx.arc(0, 0, wPx, -Math.PI / 2, 0, false);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (op.kind === 'door-double') {
          const dir = op.swing;
          const leaf = wPx * 0.5;
          ctx.strokeStyle = strokeMain;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, dir * leaf);
          ctx.moveTo(wPx, 0);
          ctx.lineTo(wPx, dir * leaf);
          ctx.stroke();

          ctx.strokeStyle = strokeSoft;
          ctx.lineWidth = 1.0;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          if (dir > 0) {
            ctx.arc(0, 0, leaf, 0, Math.PI / 2, false);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(wPx, 0, leaf, Math.PI / 2, Math.PI, false);
          } else {
            ctx.arc(0, 0, leaf, -Math.PI / 2, 0, false);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(wPx, 0, leaf, Math.PI, Math.PI * 1.5, false);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (op.kind === 'door-sliding') {
          ctx.strokeStyle = strokeGlass;
          ctx.lineWidth = 1.4;
          ctx.strokeRect(0, -halfT * 0.5, wPx * 0.56, halfT * 0.5);
          ctx.strokeRect(wPx * 0.44, 0, wPx * 0.56, halfT * 0.5);
        } else if (op.kind === 'arch-opening') {
          ctx.strokeStyle = strokeSoft;
          ctx.lineWidth = 1.0;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, -halfT);
          ctx.lineTo(wPx, -halfT);
          ctx.moveTo(0, halfT);
          ctx.lineTo(wPx, halfT);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          // Window sill & double glazing lines
          ctx.strokeStyle = strokeMain;
          ctx.lineWidth = 1.1;
          ctx.strokeRect(0, -halfT, wPx, halfT * 2);
          ctx.strokeStyle = strokeGlass;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(0, -halfT * 0.28);
          ctx.lineTo(wPx, -halfT * 0.28);
          ctx.moveTo(0, halfT * 0.28);
          ctx.lineTo(wPx, halfT * 0.28);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // 13. Structural Columns (Solid RCC Cut)
  if (layers.structure) {
    for (const col of story.pillars) {
      const sel = isTargetSelected({ type: 'pillar', id: col.id, storyIndex: story.index }, selection, multiSelection);
      const cx = w2sx(col.x);
      const cy = w2sy(col.z);
      const cw = Math.max(6, col.width * cam.scale);
      const cd = Math.max(6, col.depth * cam.scale);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(col.rotation);
      ctx.fillStyle = sel
        ? '#1d4ed8'
        : heatmapMode
        ? utilizationColor(physics.elements[col.id]?.utilization)
        : '#0f172a';
      ctx.strokeStyle = sel ? '#1e40af' : '#0f172a';
      ctx.lineWidth = sel ? 2 : 1.2;

      if (col.shape === 'circular') {
        ctx.beginPath();
        ctx.arc(0, 0, cw / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(-cw / 2, -cd / 2, cw, cd);
        ctx.strokeRect(-cw / 2, -cd / 2, cw, cd);
      }
      ctx.restore();
    }
  }

  // Screen-space occupied rects so room labels & schedule tags never collide
  const placedLabelRects: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const rectsOverlap = (
    a: { x1: number; y1: number; x2: number; y2: number },
    b: { x1: number; y1: number; x2: number; y2: number }
  ): number => {
    const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    return ox > 0 && oy > 0 ? ox * oy : 0;
  };

  // 13.5 Smart Furniture-Aware Room Labels (drawn ABOVE furniture with soft backing plate)
  if (layers.rooms) {
    // Pre-build screen-space obstacle boxes for placed furniture
    const assetBoxes = layers.furniture
      ? story.assets.map((a) => {
          const cos = Math.abs(Math.cos(a.rotation));
          const sin = Math.abs(Math.sin(a.rotation));
          const effW = (a.width * cos + a.depth * sin) * cam.scale * 0.5 + 4;
          const effH = (a.width * sin + a.depth * cos) * cam.scale * 0.5 + 4;
          const ax = w2sx(a.x);
          const ay = w2sy(a.z);
          return { x1: ax - effW, y1: ay - effH, x2: ax + effW, y2: ay + effH };
        })
      : [];

    for (const rm of story.rooms) {
      const sel = isTargetSelected({ type: 'room', id: rm.id, storyIndex: story.index }, selection, multiSelection);
      const rwPx = rm.width * cam.scale;
      const rdPx = rm.depth * cam.scale;
      if (rwPx < 42 || rdPx < 26) continue;

      const dims = computeRoomClearDimensions(rm, story);
      const useClear = settings.dimensionBasis === 'interior';
      const dispW = useClear ? dims.clearW : dims.centerlineW;
      const dispD = useClear ? dims.clearD : dims.centerlineD;
      const dispA = useClear ? dims.clearAreaM2 : dims.centerlineAreaM2;

      const compact = rwPx < 105 || rdPx < 64;
      const nameFont = compact
        ? '600 10px "Plus Jakarta Sans", sans-serif'
        : '600 11px "Plus Jakarta Sans", sans-serif';
      const dimFont = compact
        ? '500 9px "IBM Plex Mono", monospace'
        : '500 9.5px "IBM Plex Mono", monospace';
      const areaFont = '400 9px "IBM Plex Mono", monospace';

      const dimLine =
        showDimensions && layers.dimensions && rdPx >= 40
          ? `${formatLength(dispW, unit)} × ${formatLength(dispD, unit)}`
          : null;
      const areaLine =
        dimLine && !compact && rdPx >= 78 && rwPx >= 96 ? formatArea(dispA, unit) : null;

      ctx.save();
      ctx.font = nameFont;
      const nameW = ctx.measureText(rm.name).width;
      ctx.font = dimFont;
      const dimW = dimLine ? ctx.measureText(dimLine).width : 0;
      ctx.font = areaFont;
      const areaW = areaLine ? ctx.measureText(areaLine).width : 0;

      const lineCount = 1 + (dimLine ? 1 : 0) + (areaLine ? 1 : 0);
      const lineStep = compact ? 11.5 : 13;
      const boxW = Math.min(rwPx - 8, Math.max(nameW, dimW, areaW) + 12);
      const boxH = lineCount * lineStep + 6;

      const rx0 = w2sx(rm.x);
      const ry0 = w2sy(rm.z);
      const wallMarginX = Math.max(8, boxW * 0.5 + 6);
      const wallMarginY = Math.max(8, boxH * 0.5 + 6);
      const minCx = rx0 + Math.min(rwPx * 0.5, wallMarginX);
      const maxCx = rx0 + Math.max(rwPx * 0.5, rwPx - wallMarginX);
      const minCy = ry0 + Math.min(rdPx * 0.5, wallMarginY);
      const maxCy = ry0 + Math.max(rdPx * 0.5, rdPx - wallMarginY);

      const clampX = (x: number) => Math.max(minCx, Math.min(maxCx, x));
      const clampY = (y: number) => Math.max(minCy, Math.min(maxCy, y));
      const centerX = rx0 + rwPx * 0.5;
      const centerY = ry0 + rdPx * 0.5;

      // Test 9 candidate anchors inside the room to steer cleanly away from beds, tables, counters & toilets
      const candidates: Array<[number, number]> = [
        [centerX, centerY],
        [centerX, clampY(ry0 + rdPx * 0.74)],
        [centerX, clampY(ry0 + rdPx * 0.26)],
        [clampX(rx0 + rwPx * 0.28), centerY],
        [clampX(rx0 + rwPx * 0.72), centerY],
        [clampX(rx0 + rwPx * 0.28), clampY(ry0 + rdPx * 0.72)],
        [clampX(rx0 + rwPx * 0.72), clampY(ry0 + rdPx * 0.72)],
        [clampX(rx0 + rwPx * 0.28), clampY(ry0 + rdPx * 0.28)],
        [clampX(rx0 + rwPx * 0.72), clampY(ry0 + rdPx * 0.28)],
      ];

      let bestX = centerX;
      let bestY = centerY;
      let bestCost = Infinity;

      for (const [cx, cy] of candidates) {
        const rect = {
          x1: cx - boxW * 0.5,
          y1: cy - boxH * 0.5,
          x2: cx + boxW * 0.5,
          y2: cy + boxH * 0.5,
        };
        let overlap = 0;
        for (const ab of assetBoxes) {
          overlap += rectsOverlap(rect, ab);
        }
        for (const pr of placedLabelRects) {
          overlap += rectsOverlap(rect, pr) * 2;
        }
        const distBias = Math.hypot(cx - centerX, cy - centerY) * 0.4;
        const cost = overlap + distBias;
        if (cost < bestCost) {
          bestCost = cost;
          bestX = cx;
          bestY = cy;
        }
      }

      const finalRect = {
        x1: bestX - boxW * 0.5,
        y1: bestY - boxH * 0.5,
        x2: bestX + boxW * 0.5,
        y2: bestY + boxH * 0.5,
      };
      placedLabelRects.push(finalRect);

      // Soft frosted white plate so text stays crisp even in compact furnished rooms
      ctx.fillStyle = isMono ? 'rgba(255, 255, 255, 0.94)' : 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      ctx.roundRect(finalRect.x1, finalRect.y1, boxW, boxH, 4);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const topLineY = bestY - ((lineCount - 1) * lineStep) * 0.5;

      ctx.fillStyle = sel ? '#1d4ed8' : '#0f172a';
      ctx.font = nameFont;
      ctx.fillText(rm.name, bestX, topLineY, Math.max(30, rwPx - 10));

      if (dimLine) {
        ctx.fillStyle = '#475569';
        ctx.font = dimFont;
        ctx.fillText(dimLine, bestX, topLineY + lineStep, Math.max(30, rwPx - 10));
      }
      if (areaLine) {
        ctx.fillStyle = '#64748b';
        ctx.font = areaFont;
        ctx.fillText(areaLine, bestX, topLineY + lineStep * 2, Math.max(30, rwPx - 10));
      }
      ctx.restore();
    }
  }

  // 14. Auto-Numbered Schedule Tags (D1, W1, C1) — collision-checked against room labels & other tags
  if (settings.showScheduleTags && layers.dimensions && cam.scale >= 20) {
    const { tags } = computeScheduleData(story, unit);
    ctx.save();
    ctx.font = '600 8.5px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const nudges: Array<[number, number]> = [
      [0, 0],
      [0, -14],
      [0, 14],
      [14, 0],
      [-14, 0],
    ];

    for (const tg of tags) {
      const baseX = w2sx(tg.x);
      const baseY = w2sy(tg.z);
      const halfW = tg.category === 'window' ? 10.5 : tg.category === 'column' ? 9.5 : 8.5;
      const halfH = tg.category === 'window' ? 9 : tg.category === 'column' ? 6.5 : 8.5;

      let chosenX = baseX;
      let chosenY = baseY;
      let foundClear = false;
      for (const [nx, ny] of nudges) {
        const cand = {
          x1: baseX + nx - halfW - 1,
          y1: baseY + ny - halfH - 1,
          x2: baseX + nx + halfW + 1,
          y2: baseY + ny + halfH + 1,
        };
        const hits = placedLabelRects.some((r) => rectsOverlap(cand, r) > 0);
        if (!hits) {
          chosenX = baseX + nx;
          chosenY = baseY + ny;
          foundClear = true;
          break;
        }
      }
      // If a column tag is crowded at low zoom, skip it cleanly rather than stamping over text
      if (!foundClear && tg.category === 'column' && cam.scale < 36) continue;

      placedLabelRects.push({
        x1: chosenX - halfW,
        y1: chosenY - halfH,
        x2: chosenX + halfW,
        y2: chosenY + halfH,
      });

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle =
        tg.category === 'window' && !isMono
          ? '#0284c7'
          : tg.category === 'column'
          ? '#64748b'
          : '#0f172a';
      ctx.lineWidth = 1.0;

      if (tg.category === 'door') {
        ctx.beginPath();
        ctx.arc(chosenX, chosenY, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (tg.category === 'window') {
        ctx.beginPath();
        ctx.moveTo(chosenX, chosenY - 8.5);
        ctx.lineTo(chosenX + 10.5, chosenY);
        ctx.lineTo(chosenX, chosenY + 8.5);
        ctx.lineTo(chosenX - 10.5, chosenY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.roundRect(chosenX - 9.5, chosenY - 6.5, 19, 13, 2.5);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#0f172a';
      ctx.fillText(tg.tag, chosenX, chosenY + 0.5);
    }
    ctx.restore();
  }

  // 15. Exterior Dimension Chains (Clean Overall in Homeowner mode; Full 3-Tier in Pro CAD / Print Sheet)
  if (chainsActive) {
    const chains = computeExteriorDimensionChains(story, unit, settings.dimensionBasis, {
      scale: cam.scale,
      detail: chainDetail,
    });
    const drawnDimBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    ctx.save();
    for (const seg of chains) {
      const x1 = w2sx(seg.a.x);
      const y1 = w2sy(seg.a.z);
      const x2 = w2sx(seg.b.x);
      const y2 = w2sy(seg.b.z);
      const spanPx = Math.hypot(x2 - x1, y2 - y1);
      if (spanPx < 10) continue;

      const isHoriz = seg.side === 'top' || seg.side === 'bottom';
      ctx.strokeStyle = seg.tier === 3 ? '#0f172a' : '#64748b';
      ctx.lineWidth = seg.tier === 3 ? 1.1 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // 45-degree architectural slash ticks
      const tick = 3.8;
      ctx.strokeStyle = seg.tier === 3 ? '#0f172a' : '#475569';
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(x1 - tick, y1 + tick);
      ctx.lineTo(x1 + tick, y1 - tick);
      ctx.moveTo(x2 - tick, y2 + tick);
      ctx.lineTo(x2 + tick, y2 - tick);
      ctx.stroke();

      if (spanPx >= 32) {
        const mx = (x1 + x2) * 0.5;
        const my = (y1 + y2) * 0.5;
        ctx.font = `${seg.tier === 3 ? 600 : 500} 10px "IBM Plex Mono", monospace`;
        const tw = ctx.measureText(seg.label).width;
        const labelPadX = 4;
        const labelH = 13;

        // Place text centered cleanly on its dimension line with a solid white knockout box
        const box = isHoriz
          ? {
              x1: mx - tw * 0.5 - labelPadX,
              y1: my - labelH * 0.5,
              x2: mx + tw * 0.5 + labelPadX,
              y2: my + labelH * 0.5,
            }
          : {
              x1: mx - labelH * 0.5,
              y1: my - tw * 0.5 - labelPadX,
              x2: mx + labelH * 0.5,
              y2: my + tw * 0.5 + labelPadX,
            };

        const collides = drawnDimBoxes.some((b) => rectsOverlap(box, b) > 0);
        if (!collides) {
          drawnDimBoxes.push(box);
          ctx.fillStyle = isPres ? '#fafaf9' : '#ffffff';
          ctx.fillRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

          ctx.fillStyle = seg.tier === 3 ? '#0f172a' : '#334155';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (isHoriz) {
            ctx.fillText(seg.label, mx, my + 0.5);
          } else {
            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(seg.label, 0, 0.5);
            ctx.restore();
          }
        }
      }
    }
    ctx.restore();
  }

  // 16. Custom Blueprint Annotations, Leader Callouts & Linear Dimensions
  if (layers.annotations) {
    for (const an of story.annotations ?? []) {
      const sel = isTargetSelected(
        { type: 'annotation', id: an.id, storyIndex: story.index },
        selection,
        multiSelection
      );
      drawAnnotation(ctx, an, w2sx, w2sy, cam.scale, unit, sel, isMono);
    }
  }

  // 17. Saved Ruler Chains & Area Polygons
  for (const chain of rulers) {
    if (chain.points.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(w2sx(chain.points[0].x), w2sy(chain.points[0].z));
    for (let i = 1; i < chain.points.length; i++) {
      ctx.lineTo(w2sx(chain.points[i].x), w2sy(chain.points[i].z));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < chain.points.length - 1; i++) {
      const a = chain.points[i];
      const b = chain.points[i + 1];
      const segM = Math.hypot(b.x - a.x, b.z - a.z);
      const mx = w2sx((a.x + b.x) * 0.5);
      const my = w2sy((a.z + b.z) * 0.5);
      drawCanvasTag(ctx, mx, my - 10, formatLength(segM, unit), '#1d4ed8', '#ffffff');
    }
    ctx.restore();
  }

  for (const poly of areas) {
    if (poly.points.length < 3) continue;
    ctx.save();
    ctx.fillStyle = 'rgba(29, 78, 216, 0.1)';
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w2sx(poly.points[0].x), w2sy(poly.points[0].z));
    for (let i = 1; i < poly.points.length; i++) {
      ctx.lineTo(w2sx(poly.points[i].x), w2sy(poly.points[i].z));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    let areaM2 = 0;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < poly.points.length; i++) {
      const a = poly.points[i];
      const b = poly.points[(i + 1) % poly.points.length];
      areaM2 += a.x * b.z - b.x * a.z;
      cx += a.x;
      cz += a.z;
    }
    areaM2 = Math.abs(areaM2) * 0.5;
    cx /= poly.points.length;
    cz /= poly.points.length;
    drawCanvasTag(ctx, w2sx(cx), w2sy(cz), formatArea(areaM2, unit), '#0f172a', '#ffffff');
    ctx.restore();
  }

  // 18. Print Sheet Frame Preview Overlay (when in Print Sheet mode)
  if (isMono) {
    const paper = getPaperDimensionsMm(settings.paperSize, settings.paperOrientation);
    const aspect = paper.widthMm / paper.heightMm;
    const pad = 22;
    let fw = width - pad * 2;
    let fh = fw / aspect;
    if (fh > height - pad * 2 - 44) {
      fh = height - pad * 2 - 44;
      fw = fh * aspect;
    }
    const fx = (width - fw) * 0.5;
    const fy = Math.max(46, (height - fh) * 0.5 - 6);

    ctx.save();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(fx + 4, fy + 4, fw - 8, fh - 8);

    // Compact sheet corner title bar preview
    const barH = 26;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.fillRect(fx + 4, fy + fh - 4 - barH, fw - 8, barH);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.strokeRect(fx + 4, fy + fh - 4 - barH, fw - 8, barH);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 10.5px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `${project.name} · ${story.name} · ${paper.label} (${settings.printScale === 'auto' ? 'Auto Scale' : settings.printScale})`,
      fx + 12,
      fy + fh - 4 - barH * 0.5
    );

    // North Arrow top-right inside sheet frame
    const nx = fx + fw - 26;
    const ny = fy + 28;
    ctx.beginPath();
    ctx.arc(nx, ny, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(nx, ny - 10);
    ctx.lineTo(nx + 4.5, ny + 4);
    ctx.lineTo(nx, ny + 1);
    ctx.lineTo(nx - 4.5, ny + 4);
    ctx.closePath();
    ctx.fill();
    ctx.font = '700 8.5px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', nx, ny - 16);
    ctx.restore();
  }
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  an: BlueprintAnnotation,
  w2sx: (x: number) => number,
  w2sy: (z: number) => number,
  scale: number,
  unit: 'imperial' | 'metric',
  selected: boolean,
  isMono: boolean
): void {
  const x1 = w2sx(an.x1);
  const y1 = w2sy(an.z1);
  const accent = selected ? '#1d4ed8' : isMono ? '#0f172a' : '#1d4ed8';

  ctx.save();
  if (an.kind === 'dimension' && an.x2 !== undefined && an.z2 !== undefined) {
    const x2 = w2sx(an.x2);
    const y2 = w2sy(an.z2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenPx = Math.hypot(dx, dy);
    if (lenPx < 2) {
      ctx.restore();
      return;
    }
    const offPx = (an.offset ?? 0.45) * scale;
    const nx = -dy / lenPx;
    const ny = dx / lenPx;
    const dx1 = x1 + nx * offPx;
    const dy1 = y1 + ny * offPx;
    const dx2 = x2 + nx * offPx;
    const dy2 = y2 + ny * offPx;

    ctx.strokeStyle = selected ? '#1d4ed8' : '#94a3b8';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(dx1, dy1);
    ctx.moveTo(x2, y2);
    ctx.lineTo(dx2, dy2);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = selected ? 1.8 : 1.25;
    ctx.beginPath();
    ctx.moveTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.stroke();

    // 45° ticks
    ctx.beginPath();
    ctx.moveTo(dx1 - 4, dy1 + 4);
    ctx.lineTo(dx1 + 4, dy1 - 4);
    ctx.moveTo(dx2 - 4, dy2 + 4);
    ctx.lineTo(dx2 + 4, dy2 - 4);
    ctx.stroke();

    const distM = Math.hypot(an.x2 - an.x1, an.z2 - an.z1);
    const label = an.text.trim() || formatLength(distM, unit);
    drawCanvasTag(
      ctx,
      (dx1 + dx2) * 0.5,
      (dy1 + dy2) * 0.5 - 10,
      label,
      selected ? '#1d4ed8' : '#ffffff',
      selected ? '#ffffff' : '#0f172a',
      accent
    );
  } else if (an.kind === 'callout' && an.x2 !== undefined && an.z2 !== undefined) {
    const x2 = w2sx(an.x2);
    const y2 = w2sy(an.z2);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x1, y1, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = selected ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 + 16, y2);
    ctx.stroke();
    ctx.fillStyle = selected ? '#1d4ed8' : '#0f172a';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(an.text, x2 + 20, y2);
  } else {
    ctx.font = '600 11.5px "Plus Jakarta Sans", sans-serif';
    const tw = ctx.measureText(an.text).width;
    if (selected) {
      ctx.fillStyle = 'rgba(29, 78, 216, 0.1)';
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 1.2;
      ctx.fillRect(x1 - 5, y1 - 10, tw + 10, 20);
      ctx.strokeRect(x1 - 5, y1 - 10, tw + 10, 20);
    }
    ctx.fillStyle = selected ? '#1d4ed8' : '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(an.text, x1, y1);
  }
  ctx.restore();
}

export function drawCanvasTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bg: string,
  fg: string,
  border?: string
): void {
  ctx.save();
  ctx.font = '600 10.5px "IBM Plex Mono", monospace';
  const tw = ctx.measureText(text).width;
  const padX = 6;
  const h = 18;
  const rx = x - tw * 0.5 - padX;
  const ry = y - h * 0.5;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(rx, ry, tw + padX * 2, h, 4);
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

// ============================================================================
// LAYER 2: 60FPS INTERACTIVE OVERLAY RENDERER
// ============================================================================

export interface OverlayRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  cam: Camera2D;
  project: BuildingProject;
  story: Story;
  tool: ToolMode;
  selection: SelectionTarget | null;
  multiSelection: SelectionTarget[];
  hover: OverlayHoverState;
  snap: CadSnapResult | null;
  draft: ActiveDraftState | null;
  marquee: MarqueeState | null;
  cursorWorld: Vec2 | null;
  typedInput: string;
  typedField: 'length' | 'angle';
  placingAssetId?: string | null;
  placingAssetRotation?: number;
  calibOverlay?: UnderlayCalibOverlay | null;
}

export function renderInteractiveOverlayLayer(p: OverlayRenderParams): void {
  const {
    ctx,
    width,
    height,
    cam,
    project,
    story,
    tool,
    selection,
    multiSelection,
    hover,
    snap,
    draft,
    marquee,
    cursorWorld,
    typedInput,
    typedField,
    placingAssetId,
    placingAssetRotation = 0,
    calibOverlay,
  } = p;

  ctx.clearRect(0, 0, width, height);

  const unit = project.unitSystem;
  const w2sx = (x: number) => cam.offsetX + x * cam.scale;
  const w2sy = (z: number) => cam.offsetY + z * cam.scale;

  // 1. Smart Extension / Polar / Perpendicular Guide Rays
  if (snap && snap.guides.length > 0) {
    ctx.save();
    for (const g of snap.guides) {
      ctx.strokeStyle =
        g.kind === 'perpendicular'
          ? 'rgba(21, 128, 61, 0.75)'
          : g.kind === 'polar'
          ? 'rgba(29, 78, 216, 0.55)'
          : 'rgba(14, 116, 144, 0.65)';
      ctx.lineWidth = 1.05;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(w2sx(g.from.x), w2sy(g.from.z));
      ctx.lineTo(w2sx(g.to.x), w2sy(g.to.z));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 2. Hover Highlight + Clean On-Demand Wall Length Readout
  if (hover.target && !marquee && tool === 'select') {
    const t = hover.target;
    if (!isTargetSelected(t, selection, multiSelection)) {
      const b = getTargetBounds(story, t);
      if (b) {
        ctx.save();
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(
          w2sx(b.minX) - 3,
          w2sy(b.minZ) - 3,
          (b.maxX - b.minX) * cam.scale + 6,
          (b.maxZ - b.minZ) * cam.scale + 6
        );
        ctx.setLineDash([]);
        ctx.restore();
      }
      if (t.type === 'wall') {
        const hw = story.walls.find((x) => x.id === t.id);
        if (hw) {
          const lenM = getWallArcLength(hw);
          const mid = pointAtWallOffset(hw, lenM * 0.5);
          const offPx = hw.thickness * cam.scale * 0.5 + 14;
          drawCanvasTag(
            ctx,
            w2sx(mid.x) + mid.nx * offPx,
            w2sy(mid.z) + mid.nz * offPx,
            formatLength(lenM, unit),
            '#ffffff',
            '#1d4ed8',
            '#93c5fd'
          );
        }
      }
    }
  }

  // 3. Multi-Selection Group Bounding Box
  if (multiSelection.length > 1) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const t of multiSelection) {
      const b = getTargetBounds(story, t);
      if (!b) continue;
      if (b.minX < minX) minX = b.minX;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.minZ < minZ) minZ = b.minZ;
      if (b.maxZ > maxZ) maxZ = b.maxZ;
    }
    if (Number.isFinite(minX)) {
      ctx.save();
      ctx.strokeStyle = '#1d4ed8';
      ctx.fillStyle = 'rgba(29, 78, 216, 0.04)';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([6, 4]);
      const rx = w2sx(minX) - 6;
      const ry = w2sy(minZ) - 6;
      const rw = (maxX - minX) * cam.scale + 12;
      const rh = (maxZ - minZ) * cam.scale + 12;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // 4. Single-Selection Direct Manipulation Handles
  if (selection && multiSelection.length <= 1 && tool === 'select') {
    const drawHandle = (hx: number, hy: number, active: boolean, shape: 'circle' | 'square' = 'circle', color = '#1d4ed8') => {
      ctx.save();
      ctx.fillStyle = active ? color : '#ffffff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (shape === 'square') {
        ctx.fillRect(hx - 5, hy - 5, 10, 10);
        ctx.strokeRect(hx - 5, hy - 5, 10, 10);
      } else {
        ctx.beginPath();
        ctx.arc(hx, hy, active ? 6.5 : 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    };

    if (selection.type === 'wall') {
      const w = story.walls.find((x) => x.id === selection.id);
      if (w) {
        drawHandle(w2sx(w.x1), w2sy(w.z1), hover.handle === 'wall-p1', 'circle');
        drawHandle(w2sx(w.x2), w2sy(w.z2), hover.handle === 'wall-p2', 'circle');
        // Midpoint curve bend handle
        const mid = pointAtWallOffset(w, getWallArcLength(w) * 0.5);
        drawHandle(w2sx(mid.x), w2sy(mid.z), hover.handle === 'wall-curve', 'square', '#0284c7');
      }
    } else if (selection.type === 'beam') {
      const b = story.beams.find((x) => x.id === selection.id);
      if (b) {
        drawHandle(w2sx(b.x1), w2sy(b.z1), hover.handle === 'beam-p1');
        drawHandle(w2sx(b.x2), w2sy(b.z2), hover.handle === 'beam-p2');
      }
    } else if (selection.type === 'slab') {
      const sl = story.slabs.find((x) => x.id === selection.id);
      if (sl) {
        drawHandle(w2sx(sl.x), w2sy(sl.z), hover.handle === 'slab-nw', 'square');
        drawHandle(w2sx(sl.x + sl.width), w2sy(sl.z), hover.handle === 'slab-ne', 'square');
        drawHandle(w2sx(sl.x), w2sy(sl.z + sl.depth), hover.handle === 'slab-sw', 'square');
        drawHandle(w2sx(sl.x + sl.width), w2sy(sl.z + sl.depth), hover.handle === 'slab-se', 'square');
      }
    } else if (selection.type === 'cutout' && selection.parentSlabId) {
      const sl = story.slabs.find((x) => x.id === selection.parentSlabId);
      const cut = sl?.cutouts?.find((c) => c.id === selection.id);
      if (cut) {
        drawHandle(w2sx(cut.x), w2sy(cut.z), hover.handle === 'cutout-nw', 'square');
        drawHandle(w2sx(cut.x + cut.width), w2sy(cut.z), hover.handle === 'cutout-ne', 'square');
        drawHandle(w2sx(cut.x), w2sy(cut.z + cut.depth), hover.handle === 'cutout-sw', 'square');
        drawHandle(w2sx(cut.x + cut.width), w2sy(cut.z + cut.depth), hover.handle === 'cutout-se', 'square');
      }
    } else if (selection.type === 'asset') {
      const a = story.assets.find((x) => x.id === selection.id);
      if (a) {
        const cx = w2sx(a.x);
        const cy = w2sy(a.z);
        const topDist = (a.depth * cam.scale) * 0.5 + ROTATE_HANDLE_OFFSET_PX;
        const rx = cx + Math.sin(a.rotation) * topDist;
        const ry = cy - Math.cos(a.rotation) * topDist;
        ctx.save();
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(rx, ry);
        ctx.stroke();
        ctx.restore();
        drawHandle(rx, ry, hover.handle === 'asset-rotate', 'circle', '#0284c7');
      }
    } else if (selection.type === 'opening' && selection.parentWallId) {
      const w = story.walls.find((x) => x.id === selection.parentWallId);
      const op = w?.openings.find((o) => o.id === selection.id);
      if (w && op) {
        const wLen = getWallArcLength(w);
        const leftClear = op.offset;
        const rightClear = Math.max(0, wLen - (op.offset + op.width));
        const pL = pointAtWallOffset(w, leftClear * 0.5);
        const pR = pointAtWallOffset(w, op.offset + op.width + rightClear * 0.5);
        if (leftClear > 0.15) {
          drawCanvasTag(
            ctx,
            w2sx(pL.x) + pL.nx * 16,
            w2sy(pL.z) + pL.nz * 16,
            formatLength(leftClear, unit),
            '#ffffff',
            '#1d4ed8',
            '#93c5fd'
          );
        }
        if (rightClear > 0.15) {
          drawCanvasTag(
            ctx,
            w2sx(pR.x) + pR.nx * 16,
            w2sy(pR.z) + pR.nz * 16,
            formatLength(rightClear, unit),
            '#ffffff',
            '#1d4ed8',
            '#93c5fd'
          );
        }
      }
    } else if (selection.type === 'annotation') {
      const an = (story.annotations ?? []).find((x) => x.id === selection.id);
      if (an) {
        drawHandle(w2sx(an.x1), w2sy(an.z1), hover.handle === 'ann-p1');
        if (an.x2 !== undefined && an.z2 !== undefined) {
          drawHandle(w2sx(an.x2), w2sy(an.z2), hover.handle === 'ann-p2');
        }
      }
    }
  }

  // 5. Pro CAD Tool Hover Previews (Split / Trim / Extend / Door / Window / Pillar / Asset Ghost)
  if (tool === 'split-wall' && hover.wallSnap) {
    const { wall, closest } = hover.wallSnap;
    const sx = w2sx(closest.x);
    const sy = w2sy(closest.z);
    const dx = wall.x2 - wall.x1;
    const dz = wall.z2 - wall.z1;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const tick = Math.max(12, wall.thickness * cam.scale * 0.85);
    ctx.save();
    ctx.strokeStyle = hover.splitBlocked ? '#dc2626' : '#1d4ed8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(sx - nx * tick, sy - nz * tick);
    ctx.lineTo(sx + nx * tick, sy + nz * tick);
    ctx.stroke();
    drawCanvasTag(
      ctx,
      sx,
      sy - 20,
      hover.splitBlocked ? 'Opening blocked' : 'Click to split wall',
      hover.splitBlocked ? '#dc2626' : '#1d4ed8',
      '#ffffff'
    );
    ctx.restore();
  }

  if (tool === 'trim-wall' && hover.trimPreview) {
    const [a, b] = hover.trimPreview.previewSegment;
    const isTrim = hover.trimPreview.mode === 'trim';
    ctx.save();
    ctx.strokeStyle = isTrim ? '#dc2626' : '#1d4ed8';
    ctx.lineWidth = 5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(w2sx(a.x), w2sy(a.z));
    ctx.lineTo(w2sx(b.x), w2sy(b.z));
    ctx.stroke();
    ctx.setLineDash([]);
    drawCanvasTag(
      ctx,
      w2sx((a.x + b.x) * 0.5),
      w2sy((a.z + b.z) * 0.5) - 18,
      isTrim ? 'Click to trim' : 'Click to extend',
      isTrim ? '#dc2626' : '#1d4ed8',
      '#ffffff'
    );
    ctx.restore();
  }

  if ((tool === 'door' || tool === 'window') && hover.wallSnap) {
    const { wall, alongDist } = hover.wallSnap;
    const opW = tool === 'door' ? 0.9144 : 1.524;
    const wLen = getWallArcLength(wall);
    const clampedOff = Math.max(0.08, Math.min(Math.max(0.08, wLen - opW - 0.08), alongDist - opW * 0.5));
    const pt = pointAtWallOffset(wall, clampedOff);
    ctx.save();
    ctx.translate(w2sx(pt.x), w2sy(pt.z));
    ctx.rotate(pt.angle);
    ctx.strokeStyle = '#1d4ed8';
    ctx.fillStyle = 'rgba(29, 78, 216, 0.2)';
    ctx.lineWidth = 2;
    const halfT = wall.thickness * 0.5 * cam.scale;
    const wPx = opW * cam.scale;
    ctx.fillRect(0, -halfT, wPx, halfT * 2);
    ctx.strokeRect(0, -halfT, wPx, halfT * 2);
    ctx.restore();
  }

  if (tool === 'pillar' && cursorWorld) {
    const pt = snap ?? cursorWorld;
    const sizePx = Math.max(10, 0.3048 * cam.scale);
    ctx.save();
    ctx.fillStyle = 'rgba(29, 78, 216, 0.3)';
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 1.6;
    ctx.fillRect(w2sx(pt.x) - sizePx / 2, w2sy(pt.z) - sizePx / 2, sizePx, sizePx);
    ctx.strokeRect(w2sx(pt.x) - sizePx / 2, w2sy(pt.z) - sizePx / 2, sizePx, sizePx);
    ctx.restore();
  }

  if (placingAssetId && cursorWorld) {
    const def = getAssetDefinition(placingAssetId);
    if (def) {
      const pt = snap ?? cursorWorld;
      ctx.save();
      ctx.translate(w2sx(pt.x), w2sy(pt.z));
      ctx.rotate(placingAssetRotation);
      drawAssetSymbol2D(
        ctx,
        { assetId: def.id, width: def.defaultWidth, depth: def.defaultDepth },
        cam.scale,
        true,
        false,
        true
      );
      ctx.restore();
    }
  }

  // 6. Active Drafting Rubberband + Always-Visible Floating Dimension HUD
  if (draft) {
    const sx1 = w2sx(draft.start.x);
    const sy1 = w2sy(draft.start.z);
    const sx2 = w2sx(draft.current.x);
    const sy2 = w2sy(draft.current.z);

    ctx.save();
    if (draft.tool === 'offset-wall' && draft.offsetSourceWall && draft.offsetSignedDist !== undefined) {
      const src = draft.offsetSourceWall;
      const dx = src.x2 - src.x1;
      const dz = src.z2 - src.z1;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const off = draft.offsetSignedDist;
      const ox1 = src.x1 + nx * off;
      const oz1 = src.z1 + nz * off;
      const ox2 = src.x2 + nx * off;
      const oz2 = src.z2 + nz * off;

      // Highlight source wall + parallel ghost wall
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = Math.max(3, src.thickness * cam.scale);
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(w2sx(ox1), w2sy(oz1));
      ctx.lineTo(w2sx(ox2), w2sy(oz2));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(w2sx(ox1), w2sy(oz1));
      ctx.lineTo(w2sx(ox2), w2sy(oz2));
      ctx.stroke();
      ctx.setLineDash([]);

      // Distance arrow between midpoints
      const mx1 = (src.x1 + src.x2) * 0.5;
      const mz1 = (src.z1 + src.z2) * 0.5;
      const mx2 = (ox1 + ox2) * 0.5;
      const mz2 = (oz1 + oz2) * 0.5;
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(w2sx(mx1), w2sy(mz1));
      ctx.lineTo(w2sx(mx2), w2sy(mz2));
      ctx.stroke();

      const hudLabel = typedInput
        ? `Offset: ${typedInput}▌ (Enter)`
        : `Offset: ${formatLength(Math.abs(off), unit)}`;
      drawCanvasTag(
        ctx,
        w2sx((mx1 + mx2) * 0.5),
        w2sy((mz1 + mz2) * 0.5) - 14,
        hudLabel,
        '#0f172a',
        '#ffffff'
      );
    } else if (draft.tool === 'room' || draft.tool === 'slab' || draft.tool === 'cutout') {
      const rx = Math.min(sx1, sx2);
      const ry = Math.min(sy1, sy2);
      const rw = Math.abs(sx2 - sx1);
      const rh = Math.abs(sy2 - sy1);
      const wM = Math.abs(draft.current.x - draft.start.x);
      const dM = Math.abs(draft.current.z - draft.start.z);

      ctx.fillStyle =
        draft.tool === 'cutout' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(29, 78, 216, 0.08)';
      ctx.strokeStyle = draft.tool === 'cutout' ? '#dc2626' : '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);

      if (wM > 0.1 || dM > 0.1) {
        drawCanvasTag(
          ctx,
          rx + rw * 0.5,
          ry - 14,
          `${formatLength(wM, unit)} × ${formatLength(dM, unit)} · ${formatArea(wM * dM, unit)}`,
          '#0f172a',
          '#ffffff'
        );
      }
    } else if ((draft.tool === 'ruler' || draft.tool === 'area') && draft.points) {
      const pts = [...draft.points, draft.current];
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(w2sx(pts[0].x), w2sy(pts[0].z));
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(w2sx(pts[i].x), w2sy(pts[i].z));
      }
      if (draft.tool === 'area' && pts.length >= 3) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(29, 78, 216, 0.1)';
        ctx.fill();
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const prev = draft.points[draft.points.length - 1];
      const segM = Math.hypot(draft.current.x - prev.x, draft.current.z - prev.z);
      drawCanvasTag(
        ctx,
        (w2sx(prev.x) + sx2) * 0.5,
        (w2sy(prev.z) + sy2) * 0.5 - 14,
        formatLength(segM, unit),
        '#0f172a',
        '#ffffff'
      );
    } else if (draft.tool === 'dim-line') {
      const p2 = draft.dimSecond ?? draft.current;
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(w2sx(p2.x), w2sy(p2.z));
      ctx.stroke();
      ctx.setLineDash([]);
      const lenM = Math.hypot(p2.x - draft.start.x, p2.z - draft.start.z);
      drawCanvasTag(
        ctx,
        (sx1 + w2sx(p2.x)) * 0.5,
        (sy1 + w2sy(p2.z)) * 0.5 - 14,
        draft.dimSecond
          ? `Click to set offset · ${formatLength(lenM, unit)}`
          : formatLength(lenM, unit),
        '#0f172a',
        '#ffffff'
      );
    } else {
      // Wall, Curved Wall, or Beam rubberband with live dynamic length + angle HUD
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = Math.max(2.5, 0.127 * cam.scale);
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      ctx.setLineDash([]);

      const dx = draft.current.x - draft.start.x;
      const dz = draft.current.z - draft.start.z;
      const lenM = Math.hypot(dx, dz);
      const deg = ((Math.atan2(dz, dx) * 180) / Math.PI + 360) % 360;
      const lenLabel = formatLength(lenM, unit);
      const hudText = typedInput
        ? typedField === 'angle'
          ? `${lenLabel} · ∠ ${typedInput}▌°`
          : `${typedInput}▌ · ∠ ${Math.round(deg)}°`
        : `${lenLabel} · ∠ ${Math.round(deg)}°`;

      drawCanvasTag(ctx, (sx1 + sx2) * 0.5, (sy1 + sy2) * 0.5 - 18, hudText, '#0f172a', '#ffffff');
    }
    ctx.restore();
  }

  // 7. CAD Window / Crossing Marquee Selection Box
  if (marquee) {
    const x = Math.min(marquee.startScreen.x, marquee.currentScreen.x);
    const y = Math.min(marquee.startScreen.y, marquee.currentScreen.y);
    const w = Math.abs(marquee.currentScreen.x - marquee.startScreen.x);
    const h = Math.abs(marquee.currentScreen.y - marquee.startScreen.y);
    ctx.save();
    if (marquee.crossing) {
      ctx.fillStyle = 'rgba(21, 128, 61, 0.1)';
      ctx.strokeStyle = '#15803d';
      ctx.setLineDash([5, 3]);
    } else {
      ctx.fillStyle = 'rgba(29, 78, 216, 0.1)';
      ctx.strokeStyle = '#1d4ed8';
    }
    ctx.lineWidth = 1.4;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 8. 2-Point Underlay Scale Calibration Overlay
  if (calibOverlay) {
    ctx.save();
    const { pointA, pointB, cursor } = calibOverlay;
    if (pointA) {
      const ax = w2sx(pointA.x);
      const ay = w2sy(pointA.z);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(ax, ay, 5.5, 0, Math.PI * 2);
      ctx.fill();
      const target = pointB ?? cursor;
      if (target) {
        const bx = w2sx(target.x);
        const by = w2sy(target.z);
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        if (pointB) {
          ctx.beginPath();
          ctx.arc(bx, by, 5.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // 9. Distinct CAD OSNAP Reticle
  if (snap && snap.kind !== 'none' && snap.kind !== 'grid') {
    const sx = w2sx(snap.x);
    const sy = w2sy(snap.z);
    ctx.save();
    ctx.lineWidth = 1.8;

    if (snap.kind === 'endpoint') {
      ctx.strokeStyle = '#1d4ed8';
      ctx.strokeRect(sx - 5, sy - 5, 10, 10);
    } else if (snap.kind === 'midpoint') {
      ctx.strokeStyle = '#15803d';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 6.5);
      ctx.lineTo(sx + 6, sy + 5);
      ctx.lineTo(sx - 6, sy + 5);
      ctx.closePath();
      ctx.stroke();
    } else if (snap.kind === 'intersection') {
      ctx.strokeStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(sx - 5, sy - 5);
      ctx.lineTo(sx + 5, sy + 5);
      ctx.moveTo(sx + 5, sy - 5);
      ctx.lineTo(sx - 5, sy + 5);
      ctx.stroke();
    } else if (snap.kind === 'pillar') {
      ctx.strokeStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.moveTo(sx - 8, sy);
      ctx.lineTo(sx + 8, sy);
      ctx.moveTo(sx, sy - 8);
      ctx.lineTo(sx, sy + 8);
      ctx.stroke();
    } else if (snap.kind === 'perpendicular') {
      ctx.strokeStyle = '#15803d';
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy + 6);
      ctx.lineTo(sx + 6, sy + 6);
      ctx.moveTo(sx, sy + 6);
      ctx.lineTo(sx, sy - 6);
      ctx.strokeRect(sx, sy, 4, 6);
      ctx.stroke();
    } else if (snap.kind === 'nearest') {
      ctx.strokeStyle = '#0284c7';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 6);
      ctx.lineTo(sx + 6, sy);
      ctx.lineTo(sx, sy + 6);
      ctx.lineTo(sx - 6, sy);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
