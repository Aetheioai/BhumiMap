import {
  AssetElevationBand,
  BuildingProject,
  PlacedAsset,
  Story,
  Vec2,
  Wall,
} from '../types/building';
import { getAssetDefinition } from './assets';
import {
  doorSwingHitsObb,
  isCoveredBySlabCutout,
  isCurvedWall,
  OBB2D,
  obbIntersectsObb,
  obbIntersectsWall,
  sampleWallPolyline,
} from './geometryKernel';

export interface AssetSnapGuide {
  from: Vec2;
  to: Vec2;
  kind: 'wall' | 'corner' | 'asset-edge' | 'companion' | 'room-center';
}

export interface AssetConflict {
  kind: 'asset' | 'wall' | 'pillar' | 'door-swing';
  id: string;
  label: string;
  severity: 'warning' | 'critical';
  obb?: OBB2D;
}

export interface AssetConflictSummary {
  hasConflict: boolean;
  severity: 'none' | 'warning' | 'critical';
  primaryMessage: string | null;
  conflicts: AssetConflict[];
}

export interface AssetHarmonyResult {
  x: number;
  z: number;
  rotation: number;
  snapped: boolean;
  snapKind: 'none' | 'grid' | 'wall' | 'corner' | 'asset-edge' | 'companion' | 'room-center';
  snapLabel: string | null;
  snappedWallId: string | null;
  snappedPartnerId: string | null;
  guides: AssetSnapGuide[];
  conflicts: AssetConflictSummary;
}

export interface AssetCandidate {
  id?: string;
  assetId: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  elevationY?: number;
}

/**
 * Orthonormal local basis in world XZ space matching both Canvas2D (`ctx.rotate(rot)`)
 * and Three.js (`obj.rotation.y = -rot`):
 *  - local +X (right) = (cos(rot), sin(rot))
 *  - local +Z (front) = (-sin(rot), cos(rot))
 */
export function getAssetBasis(rotation: number): {
  rightX: number;
  rightZ: number;
  frontX: number;
  frontZ: number;
} {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    rightX: cos,
    rightZ: sin,
    frontX: -sin,
    frontZ: cos,
  };
}

/** Normalize angle to [-PI, PI] */
export function normalizeAngle(rad: number): number {
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Rotation radians that points local +Z (front) along (frontX, frontZ) */
export function rotationFromFrontVector(frontX: number, frontZ: number): number {
  return normalizeAngle(Math.atan2(-frontX, frontZ));
}

export function getEffectiveElevationBand(
  assetId: string,
  elevationY?: number
): AssetElevationBand {
  const def = getAssetDefinition(assetId);
  if (def?.elevationBand) return def.elevationBand;
  if (def?.isRecessed) return 'recessed';
  const ey = elevationY ?? def?.defaultElevationY ?? 0;
  if (ey >= 2.35) return 'ceiling';
  if (ey >= 1.5) return 'wall-high';
  return 'floor';
}

function getVerticalSpan(c: { assetId: string; height: number; elevationY?: number }): [number, number] {
  const def = getAssetDefinition(c.assetId);
  const band = getEffectiveElevationBand(c.assetId, c.elevationY);
  if (band === 'recessed') return [-0.75, 0.05];
  if (band === 'surface-flush') return [0, 0.04];
  const y0 = Math.max(0, c.elevationY ?? def?.defaultElevationY ?? 0);
  return [y0, y0 + Math.max(0.08, c.height)];
}

/** True if two assets vertically overlap and belong to conflicting elevation bands */
export function assetsVerticallyConflict(
  a: { assetId: string; height: number; elevationY?: number },
  b: { assetId: string; height: number; elevationY?: number }
): boolean {
  const bandA = getEffectiveElevationBand(a.assetId, a.elevationY);
  const bandB = getEffectiveElevationBand(b.assetId, b.elevationY);

  // Flush ground/floor hatches (UGR) allow vehicles or furniture over/near them without blocking
  if (bandA === 'surface-flush' || bandB === 'surface-flush') {
    return bandA === bandB;
  }

  // Ceiling items only conflict with other ceiling items
  if (bandA === 'ceiling' || bandB === 'ceiling') {
    return bandA === bandB;
  }

  // High wall-mounted items (Split AC / Geyser) only conflict with other high wall items
  // or very tall floor fixtures (except wet-zone shower which sits intentionally beneath a geyser)
  if (bandA === 'wall-high' || bandB === 'wall-high') {
    if (a.assetId === 'rain-shower' || b.assetId === 'rain-shower') return false;
    if (bandA === bandB) return true;
    const [a0, a1] = getVerticalSpan(a);
    const [b0, b1] = getVerticalSpan(b);
    return Math.min(a1, b1) - Math.max(a0, b0) > 0.12;
  }

  // Recessed ponds conflict with floor items placed into them
  if (bandA === 'recessed' || bandB === 'recessed') {
    return bandA === 'recessed' || bandB === 'recessed';
  }

  const [a0, a1] = getVerticalSpan(a);
  const [b0, b1] = getVerticalSpan(b);
  return Math.min(a1, b1) - Math.max(a0, b0) > 0.08;
}

export function candidateToObb(c: Pick<AssetCandidate, 'x' | 'z' | 'width' | 'depth' | 'rotation'>): OBB2D {
  return {
    cx: c.x,
    cz: c.z,
    hx: c.width * 0.5,
    hz: c.depth * 0.5,
    angle: c.rotation,
  };
}

interface WallSegmentInfo {
  wall: Wall;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  len: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
}

function collectWallSegments(story: Story): WallSegmentInfo[] {
  const segs: WallSegmentInfo[] = [];
  for (const wall of story.walls) {
    if (isCurvedWall(wall)) {
      const pts = sampleWallPolyline(wall, 12);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.12) continue;
        const ux = dx / len;
        const uz = dz / len;
        segs.push({
          wall,
          x1: a.x,
          z1: a.z,
          x2: b.x,
          z2: b.z,
          len,
          ux,
          uz,
          nx: -uz,
          nz: ux,
        });
      }
    } else {
      const dx = wall.x2 - wall.x1;
      const dz = wall.z2 - wall.z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.25) continue;
      const ux = dx / len;
      const uz = dz / len;
      segs.push({
        wall,
        x1: wall.x1,
        z1: wall.z1,
        x2: wall.x2,
        z2: wall.z2,
        len,
        ux,
        uz,
        nx: -uz,
        nz: ux,
      });
    }
  }
  return segs;
}

function intersectLines(
  ax1: number,
  az1: number,
  aux: number,
  auz: number,
  bx1: number,
  bz1: number,
  bux: number,
  buz: number
): { x: number; z: number; ta: number; tb: number } | null {
  const denom = aux * buz - auz * bux;
  if (Math.abs(denom) < 0.25) return null; // near-parallel
  const qx = bx1 - ax1;
  const qz = bz1 - az1;
  const ta = (qx * buz - qz * bux) / denom;
  const tb = (qx * auz - qz * aux) / denom;
  return { x: ax1 + aux * ta, z: az1 + auz * ta, ta, tb };
}

/**
 * Evaluate all real spatial conflicts (same-band asset overlaps, wall/pillar clips,
 * and door-swing obstructions) for non-blocking visual feedback.
 */
export function evaluateAssetConflicts(
  candidate: AssetCandidate,
  story: Story,
  excludeAssetId?: string | null
): AssetConflictSummary {
  const def = getAssetDefinition(candidate.assetId);
  const band = getEffectiveElevationBand(candidate.assetId, candidate.elevationY);
  const obb = candidateToObb(candidate);
  const conflicts: AssetConflict[] = [];

  // 1. Asset-to-asset overlaps (with elevation-band separation)
  for (const other of story.assets) {
    if (other.id === excludeAssetId || other.id === candidate.id) continue;
    if (!assetsVerticallyConflict(candidate, other)) continue;

    // Fast radial broad-phase reject
    const maxR =
      Math.hypot(candidate.width, candidate.depth) * 0.5 +
      Math.hypot(other.width, other.depth) * 0.5;
    if (Math.hypot(candidate.x - other.x, candidate.z - other.z) > maxR) continue;

    const otherObb = candidateToObb(other);
    if (obbIntersectsObb(obb, otherObb, 0.035)) {
      conflicts.push({
        kind: 'asset',
        id: other.id,
        label: `Overlaps ${other.label}`,
        severity: 'warning',
        obb: otherObb,
      });
    }
  }

  // 2. Wall & structural column clipping (skip for collapsible gates, ceiling fans, recessed ponds, flush hatches)
  const checkStructure =
    band === 'floor' &&
    candidate.assetId !== 'collapsible-gate' &&
    !def?.isExterior;

  if (checkStructure) {
    for (const wall of story.walls) {
      if (obbIntersectsWall(obb, wall, 0.035)) {
        conflicts.push({
          kind: 'wall',
          id: wall.id,
          label: 'Clips wall',
          severity: 'warning',
        });
        break; // one wall clip warning is enough
      }
    }

    for (const col of story.pillars) {
      const colObb: OBB2D = {
        cx: col.x,
        cz: col.z,
        hx: col.width * 0.5,
        hz: col.depth * 0.5,
        angle: col.rotation,
      };
      if (obbIntersectsObb(obb, colObb, 0.03)) {
        conflicts.push({
          kind: 'pillar',
          id: col.id,
          label: `Clips column ${col.label}`,
          severity: 'critical',
          obb: colObb,
        });
        break;
      }
    }

    // 3. Hinged door swing clearance check
    for (const wall of story.walls) {
      for (const op of wall.openings) {
        if (doorSwingHitsObb(wall, op, obb)) {
          conflicts.push({
            kind: 'door-swing',
            id: op.id,
            label: 'Blocks door swing',
            severity: 'warning',
          });
          break;
        }
      }
    }
  }

  if (conflicts.length === 0) {
    return { hasConflict: false, severity: 'none', primaryMessage: null, conflicts: [] };
  }

  const hasCritical = conflicts.some((c) => c.severity === 'critical');
  return {
    hasConflict: true,
    severity: hasCritical ? 'critical' : 'warning',
    primaryMessage: conflicts[0].label,
    conflicts,
  };
}

export interface SolvePlacementOptions {
  snapEnabled: boolean;
  gridStepM?: number;
  excludeAssetId?: string | null;
  wallSnapRadiusM?: number;
  assetSnapRadiusM?: number;
  companionSnapRadiusM?: number;
}

/**
 * Unified Asset Harmony & Smart Snapping Engine (shared by 2D Canvas and 3D Viewport).
 * Priority order:
 *   1. Semantic Companion Groupings (Tea Table <-> Sofa, TV <-> Sofa, Fridge <-> Kitchen,
 *      Ceiling Fan <-> Bed/Dining/Room Center, Car <-> Car, Bath fixtures)
 *   2. 90° Wall Corner Dual-Snap (for corner-snappable fixtures & cabinetry)
 *   3. Straight & Curved Wall-Flush Snap (auto-orients front face into room)
 *   4. Universal Edge-to-Edge Magnetic Asset Snapping & Axis Alignment Rails
 *   5. Grid Quantization Fallback
 * Always runs non-blocking overlap & door-swing conflict analysis at the final pose.
 */
export function solveAssetPlacement(
  candidate: AssetCandidate,
  story: Story,
  options: SolvePlacementOptions
): AssetHarmonyResult {
  const def = getAssetDefinition(candidate.assetId);
  const gridStep = Math.max(0.025, options.gridStepM ?? 0.1524);
  const wallRadius = options.wallSnapRadiusM ?? 0.52;
  const assetRadius = options.assetSnapRadiusM ?? 0.28;
  const companionRadius = options.companionSnapRadiusM ?? 0.72;

  if (!options.snapEnabled) {
    const x = Number(candidate.x.toFixed(4));
    const z = Number(candidate.z.toFixed(4));
    const conflicts = evaluateAssetConflicts(
      { ...candidate, x, z },
      story,
      options.excludeAssetId
    );
    return {
      x,
      z,
      rotation: candidate.rotation,
      snapped: false,
      snapKind: 'none',
      snapLabel: null,
      snappedWallId: null,
      snappedPartnerId: null,
      guides: [],
      conflicts,
    };
  }

  const rawX = candidate.x;
  const rawZ = candidate.z;
  const w = candidate.width;
  const d = candidate.depth;
  const baseRot = candidate.rotation;
  const band = getEffectiveElevationBand(candidate.assetId, candidate.elevationY);

  // ---------------------------------------------------------------------------
  // STAGE 1: Semantic Companion Grouping Magnet & Ceiling Fan Room Centering
  // ---------------------------------------------------------------------------
  let bestCompanion: {
    score: number;
    x: number;
    z: number;
    rotation: number;
    label: string;
    partnerId: string | null;
    kind: 'companion' | 'room-center';
    guides: AssetSnapGuide[];
  } | null = null;

  // 1A. Ceiling Fan -> Enclosing Room Center
  if (band === 'ceiling') {
    for (const rm of story.rooms) {
      if (
        rawX >= rm.x &&
        rawX <= rm.x + rm.width &&
        rawZ >= rm.z &&
        rawZ <= rm.z + rm.depth
      ) {
        const rcx = rm.x + rm.width * 0.5;
        const rcz = rm.z + rm.depth * 0.5;
        const dist = Math.hypot(rawX - rcx, rawZ - rcz);
        if (dist < 0.72 && (!bestCompanion || dist < bestCompanion.score)) {
          bestCompanion = {
            score: dist,
            x: rcx,
            z: rcz,
            rotation: baseRot,
            label: `${rm.name} center`,
            partnerId: null,
            kind: 'room-center',
            guides: [
              { from: { x: rm.x, z: rcz }, to: { x: rm.x + rm.width, z: rcz }, kind: 'room-center' },
              { from: { x: rcx, z: rm.z }, to: { x: rcx, z: rm.z + rm.depth }, kind: 'room-center' },
            ],
          };
        }
      }
    }
  }

  // 1B. Declared Companion Relationships
  if (def?.companions && def.companions.length > 0) {
    for (const rule of def.companions) {
      for (const other of story.assets) {
        if (other.id === options.excludeAssetId || other.id === candidate.id) continue;
        if (!rule.targetAssetIds.includes(other.assetId)) continue;

        const ob = getAssetBasis(other.rotation);
        const targetRot =
          rule.facing === 'same'
            ? other.rotation
            : rule.facing === 'opposite'
            ? normalizeAngle(other.rotation + Math.PI)
            : baseRot;

        if (rule.relation === 'front-center') {
          const distAhead = other.depth * 0.5 + d * 0.5 + rule.gapM;
          const tx = other.x + ob.frontX * distAhead;
          const tz = other.z + ob.frontZ * distAhead;
          const dist = Math.hypot(rawX - tx, rawZ - tz);
          if (dist < companionRadius && (!bestCompanion || dist < bestCompanion.score)) {
            bestCompanion = {
              score: dist,
              x: tx,
              z: tz,
              rotation: targetRot,
              label: rule.snapLabel,
              partnerId: other.id,
              kind: 'companion',
              guides: [{ from: { x: other.x, z: other.z }, to: { x: tx, z: tz }, kind: 'companion' }],
            };
          }
        } else if (rule.relation === 'overhead-center') {
          const dist = Math.hypot(rawX - other.x, rawZ - other.z);
          if (dist < companionRadius * 1.15 && (!bestCompanion || dist < bestCompanion.score)) {
            bestCompanion = {
              score: dist * 0.9, // slight preference for centering over bed/dining table
              x: other.x,
              z: other.z,
              rotation: targetRot,
              label: `Over ${other.label}`,
              partnerId: other.id,
              kind: 'companion',
              guides: [
                { from: { x: other.x - 0.5, z: other.z }, to: { x: other.x + 0.5, z: other.z }, kind: 'companion' },
                { from: { x: other.x, z: other.z - 0.5 }, to: { x: other.x, z: other.z + 0.5 }, kind: 'companion' },
              ],
            };
          }
        } else if (rule.relation === 'opposite') {
          // Centerline alignment directly across from partner (e.g., TV Console opposite Sofa)
          const rx = rawX - other.x;
          const rz = rawZ - other.z;
          const alongFront = rx * ob.frontX + rz * ob.frontZ;
          const lateral = rx * ob.rightX + rz * ob.rightZ;
          if (alongFront >= 1.1 && alongFront <= 4.6 && Math.abs(lateral) < 0.45) {
            const tx = other.x + ob.frontX * alongFront;
            const tz = other.z + ob.frontZ * alongFront;
            const score = Math.abs(lateral) + 0.12;
            if (!bestCompanion || score < bestCompanion.score) {
              bestCompanion = {
                score,
                x: tx,
                z: tz,
                rotation: targetRot,
                label: rule.snapLabel,
                partnerId: other.id,
                kind: 'companion',
                guides: [{ from: { x: other.x, z: other.z }, to: { x: tx, z: tz }, kind: 'companion' }],
              };
            }
          }
        } else if (rule.relation === 'side-flush' || rule.relation === 'parallel-bay') {
          const sideDist = other.width * 0.5 + w * 0.5 + rule.gapM;
          // Align back faces cleanly for wall-flush pieces, or centers for parallel vehicles
          const backShift =
            rule.relation === 'parallel-bay' ? 0 : (d - other.depth) * 0.5;

          for (const sideSign of [-1, 1] as const) {
            const tx = other.x + ob.rightX * (sideSign * sideDist) + ob.frontX * backShift;
            const tz = other.z + ob.rightZ * (sideSign * sideDist) + ob.frontZ * backShift;
            const dist = Math.hypot(rawX - tx, rawZ - tz);
            const radius = rule.relation === 'parallel-bay' ? companionRadius * 1.1 : companionRadius * 0.78;
            if (dist < radius && (!bestCompanion || dist < bestCompanion.score)) {
              // Back-edge alignment ray connecting both assets
              const backOff = -other.depth * 0.5;
              const g1 = {
                x: other.x + ob.frontX * backOff - ob.rightX * (other.width * 0.5),
                z: other.z + ob.frontZ * backOff - ob.rightZ * (other.width * 0.5),
              };
              const g2 = {
                x: tx + ob.frontX * (-d * 0.5) + ob.rightX * (sideSign * w * 0.5),
                z: tz + ob.frontZ * (-d * 0.5) + ob.rightZ * (sideSign * w * 0.5),
              };
              bestCompanion = {
                score: dist,
                x: tx,
                z: tz,
                rotation: targetRot,
                label: rule.snapLabel,
                partnerId: other.id,
                kind: 'companion',
                guides: [{ from: g1, to: g2, kind: 'companion' }],
              };
            }
          }
        }
      }
    }
  }

  // If TV console snapped opposite a sofa, also pull its back flush to a wall right behind it!
  if (bestCompanion && def?.wallSnappable) {
    const segs = collectWallSegments(story);
    const cb = getAssetBasis(bestCompanion.rotation);
    let wallPull: { x: number; z: number; wallId: string; dist: number; guide: AssetSnapGuide } | null = null;
    for (const s of segs) {
      // Check wall roughly parallel to companion's back edge
      const parallel = Math.abs(s.ux * cb.rightX + s.uz * cb.rightZ);
      if (parallel < 0.92) continue;
      const rx = bestCompanion.x - s.x1;
      const rz = bestCompanion.z - s.z1;
      const along = rx * s.ux + rz * s.uz;
      if (along < -0.15 || along > s.len + 0.15) continue;
      const signedPerp = rx * s.nx + rz * s.nz;
      const side = signedPerp >= 0 ? 1 : -1;
      // Ensure wall normal on this side agrees with companion front direction
      if (s.nx * side * cb.frontX + s.nz * side * cb.frontZ < 0.7) continue;
      const distFromFace = Math.abs(Math.abs(signedPerp) - s.wall.thickness * 0.5 - d * 0.5);
      if (distFromFace < 0.42 && (!wallPull || distFromFace < wallPull.dist)) {
        const targetPerp = side * (s.wall.thickness * 0.5 + d * 0.5 + 0.015);
        const wx = s.x1 + s.ux * along + s.nx * targetPerp;
        const wz = s.z1 + s.uz * along + s.nz * targetPerp;
        wallPull = {
          x: wx,
          z: wz,
          wallId: s.wall.id,
          dist: distFromFace,
          guide: {
            from: { x: s.x1, z: s.z1 },
            to: { x: s.x2, z: s.z2 },
            kind: 'wall',
          },
        };
      }
    }
    if (wallPull) {
      bestCompanion.x = wallPull.x;
      bestCompanion.z = wallPull.z;
      bestCompanion.guides.push(wallPull.guide);
    }
  }

  if (bestCompanion) {
    const fx = Number(bestCompanion.x.toFixed(4));
    const fz = Number(bestCompanion.z.toFixed(4));
    const conflicts = evaluateAssetConflicts(
      { ...candidate, x: fx, z: fz, rotation: bestCompanion.rotation },
      story,
      options.excludeAssetId
    );
    return {
      x: fx,
      z: fz,
      rotation: bestCompanion.rotation,
      snapped: true,
      snapKind: bestCompanion.kind,
      snapLabel: bestCompanion.label,
      snappedWallId: null,
      snappedPartnerId: bestCompanion.partnerId,
      guides: bestCompanion.guides,
      conflicts,
    };
  }

  // ---------------------------------------------------------------------------
  // STAGE 2 & 3: 90° Wall Corner Dual-Snap + Straight & Curved Wall-Flush Snap
  // ---------------------------------------------------------------------------
  const wallSegs = def?.wallSnappable || def?.cornerSnappable ? collectWallSegments(story) : [];

  interface WallCandidate {
    seg: WallSegmentInfo;
    along: number;
    side: 1 | -1;
    distFromBack: number;
    distFromSide: number;
  }

  const nearWalls: WallCandidate[] = [];
  for (const seg of wallSegs) {
    const rx = rawX - seg.x1;
    const rz = rawZ - seg.z1;
    const along = rx * seg.ux + rz * seg.uz;
    const pad = Math.max(w, d) * 0.45;
    if (along < -pad || along > seg.len + pad) continue;

    const signedPerp = rx * seg.nx + rz * seg.nz;
    const side: 1 | -1 = signedPerp >= 0 ? 1 : -1;
    const distFromBack = Math.abs(Math.abs(signedPerp) - seg.wall.thickness * 0.5 - d * 0.5);
    const distFromSide = Math.abs(Math.abs(signedPerp) - seg.wall.thickness * 0.5 - w * 0.5);

    if (distFromBack < wallRadius || (def?.cornerSnappable && distFromSide < wallRadius * 1.1)) {
      nearWalls.push({ seg, along, side, distFromBack, distFromSide });
    }
  }

  // STAGE 2: 90° Corner Dual-Snap (for corner-snappable fixtures like L-kitchen, L-stair, wardrobe, fridge, shower)
  if (def?.cornerSnappable && nearWalls.length >= 2) {
    let bestCorner: {
      score: number;
      x: number;
      z: number;
      rotation: number;
      wallId: string;
      guides: AssetSnapGuide[];
    } | null = null;

    for (let i = 0; i < nearWalls.length; i++) {
      for (let j = i + 1; j < nearWalls.length; j++) {
        const a = nearWalls[i];
        const b = nearWalls[j];
        if (a.seg.wall.id === b.seg.wall.id) continue;
        // Must be nearly perpendicular
        const dot = Math.abs(a.seg.ux * b.seg.ux + a.seg.uz * b.seg.uz);
        if (dot > 0.16) continue;

        const inter = intersectLines(
          a.seg.x1,
          a.seg.z1,
          a.seg.ux,
          a.seg.uz,
          b.seg.x1,
          b.seg.z1,
          b.seg.ux,
          b.seg.uz
        );
        if (!inter) continue;
        // Intersection should be near both wall segments
        if (
          inter.ta < -0.5 ||
          inter.ta > a.seg.len + 0.5 ||
          inter.tb < -0.5 ||
          inter.tb > b.seg.len + 0.5
        ) {
          continue;
        }

        // Try both orientations: back on wall A + side on wall B, or back on wall B + side on wall A
        const combos: Array<[WallCandidate, WallCandidate]> = [
          [a, b],
          [b, a],
        ];
        for (const [backW, sideW] of combos) {
          const backClear = backW.seg.wall.thickness * 0.5 + d * 0.5 + 0.015;
          const sideClear = sideW.seg.wall.thickness * 0.5 + w * 0.5 + 0.015;
          const cx =
            inter.x +
            backW.seg.nx * backW.side * backClear +
            sideW.seg.nx * sideW.side * sideClear;
          const cz =
            inter.z +
            backW.seg.nz * backW.side * backClear +
            sideW.seg.nz * sideW.side * sideClear;

          const dist = Math.hypot(rawX - cx, rawZ - cz);
          if (dist < wallRadius * 1.15) {
            const rot = rotationFromFrontVector(
              backW.seg.nx * backW.side,
              backW.seg.nz * backW.side
            );
            // Prefer keeping close to current rotation when tie-breaking
            const rotDiff = Math.abs(normalizeAngle(rot - baseRot)) * 0.08;
            const score = dist + rotDiff;
            if (!bestCorner || score < bestCorner.score) {
              bestCorner = {
                score,
                x: cx,
                z: cz,
                rotation: rot,
                wallId: backW.seg.wall.id,
                guides: [
                  {
                    from: { x: backW.seg.x1, z: backW.seg.z1 },
                    to: { x: backW.seg.x2, z: backW.seg.z2 },
                    kind: 'corner',
                  },
                  {
                    from: { x: sideW.seg.x1, z: sideW.seg.z1 },
                    to: { x: sideW.seg.x2, z: sideW.seg.z2 },
                    kind: 'corner',
                  },
                ],
              };
            }
          }
        }
      }
    }

    if (bestCorner) {
      const fx = Number(bestCorner.x.toFixed(4));
      const fz = Number(bestCorner.z.toFixed(4));
      const conflicts = evaluateAssetConflicts(
        { ...candidate, x: fx, z: fz, rotation: bestCorner.rotation },
        story,
        options.excludeAssetId
      );
      return {
        x: fx,
        z: fz,
        rotation: bestCorner.rotation,
        snapped: true,
        snapKind: 'corner',
        snapLabel: 'Corner lock',
        snappedWallId: bestCorner.wallId,
        snappedPartnerId: null,
        guides: bestCorner.guides,
        conflicts,
      };
    }
  }

  // STAGE 3: Single Straight or Curved Wall-Flush Snap
  let bestWall: {
    dist: number;
    x: number;
    z: number;
    rotation: number;
    wallId: string;
    seg: WallSegmentInfo;
    side: 1 | -1;
    along: number;
  } | null = null;

  if (def?.wallSnappable) {
    for (const cand of nearWalls) {
      if (cand.distFromBack >= wallRadius) continue;
      // Keep item reasonably within the wall span
      if (cand.along < w * 0.22 || cand.along > cand.seg.len - w * 0.22) continue;

      const targetPerp = cand.side * (cand.seg.wall.thickness * 0.5 + d * 0.5 + 0.015);
      const sx = cand.seg.x1 + cand.seg.ux * cand.along + cand.seg.nx * targetPerp;
      const sz = cand.seg.z1 + cand.seg.uz * cand.along + cand.seg.nz * targetPerp;
      const rot = rotationFromFrontVector(cand.seg.nx * cand.side, cand.seg.nz * cand.side);

      if (!bestWall || cand.distFromBack < bestWall.dist) {
        bestWall = {
          dist: cand.distFromBack,
          x: sx,
          z: sz,
          rotation: rot,
          wallId: cand.seg.wall.id,
          seg: cand.seg,
          side: cand.side,
          along: cand.along,
        };
      }
    }
  }

  // If wall-snapped, ALSO check edge-to-edge magnetic slide along the SAME wall against neighboring assets!
  if (bestWall) {
    const guides: AssetSnapGuide[] = [
      {
        from: { x: bestWall.seg.x1, z: bestWall.seg.z1 },
        to: { x: bestWall.seg.x2, z: bestWall.seg.z2 },
        kind: 'wall',
      },
    ];
    let finalX = bestWall.x;
    let finalZ = bestWall.z;
    let snapLabel = 'Flush to wall';
    let partnerId: string | null = null;

    // Slide-snap flush against any adjacent asset along this wall
    const wb = getAssetBasis(bestWall.rotation);
    let bestSlideDist = 0.28;
    for (const other of story.assets) {
      if (other.id === options.excludeAssetId || other.id === candidate.id) continue;
      if (!assetsVerticallyConflict(candidate, other)) continue;
      const ob = getAssetBasis(other.rotation);
      // Same or opposite wall orientation
      if (Math.abs(wb.rightX * ob.rightX + wb.rightZ * ob.rightZ) < 0.92) continue;
      const relPerp = (other.x - bestWall.x) * wb.frontX + (other.z - bestWall.z) * wb.frontZ;
      if (Math.abs(relPerp) > Math.max(d, other.depth) * 0.65) continue;

      const relAlong = (other.x - bestWall.x) * wb.rightX + (other.z - bestWall.z) * wb.rightZ;
      const desiredSpan = (w + other.width) * 0.5 + 0.025;
      for (const dir of [-1, 1] as const) {
        const targetAlong = relAlong + dir * desiredSpan;
        if (Math.abs(targetAlong) < bestSlideDist) {
          bestSlideDist = Math.abs(targetAlong);
          finalX = bestWall.x + wb.rightX * targetAlong;
          finalZ = bestWall.z + wb.rightZ * targetAlong;
          snapLabel = `Wall + flush to ${other.label}`;
          partnerId = other.id;
        }
      }
    }

    if (partnerId) {
      const p = story.assets.find((a) => a.id === partnerId);
      if (p) {
        guides.push({ from: { x: p.x, z: p.z }, to: { x: finalX, z: finalZ }, kind: 'asset-edge' });
      }
    }

    const fx = Number(finalX.toFixed(4));
    const fz = Number(finalZ.toFixed(4));
    const conflicts = evaluateAssetConflicts(
      { ...candidate, x: fx, z: fz, rotation: bestWall.rotation },
      story,
      options.excludeAssetId
    );
    return {
      x: fx,
      z: fz,
      rotation: bestWall.rotation,
      snapped: true,
      snapKind: 'wall',
      snapLabel,
      snappedWallId: bestWall.wallId,
      snappedPartnerId: partnerId,
      guides,
      conflicts,
    };
  }

  // ---------------------------------------------------------------------------
  // STAGE 4: Universal Edge-to-Edge Magnetic Asset Snapping & Axis Alignment
  // ---------------------------------------------------------------------------
  const myCos = Math.abs(Math.cos(baseRot));
  const mySin = Math.abs(Math.sin(baseRot));
  const myHalfX = (w * myCos + d * mySin) * 0.5;
  const myHalfZ = (w * mySin + d * myCos) * 0.5;

  let bestEdgeSnap: {
    dist: number;
    x: number;
    z: number;
    rotation: number;
    label: string;
    partnerId: string;
    guides: AssetSnapGuide[];
  } | null = null;

  for (const other of story.assets) {
    if (other.id === options.excludeAssetId || other.id === candidate.id) continue;
    if (!assetsVerticallyConflict(candidate, other)) continue;

    // Oriented edge-to-edge magnetic dock in partner's local frame
    const ob = getAssetBasis(other.rotation);
    const rx = rawX - other.x;
    const rz = rawZ - other.z;
    const localX = rx * ob.rightX + rz * ob.rightZ;
    const localZ = rx * ob.frontX + rz * ob.frontZ;

    // Only attempt local-frame dock when reasonably close
    if (Math.hypot(rx, rz) > Math.max(w, d) + Math.max(other.width, other.depth) + 1.0) continue;

    const gap = 0.02;
    const dockX = (other.width + w) * 0.5 + gap;
    const dockZ = (other.depth + d) * 0.5 + gap;

    // Left / Right side flush docks (aligning back edge or center)
    if (Math.abs(Math.abs(localX) - dockX) < assetRadius && Math.abs(localZ) < (other.depth + d) * 0.45) {
      const sideSign = localX >= 0 ? 1 : -1;
      // Snap localZ to 0 (centered) or back-edge aligned if close
      const backAlignZ = (d - other.depth) * 0.5;
      const frontAlignZ = (other.depth - d) * 0.5;
      let snappedLocalZ = localZ;
      if (Math.abs(localZ - backAlignZ) < 0.2) snappedLocalZ = backAlignZ;
      else if (Math.abs(localZ - frontAlignZ) < 0.2) snappedLocalZ = frontAlignZ;
      else if (Math.abs(localZ) < 0.2) snappedLocalZ = 0;

      const tx = other.x + ob.rightX * (sideSign * dockX) + ob.frontX * snappedLocalZ;
      const tz = other.z + ob.rightZ * (sideSign * dockX) + ob.frontZ * snappedLocalZ;
      const dist = Math.hypot(rawX - tx, rawZ - tz);
      if (dist < assetRadius * 1.15 && (!bestEdgeSnap || dist < bestEdgeSnap.dist)) {
        const seamX = other.x + ob.rightX * (sideSign * (other.width * 0.5 + gap * 0.5));
        const seamZ = other.z + ob.rightZ * (sideSign * (other.width * 0.5 + gap * 0.5));
        const rayHalf = Math.max(d, other.depth) * 0.65;
        bestEdgeSnap = {
          dist,
          x: tx,
          z: tz,
          rotation: other.rotation,
          label: `Flush beside ${other.label}`,
          partnerId: other.id,
          guides: [
            {
              from: { x: seamX - ob.frontX * rayHalf, z: seamZ - ob.frontZ * rayHalf },
              to: { x: seamX + ob.frontX * rayHalf, z: seamZ + ob.frontZ * rayHalf },
              kind: 'asset-edge',
            },
          ],
        };
      }
    }

    // Front / Back flush docks
    if (Math.abs(Math.abs(localZ) - dockZ) < assetRadius && Math.abs(localX) < (other.width + w) * 0.45) {
      const fbSign = localZ >= 0 ? 1 : -1;
      const snappedLocalX = Math.abs(localX) < 0.22 ? 0 : localX;
      const tx = other.x + ob.rightX * snappedLocalX + ob.frontX * (fbSign * dockZ);
      const tz = other.z + ob.rightZ * snappedLocalX + ob.frontZ * (fbSign * dockZ);
      const dist = Math.hypot(rawX - tx, rawZ - tz);
      if (dist < assetRadius * 1.15 && (!bestEdgeSnap || dist < bestEdgeSnap.dist)) {
        const seamX = other.x + ob.frontX * (fbSign * (other.depth * 0.5 + gap * 0.5));
        const seamZ = other.z + ob.frontZ * (fbSign * (other.depth * 0.5 + gap * 0.5));
        const rayHalf = Math.max(w, other.width) * 0.65;
        bestEdgeSnap = {
          dist,
          x: tx,
          z: tz,
          rotation: other.rotation,
          label: `Aligned with ${other.label}`,
          partnerId: other.id,
          guides: [
            {
              from: { x: seamX - ob.rightX * rayHalf, z: seamZ - ob.rightZ * rayHalf },
              to: { x: seamX + ob.rightX * rayHalf, z: seamZ + ob.rightZ * rayHalf },
              kind: 'asset-edge',
            },
          ],
        };
      }
    }
  }

  if (bestEdgeSnap) {
    const fx = Number(bestEdgeSnap.x.toFixed(4));
    const fz = Number(bestEdgeSnap.z.toFixed(4));
    const conflicts = evaluateAssetConflicts(
      { ...candidate, x: fx, z: fz, rotation: bestEdgeSnap.rotation },
      story,
      options.excludeAssetId
    );
    return {
      x: fx,
      z: fz,
      rotation: bestEdgeSnap.rotation,
      snapped: true,
      snapKind: 'asset-edge',
      snapLabel: bestEdgeSnap.label,
      snappedWallId: null,
      snappedPartnerId: bestEdgeSnap.partnerId,
      guides: bestEdgeSnap.guides,
      conflicts,
    };
  }

  // World-axis centerline & edge alignment rails with nearby assets (Figma-like smart alignment)
  let alignX: { val: number; dist: number; guide: AssetSnapGuide; partnerId: string } | null = null;
  let alignZ: { val: number; dist: number; guide: AssetSnapGuide; partnerId: string } | null = null;
  const railTol = 0.16;

  for (const other of story.assets) {
    if (other.id === options.excludeAssetId || other.id === candidate.id) continue;
    const spanDist = Math.hypot(rawX - other.x, rawZ - other.z);
    if (spanDist > 9.0) continue;

    const oCos = Math.abs(Math.cos(other.rotation));
    const oSin = Math.abs(Math.sin(other.rotation));
    const oHalfX = (other.width * oCos + other.depth * oSin) * 0.5;
    const oHalfZ = (other.width * oSin + other.depth * oCos) * 0.5;

    // X-center alignment
    const dcx = Math.abs(rawX - other.x);
    if (dcx < railTol && (!alignX || dcx < alignX.dist)) {
      alignX = {
        val: other.x,
        dist: dcx,
        partnerId: other.id,
        guide: { from: { x: other.x, z: other.z }, to: { x: other.x, z: rawZ }, kind: 'asset-edge' },
      };
    }
    // Left / right edge alignment
    const dLeft = Math.abs(rawX - myHalfX - (other.x - oHalfX));
    if (dLeft < railTol && (!alignX || dLeft < alignX.dist)) {
      const edgeX = other.x - oHalfX;
      alignX = {
        val: edgeX + myHalfX,
        dist: dLeft,
        partnerId: other.id,
        guide: { from: { x: edgeX, z: other.z }, to: { x: edgeX, z: rawZ }, kind: 'asset-edge' },
      };
    }
    const dRight = Math.abs(rawX + myHalfX - (other.x + oHalfX));
    if (dRight < railTol && (!alignX || dRight < alignX.dist)) {
      const edgeX = other.x + oHalfX;
      alignX = {
        val: edgeX - myHalfX,
        dist: dRight,
        partnerId: other.id,
        guide: { from: { x: edgeX, z: other.z }, to: { x: edgeX, z: rawZ }, kind: 'asset-edge' },
      };
    }

    // Z-center alignment
    const dcz = Math.abs(rawZ - other.z);
    if (dcz < railTol && (!alignZ || dcz < alignZ.dist)) {
      alignZ = {
        val: other.z,
        dist: dcz,
        partnerId: other.id,
        guide: { from: { x: other.x, z: other.z }, to: { x: rawX, z: other.z }, kind: 'asset-edge' },
      };
    }
    const dTop = Math.abs(rawZ - myHalfZ - (other.z - oHalfZ));
    if (dTop < railTol && (!alignZ || dTop < alignZ.dist)) {
      const edgeZ = other.z - oHalfZ;
      alignZ = {
        val: edgeZ + myHalfZ,
        dist: dTop,
        partnerId: other.id,
        guide: { from: { x: other.x, z: edgeZ }, to: { x: rawX, z: edgeZ }, kind: 'asset-edge' },
      };
    }
    const dBot = Math.abs(rawZ + myHalfZ - (other.z + oHalfZ));
    if (dBot < railTol && (!alignZ || dBot < alignZ.dist)) {
      const edgeZ = other.z + oHalfZ;
      alignZ = {
        val: edgeZ - myHalfZ,
        dist: dBot,
        partnerId: other.id,
        guide: { from: { x: other.x, z: edgeZ }, to: { x: rawX, z: edgeZ }, kind: 'asset-edge' },
      };
    }
  }

  const finalX = Number((alignX ? alignX.val : Math.round(rawX / gridStep) * gridStep).toFixed(4));
  const finalZ = Number((alignZ ? alignZ.val : Math.round(rawZ / gridStep) * gridStep).toFixed(4));
  const guides: AssetSnapGuide[] = [];
  if (alignX) guides.push({ ...alignX.guide, to: { x: alignX.guide.to.x, z: finalZ } });
  if (alignZ) guides.push({ ...alignZ.guide, to: { x: finalX, z: alignZ.guide.to.z } });

  const conflicts = evaluateAssetConflicts(
    { ...candidate, x: finalX, z: finalZ, rotation: baseRot },
    story,
    options.excludeAssetId
  );

  return {
    x: finalX,
    z: finalZ,
    rotation: baseRot,
    snapped: Boolean(alignX || alignZ),
    snapKind: alignX || alignZ ? 'asset-edge' : 'grid',
    snapLabel: alignX && alignZ ? 'Aligned X+Y' : alignX || alignZ ? 'Aligned' : null,
    snappedWallId: null,
    snappedPartnerId: alignX?.partnerId ?? alignZ?.partnerId ?? null,
    guides,
    conflicts,
  };
}

/**
 * Compute ideal ergonomic pose for spawning a companion asset (1-click "+ Tea Table", "+ Fridge", "+ Ceiling Fan", etc.)
 * Tests side candidates and chooses the clearest conflict-free placement.
 */
export function computeCompanionSpawn(
  host: PlacedAsset,
  story: Story
): Omit<PlacedAsset, 'id'> | null {
  const hostDef = getAssetDefinition(host.assetId);
  const spec = hostDef?.quickCompanion;
  if (!spec) return null;
  const compDef = getAssetDefinition(spec.assetId);
  if (!compDef) return null;

  const hb = getAssetBasis(host.rotation);
  const rot =
    spec.facing === 'same'
      ? host.rotation
      : spec.facing === 'opposite'
      ? normalizeAngle(host.rotation + Math.PI)
      : 0;

  const w = compDef.defaultWidth;
  const d = compDef.defaultDepth;
  const h = compDef.defaultHeight;
  const elev = compDef.defaultElevationY;

  const candidates: Array<{ x: number; z: number; rotation: number }> = [];

  if (spec.relation === 'front-center') {
    const ahead = host.depth * 0.5 + d * 0.5 + spec.gapM;
    candidates.push({
      x: host.x + hb.frontX * ahead,
      z: host.z + hb.frontZ * ahead,
      rotation: rot,
    });
  } else if (spec.relation === 'overhead-center') {
    candidates.push({ x: host.x, z: host.z, rotation: rot });
  } else if (spec.relation === 'side-flush') {
    const sideDist = host.width * 0.5 + w * 0.5 + spec.gapM;
    const backShift = (d - host.depth) * 0.5;
    // Try right side first, then left side
    candidates.push(
      {
        x: host.x + hb.rightX * sideDist + hb.frontX * backShift,
        z: host.z + hb.rightZ * sideDist + hb.frontZ * backShift,
        rotation: rot,
      },
      {
        x: host.x - hb.rightX * sideDist + hb.frontX * backShift,
        z: host.z - hb.rightZ * sideDist + hb.frontZ * backShift,
        rotation: rot,
      }
    );
  } else if (spec.relation === 'opposite') {
    const ahead = host.depth * 0.5 + d * 0.5 + spec.gapM;
    candidates.push({
      x: host.x + hb.frontX * ahead,
      z: host.z + hb.frontZ * ahead,
      rotation: rot,
    });
  } else {
    const sideDist = host.width * 0.5 + w * 0.5 + spec.gapM;
    candidates.push(
      { x: host.x + hb.rightX * sideDist, z: host.z + hb.rightZ * sideDist, rotation: rot },
      { x: host.x - hb.rightX * sideDist, z: host.z - hb.rightZ * sideDist, rotation: rot }
    );
  }

  let best = candidates[0];
  let bestCount = Infinity;
  for (const c of candidates) {
    const conf = evaluateAssetConflicts(
      { assetId: compDef.id, x: c.x, z: c.z, width: w, depth: d, height: h, rotation: c.rotation, elevationY: elev },
      story
    );
    if (conf.conflicts.length < bestCount) {
      bestCount = conf.conflicts.length;
      best = c;
      if (bestCount === 0) break;
    }
  }

  return {
    assetId: compDef.id,
    label: compDef.name,
    x: Number(best.x.toFixed(3)),
    z: Number(best.z.toFixed(3)),
    width: w,
    depth: d,
    height: h,
    rotation: best.rotation,
    elevationY: elev,
  };
}

/**
 * Checks if a staircase or lift core on `storyIndex` is covered by a solid floor slab
 * on `storyIndex + 1` (without a cutout), so we can offer a 1-click "Cut Upper Slab" action.
 */
export function findUpperSlabNeedingCutout(
  asset: PlacedAsset,
  project: BuildingProject,
  storyIndex: number
): { upperStoryIndex: number; slabId: string; rect: { x: number; z: number; width: number; depth: number } } | null {
  const def = getAssetDefinition(asset.assetId);
  if (!def?.isStair && !def?.isCore) return null;
  const above = project.stories.find((s) => s.index === storyIndex + 1);
  if (!above) return null;
  if (isCoveredBySlabCutout(asset, above)) return null;

  // Compute world axis-aligned footprint of the stair/lift
  const cos = Math.abs(Math.cos(asset.rotation));
  const sin = Math.abs(Math.sin(asset.rotation));
  const effW = asset.width * cos + asset.depth * sin;
  const effD = asset.width * sin + asset.depth * cos;
  const rx = asset.x - effW * 0.5;
  const rz = asset.z - effD * 0.5;

  const hostSlab = above.slabs.find(
    (s) =>
      s.type === 'floor' &&
      asset.x >= s.x + 0.1 &&
      asset.x <= s.x + s.width - 0.1 &&
      asset.z >= s.z + 0.1 &&
      asset.z <= s.z + s.depth - 0.1
  );
  if (!hostSlab) return null;

  return {
    upperStoryIndex: above.index,
    slabId: hostSlab.id,
    rect: {
      x: Number(Math.max(hostSlab.x + 0.08, rx).toFixed(3)),
      z: Number(Math.max(hostSlab.z + 0.08, rz).toFixed(3)),
      width: Number(Math.min(hostSlab.width - 0.16, effW).toFixed(3)),
      depth: Number(Math.min(hostSlab.depth - 0.16, effD).toFixed(3)),
    },
  };
}
