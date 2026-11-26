import {
  Beam,
  BuildingProject,
  ElementPhysics,
  OccupancyClass,
  PhysicsIssue,
  PhysicsReport,
  PhysicsStatus,
  Pillar,
  PlacementValidation,
  RajukCompliance,
  SeismicWindSummary,
  SoilSiteClass,
  Story,
  StructuralGrade,
  TakeoffSummary,
  Wall,
  WallMaterial,
} from '../types/building';
import { getAssetDefinition } from './assets';
import {
  computeActualPlotSetbacks,
  computeRequiredRajukRules,
  doorSwingHitsObb,
  getBnbcConfig,
  getNetSlabAreaM2,
  getPlotAreaStats,
  getWallArcLength,
  isCoveredBySlabCutout,
  OBB2D,
  obbIntersectsObb,
  obbIntersectsWall,
} from './geometryKernel';
import { CUFT_PER_CUM, formatLength, formatSection, SQFT_PER_SQM } from './units';

// BNBC 2020 Material Densities (kN/m³)
const DENSITY_KN_M3: Record<WallMaterial, number> = {
  'brick-1st': 19.2,
  'exposed-brick': 19.6,
  'fair-concrete': 24.0,
  'hollow-block': 13.5,
  rcc: 24.5,
  'jala-brick': 14.2,
  'timber-louver': 6.5,
  'gypsum-board': 8.2,
};

const CONCRETE_DENSITY_KN_M3 = 24.0;

// BNBC 2020 Occupancy Live Loads (kN/m²)
const LIVE_LOAD_KN_M2: Record<OccupancyClass, number> = {
  residential: 2.0, // ~40 psf
  office: 2.5, // ~50 psf
  commercial: 4.0, // ~80 psf
  storage: 5.0, // ~100 psf
};

const FLOOR_FINISH_DL_KN_M2 = 1.45; // Tiles + screed + ceiling plaster (~30 psf)

// Effective compressive design strength f'c (MPa)
const GRADE_FC_MPA: Record<StructuralGrade, number> = {
  'rcc-3000': 20.7,
  'rcc-3500': 24.1,
  'rcc-4000': 27.6,
  'steel-a992': 345.0,
};

// BNBC 2020 Seismic Zone Factor Z
const BNBC_ZONE_Z: Record<1 | 2 | 3 | 4, number> = {
  1: 0.12, // Khulna / Barishal
  2: 0.20, // Dhaka / Rajshahi
  3: 0.28, // Chattogram / Rangpur
  4: 0.36, // Sylhet / Mymensingh
};

// BNBC 2020 Soil Amplification Factor S
const BNBC_SOIL_S: Record<SoilSiteClass, number> = {
  SA: 1.0,
  SB: 1.2,
  SC: 1.15,
  SD: 1.35,
  SE: 1.4,
};

function statusFromUtil(u: number): PhysicsStatus {
  if (u > 1.0) return 'critical';
  if (u > 0.78) return 'warning';
  return 'ok';
}

function getColumnAxialCapacityKn(p: Pillar, clearH: number): { capacityKn: number; slenderness: number } {
  const minDim = Math.max(0.15, Math.min(p.width, p.depth));
  const areaM2 =
    p.shape === 'circular'
      ? Math.PI * (p.width * 0.5) * (p.width * 0.5)
      : p.shape === 'steel-h'
      ? Math.max(0.008, p.width * p.depth * 0.24)
      : p.width * p.depth;

  const rGyration = p.shape === 'circular' ? 0.25 * minDim : 0.3 * minDim;
  const slenderness = (1.0 * clearH) / Math.max(0.04, rGyration);
  const slenderPenalty = slenderness > 22 ? Math.max(0.55, 1 - (slenderness - 22) * 0.015) : 1.0;

  if (p.grade === 'steel-a992') {
    // 0.85 * phi(0.9) * Fy * Ag
    return {
      capacityKn: areaM2 * 345_000 * 0.52 * slenderPenalty,
      slenderness,
    };
  }

  // ACI 318 / BNBC 2020 tied RCC column: phi * Pn = 0.65 * 0.80 * [0.85 * f'c * (Ag - Ast) + fy * Ast]
  // Assuming 2.0% typical 500W TMT longitudinal steel (fy = 415-500 MPa)
  const fcKpa = GRADE_FC_MPA[p.grade] * 1000;
  const fyKpa = 460_000;
  const rho = 0.02;
  const pn = 0.8 * (0.85 * fcKpa * areaM2 * (1 - rho) + fyKpa * areaM2 * rho);
  return {
    capacityKn: 0.65 * pn * slenderPenalty,
    slenderness,
  };
}

function getWallSegmentHeight(wall: Wall, story: Story): number {
  const clearH = Math.max(2.1, story.height - story.slabThickness);
  return wall.height !== null ? Math.min(wall.height, clearH) : clearH;
}

/** Full BNBC 2020 + ETABS / CSI SAFE + RAJUK + Spatial Fit Analysis */
export function analyzeBuildingPhysics(project: BuildingProject): PhysicsReport {
  const elements: Record<string, ElementPhysics> = {};
  const issues: PhysicsIssue[] = [];
  const bnbc = getBnbcConfig(project);
  const unit = project.unitSystem;

  let totalGrossAreaM2 = 0;
  let totalWallLengthM = 0;
  let concreteVolumeM3 = 0;
  let footingConcreteM3 = 0;
  let stairConcreteM3 = 0;
  let masonryVolumeM3 = 0;
  let tileAreaM2 = 0;
  let paintAreaM2 = 0;
  let doorCount = 0;
  let windowCount = 0;
  let totalDeadLoadKn = 0;
  let totalLiveLoadKn = 0;
  let totalPillarCount = 0;
  let totalBeamCount = 0;

  const perStoryAreaM2: TakeoffSummary['perStoryAreaM2'] = [];
  const storyGravityWeightsKn: number[] = [];

  // Map column loads top-down across stories (ETABS vertical load path: Roof -> Upper -> Ground -> Footing)
  const cumulativeColLoadKn = new Map<string, number>(); // key = `${storyIdx}:${pillarId}`

  // Step 1: Precompute per-story slab, wall, beam, and asset loads
  const storyLoads = project.stories.map((story) => {
    const clearH = Math.max(2.2, story.height - story.slabThickness);
    let storyArea = 0;
    let storyDead = 0;
    let storyLive = 0;

    for (const s of story.slabs) {
      const netA = getNetSlabAreaM2(s);
      storyArea += netA;
      const slabConc = netA * s.thickness;
      concreteVolumeM3 += slabConc;
      const dl = netA * (s.thickness * CONCRETE_DENSITY_KN_M3 + FLOOR_FINISH_DL_KN_M2);
      const ll = netA * (s.type === 'balcony' ? 3.0 : LIVE_LOAD_KN_M2[story.occupancy]);
      storyDead += dl;
      storyLive += ll;
      tileAreaM2 += netA;
    }

    for (const w of story.walls) {
      const len = getWallArcLength(w);
      const wh = getWallSegmentHeight(w, story);
      const openingArea = w.openings.reduce((acc, o) => acc + o.width * o.height, 0);
      const netWallArea = Math.max(0.1, len * wh - openingArea);
      const wallVol = netWallArea * w.thickness;
      totalWallLengthM += len;
      if (w.material === 'rcc' || w.material === 'fair-concrete') {
        concreteVolumeM3 += wallVol * 0.92; // deduct column overlap
      } else {
        masonryVolumeM3 += wallVol * 0.92;
      }
      paintAreaM2 += netWallArea * 1.85;
      storyDead += wallVol * (DENSITY_KN_M3[w.material] ?? 19.2);

      for (const op of w.openings) {
        if (op.kind.startsWith('door') || op.kind === 'shutter-shop') doorCount++;
        else if (op.kind.startsWith('window')) windowCount++;
      }
    }

    for (const b of story.beams) {
      totalBeamCount++;
      const blen = Math.hypot(b.x2 - b.x1, b.z2 - b.z1);
      // Net drop depth below slab avoids double counting slab concrete
      const dropD = Math.max(0.08, b.depth - story.slabThickness);
      const bVol = blen * b.width * dropD * 0.92;
      if (b.material === 'rcc') concreteVolumeM3 += bVol;
      storyDead += blen * b.width * dropD * CONCRETE_DENSITY_KN_M3;
    }

    for (const p of story.pillars) {
      totalPillarCount++;
      const area = p.shape === 'circular' ? Math.PI * (p.width * 0.5) ** 2 : p.width * p.depth;
      const pVol = area * clearH;
      if (p.grade !== 'steel-a992') concreteVolumeM3 += pVol;
      storyDead += pVol * CONCRETE_DENSITY_KN_M3;
    }

    for (const a of story.assets) {
      const def = getAssetDefinition(a.assetId);
      if (def && !def.isExterior) {
        storyDead += def.deadLoadKn;
        if (def.isStair) {
          // RCC stair waist slab + steps concrete volume (~0.24 m³ per m² of stair footprint)
          const stVol = a.width * a.depth * 0.24;
          stairConcreteM3 += stVol;
          concreteVolumeM3 += stVol;
        }
      }
    }

    totalGrossAreaM2 += storyArea;
    totalDeadLoadKn += storyDead;
    totalLiveLoadKn += storyLive;
    perStoryAreaM2.push({
      storyIndex: story.index,
      name: story.name,
      areaM2: storyArea,
      clearHeightM: clearH,
    });
    storyGravityWeightsKn.push(storyDead + 0.25 * storyLive); // Seismic effective weight W = D + 0.25L
    return { storyArea, storyDead, storyLive, clearH };
  });

  // Add Roof slab + parapet concrete volume for top story
  const topStory = project.stories[project.stories.length - 1];
  if (topStory) {
    for (const s of topStory.slabs) {
      if (s.type === 'floor' || s.hasRoofSlab) {
        const netA = getNetSlabAreaM2(s);
        concreteVolumeM3 += netA * topStory.slabThickness;
        totalDeadLoadKn += netA * (topStory.slabThickness * CONCRETE_DENSITY_KN_M3 + 1.2);
      }
    }
  }

  // Step 2: Top-Down Column Tributary Load Transfer (Voronoi / Two-Way Tributary Grid)
  const sortedDesc = [...project.stories].sort((a, b) => b.index - a.index);
  const transferFromAbove = new Map<string, number>(); // key = `${storyIdx}:${pillarId}`

  for (const story of sortedDesc) {
    const sIdx = story.index;
    const clearH = Math.max(2.2, story.height - story.slabThickness);
    const roofMultiplier = sIdx === project.stories.length - 1 ? 1.55 : 1.0;

    // Distribute floor slab factored gravity load (1.2D + 1.6L) to columns by fine Voronoi tributary area
    const localPillarFactored = new Map<string, number>();
    for (const p of story.pillars) localPillarFactored.set(p.id, 0);

    if (story.pillars.length > 0) {
      for (const s of story.slabs) {
        const nx = Math.max(6, Math.min(16, Math.round(s.width * 2)));
        const nz = Math.max(6, Math.min(16, Math.round(s.depth * 2)));
        const cellA = (s.width / nx) * (s.depth / nz);
        const dlPerM2 = (s.thickness * CONCRETE_DENSITY_KN_M3 + FLOOR_FINISH_DL_KN_M2 + 1.8) * roofMultiplier;
        const llPerM2 = s.type === 'balcony' ? 3.0 : LIVE_LOAD_KN_M2[story.occupancy];
        const cellFactoredKn = cellA * (1.2 * dlPerM2 + 1.6 * llPerM2);

        for (let ix = 0; ix < nx; ix++) {
          const cx = s.x + ((ix + 0.5) / nx) * s.width;
          for (let iz = 0; iz < nz; iz++) {
            const cz = s.z + ((iz + 0.5) / nz) * s.depth;
            // Skip cutout holes
            const inHole = (s.cutouts ?? []).some(
              (c) => cx >= c.x && cx <= c.x + c.width && cz >= c.z && cz <= c.z + c.depth
            );
            if (inHole) continue;

            let nearest = story.pillars[0];
            let bestD2 = Infinity;
            for (const p of story.pillars) {
              const d2 = (p.x - cx) ** 2 + (p.z - cz) ** 2;
              if (d2 < bestD2) {
                bestD2 = d2;
                nearest = p;
              }
            }
            localPillarFactored.set(nearest.id, (localPillarFactored.get(nearest.id) ?? 0) + cellFactoredKn);
          }
        }
      }
    }

    // Accumulate load from story above + local factored load, then pass down to story below
    const belowStory = project.stories.find((st) => st.index === sIdx - 1);
    for (const p of story.pillars) {
      const aboveLoad = transferFromAbove.get(`${sIdx}:${p.id}`) ?? 0;
      const selfWt =
        1.2 *
        (p.shape === 'circular' ? Math.PI * (p.width * 0.5) ** 2 : p.width * p.depth) *
        clearH *
        CONCRETE_DENSITY_KN_M3;
      const totalPu = aboveLoad + (localPillarFactored.get(p.id) ?? 0) + selfWt;
      cumulativeColLoadKn.set(`${sIdx}:${p.id}`, totalPu);

      // Vertical column continuity check against lower floor
      if (belowStory) {
        let alignedBelow: Pillar | null = null;
        let bestDist = Infinity;
        for (const bp of belowStory.pillars) {
          const d = Math.hypot(bp.x - p.x, bp.z - p.z);
          if (d < bestDist) {
            bestDist = d;
            alignedBelow = bp;
          }
        }
        if (alignedBelow && bestDist <= 0.35) {
          const key = `${belowStory.index}:${alignedBelow.id}`;
          transferFromAbove.set(key, (transferFromAbove.get(key) ?? 0) + totalPu);
        } else {
          // Floating column warning/critical!
          issues.push({
            id: `col-float-${sIdx}-${p.id}`,
            severity: 'critical',
            storyIndex: sIdx,
            elementId: p.id,
            elementType: 'pillar',
            category: 'structural',
            title: `Floating Column ${p.label} (No Support Below)`,
            detail: `Column ${p.label} on ${story.name} does not align vertically with a column on ${belowStory.name} (offset ${formatLength(bestDist, unit)}).`,
            fixHint: `Align ${p.label} directly over a column on ${belowStory.name} or add a matching column below.`,
            simpleTitle: `Pillar ${p.label} has no pillar underneath it`,
            simpleFix: `Place a matching pillar in the exact same spot on ${belowStory.name}.`,
          });
          if (alignedBelow) {
            const key = `${belowStory.index}:${alignedBelow.id}`;
            transferFromAbove.set(key, (transferFromAbove.get(key) ?? 0) + totalPu);
          }
        }
      }
    }
  }

  // Step 3: Evaluate Every Story's Columns (Axial, Slenderness, Footing), Beams (M/V/Deflection), Slabs (Punching/Thickness), Walls, Openings & Spatial Fit
  let maxFootingPressureKpa = 0;

  for (const story of project.stories) {
    const sIdx = story.index;
    const clearH = Math.max(2.2, story.height - story.slabThickness);

    // 3A. Pillars + Ground Isolated Footing Bearing (CSI SAFE style)
    for (const p of story.pillars) {
      const pu = cumulativeColLoadKn.get(`${sIdx}:${p.id}`) ?? 45;
      const { capacityKn, slenderness } = getColumnAxialCapacityKn(p, clearH);
      let util = pu / Math.max(10, capacityKn);
      const minDimM = Math.min(p.width, p.depth);

      // BNBC 2020 Seismic minimum column dimension: 10" (250mm) for low-rise (<=2F), 12" (300mm) for 3F+
      const minCodeDim = project.stories.length >= 3 ? 0.295 : 0.245;
      if (minDimM < minCodeDim - 0.005 && p.shape !== 'circular') {
        util = Math.max(util, 0.88);
        issues.push({
          id: `col-min-${sIdx}-${p.id}`,
          severity: minDimM < 0.22 ? 'critical' : 'warning',
          storyIndex: sIdx,
          elementId: p.id,
          elementType: 'pillar',
          category: 'structural',
          title: `Column ${p.label} Below BNBC Seismic Min Size`,
          detail: `Column ${p.label} is ${formatSection(minDimM, unit)} wide; BNBC 2020 recommends >= ${formatSection(minCodeDim + 0.005, unit)} for ${project.stories.length}-story RCC frames.`,
          fixHint: `Increase column ${p.label} cross-section to at least ${formatSection(minCodeDim + 0.005, unit)}.`,
          simpleTitle: `Pillar ${p.label} is thinner than code minimum`,
          simpleFix: `Widen pillar ${p.label} to at least ${formatSection(minCodeDim + 0.005, unit)} in the inspector.`,
        });
      }

      // Ground floor isolated footing sizing & soil bearing check
      let footingSizeM: number | undefined;
      let footingPressureKpa: number | undefined;
      if (sIdx === 0) {
        const serviceLoadKn = pu / 1.35; // Unfactored service axial load
        // Auto-sized standard footing from 1.2m up to 2.6m
        const reqArea = (serviceLoadKn * 1.1) / Math.max(60, bnbc.soilBearingKpa);
        footingSizeM = Math.max(1.2, Math.min(2.8, Math.ceil(Math.sqrt(reqArea) * 10) / 10));
        footingPressureKpa = (serviceLoadKn * 1.1) / (footingSizeM * footingSizeM);
        maxFootingPressureKpa = Math.max(maxFootingPressureKpa, footingPressureKpa);
        footingConcreteM3 += footingSizeM * footingSizeM * 0.42;

        if (footingPressureKpa > bnbc.soilBearingKpa * 1.05) {
          util = Math.max(util, footingPressureKpa / bnbc.soilBearingKpa);
          issues.push({
            id: `footing-${p.id}`,
            severity: 'warning',
            storyIndex: 0,
            elementId: p.id,
            elementType: 'pillar',
            category: 'structural',
            title: `High Soil Bearing Under ${p.label}`,
            detail: `Estimated footing pressure (${footingPressureKpa.toFixed(0)} kPa) exceeds soil bearing capacity q_allow (${bnbc.soilBearingKpa} kPa).`,
            fixHint: `Add intermediate columns, increase soil bearing via mat/pile foundation, or reduce stories.`,
            simpleTitle: `Foundation load is heavy under pillar ${p.label}`,
            simpleFix: `Consider adding a support pillar or using a mat/pile foundation for this soil.`,
          });
        }
      }

      if (util > 1.0) {
        issues.push({
          id: `col-over-${sIdx}-${p.id}`,
          severity: 'critical',
          storyIndex: sIdx,
          elementId: p.id,
          elementType: 'pillar',
          category: 'structural',
          title: `Column ${p.label} Overstressed (D/C ${util.toFixed(2)})`,
          detail: `Factored axial load Pu = ${pu.toFixed(0)} kN exceeds design capacity φPn = ${capacityKn.toFixed(0)} kN.`,
          fixHint: `Increase column size to 12"x15" or 12"x18", or upgrade concrete to 4000 psi.`,
          simpleTitle: `Pillar ${p.label} is carrying too much weight`,
          simpleFix: `Make pillar ${p.label} thicker or add another pillar nearby.`,
        });
      }

      const st = statusFromUtil(util);
      elements[p.id] = {
        id: p.id,
        storyIndex: sIdx,
        type: 'pillar',
        utilization: util,
        status: st,
        simpleSummary:
          st === 'ok'
            ? `Pillar ${p.label} is well within safe BNBC 2020 capacity (${Math.round(util * 100)}%).`
            : st === 'warning'
            ? `Pillar ${p.label} is near upper limit (${Math.round(util * 100)}%).`
            : `Pillar ${p.label} exceeds safe capacity (${Math.round(util * 100)}%).`,
        primaryMetricLabel: 'Axial Load Pu / φPn',
        primaryMetricValue: `${pu.toFixed(0)} / ${capacityKn.toFixed(0)} kN`,
        secondaryMetricLabel: sIdx === 0 ? 'Footing Est. / KL/r' : 'Slenderness KL/r',
        secondaryMetricValue:
          sIdx === 0 && footingSizeM
            ? `${footingSizeM.toFixed(1)}m sq (${footingPressureKpa?.toFixed(0)} kPa)`
            : `${slenderness.toFixed(1)}`,
        axialLoadKn: pu,
        capacityKn,
        slenderness,
        footingSizeM,
        footingPressureKpa,
      };
    }

    // 3B. Beams (Clear Span, Deflection L/d, Bending Moment Mu/φMn & Shear Vu/φVn)
    for (const b of story.beams) {
      const spanM = Math.hypot(b.x2 - b.x1, b.z2 - b.z1);
      // Tributary width estimate (~3.2m typical bay)
      const tribW = Math.min(4.2, Math.max(1.8, spanM * 0.55));
      const wuKnM =
        (1.2 * (story.slabThickness * CONCRETE_DENSITY_KN_M3 + FLOOR_FINISH_DL_KN_M2 + 2.4) +
          1.6 * LIVE_LOAD_KN_M2[story.occupancy]) *
        tribW;
      // Continuous frame negative/positive design moment Mu ≈ wu * L² / 10, shear Vu ≈ 0.55 * wu * L
      const muKnM = (wuKnM * spanM * spanM) / 10;
      const dEff = Math.max(0.15, b.depth - 0.05);
      // Singly-reinforced RCC moment capacity φMn (with ρ ≈ 1.4%, fy = 500 MPa)
      const phiMn = b.material === 'steel' ? b.width * dEff * dEff * 4800 : 0.9 * b.width * dEff * dEff * 4100;
      const momentUtil = muKnM / Math.max(5, phiMn);
      const spanDepthLimit = b.material === 'steel' ? 20 : 16.5; // BNBC continuous beam L/h
      const deflUtil = spanM / Math.max(0.15, b.depth * spanDepthLimit);
      const util = Math.max(momentUtil, deflUtil);

      if (util > 1.0) {
        issues.push({
          id: `beam-over-${sIdx}-${b.id}`,
          severity: util > 1.25 ? 'critical' : 'warning',
          storyIndex: sIdx,
          elementId: b.id,
          elementType: 'beam',
          category: 'structural',
          title: `Beam Over-Spanned (${formatLength(spanM, unit)} span)`,
          detail: `Beam depth ${formatSection(b.depth, unit)} yields D/C ${util.toFixed(2)} (Mu = ${muKnM.toFixed(0)} kN·m vs φMn = ${phiMn.toFixed(0)} kN·m).`,
          fixHint: `Increase beam depth to ${formatSection(Math.ceil((spanM / 14) / 0.0254) * 0.0254, unit)} or add an intermediate column.`,
          simpleTitle: `Beam span is too long for its depth`,
          simpleFix: `Make this beam deeper or add a supporting pillar along the span.`,
        });
      }

      const st = statusFromUtil(util);
      elements[b.id] = {
        id: b.id,
        storyIndex: sIdx,
        type: 'beam',
        utilization: util,
        status: st,
        simpleSummary:
          st === 'ok'
            ? `Beam span (${formatLength(spanM, unit)}) is structurally sound.`
            : `Beam depth is tight for its ${formatLength(spanM, unit)} span.`,
        primaryMetricLabel: 'Moment Mu / φMn',
        primaryMetricValue: `${muKnM.toFixed(0)} / ${phiMn.toFixed(0)} kN·m`,
        secondaryMetricLabel: 'Span / Depth',
        secondaryMetricValue: `${(spanM / Math.max(0.1, b.depth)).toFixed(1)} (max ${spanDepthLimit})`,
        clearSpanM: spanM,
      };
    }

    // 3C. Slabs (Two-Way Thickness Check + Veranda Roof Check)
    for (const s of story.slabs) {
      const perim = 2 * (s.width + s.depth);
      const minThickM = s.type === 'balcony' ? 0.12 : Math.max(0.125, Math.min(0.175, perim / 240));
      const util = minThickM / Math.max(0.08, s.thickness);
      if (s.thickness < 0.115) {
        issues.push({
          id: `slab-thin-${sIdx}-${s.id}`,
          severity: 'warning',
          storyIndex: sIdx,
          elementId: s.id,
          elementType: 'slab',
          category: 'structural',
          title: `Slab "${s.label}" Thinner Than BNBC 5" Minimum`,
          detail: `Slab thickness ${formatSection(s.thickness, unit)} is below standard 5" (125mm) RCC residential slab minimum.`,
          fixHint: `Increase slab thickness to at least 5" (127 mm).`,
          simpleTitle: `Floor slab "${s.label}" is too thin`,
          simpleFix: `Set slab thickness to 5 inches (127 mm) or thicker.`,
        });
      }
      elements[s.id] = {
        id: s.id,
        storyIndex: sIdx,
        type: 'slab',
        utilization: Math.min(1.2, util * 0.72),
        status: s.thickness < 0.115 ? 'warning' : 'ok',
        simpleSummary: `Net slab area ${Math.round(getNetSlabAreaM2(s) * SQFT_PER_SQM)} sq ft (${formatSection(s.thickness, unit)} thick).`,
        primaryMetricLabel: 'Net Area',
        primaryMetricValue: `${getNetSlabAreaM2(s).toFixed(1)} m²`,
        secondaryMetricLabel: 'Thickness',
        secondaryMetricValue: formatSection(s.thickness, unit),
      };
    }

    // 3D. Walls & Openings (Slenderness, Opening Headroom vs Beam Soffit, Curved Wall Radius)
    const maxBeamDepth = story.beams.reduce((m, b) => Math.max(m, b.depth), 0.35);
    const beamSoffitClear = story.height - maxBeamDepth;

    for (const w of story.walls) {
      const len = getWallArcLength(w);
      const wh = getWallSegmentHeight(w, story);
      const slenderness = wh / Math.max(0.08, w.thickness);
      const maxSlender = w.role === 'load-bearing' ? 24 : 32;
      const util = slenderness / maxSlender;

      for (const op of w.openings) {
        const opTop = op.sillHeight + op.height;
        if (opTop > clearH + 0.02) {
          issues.push({
            id: `op-tall-${sIdx}-${op.id}`,
            severity: 'critical',
            storyIndex: sIdx,
            elementId: w.id,
            elementType: 'wall',
            category: 'spatial',
            title: `Opening Exceeds Clear Floor Height`,
            detail: `Opening top (${formatLength(opTop, unit)}) exceeds ceiling clear height (${formatLength(clearH, unit)}).`,
            fixHint: `Reduce opening height or increase story height.`,
            simpleTitle: `Door/window is taller than the wall`,
            simpleFix: `Lower the door/window height so it fits cleanly under the beam.`,
          });
        } else if (opTop > beamSoffitClear + 0.16 && w.role === 'load-bearing') {
          issues.push({
            id: `op-beam-${sIdx}-${op.id}`,
            severity: 'warning',
            storyIndex: sIdx,
            elementId: w.id,
            elementType: 'wall',
            category: 'structural',
            title: `Opening Crowds Perimeter Drop Beam`,
            detail: `Opening top (${formatLength(opTop, unit)}) rises close to drop beam soffit (${formatLength(beamSoffitClear, unit)}).`,
            fixHint: `Keep doors/windows at 7'-0" (2.13m) or increase floor height to 10'-6".`,
            simpleTitle: `Door/window is very close to the overhead beam`,
            simpleFix: `Use standard 7 ft height for doors and windows.`,
          });
        }
      }

      elements[w.id] = {
        id: w.id,
        storyIndex: sIdx,
        type: 'wall',
        utilization: Math.min(1.5, util * 0.78),
        status: util > 1.0 ? 'warning' : 'ok',
        simpleSummary: `${w.curveOffset ? 'Curved' : 'Straight'} wall (${formatLength(len, unit)} long, ${formatSection(w.thickness, unit)} thick).`,
        primaryMetricLabel: 'Arc Length',
        primaryMetricValue: formatLength(len, unit),
        secondaryMetricLabel: 'Height/Thick',
        secondaryMetricValue: `${slenderness.toFixed(1)}`,
      };
    }

    // 3E. Spatial Fit & Circulation Checks (Stairwell Slab Cutout, Furniture Collisions, Door Swings)
    const aboveStory = project.stories.find((st) => st.index === sIdx + 1);
    const interiorAssets = story.assets.filter((a) => !getAssetDefinition(a.assetId)?.isExterior);

    for (let i = 0; i < story.assets.length; i++) {
      const a = story.assets[i];
      const def = getAssetDefinition(a.assetId);
      let assetStatus: PhysicsStatus = 'ok';
      let assetUtil = 0.35;

      // Staircase upper slab cutout verification!
      if (def?.isStair && aboveStory) {
        if (!isCoveredBySlabCutout(a, aboveStory)) {
          assetStatus = 'critical';
          assetUtil = 1.25;
          issues.push({
            id: `stair-cutout-${sIdx}-${a.id}`,
            severity: 'critical',
            storyIndex: sIdx,
            elementId: a.id,
            elementType: 'asset',
            category: 'circulation',
            title: `Staircase "${a.label}" Hits Solid Upper Slab`,
            detail: `No matching stairwell slab cutout found on ${aboveStory.name} above this staircase.`,
            fixHint: `Add a Slab Cutout on ${aboveStory.name} directly above the staircase footprint.`,
            simpleTitle: `Staircase has no ceiling opening on ${aboveStory.name}`,
            simpleFix: `Use the Slab Cutout tool on ${aboveStory.name} to open the stairwell.`,
          });
        }
      }

      // Skip overhead mounted items (ceiling fan, split AC, geyser) and exterior landscape for floor OBB collisions
      const isFloorObstacle =
        !def?.isExterior &&
        (a.elevationY ?? def?.defaultElevationY ?? 0) < 1.2 &&
        !def?.isStair &&
        !def?.isCore &&
        a.assetId !== 'ugr-hatch';

      if (isFloorObstacle) {
        const aObb: OBB2D = {
          cx: a.x,
          cz: a.z,
          hx: a.width * 0.5,
          hz: a.depth * 0.5,
          angle: a.rotation,
        };

        // Check wall overlap
        for (const w of story.walls) {
          if (obbIntersectsWall(aObb, w, 0.045)) {
            assetStatus = 'critical';
            assetUtil = 1.15;
            issues.push({
              id: `fit-wall-${sIdx}-${a.id}-${w.id}`,
              severity: 'critical',
              storyIndex: sIdx,
              elementId: a.id,
              elementType: 'asset',
              category: 'spatial',
              title: `"${a.label}" Intersects Wall`,
              detail: `"${a.label}" overlaps wall masonry on ${story.name}.`,
              fixHint: `Move "${a.label}" slightly away from the wall or snap cleanly against its inner face.`,
              simpleTitle: `${a.label} is cutting into a wall`,
              simpleFix: `Drag ${a.label} inside the room so it snaps cleanly against the wall.`,
            });
            break;
          }
        }

        // Check pillar overlap
        for (const p of story.pillars) {
          const pObb: OBB2D = { cx: p.x, cz: p.z, hx: p.width * 0.5, hz: p.depth * 0.5, angle: p.rotation };
          if (obbIntersectsObb(aObb, pObb, 0.04)) {
            assetStatus = 'critical';
            assetUtil = 1.15;
            issues.push({
              id: `fit-col-${sIdx}-${a.id}-${p.id}`,
              severity: 'critical',
              storyIndex: sIdx,
              elementId: a.id,
              elementType: 'asset',
              category: 'spatial',
              title: `"${a.label}" Collides With Column ${p.label}`,
              detail: `"${a.label}" intersects structural column ${p.label} on ${story.name}.`,
              fixHint: `Reposition "${a.label}" clear of column ${p.label}.`,
              simpleTitle: `${a.label} hits pillar ${p.label}`,
              simpleFix: `Move ${a.label} clear of the concrete pillar.`,
            });
            break;
          }
        }

        // Check hinged door swing clearance
        for (const w of story.walls) {
          let hitDoor = false;
          for (const op of w.openings) {
            if (doorSwingHitsObb(w, op, aObb)) {
              assetStatus = assetStatus === 'critical' ? 'critical' : 'warning';
              assetUtil = Math.max(assetUtil, 0.92);
              issues.push({
                id: `fit-door-${sIdx}-${a.id}-${op.id}`,
                severity: 'warning',
                storyIndex: sIdx,
                elementId: a.id,
                elementType: 'asset',
                category: 'circulation',
                title: `Door Swing Blocked by "${a.label}"`,
                detail: `A hinged door on ${story.name} swings into "${a.label}".`,
                fixHint: `Move "${a.label}" outside the door swing arc or flip the door swing direction.`,
                simpleTitle: `Door hits ${a.label} when opening`,
                simpleFix: `Slide ${a.label} slightly clear of the doorway or flip door swing.`,
              });
              hitDoor = true;
              break;
            }
          }
          if (hitDoor) break;
        }

        // Check asset-to-asset floor overlap (only once per pair i < j)
        for (let j = i + 1; j < interiorAssets.length; j++) {
          const b = interiorAssets[j];
          if (b.id === a.id) continue;
          const bDef = getAssetDefinition(b.assetId);
          if (
            (b.elevationY ?? bDef?.defaultElevationY ?? 0) >= 1.2 ||
            bDef?.isStair ||
            bDef?.isCore ||
            b.assetId === 'ugr-hatch'
          ) {
            continue;
          }
          const bObb: OBB2D = {
            cx: b.x,
            cz: b.z,
            hx: b.width * 0.5,
            hz: b.depth * 0.5,
            angle: b.rotation,
          };
          if (obbIntersectsObb(aObb, bObb, 0.05)) {
            assetStatus = 'critical';
            assetUtil = 1.12;
            issues.push({
              id: `fit-asset-${sIdx}-${a.id}-${b.id}`,
              severity: 'critical',
              storyIndex: sIdx,
              elementId: a.id,
              elementType: 'asset',
              category: 'spatial',
              title: `"${a.label}" Overlaps "${b.label}"`,
              detail: `"${a.label}" and "${b.label}" overlap spatially on ${story.name}.`,
              fixHint: `Separate "${a.label}" and "${b.label}" for comfortable walking clearance.`,
              simpleTitle: `${a.label} overlaps ${b.label}`,
              simpleFix: `Move one of the items so they have clean space between them.`,
            });
          }
        }
      }

      elements[a.id] = {
        id: a.id,
        storyIndex: sIdx,
        type: 'asset',
        utilization: assetUtil,
        status: assetStatus,
        simpleSummary:
          assetStatus === 'ok'
            ? `"${a.label}" fits cleanly with zero collision.`
            : `"${a.label}" has a spatial or stairwell clearance issue.`,
        primaryMetricLabel: 'Footprint',
        primaryMetricValue: `${formatLength(a.width, unit)} × ${formatLength(a.depth, unit)}`,
        secondaryMetricLabel: 'Dead Load',
        secondaryMetricValue: `${(def?.deadLoadKn ?? 0.5).toFixed(1)} kN`,
      };
    }
  }

  // Step 4: RAJUK / Bangladesh Imarat Nirman Bidhimala Compliance (Setbacks, MGC, FAR)
  const { footprintAreaM2, actualSetbacks } = computeActualPlotSetbacks(project);
  let rajuk: RajukCompliance;
  if (project.plot) {
    const plotStats = getPlotAreaStats(project.plot);
    const rules = computeRequiredRajukRules(project.plot, bnbc, project.stories.length);
    const actualMgcPct = plotStats.areaM2 > 0 ? (footprintAreaM2 / plotStats.areaM2) * 100 : 0;
    // Exclude stilt parking ground floor from FAR per RAJUK practice if ground floor has cars & <= 25% enclosed rooms
    const groundStory = project.stories[0];
    const isStiltParking =
      groundStory &&
      groundStory.assets.some((a) => a.assetId === 'car-sedan') &&
      groundStory.rooms.some((r) => /parking|stilt|garage/i.test(r.name));
    const farCountableArea = isStiltParking
      ? Math.max(0, totalGrossAreaM2 - (storyLoads[0]?.storyArea ?? 0) * 0.72)
      : totalGrossAreaM2;
    const actualFar = plotStats.areaM2 > 0 ? farCountableArea / plotStats.areaM2 : 0;

    const tol = 0.06; // 6cm tolerance for plaster finish
    const frontOk = actualSetbacks.front >= rules.requiredSetbacks.front - tol;
    const rearOk = actualSetbacks.rear >= rules.requiredSetbacks.rear - tol;
    const leftOk = actualSetbacks.left >= rules.requiredSetbacks.left - tol;
    const rightOk = actualSetbacks.right >= rules.requiredSetbacks.right - tol;
    const setbacksOk = frontOk && rearOk && leftOk && rightOk;
    const mgcOk = actualMgcPct <= rules.maxMgcPct + 1.0;
    const farOk = actualFar <= rules.maxFar + 0.05;

    if (!setbacksOk) {
      const violated: string[] = [];
      if (!frontOk) violated.push(`Front ${formatLength(actualSetbacks.front, unit)} < ${formatLength(rules.requiredSetbacks.front, unit)}`);
      if (!rearOk) violated.push(`Rear ${formatLength(actualSetbacks.rear, unit)} < ${formatLength(rules.requiredSetbacks.rear, unit)}`);
      if (!leftOk) violated.push(`Left ${formatLength(actualSetbacks.left, unit)} < ${formatLength(rules.requiredSetbacks.left, unit)}`);
      if (!rightOk) violated.push(`Right ${formatLength(actualSetbacks.right, unit)} < ${formatLength(rules.requiredSetbacks.right, unit)}`);

      issues.push({
        id: 'rajuk-setback-violation',
        severity: 'critical',
        storyIndex: 0,
        elementId: project.stories[0]?.slabs[0]?.id ?? 'plot',
        elementType: 'slab',
        category: 'legal',
        title: 'RAJUK / BNBC Legal Setback Violation',
        detail: `Building encroaches on mandatory neighbor/road open space: ${violated.join(', ')}.`,
        fixHint: `Keep required open setback from plot borders so adjacent side-to-side buildings never collide.`,
        simpleTitle: 'Building is too close to the land boundary',
        simpleFix: `Leave legal gap around the plot (${violated.join(', ')}) so neighboring buildings don't collide.`,
      });
    }

    if (!mgcOk) {
      issues.push({
        id: 'rajuk-mgc-violation',
        severity: 'warning',
        storyIndex: 0,
        elementId: project.stories[0]?.slabs[0]?.id ?? 'plot',
        elementType: 'slab',
        category: 'legal',
        title: `Ground Coverage (${actualMgcPct.toFixed(1)}%) Exceeds ${rules.maxMgcPct}% Limit`,
        detail: `RAJUK / Bidhimala MGC limit for this plot size is ${rules.maxMgcPct}%.`,
        fixHint: `Trim slab footprint slightly or widen plot dimensions.`,
        simpleTitle: `Building covers too much of the land (${actualMgcPct.toFixed(1)}%)`,
        simpleFix: `Keep ground footprint under ${rules.maxMgcPct}% of plot area.`,
      });
    }

    if (!farOk) {
      issues.push({
        id: 'rajuk-far-violation',
        severity: 'warning',
        storyIndex: 0,
        elementId: project.stories[0]?.slabs[0]?.id ?? 'plot',
        elementType: 'slab',
        category: 'legal',
        title: `FAR (${actualFar.toFixed(2)}) Exceeds Allowable ${rules.maxFar}`,
        detail: `Total countable floor area exceeds RAJUK FAR ${rules.maxFar} for ${bnbc.roadWidthM.toFixed(1)}m road width.`,
        fixHint: `Reduce number of stories or trim floor plate area.`,
        simpleTitle: `Too many floors for this land & road width`,
        simpleFix: `Reduce floor count or floor area to stay within allowable FAR ${rules.maxFar}.`,
      });
    }

    rajuk = {
      hasPlot: true,
      landContext: rules.landContext,
      plotAreaM2: plotStats.areaM2,
      plotKatha: plotStats.katha,
      plotShotok: plotStats.shotok,
      footprintAreaM2,
      grossFloorAreaM2: totalGrossAreaM2,
      actualMgcPct,
      maxMgcPct: rules.maxMgcPct,
      mgcOk,
      actualFar,
      maxFar: rules.maxFar,
      farOk,
      requiredSetbacks: rules.requiredSetbacks,
      actualSetbacks,
      setbacksOk,
    };
  } else {
    rajuk = {
      hasPlot: false,
      landContext: bnbc.landContext,
      plotAreaM2: 0,
      plotKatha: 0,
      plotShotok: 0,
      footprintAreaM2,
      grossFloorAreaM2: totalGrossAreaM2,
      actualMgcPct: 0,
      maxMgcPct: 65,
      mgcOk: true,
      actualFar: 0,
      maxFar: 3.35,
      farOk: true,
      requiredSetbacks: { front: 1.5, rear: 1.0, left: 1.0, right: 1.0 },
      actualSetbacks: { front: 0, rear: 0, left: 0, right: 0 },
      setbacksOk: true,
    };
  }

  // Step 5: BNBC 2020 Seismic Base Shear (Equivalent Static Method) & Wind Drift Check
  const totalHeightM = project.stories.reduce((s, st) => s + st.height, 0);
  const totalSeismicW = storyGravityWeightsKn.reduce((s, w) => s + w, 0);
  const Z = BNBC_ZONE_Z[bnbc.seismicZone];
  const S = BNBC_SOIL_S[bnbc.soilClass];
  const I = 1.0; // Residential/Commercial Occupancy Category II
  const R = 5.0; // IMRF (Intermediate Moment Resisting Frame — standard Dhaka RCC)
  const T = 0.0466 * Math.pow(Math.max(3, totalHeightM), 0.9);
  const Cs = Math.max(0.044 * Z * I, Math.min((2 / 3) * Z * I * S * 2.5 / R, (2 / 3) * Z * I * S * (1.2 / Math.max(0.3, T)) / R));
  const baseShearKn = Cs * totalSeismicW;

  // Wind base shear (BNBC 2020 qz = 0.000613 * V² kN/m² * Gust * Cp)
  const facadeW = Math.sqrt(Math.max(10, footprintAreaM2));
  const qzKnM2 = 0.000613 * bnbc.windSpeedMs * bnbc.windSpeedMs * 0.72;
  const windBaseShearKn = qzKnM2 * facadeW * totalHeightM * 1.1;

  // Story lateral stiffness & drift estimate (Δ/h <= 0.020 per BNBC 2020)
  const gStory = project.stories[0];
  const sumColI = (gStory?.pillars ?? []).reduce((sum, p) => {
    const b = p.width;
    const h = p.depth;
    return sum + (b * h * h * h) / 12;
  }, 0.001);
  const EcKpa = 4700 * Math.sqrt(bnbc.concretePsi * 0.006895) * 1000;
  const h1 = gStory?.height ?? 3.048;
  const lateralStiffKnM = (12 * EcKpa * sumColI) / (h1 * h1 * h1);
  const govLateralKn = Math.max(baseShearKn, windBaseShearKn);
  const elasticDrift = govLateralKn / Math.max(5000, lateralStiffKnM);
  const driftRatio = (elasticDrift * 4.5) / h1; // Cd = 4.5 inelastic drift multiplier
  const maxDriftRatio = 0.02;
  const driftOk = driftRatio <= maxDriftRatio;

  if (!driftOk) {
    issues.push({
      id: 'bnbc-drift-exceeded',
      severity: 'warning',
      storyIndex: 0,
      elementId: gStory?.pillars[0]?.id ?? 'frame',
      elementType: 'pillar',
      category: 'structural',
      title: `Seismic Story Drift (${(driftRatio * 100).toFixed(2)}%) Exceeds 2.0% Limit`,
      detail: `Lateral stiffness under BNBC Zone ${bnbc.seismicZone} (Z=${Z}) produces drift ratio ${driftRatio.toFixed(4)} > 0.020.`,
      fixHint: `Increase ground-floor column sizes or add RCC shear walls around the lift/stair core.`,
      simpleTitle: `Building needs stronger columns for earthquake safety`,
      simpleFix: `Increase pillar sizes on the ground floor or add concrete core walls.`,
    });
  }

  const seismicWind: SeismicWindSummary = {
    zone: bnbc.seismicZone,
    zoneFactorZ: Z,
    soilClass: bnbc.soilClass,
    windSpeedMs: bnbc.windSpeedMs,
    baseShearKn,
    windBaseShearKn,
    driftRatio,
    maxDriftRatio,
    driftOk,
    maxFootingPressureKpa,
    allowBearingKpa: bnbc.soilBearingKpa,
    footingOk: maxFootingPressureKpa <= bnbc.soilBearingKpa * 1.05,
  };

  // Step 6: Authentic Bangladeshi Construction BOQ Estimation (PWD / Market Norms)
  const totalConcreteM3 = concreteVolumeM3 + footingConcreteM3;
  // Standard 1:1.5:3 RCC mix (1.54 dry vol factor): ~7.6 bags cement/m³, 15.2 cft Sylhet sand/m³, 30.4 cft stone chips/m³
  // Standard 1st-class brick masonry (9.5"x4.5"x2.75"): ~415 bricks/m³, 1.9 bags cement/m³, 10.5 cft local sand/m³
  const estimatedBricks = Math.round(masonryVolumeM3 * 415);
  const rccCementBags = totalConcreteM3 * 7.6;
  const masonryPlasterCementBags = masonryVolumeM3 * 1.9 + paintAreaM2 * 0.095;
  const estimatedCementBags = Math.round(rccCementBags + masonryPlasterCementBags);
  const sandSylhetCft = Math.round(totalConcreteM3 * 0.42 * CUFT_PER_CUM);
  const sandLocalCft = Math.round((masonryVolumeM3 * 0.3 + paintAreaM2 * 0.016) * CUFT_PER_CUM);
  const stoneChipsCft = Math.round(totalConcreteM3 * 0.84 * CUFT_PER_CUM);
  // Standard Bangladesh RCC rebar rate: ~108 kg/m³ average across footings, columns, beams, slabs & stairs
  const steelWeightKg = Math.round(totalConcreteM3 * 108);

  // Realistic Bangladesh turnkey grey + standard finish cost estimate (BDT Lakhs):
  // Urban RCC ~ 2,400 - 2,850 BDT/sq ft; Village 1-2F ~ 1,950 - 2,250 BDT/sq ft
  const grossSqft = totalGrossAreaM2 * SQFT_PER_SQM;
  const bdtPerSqft = bnbc.landContext === 'village' ? 2150 : project.stories.length >= 4 ? 2750 : 2450;
  const estimatedBdtLakhs = Number(((grossSqft * bdtPerSqft) / 100_000).toFixed(1));

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const maxUtilization = Object.values(elements).reduce((m, e) => Math.max(m, e.utilization), 0);
  const overallStatus: PhysicsStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'ok';

  return {
    overallStatus,
    maxUtilization,
    criticalCount,
    warningCount,
    elements,
    issues,
    rajuk,
    seismicWind,
    takeoff: {
      totalGrossAreaM2,
      footprintAreaM2,
      perStoryAreaM2,
      totalWallLengthM,
      concreteVolumeM3: totalConcreteM3,
      footingConcreteM3,
      stairConcreteM3,
      masonryVolumeM3,
      estimatedBricks,
      estimatedCementBags,
      steelWeightKg,
      sandLocalCft,
      sandSylhetCft,
      stoneChipsCft,
      tileAreaM2,
      paintAreaM2,
      doorCount,
      windowCount,
      estimatedBdtLakhs,
      totalDeadLoadKn,
      totalLiveLoadKn,
      totalFactoredLoadKn: 1.2 * totalDeadLoadKn + 1.6 * totalLiveLoadKn,
      pillarCount: totalPillarCount,
      beamCount: totalBeamCount,
    },
  };
}

/** Real-time strict physics placement validator used during 2D CAD drafting */
export function validateWallPlacement(
  _story: Story,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  _strictLock: boolean
): PlacementValidation {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.25) {
    return {
      allowed: false,
      reason: 'Wall segment is shorter than 10 inches (0.25m).',
      fixHint: 'Drag further to draw a valid wall.',
    };
  }
  return { allowed: true };
}

export function validatePillarPlacement(
  story: Story,
  x: number,
  z: number,
  strictLock: boolean
): PlacementValidation {
  for (const p of story.pillars) {
    if (Math.hypot(p.x - x, p.z - z) < 0.45) {
      return {
        allowed: !strictLock,
        reason: `Too close to existing column ${p.label}.`,
        fixHint: 'Space columns cleanly on your structural grid (typically 10 ft to 16 ft apart).',
      };
    }
  }
  return { allowed: true };
}
