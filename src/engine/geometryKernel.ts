import {
  BnbcConfig,
  BuildingProject,
  DEFAULT_BNBC_CONFIG,
  LandContext,
  LandPlot,
  LandSetbacks,
  Pillar,
  PlacedAsset,
  RoomZone,
  Slab,
  Story,
  StructuralGridLines,
  Vec2,
  Wall,
  WallOpening,
} from '../types/building';
import { SQFT_PER_KATHA, SQFT_PER_SHOTOK, SQFT_PER_SQM } from './units';

/** Canonical vertical elevation constants (meters) — single source of truth across 3D & Physics */
export const PLINTH_HEIGHT_M = 0.45; // 18" plinth above courtyard/ground (monsoon flood protection)
export const ROAD_CURB_DROP_M = 0.15; // Road asphalt lies 15cm below plot ground apron
export const GROUND_LEVEL_Y = -PLINTH_HEIGHT_M; // -0.45m relative to Ground FFL = 0.000m
export const ROAD_LEVEL_Y = GROUND_LEVEL_Y - ROAD_CURB_DROP_M; // -0.60m

/** Exterior fascia micro-offsets so column > beam > masonry plaster NEVER share coplanar faces (zero Z-fighting) */
export const COLUMN_PROUD_EPS = 0.006;
export const BEAM_PROUD_EPS = 0.003;
export const SLAB_INSET_EPS = 0.004;

export interface WallSamplePoint {
  x: number;
  z: number;
  tx: number; // unit tangent X
  tz: number; // unit tangent Z
  nx: number; // unit left normal X (-tz)
  nz: number; // unit left normal Z (+tx)
  angle: number; // atan2(tz, tx)
  dist: number; // cumulative arc distance from start
}

/** Whether a wall is curved (non-negligible perpendicular midpoint bulge) */
export function isCurvedWall(wall: Wall): boolean {
  return typeof wall.curveOffset === 'number' && Math.abs(wall.curveOffset) > 0.015;
}

/** Quadratic Bezier control point for a curved wall with perpendicular midpoint offset */
export function getWallControlPoint(wall: Wall): Vec2 {
  const mx = (wall.x1 + wall.x2) * 0.5;
  const mz = (wall.z1 + wall.z2) * 0.5;
  const dx = wall.x2 - wall.x1;
  const dz = wall.z2 - wall.z1;
  const chord = Math.hypot(dx, dz);
  if (chord < 1e-4 || !isCurvedWall(wall)) return { x: mx, z: mz };
  // For a quadratic Bezier passing through midpoint bulge b at t=0.5, control offset = 2*b
  const nx = -dz / chord;
  const nz = dx / chord;
  const b = wall.curveOffset ?? 0;
  return {
    x: mx + nx * (2 * b),
    z: mz + nz * (2 * b),
  };
}

/** Sample centerline points along straight or curved wall */
export function sampleWallPolyline(wall: Wall, curvedSegments = 20): WallSamplePoint[] {
  const dx = wall.x2 - wall.x1;
  const dz = wall.z2 - wall.z1;
  const chord = Math.hypot(dx, dz);
  if (chord < 1e-5) {
    return [{ x: wall.x1, z: wall.z1, tx: 1, tz: 0, nx: 0, nz: 1, angle: 0, dist: 0 }];
  }

  if (!isCurvedWall(wall)) {
    const tx = dx / chord;
    const tz = dz / chord;
    const nx = -tz;
    const nz = tx;
    const angle = Math.atan2(tz, tx);
    return [
      { x: wall.x1, z: wall.z1, tx, tz, nx, nz, angle, dist: 0 },
      { x: wall.x2, z: wall.z2, tx, tz, nx, nz, angle, dist: chord },
    ];
  }

  const cp = getWallControlPoint(wall);
  const segs = Math.max(8, curvedSegments);
  const pts: WallSamplePoint[] = [];
  let cum = 0;

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const omt = 1 - t;
    const x = omt * omt * wall.x1 + 2 * omt * t * cp.x + t * t * wall.x2;
    const z = omt * omt * wall.z1 + 2 * omt * t * cp.z + t * t * wall.z2;
    const dtx = 2 * omt * (cp.x - wall.x1) + 2 * t * (wall.x2 - cp.x);
    const dtz = 2 * omt * (cp.z - wall.z1) + 2 * t * (wall.z2 - cp.z);
    const tLen = Math.hypot(dtx, dtz) || 1;
    const tx = dtx / tLen;
    const tz = dtz / tLen;
    if (i > 0) {
      cum += Math.hypot(x - pts[i - 1].x, z - pts[i - 1].z);
    }
    pts.push({
      x,
      z,
      tx,
      tz,
      nx: -tz,
      nz: tx,
      angle: Math.atan2(tz, tx),
      dist: cum,
    });
  }
  return pts;
}

/** Exact length of a straight or curved wall in meters */
export function getWallArcLength(wall: Wall): number {
  if (!isCurvedWall(wall)) {
    return Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
  }
  const pts = sampleWallPolyline(wall, 24);
  return pts[pts.length - 1]?.dist ?? 0;
}

/** Interpolate exact position, tangent, and normal at arc distance along any wall */
export function pointAtWallOffset(wall: Wall, offsetM: number): WallSamplePoint {
  const pts = sampleWallPolyline(wall, isCurvedWall(wall) ? 24 : 1);
  const total = pts[pts.length - 1]?.dist ?? 0;
  const clamped = Math.max(0, Math.min(total, offsetM));

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (clamped <= b.dist + 1e-6 || i === pts.length - 2) {
      const span = Math.max(1e-6, b.dist - a.dist);
      const frac = Math.max(0, Math.min(1, (clamped - a.dist) / span));
      const x = a.x + (b.x - a.x) * frac;
      const z = a.z + (b.z - a.z) * frac;
      const tx = a.tx + (b.tx - a.tx) * frac;
      const tz = a.tz + (b.tz - a.tz) * frac;
      const tLen = Math.hypot(tx, tz) || 1;
      const utx = tx / tLen;
      const utz = tz / tLen;
      return {
        x,
        z,
        tx: utx,
        tz: utz,
        nx: -utz,
        nz: utx,
        angle: Math.atan2(utz, utx),
        dist: clamped,
      };
    }
  }
  return pts[0];
}

/** Exact distance from point (x, z) to a straight or curved wall centerline, returning perpendicular distance and arc offset */
export function pointToWallDist(
  x: number,
  z: number,
  wall: Wall
): { dist: number; alongDist: number; closest: Vec2 } {
  const pts = sampleWallPolyline(wall, isCurvedWall(wall) ? 20 : 1);
  let bestDist = Infinity;
  let bestAlong = 0;
  let bestPt: Vec2 = { x: pts[0].x, z: pts[0].z };
  let acc = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    const segLen = Math.sqrt(lenSq);
    const t =
      lenSq > 1e-8 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lenSq)) : 0;
    const cx = a.x + t * dx;
    const cz = a.z + t * dz;
    const d = Math.hypot(x - cx, z - cz);
    if (d < bestDist) {
      bestDist = d;
      bestAlong = acc + t * segLen;
      bestPt = { x: cx, z: cz };
    }
    acc += segLen;
  }

  return { dist: bestDist, alongDist: bestAlong, closest: bestPt };
}

/**
 * Compute seamless corner extensions for straight walls so L/T/X corners close cleanly
 * without notched gaps or protruding butts.
 * Returns extra start/end extension (in meters) along each wall's axis.
 */
export function computeWallCornerExtensions(
  walls: Wall[],
  pillars: Pillar[]
): Map<string, { extStart: number; extEnd: number }> {
  const map = new Map<string, { extStart: number; extEnd: number }>();
  const ENDPOINT_TOL = 0.08;

  for (const w of walls) {
    if (isCurvedWall(w)) {
      map.set(w.id, { extStart: 0, extEnd: 0 });
      continue;
    }

    const computeEndExt = (px: number, pz: number): number => {
      // If a column sits directly at this endpoint, stop cleanly at column center (clipped later by pillar)
      for (const p of pillars) {
        if (Math.hypot(p.x - px, p.z - pz) < Math.max(p.width, p.depth) * 0.55) {
          return 0;
        }
      }
      // Check if another wall meets this endpoint at an angle (L-corner)
      let maxOtherHalfT = 0;
      for (const o of walls) {
        if (o.id === w.id) continue;
        const hitsStart = Math.hypot(o.x1 - px, o.z1 - pz) < ENDPOINT_TOL;
        const hitsEnd = Math.hypot(o.x2 - px, o.z2 - pz) < ENDPOINT_TOL;
        if (hitsStart || hitsEnd) {
          // Only extend thicker or lexicographically earlier wall to prevent coplanar corner Z-fighting!
          const wPri = w.thickness * 1000 + (w.id < o.id ? 0.5 : 0);
          const oPri = o.thickness * 1000 + (o.id < w.id ? 0.5 : 0);
          if (wPri >= oPri) {
            maxOtherHalfT = Math.max(maxOtherHalfT, o.thickness * 0.5);
          } else {
            // Pull back slightly by 2mm from the dominant wall's inner face so zero coplanar overlap occurs
            return -(o.thickness * 0.5 - 0.002);
          }
        } else if (!isCurvedWall(o)) {
          // T-junction: endpoint lands on interior of another straight wall o
          const odx = o.x2 - o.x1;
          const odz = o.z2 - o.z1;
          const olenSq = odx * odx + odz * odz;
          if (olenSq > 1e-4) {
            const t = ((px - o.x1) * odx + (pz - o.z1) * odz) / olenSq;
            if (t > 0.02 && t < 0.98) {
              const projX = o.x1 + t * odx;
              const projZ = o.z1 + t * odz;
              if (Math.hypot(px - projX, pz - projZ) < o.thickness * 0.55 + 0.04) {
                // Stop cleanly against the face of wall o (no poke-through!)
                return -(o.thickness * 0.5 - 0.002);
              }
            }
          }
        }
      }
      return maxOtherHalfT;
    };

    map.set(w.id, {
      extStart: computeEndExt(w.x1, w.z1),
      extEnd: computeEndExt(w.x2, w.z2),
    });
  }
  return map;
}

/**
 * Given a straight wall segment [startOffset, endOffset] along the wall centerline,
 * subtract intervals occupied by intersecting concrete pillars so masonry never Z-fights
 * through column faces.
 */
export function subtractPillarIntervals(
  wall: Wall,
  baseStart: number,
  baseEnd: number,
  pillars: Pillar[]
): Array<[number, number]> {
  if (isCurvedWall(wall)) return [[baseStart, baseEnd]];
  const dx = wall.x2 - wall.x1;
  const dz = wall.z2 - wall.z1;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return [];
  const ux = dx / len;
  const uz = dz / len;
  const nx = -uz;
  const nz = ux;

  // Collect blocked intervals along the wall axis
  const blocked: Array<[number, number]> = [];
  for (const p of pillars) {
    const rx = p.x - wall.x1;
    const rz = p.z - wall.z1;
    const along = rx * ux + rz * uz;
    const perp = Math.abs(rx * nx + rz * nz);

    // Project pillar bounding box onto wall tangent & normal
    const cosR = Math.cos(p.rotation);
    const sinR = Math.sin(p.rotation);
    const halfAlong =
      Math.abs(ux * cosR + uz * sinR) * (p.width * 0.5) +
      Math.abs(-ux * sinR + uz * cosR) * (p.depth * 0.5);
    const halfPerp =
      Math.abs(nx * cosR + nz * sinR) * (p.width * 0.5) +
      Math.abs(-nx * sinR + nz * cosR) * (p.depth * 0.5);

    // Only clip if pillar genuinely overlaps wall cross-section
    if (perp < halfPerp + wall.thickness * 0.42 && along + halfAlong > baseStart && along - halfAlong < baseEnd) {
      // Leave 2mm tuck inside pillar face so zero gap opens even at grazing angles
      const clipHalf = Math.max(0.02, halfAlong - 0.002);
      blocked.push([along - clipHalf, along + clipHalf]);
    }
  }

  if (blocked.length === 0) return [[baseStart, baseEnd]];
  blocked.sort((a, b) => a[0] - b[0]);

  const segments: Array<[number, number]> = [];
  let cursor = baseStart;
  for (const [b0, b1] of blocked) {
    if (b0 > cursor + 0.015) {
      segments.push([cursor, Math.min(baseEnd, b0)]);
    }
    cursor = Math.max(cursor, b1);
  }
  if (baseEnd > cursor + 0.015) {
    segments.push([cursor, baseEnd]);
  }
  return segments;
}

/** AutoCAD-style wall intersection splitter when adding a new straight wall */
export function splitWallsAtIntersection(existingWalls: Wall[], newWall: Wall): Wall[] {
  if (isCurvedWall(newWall)) {
    return [...existingWalls, newWall];
  }
  const TOL = 0.05;
  const newSplitTs: number[] = [0, 1];
  const updatedExisting: Wall[] = [];

  const segIntersect = (
    ax1: number, az1: number, ax2: number, az2: number,
    bx1: number, bz1: number, bx2: number, bz2: number
  ): { ta: number; tb: number; x: number; z: number } | null => {
    const rX = ax2 - ax1;
    const rZ = az2 - az1;
    const sX = bx2 - bx1;
    const sZ = bz2 - bz1;
    const denom = rX * sZ - rZ * sX;
    if (Math.abs(denom) < 1e-6) return null;
    const qpx = bx1 - ax1;
    const qpz = bz1 - az1;
    const ta = (qpx * sZ - qpz * sX) / denom;
    const tb = (qpx * rZ - qpz * rX) / denom;
    if (ta >= -0.001 && ta <= 1.001 && tb >= -0.001 && tb <= 1.001) {
      return {
        ta: Math.max(0, Math.min(1, ta)),
        tb: Math.max(0, Math.min(1, tb)),
        x: ax1 + ta * rX,
        z: az1 + ta * rZ,
      };
    }
    return null;
  };

  for (const w of existingWalls) {
    if (isCurvedWall(w)) {
      updatedExisting.push(w);
      continue;
    }
    const hit = segIntersect(w.x1, w.z1, w.x2, w.z2, newWall.x1, newWall.z1, newWall.x2, newWall.z2);
    if (!hit) {
      updatedExisting.push(w);
      continue;
    }
    const wLen = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
    const nLen = Math.hypot(newWall.x2 - newWall.x1, newWall.z2 - newWall.z1);
    const splitDistW = hit.ta * wLen;
    const splitDistN = hit.tb * nLen;

    if (splitDistN > TOL && nLen - splitDistN > TOL) {
      newSplitTs.push(hit.tb);
    }

    // Split existing wall only if hit is strictly interior AND doesn't slice through an opening
    const hitsOpening = w.openings.some(
      (op) => splitDistW >= op.offset - 0.05 && splitDistW <= op.offset + op.width + 0.05
    );
    if (splitDistW > TOL && wLen - splitDistW > TOL && !hitsOpening) {
      const ops1 = w.openings.filter((op) => op.offset + op.width <= splitDistW + 0.02);
      const ops2 = w.openings
        .filter((op) => op.offset >= splitDistW - 0.02)
        .map((op) => ({ ...op, offset: Math.max(0.05, op.offset - splitDistW) }));
      updatedExisting.push(
        { ...w, x2: hit.x, z2: hit.z, openings: ops1 },
        { ...w, id: `${w.id}-s${Math.round(hit.ta * 100)}`, x1: hit.x, z1: hit.z, openings: ops2 }
      );
    } else {
      updatedExisting.push(w);
    }
  }

  newSplitTs.sort((a, b) => a - b);
  const dedupTs: number[] = [newSplitTs[0]];
  for (let i = 1; i < newSplitTs.length; i++) {
    if (newSplitTs[i] - dedupTs[dedupTs.length - 1] > 0.02) {
      dedupTs.push(newSplitTs[i]);
    }
  }

  const newParts: Wall[] = [];
  for (let i = 0; i < dedupTs.length - 1; i++) {
    const t0 = dedupTs[i];
    const t1 = dedupTs[i + 1];
    const x1 = newWall.x1 + (newWall.x2 - newWall.x1) * t0;
    const z1 = newWall.z1 + (newWall.z2 - newWall.z1) * t0;
    const x2 = newWall.x1 + (newWall.x2 - newWall.x1) * t1;
    const z2 = newWall.z1 + (newWall.z2 - newWall.z1) * t1;
    if (Math.hypot(x2 - x1, z2 - z1) >= 0.15) {
      newParts.push({
        ...newWall,
        id: i === 0 ? newWall.id : `${newWall.id}-p${i}`,
        x1,
        z1,
        x2,
        z2,
        openings: i === 0 ? newWall.openings : [],
      });
    }
  }

  return [...updatedExisting, ...(newParts.length > 0 ? newParts : [newWall])];
}

/**
 * Extract AutoCAD / ETABS structural column gridlines (A, B, C... on X; 1, 2, 3... on Z)
 * by clustering column centers within 0.25m tolerance.
 */
export function computeStructuralGrid(story: Story): StructuralGridLines {
  const cluster = (values: number[], tol = 0.25): number[] => {
    if (values.length === 0) return [];
    const sorted = [...values].sort((a, b) => a - b);
    const groups: number[][] = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
      const last = groups[groups.length - 1];
      const mean = last.reduce((s, v) => s + v, 0) / last.length;
      if (Math.abs(sorted[i] - mean) <= tol) {
        last.push(sorted[i]);
      } else {
        groups.push([sorted[i]]);
      }
    }
    return groups.map((g) => Number((g.reduce((s, v) => s + v, 0) / g.length).toFixed(4)));
  };

  const xs = cluster(story.pillars.map((p) => p.x));
  const zs = cluster(story.pillars.map((p) => p.z));

  return {
    xLines: xs.map((coord, i) => ({
      label: String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : ''),
      coord,
    })),
    zLines: zs.map((coord, i) => ({
      label: String(i + 1),
      coord,
    })),
  };
}

/**
 * Automatic enclosed room polygon detector using planar half-edge face tracing.
 * Detects minimal closed cycles formed by walls and preserves existing room names via centroid matching.
 */
export function detectEnclosedRooms(story: Story): RoomZone[] {
  if (story.walls.length < 3) return story.rooms;

  const SNAP = 0.14;
  interface Node {
    id: number;
    x: number;
    z: number;
  }
  const nodes: Node[] = [];
  const getOrAddNode = (x: number, z: number): number => {
    for (const n of nodes) {
      if (Math.hypot(n.x - x, n.z - z) < SNAP) return n.id;
    }
    const id = nodes.length;
    nodes.push({ id, x, z });
    return id;
  };

  // Build undirected edges from wall polylines (curved walls become 4-segment chords for polygon tracing)
  const edgeSet = new Set<string>();
  const adj = new Map<number, number[]>();
  const addEdge = (u: number, v: number) => {
    if (u === v) return;
    const key = u < v ? `${u}-${v}` : `${v}-${u}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    adj.get(u)!.push(v);
    adj.get(v)!.push(u);
  };

  for (const w of story.walls) {
    const pts = sampleWallPolyline(w, isCurvedWall(w) ? 4 : 1);
    for (let i = 0; i < pts.length - 1; i++) {
      const u = getOrAddNode(pts[i].x, pts[i].z);
      const v = getOrAddNode(pts[i + 1].x, pts[i + 1].z);
      addEdge(u, v);
    }
  }

  // Sort outgoing neighbors by angle around each node
  for (const [u, nbrs] of adj.entries()) {
    const nu = nodes[u];
    nbrs.sort((a, b) => {
      const angA = Math.atan2(nodes[a].z - nu.z, nodes[a].x - nu.x);
      const angB = Math.atan2(nodes[b].z - nu.z, nodes[b].x - nu.x);
      return angA - angB;
    });
  }

  // Trace minimal counter-clockwise / clockwise planar faces
  const visitedDir = new Set<string>();
  const faces: Vec2[][] = [];

  for (const [u, nbrs] of adj.entries()) {
    for (const v of nbrs) {
      const startKey = `${u}->${v}`;
      if (visitedDir.has(startKey)) continue;

      const cycle: number[] = [u];
      let currU = u;
      let currV = v;
      let guard = 0;

      while (guard++ < 40) {
        const dirKey = `${currU}->${currV}`;
        if (visitedDir.has(dirKey)) break;
        visitedDir.add(dirKey);

        if (currV === u) {
          if (cycle.length >= 3) {
            faces.push(cycle.map((id) => ({ x: nodes[id].x, z: nodes[id].z })));
          }
          break;
        }
        cycle.push(currV);

        const nextNbrs = adj.get(currV);
        if (!nextNbrs || nextNbrs.length < 2) break;
        const backIdx = nextNbrs.indexOf(currU);
        if (backIdx === -1) break;
        // Choose next edge clockwise (previous in CCW sorted list) for interior minimal cycles
        const nextIdx = (backIdx - 1 + nextNbrs.length) % nextNbrs.length;
        currU = currV;
        currV = nextNbrs[nextIdx];
      }
    }
  }

  const polygonSignedArea = (poly: Vec2[]): number => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      a += p1.x * p2.z - p2.x * p1.z;
    }
    return a * 0.5;
  };

  // Filter positive-area interior bounded faces (exclude giant outer boundary face)
  const detected: RoomZone[] = [];
  const usedExisting = new Set<string>();

  for (const poly of faces) {
    const signedA = polygonSignedArea(poly);
    // In screen/plan coordinates (+X right, +Z down), interior faces from clockwise turn have positive signed area
    if (signedA <= 1.2 || signedA > 180) continue;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let cx = 0;
    let cz = 0;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      cx += p.x;
      cz += p.z;
    }
    cx /= poly.length;
    cz /= poly.length;

    // Match against existing room label if centroid falls inside an existing room box
    const existing = story.rooms.find(
      (r) =>
        !usedExisting.has(r.id) &&
        cx >= r.x &&
        cx <= r.x + r.width &&
        cz >= r.z &&
        cz <= r.z + r.depth
    );
    if (existing) usedExisting.add(existing.id);

    detected.push({
      id: existing?.id ?? `room-auto-${detected.length + 1}`,
      name: existing?.name ?? `Room ${detected.length + 1}`,
      x: Number(minX.toFixed(3)),
      z: Number(minZ.toFixed(3)),
      width: Number((maxX - minX).toFixed(3)),
      depth: Number((maxZ - minZ).toFixed(3)),
      polygon: poly,
    });
  }

  return detected.length > 0 ? detected : story.rooms;
}

/** 2D Oriented Bounding Box (OBB) for exact SAT collision tests */
export interface OBB2D {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  angle: number; // radians
}

export function getObbCorners(obb: OBB2D): Vec2[] {
  const c = Math.cos(obb.angle);
  const s = Math.sin(obb.angle);
  const ux = c * obb.hx;
  const uz = s * obb.hx;
  const vx = -s * obb.hz;
  const vz = c * obb.hz;
  return [
    { x: obb.cx - ux - vx, z: obb.cz - uz - vz },
    { x: obb.cx + ux - vx, z: obb.cz + uz - vz },
    { x: obb.cx + ux + vx, z: obb.cz + uz + vz },
    { x: obb.cx - ux + vx, z: obb.cz - uz + vz },
  ];
}

/** Separating Axis Theorem (SAT) overlap test between two 2D OBBs with optional clearance shrink */
export function obbIntersectsObb(a: OBB2D, b: OBB2D, shrinkToleranceM = 0.03): boolean {
  const sa: OBB2D = {
    ...a,
    hx: Math.max(0.01, a.hx - shrinkToleranceM),
    hz: Math.max(0.01, a.hz - shrinkToleranceM),
  };
  const sb: OBB2D = {
    ...b,
    hx: Math.max(0.01, b.hx - shrinkToleranceM),
    hz: Math.max(0.01, b.hz - shrinkToleranceM),
  };

  const cornersA = getObbCorners(sa);
  const cornersB = getObbCorners(sb);

  const axes: Vec2[] = [
    { x: Math.cos(sa.angle), z: Math.sin(sa.angle) },
    { x: -Math.sin(sa.angle), z: Math.cos(sa.angle) },
    { x: Math.cos(sb.angle), z: Math.sin(sb.angle) },
    { x: -Math.sin(sb.angle), z: Math.cos(sb.angle) },
  ];

  for (const ax of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    for (const p of cornersA) {
      const proj = p.x * ax.x + p.z * ax.z;
      if (proj < minA) minA = proj;
      if (proj > maxA) maxA = proj;
    }
    let minB = Infinity;
    let maxB = -Infinity;
    for (const p of cornersB) {
      const proj = p.x * ax.x + p.z * ax.z;
      if (proj < minB) minB = proj;
      if (proj > maxB) maxB = proj;
    }
    if (maxA <= minB || maxB <= minA) return false;
  }
  return true;
}

/** Check if an OBB collides with a straight or curved wall (ignoring door/arch openings) */
export function obbIntersectsWall(obb: OBB2D, wall: Wall, toleranceM = 0.03): boolean {
  const pts = sampleWallPolyline(wall, isCurvedWall(wall) ? 10 : 1);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (segLen < 0.02) continue;

    // For straight walls, skip sections occupied by floor-level door/arch openings
    if (!isCurvedWall(wall) && wall.openings.length > 0) {
      const solidRuns: Array<[number, number]> = [];
      const sorted = [...wall.openings]
        .filter((o) => o.sillHeight < 0.15)
        .sort((o1, o2) => o1.offset - o2.offset);
      let cursor = 0;
      for (const op of sorted) {
        if (op.offset > cursor + 0.02) solidRuns.push([cursor, op.offset]);
        cursor = Math.max(cursor, op.offset + op.width);
      }
      if (segLen > cursor + 0.02) solidRuns.push([cursor, segLen]);

      const ux = (b.x - a.x) / segLen;
      const uz = (b.z - a.z) / segLen;
      const ang = Math.atan2(uz, ux);
      for (const [r0, r1] of solidRuns) {
        const mid = (r0 + r1) * 0.5;
        const wObb: OBB2D = {
          cx: a.x + ux * mid,
          cz: a.z + uz * mid,
          hx: (r1 - r0) * 0.5,
          hz: wall.thickness * 0.5,
          angle: ang,
        };
        if (obbIntersectsObb(obb, wObb, toleranceM)) return true;
      }
      continue;
    }

    const wObb: OBB2D = {
      cx: (a.x + b.x) * 0.5,
      cz: (a.z + b.z) * 0.5,
      hx: segLen * 0.5,
      hz: wall.thickness * 0.5,
      angle: Math.atan2(b.z - a.z, b.x - a.x),
    };
    if (obbIntersectsObb(obb, wObb, toleranceM)) return true;
  }
  return false;
}

/** Check whether a hinged door's 90-degree swing quadrant hits a furniture OBB */
export function doorSwingHitsObb(wall: Wall, op: WallOpening, obb: OBB2D): boolean {
  if (op.kind !== 'door-single' && op.kind !== 'door-double') return false;
  const isDouble = op.kind === 'door-double';
  const leafW = isDouble ? op.width * 0.5 : op.width;
  const pt = pointAtWallOffset(wall, op.offset + op.width * 0.5);
  const swingDir = op.swing; // +1 along +normal, -1 along -normal

  // Approximate swept clearance zone as an OBB projecting leafW*0.82 into the swing side
  const depthClear = leafW * 0.82;
  const swingObb: OBB2D = {
    cx: pt.x + pt.nx * swingDir * (wall.thickness * 0.5 + depthClear * 0.5),
    cz: pt.z + pt.nz * swingDir * (wall.thickness * 0.5 + depthClear * 0.5),
    hx: Math.max(0.15, op.width * 0.44),
    hz: depthClear * 0.46,
    angle: pt.angle,
  };
  return obbIntersectsObb(swingObb, obb, 0.04);
}

/**
 * Smart furniture wall-snapping:
 * Finds nearest wall within snapRadiusM, aligns back face flush against wall inner face
 * with 15mm breathing clearance, and snaps rotation so front faces into the room.
 */
export function snapAssetToNearestWall(
  x: number,
  z: number,
  width: number,
  depth: number,
  currentRotation: number,
  story: Story,
  snapRadiusM = 0.55
): { x: number; z: number; rotation: number; snappedWallId: string | null } {
  let bestDist = snapRadiusM;
  let bestResult: { x: number; z: number; rotation: number; snappedWallId: string | null } = {
    x,
    z,
    rotation: currentRotation,
    snappedWallId: null,
  };

  for (const wall of story.walls) {
    if (isCurvedWall(wall)) continue;
    const dx = wall.x2 - wall.x1;
    const dz = wall.z2 - wall.z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) continue;

    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;

    const rx = x - wall.x1;
    const rz = z - wall.z1;
    const along = rx * ux + rz * uz;
    if (along < width * 0.3 || along > len - width * 0.3) continue;

    const signedPerp = rx * nx + rz * nz;
    const side = signedPerp >= 0 ? 1 : -1;
    const distFromWallFace = Math.abs(signedPerp) - wall.thickness * 0.5 - depth * 0.5;

    if (Math.abs(distFromWallFace) < bestDist) {
      bestDist = Math.abs(distFromWallFace);
      const targetPerp = side * (wall.thickness * 0.5 + depth * 0.5 + 0.015);
      const snapX = wall.x1 + ux * along + nx * targetPerp;
      const snapZ = wall.z1 + uz * along + nz * targetPerp;
      // Local +Z is front of furniture; align local +Z with (side * normal)
      // In our Y-rotation convention (rotation.y = -asset.rotation), local +Z maps to (-sin(rot), cos(rot))
      const frontX = nx * side;
      const frontZ = nz * side;
      const rot = Math.atan2(-frontX, frontZ);
      bestResult = {
        x: Number(snapX.toFixed(4)),
        z: Number(snapZ.toFixed(4)),
        rotation: rot,
        snappedWallId: wall.id,
      };
    }
  }
  return bestResult;
}

/**
 * RAJUK / Bangladesh Imarat Nirman Bidhimala (2008) & BNBC 2020 statutory setback, MGC, and FAR rules.
 */
export function computeRequiredRajukRules(
  plot: LandPlot,
  bnbc: BnbcConfig,
  storyCount: number
): {
  landContext: LandContext;
  maxMgcPct: number;
  maxFar: number;
  requiredSetbacks: LandSetbacks;
} {
  const landContext = plot.landContext ?? bnbc.landContext ?? 'urban';
  const areaM2 = plot.width * plot.depth;
  const roadW = plot.roadWidthM ?? bnbc.roadWidthM ?? 6.1;

  if (landContext === 'village') {
    return {
      landContext: 'village',
      maxMgcPct: 60.0,
      maxFar: 2.0,
      requiredSetbacks: {
        front: 2.1, // Practical Grameen front Uthan / approach
        rear: 1.0,
        left: 0.9,
        right: 0.9,
      },
    };
  }

  // Urban / Semi-Urban RAJUK / Pourashava rules by plot size (m² / Katha)
  let maxMgcPct = 65.0;
  let baseFar = 3.35;
  let front = 1.5; // 5'-0" minimum front setback
  let rear = 1.0;
  let side = 1.0;

  if (areaM2 <= 135) {
    // <= 2 Katha (1,440 sq ft)
    maxMgcPct = 67.5;
    baseFar = 3.15;
    front = 1.5;
    rear = 1.0;
    side = 0.8; // 2'-8" mandatory neighbor separation
  } else if (areaM2 <= 205) {
    // 2 to 3 Katha (2,160 sq ft)
    maxMgcPct = 65.0;
    baseFar = 3.35;
    front = 1.5;
    rear = 1.0;
    side = 1.0; // 3'-3" mandatory neighbor separation
  } else if (areaM2 <= 270) {
    // 3 to 4 Katha (2,880 sq ft)
    maxMgcPct = 62.5;
    baseFar = 3.5;
    front = 1.5;
    rear = 1.5;
    side = 1.0;
  } else {
    // 4 to 5+ Katha (3,600+ sq ft)
    maxMgcPct = 62.5;
    baseFar = 3.75;
    front = 1.5;
    rear = 2.0;
    side = 1.25;
  }

  // Road width FAR bonus/adjustment (RAJUK DAP convention)
  if (roadW >= 9.0) baseFar += 0.35;
  else if (roadW < 4.5) baseFar = Math.max(2.25, baseFar - 0.5);

  // Height scaling for 7+ story buildings
  if (storyCount >= 7) {
    side = Math.max(side, 1.5);
    rear = Math.max(rear, 2.0);
  }

  return {
    landContext,
    maxMgcPct,
    maxFar: Number(baseFar.toFixed(2)),
    requiredSetbacks: { front, rear, left: side, right: side },
  };
}

/**
 * Compute actual outer building envelope setbacks relative to plot boundaries,
 * respecting plot.roadSide ('south' | 'north' | 'east' | 'west') accurately!
 */
export function computeActualPlotSetbacks(project: BuildingProject): {
  footprintAreaM2: number;
  actualSetbacks: LandSetbacks;
  buildingBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
} {
  const ground = project.stories[0];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let footprintAreaM2 = 0;

  if (ground) {
    // Ground floor footprint (main floor slabs + roofed verandas; exclude upper cantilevered balconies)
    for (const s of ground.slabs) {
      const cutoutsArea = (s.cutouts ?? []).reduce((acc, c) => acc + c.width * c.depth, 0);
      footprintAreaM2 += Math.max(0, s.width * s.depth - cutoutsArea);
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x + s.width);
      minZ = Math.min(minZ, s.z);
      maxZ = Math.max(maxZ, s.z + s.depth);
    }
    for (const w of ground.walls) {
      const halfT = w.thickness * 0.5;
      const pts = sampleWallPolyline(w, isCurvedWall(w) ? 12 : 1);
      for (const p of pts) {
        minX = Math.min(minX, p.x - halfT);
        maxX = Math.max(maxX, p.x + halfT);
        minZ = Math.min(minZ, p.z - halfT);
        maxZ = Math.max(maxZ, p.z + halfT);
      }
    }
    for (const p of ground.pillars) {
      minX = Math.min(minX, p.x - p.width * 0.5);
      maxX = Math.max(maxX, p.x + p.width * 0.5);
      minZ = Math.min(minZ, p.z - p.depth * 0.5);
      maxZ = Math.max(maxZ, p.z + p.depth * 0.5);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
    minZ = 0;
    maxZ = 0;
  }

  const plot = project.plot;
  if (!plot) {
    return {
      footprintAreaM2,
      actualSetbacks: { front: 0, rear: 0, left: 0, right: 0 },
      buildingBounds: { minX, maxX, minZ, maxZ },
    };
  }

  const clearNorth = minZ - plot.originZ;
  const clearSouth = plot.originZ + plot.depth - maxZ;
  const clearWest = minX - plot.originX;
  const clearEast = plot.originX + plot.width - maxX;

  let actualSetbacks: LandSetbacks;
  switch (plot.roadSide) {
    case 'north':
      actualSetbacks = { front: clearNorth, rear: clearSouth, left: clearEast, right: clearWest };
      break;
    case 'east':
      actualSetbacks = { front: clearEast, rear: clearWest, left: clearSouth, right: clearNorth };
      break;
    case 'west':
      actualSetbacks = { front: clearWest, rear: clearEast, left: clearNorth, right: clearSouth };
      break;
    case 'south':
    default:
      actualSetbacks = { front: clearSouth, rear: clearNorth, left: clearWest, right: clearEast };
      break;
  }

  return {
    footprintAreaM2,
    actualSetbacks: {
      front: Number(actualSetbacks.front.toFixed(3)),
      rear: Number(actualSetbacks.rear.toFixed(3)),
      left: Number(actualSetbacks.left.toFixed(3)),
      right: Number(actualSetbacks.right.toFixed(3)),
    },
    buildingBounds: { minX, maxX, minZ, maxZ },
  };
}

/** Helper to compute plot area metrics in Katha and Shotok */
export function getPlotAreaStats(plot?: LandPlot) {
  if (!plot) return { areaM2: 0, katha: 0, shotok: 0 };
  const areaM2 = plot.width * plot.depth;
  const sqft = areaM2 * SQFT_PER_SQM;
  return {
    areaM2,
    katha: sqft / SQFT_PER_KATHA,
    shotok: sqft / SQFT_PER_SHOTOK,
  };
}

/** Check if a given (x, z) center point sits cleanly inside any cutout hole of a slab */
export function isCoveredBySlabCutout(
  asset: PlacedAsset,
  aboveStory: Story
): boolean {
  const ax0 = asset.x - asset.width * 0.42;
  const ax1 = asset.x + asset.width * 0.42;
  const az0 = asset.z - asset.depth * 0.42;
  const az1 = asset.z + asset.depth * 0.42;

  for (const s of aboveStory.slabs) {
    if (!s.cutouts || s.cutouts.length === 0) continue;
    for (const c of s.cutouts) {
      const cx0 = c.x - 0.15;
      const cx1 = c.x + c.width + 0.15;
      const cz0 = c.z - 0.15;
      const cz1 = c.z + c.depth + 0.15;
      // Check substantial overlap with cutout
      const ox = Math.max(0, Math.min(ax1, cx1) - Math.max(ax0, cx0));
      const oz = Math.max(0, Math.min(az1, cz1) - Math.max(az0, cz0));
      const assetArea = Math.max(0.01, (ax1 - ax0) * (az1 - az0));
      if ((ox * oz) / assetArea >= 0.72) return true;
    }
  }
  return false;
}

/** Get effective BNBC config with defaults */
export function getBnbcConfig(project: BuildingProject): BnbcConfig {
  return {
    ...DEFAULT_BNBC_CONFIG,
    ...(project.bnbc ?? {}),
    landContext: project.plot?.landContext ?? project.bnbc?.landContext ?? DEFAULT_BNBC_CONFIG.landContext,
    roadWidthM: project.plot?.roadWidthM ?? project.bnbc?.roadWidthM ?? DEFAULT_BNBC_CONFIG.roadWidthM,
  };
}

/** Compute net area of a slab excluding its cutouts */
export function getNetSlabAreaM2(slab: Slab): number {
  const gross = slab.width * slab.depth;
  const holeArea = (slab.cutouts ?? []).reduce((s, c) => s + c.width * c.depth, 0);
  return Math.max(0, gross - holeArea);
}
