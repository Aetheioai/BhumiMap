import {
  Beam,
  BlueprintAnnotation,
  BlueprintSettings,
  BuildingProject,
  DEFAULT_BLUEPRINT_SETTINGS,
  DEFAULT_LAYER_VISIBILITY,
  DimensionBasis,
  LandPlot,
  Pillar,
  PlacedAsset,
  RoomZone,
  SelectionTarget,
  Slab,
  Story,
  Vec2,
  Wall,
  WallOpening,
} from '../types/building';
import {
  computeStructuralGrid,
  computeWallCornerExtensions,
  getWallArcLength,
  isCurvedWall,
  pointAtWallOffset,
  pointToWallDist,
  sampleWallPolyline,
  subtractPillarIntervals,
} from './geometryKernel';
import { formatLength } from './units';

export function getBlueprintSettings(project: BuildingProject): BlueprintSettings {
  const raw = project.blueprintSettings;
  return {
    ...DEFAULT_BLUEPRINT_SETTINGS,
    ...(raw ?? {}),
    layers: {
      ...DEFAULT_LAYER_VISIBILITY,
      ...(raw?.layers ?? {}),
    },
  };
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// 1. WALL POLYGON, SOLID RUNS & MITER GEOMETRY
// ============================================================================

export interface WallSolidPolygon {
  wallId: string;
  quads: Vec2[][]; // world-space 4-point polygons for each solid wall segment (between openings & pillars)
  outlineEdges: Array<[Vec2, Vec2]>; // crisp exterior & interior face lines
  startExt: number;
  endExt: number;
}

/**
 * Computes exact solid 2D wall polygons with clean L/T corner extensions,
 * pillar clipping, and door/window opening cutouts so 2D walls render as crisp
 * architectural poche instead of overlapping centerline strokes.
 */
export function computeWallPolygons(story: Story): Map<string, WallSolidPolygon> {
  const extensions = computeWallCornerExtensions(story.walls, story.pillars);
  const result = new Map<string, WallSolidPolygon>();

  for (const wall of story.walls) {
    if (isCurvedWall(wall)) {
      const pts = sampleWallPolyline(wall, 24);
      const halfT = wall.thickness * 0.5;
      const quads: Vec2[][] = [];
      const outlineEdges: Array<[Vec2, Vec2]> = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const p0 = { x: a.x + a.nx * halfT, z: a.z + a.nz * halfT };
        const p1 = { x: b.x + b.nx * halfT, z: b.z + b.nz * halfT };
        const p2 = { x: b.x - b.nx * halfT, z: b.z - b.nz * halfT };
        const p3 = { x: a.x - a.nx * halfT, z: a.z - a.nz * halfT };
        quads.push([p0, p1, p2, p3]);
        outlineEdges.push([p0, p1], [p3, p2]);
      }
      result.set(wall.id, { wallId: wall.id, quads, outlineEdges, startExt: 0, endExt: 0 });
      continue;
    }

    const dx = wall.x2 - wall.x1;
    const dz = wall.z2 - wall.z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) {
      result.set(wall.id, { wallId: wall.id, quads: [], outlineEdges: [], startExt: 0, endExt: 0 });
      continue;
    }

    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;
    const halfT = wall.thickness * 0.5;
    const ext = extensions.get(wall.id) ?? { extStart: 0, extEnd: 0 };

    // Build intervals excluding floor/wall openings
    const startOff = -ext.extStart;
    const endOff = len + ext.extEnd;
    const openIntervals = [...wall.openings]
      .map((o) => [Math.max(0, o.offset), Math.min(len, o.offset + o.width)] as [number, number])
      .filter(([a, b]) => b > a + 0.02)
      .sort((a, b) => a[0] - b[0]);

    const afterOpenings: Array<[number, number]> = [];
    let cursor = startOff;
    for (const [o0, o1] of openIntervals) {
      if (o0 > cursor + 0.01) afterOpenings.push([cursor, o0]);
      cursor = Math.max(cursor, o1);
    }
    if (endOff > cursor + 0.01) afterOpenings.push([cursor, endOff]);

    // Subtract column footprints so masonry never bleeds over RCC columns
    const finalRuns: Array<[number, number]> = [];
    for (const [r0, r1] of afterOpenings) {
      const clipped = subtractPillarIntervals(wall, r0, r1, story.pillars);
      for (const seg of clipped) {
        if (seg[1] - seg[0] > 0.015) finalRuns.push(seg);
      }
    }

    const quads: Vec2[][] = [];
    const outlineEdges: Array<[Vec2, Vec2]> = [];

    for (const [a, b] of finalRuns) {
      const ax = wall.x1 + ux * a;
      const az = wall.z1 + uz * a;
      const bx = wall.x1 + ux * b;
      const bz = wall.z1 + uz * b;
      const p0 = { x: ax + nx * halfT, z: az + nz * halfT };
      const p1 = { x: bx + nx * halfT, z: bz + nz * halfT };
      const p2 = { x: bx - nx * halfT, z: bz - nz * halfT };
      const p3 = { x: ax - nx * halfT, z: az - nz * halfT };
      quads.push([p0, p1, p2, p3]);
      outlineEdges.push([p0, p1], [p3, p2]);
      // End caps at openings or free ends
      const isOpeningStart = openIntervals.some(([, o1]) => Math.abs(o1 - a) < 0.02);
      const isOpeningEnd = openIntervals.some(([o0]) => Math.abs(o0 - b) < 0.02);
      if (isOpeningStart || (Math.abs(a - startOff) < 0.02 && ext.extStart >= 0)) {
        outlineEdges.push([p3, p0]);
      }
      if (isOpeningEnd || (Math.abs(b - endOff) < 0.02 && ext.extEnd >= 0)) {
        outlineEdges.push([p1, p2]);
      }
    }

    result.set(wall.id, {
      wallId: wall.id,
      quads,
      outlineEdges,
      startExt: ext.extStart,
      endExt: ext.extEnd,
    });
  }

  return result;
}

// ============================================================================
// 2. CONNECTED-CORNER TOPOLOGY & OPENING INTEGRITY
// ============================================================================

export interface ConnectedEndpoint {
  wallId: string;
  end: 'p1' | 'p2';
}

/** Find all unlocked wall endpoints sharing a corner vertex within tolerance */
export function findConnectedWallJoints(
  walls: Wall[],
  x: number,
  z: number,
  toleranceM = 0.075
): ConnectedEndpoint[] {
  const hits: ConnectedEndpoint[] = [];
  for (const w of walls) {
    if (w.locked) continue;
    if (Math.hypot(w.x1 - x, w.z1 - z) <= toleranceM) {
      hits.push({ wallId: w.id, end: 'p1' });
    }
    if (Math.hypot(w.x2 - x, w.z2 - z) <= toleranceM) {
      hits.push({ wallId: w.id, end: 'p2' });
    }
  }
  return hits;
}

/** Keep all openings safely inside the wall's updated length */
export function clampWallOpenings(wall: Wall): WallOpening[] {
  const len = getWallArcLength(wall);
  if (wall.openings.length === 0) return wall.openings;
  return wall.openings
    .filter((o) => len >= 0.25)
    .map((o) => {
      const clampedW = Math.min(o.width, Math.max(0.25, len - 0.12));
      const maxOff = Math.max(0.05, len - clampedW - 0.05);
      const nextOff = Math.max(0.05, Math.min(maxOff, o.offset));
      return {
        ...o,
        width: Number(clampedW.toFixed(3)),
        offset: Number(nextOff.toFixed(3)),
      };
    });
}

/** Apply a connected-joint move across multiple wall endpoints atomically */
export function applyConnectedJointMove(
  walls: Wall[],
  joints: ConnectedEndpoint[],
  targetX: number,
  targetZ: number
): Wall[] {
  const map = new Map<string, Set<'p1' | 'p2'>>();
  for (const j of joints) {
    if (!map.has(j.wallId)) map.set(j.wallId, new Set());
    map.get(j.wallId)!.add(j.end);
  }
  const rx = Number(targetX.toFixed(4));
  const rz = Number(targetZ.toFixed(4));

  return walls.map((w) => {
    const ends = map.get(w.id);
    if (!ends) return w;
    let next = { ...w };
    if (ends.has('p1')) {
      next = { ...next, x1: rx, z1: rz };
    }
    if (ends.has('p2')) {
      next = { ...next, x2: rx, z2: rz };
    }
    // Prevent collapsing a wall to zero length
    if (Math.hypot(next.x2 - next.x1, next.z2 - next.z1) < 0.2) {
      return w;
    }
    return { ...next, openings: clampWallOpenings(next) };
  });
}

// ============================================================================
// 3. PRO CAD WALL OPERATORS (SPLIT, OFFSET, TRIM / EXTEND)
// ============================================================================

export interface SplitWallResult {
  ok: boolean;
  reason?: string;
  walls?: Wall[];
  splitPoint?: Vec2;
}

/** Split a straight wall cleanly at an arc distance, preserving doors/windows on each half */
export function splitWallAtDistance(
  walls: Wall[],
  wallId: string,
  alongDist: number
): SplitWallResult {
  const wall = walls.find((w) => w.id === wallId);
  if (!wall) return { ok: false, reason: 'Wall not found.' };
  if (wall.locked) return { ok: false, reason: 'Unlock this wall before splitting.' };
  if (isCurvedWall(wall)) return { ok: false, reason: 'Straighten curved wall before splitting.' };

  const len = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
  if (alongDist < 0.2 || len - alongDist < 0.2) {
    return { ok: false, reason: 'Click closer to the middle of the wall to split it.' };
  }

  const hitsOpening = wall.openings.some(
    (op) => alongDist >= op.offset - 0.04 && alongDist <= op.offset + op.width + 0.04
  );
  if (hitsOpening) {
    return { ok: false, reason: 'Cannot split directly through a door or window opening.' };
  }

  const t = alongDist / len;
  const sx = Number((wall.x1 + (wall.x2 - wall.x1) * t).toFixed(4));
  const sz = Number((wall.z1 + (wall.z2 - wall.z1) * t).toFixed(4));

  const ops1 = wall.openings.filter((o) => o.offset + o.width <= alongDist + 0.02);
  const ops2 = wall.openings
    .filter((o) => o.offset >= alongDist - 0.02)
    .map((o) => ({ ...o, offset: Number(Math.max(0.05, o.offset - alongDist).toFixed(3)) }));

  const part1: Wall = { ...wall, x2: sx, z2: sz, openings: ops1 };
  const part2: Wall = {
    ...wall,
    id: makeId('w'),
    x1: sx,
    z1: sz,
    openings: ops2,
  };

  const nextWalls: Wall[] = [];
  for (const w of walls) {
    if (w.id === wall.id) {
      nextWalls.push(part1, part2);
    } else {
      nextWalls.push(w);
    }
  }
  return { ok: true, walls: nextWalls, splitPoint: { x: sx, z: sz } };
}

/** Create a parallel offset wall at signed perpendicular distance (meters) */
export function buildOffsetWall(source: Wall, signedPerpDist: number): Wall | null {
  if (isCurvedWall(source)) return null;
  const dx = source.x2 - source.x1;
  const dz = source.z2 - source.z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.15 || Math.abs(signedPerpDist) < 0.15) return null;
  const nx = -dz / len;
  const nz = dx / len;
  return {
    id: makeId('w'),
    x1: Number((source.x1 + nx * signedPerpDist).toFixed(4)),
    z1: Number((source.z1 + nz * signedPerpDist).toFixed(4)),
    x2: Number((source.x2 + nx * signedPerpDist).toFixed(4)),
    z2: Number((source.z2 + nz * signedPerpDist).toFixed(4)),
    curveOffset: 0,
    thickness: source.thickness,
    height: source.height,
    material: source.material,
    role: source.role,
    openings: [],
  };
}

export interface TrimExtendPreview {
  mode: 'trim' | 'extend';
  wallId: string;
  previewSegment: [Vec2, Vec2]; // red dashed portion removed (trim) or blue dashed portion added (extend)
  nextWalls: Wall[];
}

function lineLineIntersect(
  ax1: number,
  az1: number,
  ax2: number,
  az2: number,
  bx1: number,
  bz1: number,
  bx2: number,
  bz2: number
): { ta: number; tb: number; x: number; z: number } | null {
  const rx = ax2 - ax1;
  const rz = az2 - az1;
  const sx = bx2 - bx1;
  const sz = bz2 - bz1;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-6) return null;
  const qpx = bx1 - ax1;
  const qpz = bz1 - az1;
  const ta = (qpx * sz - qpz * sx) / denom;
  const tb = (qpx * rz - qpz * rx) / denom;
  return { ta, tb, x: ax1 + ta * rx, z: az1 + ta * rz };
}

/**
 * Smart CAD Trim / Extend solver:
 * - If other walls intersect or touch the target wall interior, hovering a tail or middle span previews TRIM (removes that piece).
 * - If hovering near an open end that faces another wall ahead, previews EXTEND to close the gap cleanly.
 */
export function computeTrimOrExtend(
  walls: Wall[],
  wallId: string,
  alongDist: number
): TrimExtendPreview | null {
  const target = walls.find((w) => w.id === wallId);
  if (!target || target.locked || isCurvedWall(target)) return null;

  const dx = target.x2 - target.x1;
  const dz = target.z2 - target.z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.15) return null;

  const ux = dx / len;
  const uz = dz / len;
  const clickT = Math.max(0, Math.min(1, alongDist / len));

  // Collect all interior intersection parameters along target wall (0 < t < 1)
  const cutTs: number[] = [];
  for (const other of walls) {
    if (other.id === target.id || isCurvedWall(other)) continue;
    const hit = lineLineIntersect(
      target.x1,
      target.z1,
      target.x2,
      target.z2,
      other.x1,
      other.z1,
      other.x2,
      other.z2
    );
    if (!hit) continue;
    // Other wall must genuinely cross or touch target (within half-thickness tolerance)
    const oLen = Math.hypot(other.x2 - other.x1, other.z2 - other.z1);
    const padTb = oLen > 0.05 ? (other.thickness * 0.6 + 0.05) / oLen : 0.05;
    if (hit.tb >= -padTb && hit.tb <= 1 + padTb && hit.ta > 0.03 && hit.ta < 0.97) {
      cutTs.push(hit.ta);
    }
  }

  cutTs.sort((a, b) => a - b);
  const dedupCuts: number[] = [];
  for (const t of cutTs) {
    if (dedupCuts.length === 0 || (t - dedupCuts[dedupCuts.length - 1]) * len > 0.08) {
      dedupCuts.push(t);
    }
  }

  // Try TRIM first if there are interior cuts
  if (dedupCuts.length > 0) {
    const spans = [0, ...dedupCuts, 1];
    let segIdx = 0;
    for (let i = 0; i < spans.length - 1; i++) {
      if (clickT >= spans[i] - 1e-4 && clickT <= spans[i + 1] + 1e-4) {
        segIdx = i;
        break;
      }
    }
    const t0 = spans[segIdx];
    const t1 = spans[segIdx + 1];
    const p0: Vec2 = { x: target.x1 + dx * t0, z: target.z1 + dz * t0 };
    const p1: Vec2 = { x: target.x1 + dx * t1, z: target.z1 + dz * t1 };

    const remainPieces: Wall[] = [];
    if (t0 > 0.02) {
      const lenA = t0 * len;
      if (lenA >= 0.2) {
        const opsA = target.openings.filter((o) => o.offset + o.width <= lenA + 0.02);
        remainPieces.push({
          ...target,
          x2: Number(p0.x.toFixed(4)),
          z2: Number(p0.z.toFixed(4)),
          openings: opsA,
        });
      }
    }
    if (1 - t1 > 0.02) {
      const startB = t1 * len;
      const lenB = (1 - t1) * len;
      if (lenB >= 0.2) {
        const opsB = target.openings
          .filter((o) => o.offset >= startB - 0.02)
          .map((o) => ({ ...o, offset: Number(Math.max(0.05, o.offset - startB).toFixed(3)) }));
        remainPieces.push({
          ...target,
          id: remainPieces.length === 0 ? target.id : makeId('w'),
          x1: Number(p1.x.toFixed(4)),
          z1: Number(p1.z.toFixed(4)),
          openings: opsB,
        });
      }
    }

    const nextWalls: Wall[] = [];
    for (const w of walls) {
      if (w.id === target.id) {
        nextWalls.push(...remainPieces);
      } else {
        nextWalls.push(w);
      }
    }

    return {
      mode: 'trim',
      wallId: target.id,
      previewSegment: [p0, p1],
      nextWalls,
    };
  }

  // Otherwise try EXTEND from whichever end is closer to the cursor
  const extendEnd: 'p1' | 'p2' = clickT < 0.5 ? 'p1' : 'p2';
  let bestDelta = Infinity;
  let bestHit: Vec2 | null = null;

  for (const other of walls) {
    if (other.id === target.id || isCurvedWall(other)) continue;
    const hit = lineLineIntersect(
      target.x1,
      target.z1,
      target.x2,
      target.z2,
      other.x1,
      other.z1,
      other.x2,
      other.z2
    );
    if (!hit) continue;
    const oLen = Math.hypot(other.x2 - other.x1, other.z2 - other.z1);
    const padTb = oLen > 0.05 ? 0.08 / oLen : 0.05;
    if (hit.tb < -padTb || hit.tb > 1 + padTb) continue;

    if (extendEnd === 'p2' && hit.ta > 1.01) {
      const dist = (hit.ta - 1) * len;
      if (dist > 0.04 && dist < 18 && dist < bestDelta) {
        bestDelta = dist;
        bestHit = { x: Number(hit.x.toFixed(4)), z: Number(hit.z.toFixed(4)) };
      }
    } else if (extendEnd === 'p1' && hit.ta < -0.01) {
      const dist = -hit.ta * len;
      if (dist > 0.04 && dist < 18 && dist < bestDelta) {
        bestDelta = dist;
        bestHit = { x: Number(hit.x.toFixed(4)), z: Number(hit.z.toFixed(4)) };
      }
    }
  }

  if (!bestHit) return null;

  const anchor: Vec2 = extendEnd === 'p1' ? { x: target.x1, z: target.z1 } : { x: target.x2, z: target.z2 };
  const addedLen = Math.hypot(bestHit.x - anchor.x, bestHit.z - anchor.z);
  const nextWall: Wall =
    extendEnd === 'p1'
      ? {
          ...target,
          x1: bestHit.x,
          z1: bestHit.z,
          openings: target.openings.map((o) => ({
            ...o,
            offset: Number((o.offset + addedLen).toFixed(3)),
          })),
        }
      : {
          ...target,
          x2: bestHit.x,
          z2: bestHit.z,
        };

  // Ensure unit direction wasn't inverted
  if (Math.hypot(nextWall.x2 - nextWall.x1, nextWall.z2 - nextWall.z1) < 0.15) return null;
  void ux;
  void uz;

  return {
    mode: 'extend',
    wallId: target.id,
    previewSegment: [anchor, bestHit],
    nextWalls: walls.map((w) => (w.id === target.id ? nextWall : w)),
  };
}

// ============================================================================
// 4. SPATIAL OSNAP & SMART EXTENSION TRACKING ENGINE
// ============================================================================

export type CadSnapKind =
  | 'endpoint'
  | 'intersection'
  | 'midpoint'
  | 'pillar'
  | 'perpendicular'
  | 'nearest'
  | 'extension'
  | 'polar'
  | 'grid'
  | 'none';

export interface GuideRay {
  from: Vec2;
  to: Vec2;
  kind: 'extension' | 'polar' | 'perpendicular';
}

export interface CadSnapResult {
  x: number;
  z: number;
  kind: CadSnapKind;
  label?: string;
  guides: GuideRay[];
}

export interface SpatialSnapIndex {
  endpoints: Vec2[];
  midpoints: Vec2[];
  intersections: Vec2[];
  pillarCenters: Vec2[];
  straightWalls: Wall[];
  alignXs: Array<{ coord: number; origin: Vec2 }>;
  alignZs: Array<{ coord: number; origin: Vec2 }>;
}

/** Build a fast reusable snap index once per story revision */
export function buildSpatialSnapIndex(
  story: Story,
  lowerStory?: Story,
  plot?: LandPlot
): SpatialSnapIndex {
  const endpoints: Vec2[] = [];
  const midpoints: Vec2[] = [];
  const intersections: Vec2[] = [];
  const pillarCenters: Vec2[] = [];
  const straightWalls: Wall[] = [];
  const alignXs: Array<{ coord: number; origin: Vec2 }> = [];
  const alignZs: Array<{ coord: number; origin: Vec2 }> = [];

  const addUniquePt = (arr: Vec2[], x: number, z: number) => {
    for (const p of arr) {
      if (Math.abs(p.x - x) < 0.02 && Math.abs(p.z - z) < 0.02) return;
    }
    arr.push({ x, z });
  };

  for (const w of story.walls) {
    addUniquePt(endpoints, w.x1, w.z1);
    addUniquePt(endpoints, w.x2, w.z2);
    alignXs.push({ coord: w.x1, origin: { x: w.x1, z: w.z1 } });
    alignXs.push({ coord: w.x2, origin: { x: w.x2, z: w.z2 } });
    alignZs.push({ coord: w.z1, origin: { x: w.x1, z: w.z1 } });
    alignZs.push({ coord: w.z2, origin: { x: w.x2, z: w.z2 } });
    if (!isCurvedWall(w)) {
      straightWalls.push(w);
      addUniquePt(midpoints, (w.x1 + w.x2) * 0.5, (w.z1 + w.z2) * 0.5);
    }
  }

  for (const p of story.pillars) {
    pillarCenters.push({ x: p.x, z: p.z });
    alignXs.push({ coord: p.x, origin: { x: p.x, z: p.z } });
    alignZs.push({ coord: p.z, origin: { x: p.x, z: p.z } });
  }

  if (lowerStory) {
    for (const p of lowerStory.pillars) {
      addUniquePt(pillarCenters, p.x, p.z);
    }
    for (const w of lowerStory.walls) {
      addUniquePt(endpoints, w.x1, w.z1);
      addUniquePt(endpoints, w.x2, w.z2);
    }
  }

  if (plot) {
    addUniquePt(endpoints, plot.originX, plot.originZ);
    addUniquePt(endpoints, plot.originX + plot.width, plot.originZ);
    addUniquePt(endpoints, plot.originX + plot.width, plot.originZ + plot.depth);
    addUniquePt(endpoints, plot.originX, plot.originZ + plot.depth);
  }

  // Pairwise straight-wall intersections (capped cleanly for massive plans)
  const cap = Math.min(straightWalls.length, 160);
  for (let i = 0; i < cap; i++) {
    const a = straightWalls[i];
    for (let j = i + 1; j < cap; j++) {
      const b = straightWalls[j];
      const hit = lineLineIntersect(a.x1, a.z1, a.x2, a.z2, b.x1, b.z1, b.x2, b.z2);
      if (hit && hit.ta > 0.02 && hit.ta < 0.98 && hit.tb > 0.02 && hit.tb < 0.98) {
        addUniquePt(intersections, hit.x, hit.z);
      }
    }
  }

  return {
    endpoints,
    midpoints,
    intersections,
    pillarCenters,
    straightWalls,
    alignXs,
    alignZs,
  };
}

/** High-precision CAD OSNAP + Smart Extension + Polar Tracking */
export function computeCadSnap(
  raw: Vec2,
  index: SpatialSnapIndex,
  scalePxPerM: number,
  gridStepM: number,
  options: {
    enabled: boolean;
    anchor?: Vec2 | null;
    orthoShift?: boolean;
    excludeWallId?: string | null;
  }
): CadSnapResult {
  if (!options.enabled) {
    return { x: raw.x, z: raw.z, kind: 'none', guides: [] };
  }

  const snapRadiusM = Math.min(0.45, Math.max(0.14, 13 / Math.max(12, scalePxPerM)));
  const alignRadiusM = Math.min(0.32, Math.max(0.1, 10 / Math.max(12, scalePxPerM)));
  const anchor = options.anchor ?? null;

  // Apply polar / shift-ortho pre-projection when drawing from an anchor
  let working = { ...raw };
  const guides: GuideRay[] = [];
  let polarSnapped = false;

  if (anchor) {
    const dx = raw.x - anchor.x;
    const dz = raw.z - anchor.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      const deg = (Math.atan2(dz, dx) * 180) / Math.PI;
      const stepDeg = options.orthoShift ? 45 : 90;
      const nearest = Math.round(deg / stepDeg) * stepDeg;
      const tol = options.orthoShift ? 22.5 : 4.2;
      if (Math.abs(deg - nearest) <= tol) {
        const rad = (nearest * Math.PI) / 180;
        working = {
          x: anchor.x + Math.cos(rad) * dist,
          z: anchor.z + Math.sin(rad) * dist,
        };
        polarSnapped = true;
        guides.push({ from: anchor, to: working, kind: 'polar' });
      }
    }
  }

  // Priority 1: Column centers & Wall Endpoints & Intersections
  let bestPt: { pt: Vec2; kind: CadSnapKind; dist: number; label: string } | null = null;

  const testPoints = (pts: Vec2[], kind: CadSnapKind, label: string, bias = 1) => {
    for (const p of pts) {
      const d = Math.hypot(working.x - p.x, working.z - p.z);
      if (d < snapRadiusM * bias && (!bestPt || d < bestPt.dist)) {
        bestPt = { pt: p, kind, dist: d, label };
      }
    }
  };

  testPoints(index.pillarCenters, 'pillar', 'Column', 1.05);
  testPoints(index.endpoints, 'endpoint', 'Endpoint', 1.0);
  testPoints(index.intersections, 'intersection', 'Intersection', 0.95);
  if (!bestPt) {
    testPoints(index.midpoints, 'midpoint', 'Midpoint', 0.85);
  }

  if (bestPt) {
    const found = bestPt as { pt: Vec2; kind: CadSnapKind; dist: number; label: string };
    return {
      x: found.pt.x,
      z: found.pt.z,
      kind: found.kind,
      label: found.label,
      guides,
    };
  }

  // Priority 2: Perpendicular foot on straight wall (when drawing from anchor)
  if (anchor) {
    let bestPerp: { pt: Vec2; dist: number } | null = null;
    for (const w of index.straightWalls) {
      if (w.id === options.excludeWallId) continue;
      const wdx = w.x2 - w.x1;
      const wdz = w.z2 - w.z1;
      const wLenSq = wdx * wdx + wdz * wdz;
      if (wLenSq < 1e-4) continue;
      const t = ((anchor.x - w.x1) * wdx + (anchor.z - w.z1) * wdz) / wLenSq;
      if (t <= 0.02 || t >= 0.98) continue;
      const px = w.x1 + t * wdx;
      const pz = w.z1 + t * wdz;
      const d = Math.hypot(working.x - px, working.z - pz);
      if (d < snapRadiusM * 0.9 && (!bestPerp || d < bestPerp.dist)) {
        bestPerp = { pt: { x: px, z: pz }, dist: d };
      }
    }
    if (bestPerp) {
      return {
        x: bestPerp.pt.x,
        z: bestPerp.pt.z,
        kind: 'perpendicular',
        label: 'Perpendicular',
        guides: [{ from: anchor, to: bestPerp.pt, kind: 'perpendicular' }],
      };
    }
  }

  // Priority 3: Nearest point along straight wall centerline
  let bestWallPt: { pt: Vec2; dist: number } | null = null;
  for (const w of index.straightWalls) {
    if (w.id === options.excludeWallId) continue;
    const hit = pointToWallDist(working.x, working.z, w);
    if (hit.dist < snapRadiusM * 0.6 && (!bestWallPt || hit.dist < bestWallPt.dist)) {
      bestWallPt = { pt: hit.closest, dist: hit.dist };
    }
  }
  if (bestWallPt) {
    return {
      x: bestWallPt.pt.x,
      z: bestWallPt.pt.z,
      kind: 'nearest',
      label: 'On wall',
      guides,
    };
  }

  // Priority 4: Smart Axis Extension Tracking (horizontal & vertical rays from nearby wall/column corners)
  let extX: { coord: number; origin: Vec2; dist: number } | null = null;
  let extZ: { coord: number; origin: Vec2; dist: number } | null = null;

  for (const a of index.alignXs) {
    const d = Math.abs(working.x - a.coord);
    const span = Math.abs(working.z - a.origin.z);
    if (d < alignRadiusM && span > 0.15 && span < 28 && (!extX || d < extX.dist)) {
      extX = { coord: a.coord, origin: a.origin, dist: d };
    }
  }
  for (const a of index.alignZs) {
    const d = Math.abs(working.z - a.coord);
    const span = Math.abs(working.x - a.origin.x);
    if (d < alignRadiusM && span > 0.15 && span < 28 && (!extZ || d < extZ.dist)) {
      extZ = { coord: a.coord, origin: a.origin, dist: d };
    }
  }

  const step = Math.max(0.025, gridStepM || 0.1524);
  const finalX = extX ? extX.coord : Math.round(working.x / step) * step;
  const finalZ = extZ ? extZ.coord : Math.round(working.z / step) * step;

  if (extX) {
    guides.push({ from: extX.origin, to: { x: finalX, z: finalZ }, kind: 'extension' });
  }
  if (extZ) {
    guides.push({ from: extZ.origin, to: { x: finalX, z: finalZ }, kind: 'extension' });
  }

  if (extX || extZ) {
    return {
      x: Number(finalX.toFixed(4)),
      z: Number(finalZ.toFixed(4)),
      kind: 'extension',
      label: extX && extZ ? 'Align X+Y' : 'Align',
      guides,
    };
  }

  return {
    x: Number(finalX.toFixed(4)),
    z: Number(finalZ.toFixed(4)),
    kind: polarSnapped ? 'polar' : 'grid',
    label: polarSnapped ? 'Angle' : 'Grid',
    guides,
  };
}

// ============================================================================
// 5. CLEAR INTERIOR ROOM DIMENSIONS, 3-TIER DIMENSION CHAINS & SCHEDULE TAGS
// ============================================================================

export interface RoomClearDimensions {
  centerlineW: number;
  centerlineD: number;
  clearW: number;
  clearD: number;
  clearAreaM2: number;
  centerlineAreaM2: number;
}

/** Computes both centerline and true clear face-to-face interior dimensions for a room */
export function computeRoomClearDimensions(room: RoomZone, story: Story): RoomClearDimensions {
  const rx0 = room.x;
  const rx1 = room.x + room.width;
  const rz0 = room.z;
  const rz1 = room.z + room.depth;

  let leftHalf = 0;
  let rightHalf = 0;
  let topHalf = 0;
  let bottomHalf = 0;

  for (const w of story.walls) {
    if (isCurvedWall(w)) continue;
    const isVert = Math.abs(w.x1 - w.x2) < 0.12;
    const isHoriz = Math.abs(w.z1 - w.z2) < 0.12;
    if (isVert) {
      const wx = (w.x1 + w.x2) * 0.5;
      const minZ = Math.min(w.z1, w.z2);
      const maxZ = Math.max(w.z1, w.z2);
      const overlapZ = Math.min(maxZ, rz1) - Math.max(minZ, rz0);
      if (overlapZ > room.depth * 0.28) {
        if (Math.abs(wx - rx0) < 0.25) leftHalf = Math.max(leftHalf, w.thickness * 0.5);
        if (Math.abs(wx - rx1) < 0.25) rightHalf = Math.max(rightHalf, w.thickness * 0.5);
      }
    } else if (isHoriz) {
      const wz = (w.z1 + w.z2) * 0.5;
      const minX = Math.min(w.x1, w.x2);
      const maxX = Math.max(w.x1, w.x2);
      const overlapX = Math.min(maxX, rx1) - Math.max(minX, rx0);
      if (overlapX > room.width * 0.28) {
        if (Math.abs(wz - rz0) < 0.25) topHalf = Math.max(topHalf, w.thickness * 0.5);
        if (Math.abs(wz - rz1) < 0.25) bottomHalf = Math.max(bottomHalf, w.thickness * 0.5);
      }
    }
  }

  const clearW = Math.max(0.3, room.width - leftHalf - rightHalf);
  const clearD = Math.max(0.3, room.depth - topHalf - bottomHalf);

  return {
    centerlineW: room.width,
    centerlineD: room.depth,
    clearW,
    clearD,
    clearAreaM2: clearW * clearD,
    centerlineAreaM2: room.width * room.depth,
  };
}

export interface ExteriorDimSegment {
  a: Vec2;
  b: Vec2;
  lengthM: number;
  label: string;
  tier: 1 | 2 | 3; // 1 = openings, 2 = structural bays, 3 = overall
  side: 'top' | 'bottom' | 'left' | 'right';
}

export interface ExteriorChainOptions {
  /** Current 2D viewport scale (px per meter) to enforce non-overlapping tier spacing */
  scale?: number;
  /** 'clean' = crisp Overall Top + Left only; 'full' = architectural 3-tier chains on all sides */
  detail?: 'clean' | 'full';
}

export interface ExteriorChainMetrics {
  valid: boolean;
  /** Measured building envelope (straight perimeter corners) */
  ref: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** True outer visual bounds including curved wall bulges */
  outer: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Outermost chain offset (meters beyond outer bounds) used on each side */
  outermostOff: { top: number; bottom: number; left: number; right: number };
}

function clusterSorted(vals: number[], tol = 0.08): number[] {
  if (vals.length === 0) return [];
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [s[0]];
  for (let i = 1; i < s.length; i++) {
    if (s[i] - out[out.length - 1] > tol) out.push(s[i]);
  }
  return out;
}

function computeStoryEnvelope(story: Story, basis: DimensionBasis) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  let outMinX = Infinity;
  let outMaxX = -Infinity;
  let outMinZ = Infinity;
  let outMaxZ = -Infinity;

  for (const w of story.walls) {
    const ht = basis === 'interior' ? 0 : w.thickness * 0.5;
    const visHt = w.thickness * 0.5;
    minX = Math.min(minX, w.x1 - ht, w.x2 - ht);
    maxX = Math.max(maxX, w.x1 + ht, w.x2 + ht);
    minZ = Math.min(minZ, w.z1 - ht, w.z2 - ht);
    maxZ = Math.max(maxZ, w.z1 + ht, w.z2 + ht);

    outMinX = Math.min(outMinX, w.x1 - visHt, w.x2 - visHt);
    outMaxX = Math.max(outMaxX, w.x1 + visHt, w.x2 + visHt);
    outMinZ = Math.min(outMinZ, w.z1 - visHt, w.z2 - visHt);
    outMaxZ = Math.max(outMaxZ, w.z1 + visHt, w.z2 + visHt);

    if (isCurvedWall(w)) {
      const arcLen = getWallArcLength(w);
      for (const frac of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        const pt = pointAtWallOffset(w, arcLen * frac);
        outMinX = Math.min(outMinX, pt.x - visHt);
        outMaxX = Math.max(outMaxX, pt.x + visHt);
        outMinZ = Math.min(outMinZ, pt.z - visHt);
        outMaxZ = Math.max(outMaxZ, pt.z + visHt);
      }
    }
  }
  for (const sl of story.slabs) {
    minX = Math.min(minX, sl.x);
    maxX = Math.max(maxX, sl.x + sl.width);
    minZ = Math.min(minZ, sl.z);
    maxZ = Math.max(maxZ, sl.z + sl.depth);
    outMinX = Math.min(outMinX, sl.x);
    outMaxX = Math.max(outMaxX, sl.x + sl.width);
    outMinZ = Math.min(outMinZ, sl.z);
    outMaxZ = Math.max(outMaxZ, sl.z + sl.depth);
  }

  const valid = Number.isFinite(minX) && maxX - minX >= 0.5 && maxZ - minZ >= 0.5;
  return {
    valid,
    ref: { minX, maxX, minZ, maxZ },
    outer: {
      minX: Number.isFinite(outMinX) ? outMinX : minX,
      maxX: Number.isFinite(outMaxX) ? outMaxX : maxX,
      minZ: Number.isFinite(outMinZ) ? outMinZ : minZ,
      maxZ: Number.isFinite(outMaxZ) ? outMaxZ : maxZ,
    },
  };
}

/** Shared geometry metrics so exterior chains and structural grid bubbles NEVER collide */
export function computeExteriorChainMetrics(
  story: Story,
  basis: DimensionBasis,
  opts?: ExteriorChainOptions
): ExteriorChainMetrics {
  const env = computeStoryEnvelope(story, basis);
  if (!env.valid) {
    return {
      valid: false,
      ref: env.ref,
      outer: env.outer,
      outermostOff: { top: 0, bottom: 0, left: 0, right: 0 },
    };
  }

  const scale = opts?.scale;
  const detail = opts?.detail ?? 'full';
  const pxToM = (px: number) => (scale && scale > 1 ? px / scale : 0);

  if (detail === 'clean') {
    const cleanOff = Math.max(0.75, pxToM(26));
    return {
      valid: true,
      ref: env.ref,
      outer: env.outer,
      outermostOff: { top: cleanOff, bottom: 0, left: cleanOff, right: 0 },
    };
  }

  const grid = computeStructuralGrid(story);
  const { minX, maxX, minZ, maxZ } = env.ref;

  let hasTopOp = false;
  let hasBotOp = false;
  let hasLeftOp = false;
  let hasRightOp = false;
  for (const w of story.walls) {
    if (isCurvedWall(w) || w.openings.length === 0) continue;
    const horiz = Math.abs(w.z1 - w.z2) < 0.12;
    const vert = Math.abs(w.x1 - w.x2) < 0.12;
    if (horiz) {
      const wz = (w.z1 + w.z2) * 0.5;
      if (Math.abs(wz - minZ) < 0.55) hasTopOp = true;
      if (Math.abs(wz - maxZ) < 0.55) hasBotOp = true;
    } else if (vert) {
      const wx = (w.x1 + w.x2) * 0.5;
      if (Math.abs(wx - minX) < 0.55) hasLeftOp = true;
      if (Math.abs(wx - maxX) < 0.55) hasRightOp = true;
    }
  }

  const hasXBays = grid.xLines.length >= 2;
  const hasZBays = grid.zLines.length >= 2;

  const baseOff = Math.max(0.72, pxToM(26));
  const tierGap = Math.max(0.68, pxToM(24));

  const sideOuter = (hasOp: boolean, hasBay: boolean) => {
    const count = (hasOp ? 1 : 0) + (hasBay ? 1 : 0) + 1; // +1 for overall
    return baseOff + (count - 1) * tierGap;
  };

  return {
    valid: true,
    ref: env.ref,
    outer: env.outer,
    outermostOff: {
      top: sideOuter(hasTopOp, hasXBays),
      bottom: sideOuter(hasBotOp, hasXBays),
      left: sideOuter(hasLeftOp, hasZBays),
      right: sideOuter(hasRightOp, hasZBays),
    },
  };
}

/** Computes clean, collision-free exterior architectural dimension chains around the building envelope */
export function computeExteriorDimensionChains(
  story: Story,
  unit: 'imperial' | 'metric',
  basis: DimensionBasis,
  opts?: ExteriorChainOptions
): ExteriorDimSegment[] {
  const env = computeStoryEnvelope(story, basis);
  if (!env.valid) return [];

  const { minX, maxX, minZ, maxZ } = env.ref;
  const { minX: outMinX, maxX: outMaxX, minZ: outMinZ, maxZ: outMaxZ } = env.outer;
  const scale = opts?.scale;
  const detail = opts?.detail ?? 'full';
  const pxToM = (px: number) => (scale && scale > 1 ? px / scale : 0);

  const segments: ExteriorDimSegment[] = [];

  const pushHorizChain = (
    coords: number[],
    zPos: number,
    tier: 1 | 2 | 3,
    side: 'top' | 'bottom'
  ) => {
    const clean = clusterSorted(coords, 0.12);
    if (clean.length < 2) return;
    for (let i = 0; i < clean.length - 1; i++) {
      const len = clean[i + 1] - clean[i];
      if (len < 0.15) continue;
      segments.push({
        a: { x: clean[i], z: zPos },
        b: { x: clean[i + 1], z: zPos },
        lengthM: len,
        label: formatLength(len, unit),
        tier,
        side,
      });
    }
  };

  const pushVertChain = (
    coords: number[],
    xPos: number,
    tier: 1 | 2 | 3,
    side: 'left' | 'right'
  ) => {
    const clean = clusterSorted(coords, 0.12);
    if (clean.length < 2) return;
    for (let i = 0; i < clean.length - 1; i++) {
      const len = clean[i + 1] - clean[i];
      if (len < 0.15) continue;
      segments.push({
        a: { x: xPos, z: clean[i] },
        b: { x: xPos, z: clean[i + 1] },
        lengthM: len,
        label: formatLength(len, unit),
        tier,
        side,
      });
    }
  };

  // Clean homeowner mode: crisp Overall Width (top) & Overall Depth (left) only
  if (detail === 'clean') {
    const cleanOff = Math.max(0.75, pxToM(26));
    pushHorizChain([minX, maxX], outMinZ - cleanOff, 3, 'top');
    pushVertChain([minZ, maxZ], outMinX - cleanOff, 3, 'left');
    return segments;
  }

  const grid = computeStructuralGrid(story);
  const baseOff = Math.max(0.72, pxToM(26));
  const tierGap = Math.max(0.68, pxToM(24));

  // Collect perimeter opening stops along top (minZ), bottom (maxZ), left (minX), right (maxX)
  const topStops: number[] = [minX, maxX];
  const bottomStops: number[] = [minX, maxX];
  const leftStops: number[] = [minZ, maxZ];
  const rightStops: number[] = [minZ, maxZ];

  for (const w of story.walls) {
    if (isCurvedWall(w) || w.openings.length === 0) continue;
    const horiz = Math.abs(w.z1 - w.z2) < 0.12;
    const vert = Math.abs(w.x1 - w.x2) < 0.12;
    if (horiz) {
      const wz = (w.z1 + w.z2) * 0.5;
      const isTop = Math.abs(wz - minZ) < 0.55;
      const isBot = Math.abs(wz - maxZ) < 0.55;
      if (isTop || isBot) {
        for (const op of w.openings) {
          const pA = pointAtWallOffset(w, op.offset);
          const pB = pointAtWallOffset(w, op.offset + op.width);
          if (isTop) topStops.push(pA.x, pB.x);
          if (isBot) bottomStops.push(pA.x, pB.x);
        }
      }
    } else if (vert) {
      const wx = (w.x1 + w.x2) * 0.5;
      const isLeft = Math.abs(wx - minX) < 0.55;
      const isRight = Math.abs(wx - maxX) < 0.55;
      if (isLeft || isRight) {
        for (const op of w.openings) {
          const pA = pointAtWallOffset(w, op.offset);
          const pB = pointAtWallOffset(w, op.offset + op.width);
          if (isLeft) leftStops.push(pA.z, pB.z);
          if (isRight) rightStops.push(pA.z, pB.z);
        }
      }
    }
  }

  const xBays = grid.xLines.length >= 2 ? [minX, ...grid.xLines.map((g) => g.coord), maxX] : [];
  const zBays = grid.zLines.length >= 2 ? [minZ, ...grid.zLines.map((g) => g.coord), maxZ] : [];

  // Pack tiers tightly outward from the true visual outer bounds (clearing curved bays cleanly)
  const emitHorizSide = (side: 'top' | 'bottom', stops: number[]) => {
    const sign = side === 'top' ? -1 : 1;
    const anchorZ = side === 'top' ? outMinZ : outMaxZ;
    let slot = 0;
    if (stops.length > 2) {
      pushHorizChain(stops, anchorZ + sign * (baseOff + slot * tierGap), 1, side);
      slot++;
    }
    if (xBays.length >= 2) {
      pushHorizChain(xBays, anchorZ + sign * (baseOff + slot * tierGap), 2, side);
      slot++;
    }
    pushHorizChain([minX, maxX], anchorZ + sign * (baseOff + slot * tierGap), 3, side);
  };

  const emitVertSide = (side: 'left' | 'right', stops: number[]) => {
    const sign = side === 'left' ? -1 : 1;
    const anchorX = side === 'left' ? outMinX : outMaxX;
    let slot = 0;
    if (stops.length > 2) {
      pushVertChain(stops, anchorX + sign * (baseOff + slot * tierGap), 1, side);
      slot++;
    }
    if (zBays.length >= 2) {
      pushVertChain(zBays, anchorX + sign * (baseOff + slot * tierGap), 2, side);
      slot++;
    }
    pushVertChain([minZ, maxZ], anchorX + sign * (baseOff + slot * tierGap), 3, side);
  };

  emitHorizSide('top', topStops);
  emitHorizSide('bottom', bottomStops);
  emitVertSide('left', leftStops);
  emitVertSide('right', rightStops);

  return segments;
}

export interface ScheduleTagAnchor {
  id: string;
  tag: string; // D1, D2, W1, W2, C1...
  category: 'door' | 'window' | 'column';
  x: number;
  z: number;
}

export interface ScheduleSummaryRow {
  tag: string;
  category: 'door' | 'window' | 'column';
  description: string;
  sizeLabel: string;
  count: number;
}

/** Deterministically builds D1/W1/C1 blueprint tags (oriented inward so they never collide with exterior chains) */
export function computeScheduleData(
  story: Story,
  unit: 'imperial' | 'metric'
): { tags: ScheduleTagAnchor[]; rows: ScheduleSummaryRow[] } {
  const tags: ScheduleTagAnchor[] = [];
  const doorSigToTag = new Map<string, { tag: string; row: ScheduleSummaryRow }>();
  const winSigToTag = new Map<string, { tag: string; row: ScheduleSummaryRow }>();
  const colSigToTag = new Map<string, { tag: string; row: ScheduleSummaryRow }>();

  const env = computeStoryEnvelope(story, 'centerline');
  const envCx = env.valid ? (env.ref.minX + env.ref.maxX) * 0.5 : 0;
  const envCz = env.valid ? (env.ref.minZ + env.ref.maxZ) * 0.5 : 0;

  let dIdx = 1;
  let wIdx = 1;
  let cIdx = 1;

  for (const wall of story.walls) {
    for (const op of wall.openings) {
      const isWin = op.kind.startsWith('window');
      const isArch = op.kind === 'arch-opening';
      if (isArch) continue;

      const sig = `${op.kind}|${Math.round(op.width * 100)}|${Math.round(op.height * 100)}`;
      const map = isWin ? winSigToTag : doorSigToTag;
      let entry = map.get(sig);
      if (!entry) {
        const tag = isWin ? `W${wIdx++}` : `D${dIdx++}`;
        const descMap: Record<string, string> = {
          'door-single': 'Single Hinged Door',
          'door-double': 'Double Main Door',
          'door-sliding': 'Sliding Glass Door',
          'shutter-shop': 'Rolling Shutter',
          'window-casement': 'Casement Window',
          'window-picture': 'Fixed Picture Window',
        };
        entry = {
          tag,
          row: {
            tag,
            category: isWin ? 'window' : 'door',
            description: descMap[op.kind] ?? op.kind,
            sizeLabel: `${formatLength(op.width, unit)} × ${formatLength(op.height, unit)}`,
            count: 0,
          },
        };
        map.set(sig, entry);
      }
      entry.row.count += 1;

      const mid = pointAtWallOffset(wall, op.offset + op.width * 0.5);
      const sideOffset = wall.thickness * 0.5 + (isWin ? 0.42 : 0.44);

      // Always keep perimeter window & door tags INSIDE the building envelope so they never collide with exterior chains
      const toCenterDot = (envCx - mid.x) * mid.nx + (envCz - mid.z) * mid.nz;
      const inwardDir = toCenterDot >= 0 ? 1 : -1;

      const isPerimeter =
        env.valid &&
        (Math.abs(mid.x - env.ref.minX) < 0.55 ||
          Math.abs(mid.x - env.ref.maxX) < 0.55 ||
          Math.abs(mid.z - env.ref.minZ) < 0.55 ||
          Math.abs(mid.z - env.ref.maxZ) < 0.55);

      const dir = isWin || isPerimeter ? inwardDir : -op.swing;
      tags.push({
        id: op.id,
        tag: entry.tag,
        category: isWin ? 'window' : 'door',
        x: mid.x + mid.nx * dir * sideOffset,
        z: mid.z + mid.nz * dir * sideOffset,
      });
    }
  }

  for (const p of story.pillars) {
    const sig = `${p.shape}|${Math.round(p.width * 100)}|${Math.round(p.depth * 100)}`;
    let entry = colSigToTag.get(sig);
    if (!entry) {
      const tag = `C${cIdx++}`;
      entry = {
        tag,
        row: {
          tag,
          category: 'column',
          description: p.shape === 'circular' ? 'Circular RCC Col' : 'RCC Column',
          sizeLabel: `${formatLength(p.width, unit)} × ${formatLength(p.depth, unit)}`,
          count: 0,
        },
      };
      colSigToTag.set(sig, entry);
    }
    entry.row.count += 1;
    // Tuck column tag diagonally inward toward plan center so outer corners stay clear of exterior chains
    const signX = env.valid && p.x > envCx ? -1 : 1;
    const signZ = env.valid && p.z > envCz ? -1 : 1;
    tags.push({
      id: p.id,
      tag: p.label || entry.tag,
      category: 'column',
      x: p.x + signX * (p.width * 0.5 + 0.34),
      z: p.z + signZ * (p.depth * 0.5 + 0.24),
    });
  }

  const rows: ScheduleSummaryRow[] = [
    ...Array.from(doorSigToTag.values()).map((v) => v.row),
    ...Array.from(winSigToTag.values()).map((v) => v.row),
    ...Array.from(colSigToTag.values()).map((v) => v.row),
  ];

  return { tags, rows };
}

// ============================================================================
// 6. MULTI-SELECTION MARQUEE, ALIGN, DISTRIBUTE & MIRROR TRANSFORMS
// ============================================================================

export interface Bounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
}

export function getTargetBounds(story: Story, target: SelectionTarget): Bounds2D | null {
  if (target.type === 'wall') {
    const w = story.walls.find((x) => x.id === target.id);
    if (!w) return null;
    const minX = Math.min(w.x1, w.x2);
    const maxX = Math.max(w.x1, w.x2);
    const minZ = Math.min(w.z1, w.z2);
    const maxZ = Math.max(w.z1, w.z2);
    return { minX, maxX, minZ, maxZ, cx: (minX + maxX) * 0.5, cz: (minZ + maxZ) * 0.5 };
  }
  if (target.type === 'pillar') {
    const p = story.pillars.find((x) => x.id === target.id);
    if (!p) return null;
    return {
      minX: p.x - p.width * 0.5,
      maxX: p.x + p.width * 0.5,
      minZ: p.z - p.depth * 0.5,
      maxZ: p.z + p.depth * 0.5,
      cx: p.x,
      cz: p.z,
    };
  }
  if (target.type === 'beam') {
    const b = story.beams.find((x) => x.id === target.id);
    if (!b) return null;
    const minX = Math.min(b.x1, b.x2);
    const maxX = Math.max(b.x1, b.x2);
    const minZ = Math.min(b.z1, b.z2);
    const maxZ = Math.max(b.z1, b.z2);
    return { minX, maxX, minZ, maxZ, cx: (minX + maxX) * 0.5, cz: (minZ + maxZ) * 0.5 };
  }
  if (target.type === 'slab') {
    const s = story.slabs.find((x) => x.id === target.id);
    if (!s) return null;
    return {
      minX: s.x,
      maxX: s.x + s.width,
      minZ: s.z,
      maxZ: s.z + s.depth,
      cx: s.x + s.width * 0.5,
      cz: s.z + s.depth * 0.5,
    };
  }
  if (target.type === 'room') {
    const r = story.rooms.find((x) => x.id === target.id);
    if (!r) return null;
    return {
      minX: r.x,
      maxX: r.x + r.width,
      minZ: r.z,
      maxZ: r.z + r.depth,
      cx: r.x + r.width * 0.5,
      cz: r.z + r.depth * 0.5,
    };
  }
  if (target.type === 'asset') {
    const a = story.assets.find((x) => x.id === target.id);
    if (!a) return null;
    return {
      minX: a.x - a.width * 0.5,
      maxX: a.x + a.width * 0.5,
      minZ: a.z - a.depth * 0.5,
      maxZ: a.z + a.depth * 0.5,
      cx: a.x,
      cz: a.z,
    };
  }
  if (target.type === 'annotation') {
    const an = (story.annotations ?? []).find((x) => x.id === target.id);
    if (!an) return null;
    const minX = Math.min(an.x1, an.x2 ?? an.x1);
    const maxX = Math.max(an.x1, an.x2 ?? an.x1);
    const minZ = Math.min(an.z1, an.z2 ?? an.z1);
    const maxZ = Math.max(an.z1, an.z2 ?? an.z1);
    return { minX, maxX, minZ, maxZ, cx: (minX + maxX) * 0.5, cz: (minZ + maxZ) * 0.5 };
  }
  return null;
}

/** Query all selectable items inside (window) or intersecting (crossing) a world-space marquee rectangle */
export function selectElementsInMarquee(
  story: Story,
  rect: { minX: number; maxX: number; minZ: number; maxZ: number },
  crossing: boolean,
  layers: BlueprintSettings['layers']
): SelectionTarget[] {
  const hits: SelectionTarget[] = [];
  const matches = (b: Bounds2D): boolean => {
    if (crossing) {
      return !(b.maxX < rect.minX || b.minX > rect.maxX || b.maxZ < rect.minZ || b.minZ > rect.maxZ);
    }
    return b.minX >= rect.minX && b.maxX <= rect.maxX && b.minZ >= rect.minZ && b.maxZ <= rect.maxZ;
  };

  if (layers.walls) {
    for (const w of story.walls) {
      const t: SelectionTarget = { type: 'wall', id: w.id, storyIndex: story.index };
      const b = getTargetBounds(story, t);
      if (b && matches(b)) hits.push(t);
    }
  }
  if (layers.structure) {
    for (const p of story.pillars) {
      const t: SelectionTarget = { type: 'pillar', id: p.id, storyIndex: story.index };
      const b = getTargetBounds(story, t);
      if (b && matches(b)) hits.push(t);
    }
    for (const bm of story.beams) {
      const t: SelectionTarget = { type: 'beam', id: bm.id, storyIndex: story.index };
      const b = getTargetBounds(story, t);
      if (b && matches(b)) hits.push(t);
    }
  }
  if (layers.furniture) {
    for (const a of story.assets) {
      const t: SelectionTarget = { type: 'asset', id: a.id, storyIndex: story.index };
      const b = getTargetBounds(story, t);
      if (b && matches(b)) hits.push(t);
    }
  }
  if (layers.annotations) {
    for (const an of story.annotations ?? []) {
      const t: SelectionTarget = { type: 'annotation', id: an.id, storyIndex: story.index };
      const b = getTargetBounds(story, t);
      if (b && matches(b)) hits.push(t);
    }
  }
  return hits;
}

export function translateTargetsInStory(
  story: Story,
  targets: SelectionTarget[],
  dx: number,
  dz: number
): Story {
  const ids = new Map<string, Set<string>>();
  for (const t of targets) {
    if (!ids.has(t.type)) ids.set(t.type, new Set());
    ids.get(t.type)!.add(t.id);
  }
  const has = (type: string, id: string) => ids.get(type)?.has(id) ?? false;
  const r = (v: number) => Number(v.toFixed(4));

  return {
    ...story,
    walls: story.walls.map((w) =>
      !w.locked && has('wall', w.id)
        ? { ...w, x1: r(w.x1 + dx), z1: r(w.z1 + dz), x2: r(w.x2 + dx), z2: r(w.z2 + dz) }
        : w
    ),
    pillars: story.pillars.map((p) =>
      !p.locked && has('pillar', p.id) ? { ...p, x: r(p.x + dx), z: r(p.z + dz) } : p
    ),
    beams: story.beams.map((b) =>
      !b.locked && has('beam', b.id)
        ? { ...b, x1: r(b.x1 + dx), z1: r(b.z1 + dz), x2: r(b.x2 + dx), z2: r(b.z2 + dz) }
        : b
    ),
    slabs: story.slabs.map((sl) =>
      !sl.locked && has('slab', sl.id) ? { ...sl, x: r(sl.x + dx), z: r(sl.z + dz) } : sl
    ),
    rooms: story.rooms.map((rm) =>
      has('room', rm.id)
        ? {
            ...rm,
            x: r(rm.x + dx),
            z: r(rm.z + dz),
            polygon: rm.polygon?.map((pt) => ({ x: r(pt.x + dx), z: r(pt.z + dz) })),
          }
        : rm
    ),
    assets: story.assets.map((a) =>
      !a.locked && has('asset', a.id) ? { ...a, x: r(a.x + dx), z: r(a.z + dz) } : a
    ),
    annotations: (story.annotations ?? []).map((an) =>
      !an.locked && has('annotation', an.id)
        ? {
            ...an,
            x1: r(an.x1 + dx),
            z1: r(an.z1 + dz),
            x2: an.x2 !== undefined ? r(an.x2 + dx) : undefined,
            z2: an.z2 !== undefined ? r(an.z2 + dz) : undefined,
          }
        : an
    ),
  };
}

export type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-z' | 'bottom';

export function alignTargetsInStory(
  story: Story,
  targets: SelectionTarget[],
  mode: AlignMode
): Story {
  const entries = targets
    .map((t) => ({ target: t, bounds: getTargetBounds(story, t) }))
    .filter((e): e is { target: SelectionTarget; bounds: Bounds2D } => e.bounds !== null);
  if (entries.length < 2) return story;

  const minX = Math.min(...entries.map((e) => e.bounds.minX));
  const maxX = Math.max(...entries.map((e) => e.bounds.maxX));
  const minZ = Math.min(...entries.map((e) => e.bounds.minZ));
  const maxZ = Math.max(...entries.map((e) => e.bounds.maxZ));
  const midX = (minX + maxX) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;

  let next = story;
  for (const { target, bounds } of entries) {
    let dx = 0;
    let dz = 0;
    if (mode === 'left') dx = minX - bounds.minX;
    else if (mode === 'center-x') dx = midX - bounds.cx;
    else if (mode === 'right') dx = maxX - bounds.maxX;
    else if (mode === 'top') dz = minZ - bounds.minZ;
    else if (mode === 'center-z') dz = midZ - bounds.cz;
    else if (mode === 'bottom') dz = maxZ - bounds.maxZ;
    if (Math.abs(dx) > 1e-4 || Math.abs(dz) > 1e-4) {
      next = translateTargetsInStory(next, [target], dx, dz);
    }
  }
  return next;
}

export function distributeTargetsInStory(
  story: Story,
  targets: SelectionTarget[],
  axis: 'x' | 'z'
): Story {
  const entries = targets
    .map((t) => ({ target: t, bounds: getTargetBounds(story, t) }))
    .filter((e): e is { target: SelectionTarget; bounds: Bounds2D } => e.bounds !== null);
  if (entries.length < 3) return story;

  entries.sort((a, b) => (axis === 'x' ? a.bounds.cx - b.bounds.cx : a.bounds.cz - b.bounds.cz));
  const first = axis === 'x' ? entries[0].bounds.cx : entries[0].bounds.cz;
  const last =
    axis === 'x'
      ? entries[entries.length - 1].bounds.cx
      : entries[entries.length - 1].bounds.cz;
  const step = (last - first) / (entries.length - 1);

  let next = story;
  for (let i = 1; i < entries.length - 1; i++) {
    const desired = first + step * i;
    const curr = axis === 'x' ? entries[i].bounds.cx : entries[i].bounds.cz;
    const delta = desired - curr;
    if (Math.abs(delta) > 1e-4) {
      next = translateTargetsInStory(
        next,
        [entries[i].target],
        axis === 'x' ? delta : 0,
        axis === 'z' ? delta : 0
      );
    }
  }
  return next;
}

/** Mirror selected elements horizontally or vertically around their combined center (optional clone for twin units) */
export function mirrorTargetsInStory(
  story: Story,
  targets: SelectionTarget[],
  axis: 'horizontal' | 'vertical',
  clone = false
): { story: Story; nextTargets: SelectionTarget[] } {
  const entries = targets
    .map((t) => ({ target: t, bounds: getTargetBounds(story, t) }))
    .filter((e): e is { target: SelectionTarget; bounds: Bounds2D } => e.bounds !== null);
  if (entries.length === 0) return { story, nextTargets: targets };

  const minX = Math.min(...entries.map((e) => e.bounds.minX));
  const maxX = Math.max(...entries.map((e) => e.bounds.maxX));
  const minZ = Math.min(...entries.map((e) => e.bounds.minZ));
  const maxZ = Math.max(...entries.map((e) => e.bounds.maxZ));
  const cx = clone && axis === 'horizontal' ? maxX : (minX + maxX) * 0.5;
  const cz = clone && axis === 'vertical' ? maxZ : (minZ + maxZ) * 0.5;

  const mx = (x: number) => Number((axis === 'horizontal' ? 2 * cx - x : x).toFixed(4));
  const mz = (z: number) => Number((axis === 'vertical' ? 2 * cz - z : z).toFixed(4));

  const targetIds = new Map<string, Set<string>>();
  for (const t of targets) {
    if (!targetIds.has(t.type)) targetIds.set(t.type, new Set());
    targetIds.get(t.type)!.add(t.id);
  }
  const has = (type: string, id: string) => targetIds.get(type)?.has(id) ?? false;

  const nextTargets: SelectionTarget[] = [];

  const mirrorWall = (w: Wall): Wall => {
    const newId = clone ? makeId('w') : w.id;
    nextTargets.push({ type: 'wall', id: newId, storyIndex: story.index });
    return {
      ...w,
      id: newId,
      x1: mx(w.x1),
      z1: mz(w.z1),
      x2: mx(w.x2),
      z2: mz(w.z2),
      curveOffset: w.curveOffset ? -w.curveOffset : 0,
      openings: w.openings.map((o) => ({
        ...o,
        id: clone ? makeId('op') : o.id,
        swing: (o.swing === 1 ? -1 : 1) as 1 | -1,
      })),
      locked: false,
    };
  };

  const mirrorPillar = (p: Pillar): Pillar => {
    const newId = clone ? makeId('col') : p.id;
    nextTargets.push({ type: 'pillar', id: newId, storyIndex: story.index });
    return {
      ...p,
      id: newId,
      label: clone ? `C${story.pillars.length + nextTargets.length}` : p.label,
      x: mx(p.x),
      z: mz(p.z),
      rotation: -p.rotation,
      locked: false,
    };
  };

  const mirrorBeam = (b: Beam): Beam => {
    const newId = clone ? makeId('bm') : b.id;
    nextTargets.push({ type: 'beam', id: newId, storyIndex: story.index });
    return {
      ...b,
      id: newId,
      x1: mx(b.x1),
      z1: mz(b.z1),
      x2: mx(b.x2),
      z2: mz(b.z2),
      locked: false,
    };
  };

  const mirrorSlab = (s: Slab): Slab => {
    const newId = clone ? makeId('sl') : s.id;
    nextTargets.push({ type: 'slab', id: newId, storyIndex: story.index });
    const x0 = Math.min(mx(s.x), mx(s.x + s.width));
    const z0 = Math.min(mz(s.z), mz(s.z + s.depth));
    return {
      ...s,
      id: newId,
      x: x0,
      z: z0,
      cutouts: (s.cutouts ?? []).map((c) => ({
        ...c,
        id: clone ? makeId('cut') : c.id,
        x: Math.min(mx(c.x), mx(c.x + c.width)),
        z: Math.min(mz(c.z), mz(c.z + c.depth)),
      })),
      locked: false,
    };
  };

  const mirrorAsset = (a: PlacedAsset): PlacedAsset => {
    const newId = clone ? makeId('ast') : a.id;
    nextTargets.push({ type: 'asset', id: newId, storyIndex: story.index });
    return {
      ...a,
      id: newId,
      x: mx(a.x),
      z: mz(a.z),
      rotation: axis === 'horizontal' ? -a.rotation : Math.PI - a.rotation,
      flipX: !a.flipX,
      locked: false,
    };
  };

  const mirrorAnnotation = (an: BlueprintAnnotation): BlueprintAnnotation => {
    const newId = clone ? makeId('ann') : an.id;
    nextTargets.push({ type: 'annotation', id: newId, storyIndex: story.index });
    return {
      ...an,
      id: newId,
      x1: mx(an.x1),
      z1: mz(an.z1),
      x2: an.x2 !== undefined ? mx(an.x2) : undefined,
      z2: an.z2 !== undefined ? mz(an.z2) : undefined,
      locked: false,
    };
  };

  const nextStory: Story = {
    ...story,
    walls: clone
      ? [...story.walls, ...story.walls.filter((w) => has('wall', w.id)).map(mirrorWall)]
      : story.walls.map((w) => (!w.locked && has('wall', w.id) ? mirrorWall(w) : w)),
    pillars: clone
      ? [...story.pillars, ...story.pillars.filter((p) => has('pillar', p.id)).map(mirrorPillar)]
      : story.pillars.map((p) => (!p.locked && has('pillar', p.id) ? mirrorPillar(p) : p)),
    beams: clone
      ? [...story.beams, ...story.beams.filter((b) => has('beam', b.id)).map(mirrorBeam)]
      : story.beams.map((b) => (!b.locked && has('beam', b.id) ? mirrorBeam(b) : b)),
    slabs: clone
      ? [...story.slabs, ...story.slabs.filter((s) => has('slab', s.id)).map(mirrorSlab)]
      : story.slabs.map((s) => (!s.locked && has('slab', s.id) ? mirrorSlab(s) : s)),
    assets: clone
      ? [...story.assets, ...story.assets.filter((a) => has('asset', a.id)).map(mirrorAsset)]
      : story.assets.map((a) => (!a.locked && has('asset', a.id) ? mirrorAsset(a) : a)),
    annotations: clone
      ? [
          ...(story.annotations ?? []),
          ...(story.annotations ?? []).filter((an) => has('annotation', an.id)).map(mirrorAnnotation),
        ]
      : (story.annotations ?? []).map((an) =>
          !an.locked && has('annotation', an.id) ? mirrorAnnotation(an) : an
        ),
  };

  return { story: nextStory, nextTargets };
}

export function deleteTargetsInStory(story: Story, targets: SelectionTarget[]): Story {
  const byType = new Map<string, Set<string>>();
  for (const t of targets) {
    if (!byType.has(t.type)) byType.set(t.type, new Set());
    byType.get(t.type)!.add(t.id);
  }
  const has = (type: string, id: string) => byType.get(type)?.has(id) ?? false;

  return {
    ...story,
    walls: story.walls
      .filter((w) => !has('wall', w.id))
      .map((w) => ({
        ...w,
        openings: w.openings.filter((o) => !has('opening', o.id)),
      })),
    pillars: story.pillars.filter((p) => !has('pillar', p.id)),
    beams: story.beams.filter((b) => !has('beam', b.id)),
    slabs: story.slabs
      .filter((s) => !has('slab', s.id))
      .map((s) => ({
        ...s,
        cutouts: (s.cutouts ?? []).filter((c) => !has('cutout', c.id)),
      })),
    rooms: story.rooms.filter((r) => !has('room', r.id)),
    assets: story.assets.filter((a) => !has('asset', a.id)),
    annotations: (story.annotations ?? []).filter((an) => !has('annotation', an.id)),
  };
}
