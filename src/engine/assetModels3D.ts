import * as THREE from 'three';

export interface AssetBuildOptions {
  colorOverride?: string;
  heatmapColor?: number;
  selected?: boolean;
  clippingPlanes?: THREE.Plane[];
}

function makeMat(
  color: number | string,
  roughness = 0.65,
  metalness = 0.08,
  opts?: {
    transparent?: boolean;
    opacity?: number;
    heatmapColor?: number;
    selected?: boolean;
    clippingPlanes?: THREE.Plane[];
    side?: THREE.Side;
  }
): THREE.MeshStandardMaterial {
  const baseColor = opts?.heatmapColor !== undefined ? opts.heatmapColor : color;
  return new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness,
    metalness,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
    side: opts?.side ?? THREE.FrontSide,
    emissive: opts?.selected ? new THREE.Color(0x1d4ed8) : new THREE.Color(0x000000),
    emissiveIntensity: opts?.selected ? 0.14 : 0,
    clippingPlanes: opts?.clippingPlanes ?? [],
    clipShadows: true,
  });
}

function addBox(
  parent: THREE.Group,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  castShadow = true
): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.008, w), Math.max(0.008, h), Math.max(0.008, d)),
    mat
  );
  m.position.set(x, y, z);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function addCyl(
  parent: THREE.Group,
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  segs = 14
): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.max(0.004, rTop), Math.max(0.004, rBot), Math.max(0.008, h), segs),
    mat
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Connect two exact 3D points with a sloped rod/beam using exact vector orientation.
 * Eliminates all sign/pitch bugs on staircase waist slabs, stringers, and handrails!
 */
function addSegmentBar(
  parent: THREE.Group,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  width: number,
  height: number,
  mat: THREE.Material
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.01, width), Math.max(0.01, height), Math.max(0.01, len)),
    mat
  );
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  mesh.position.copy(mid);
  mesh.lookAt(p2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Build an exact, code-accurate RCC stair flight with waist slab, treads, nosing, balusters & sloped handrail */
function buildAccurateFlight(
  group: THREE.Group,
  startX: number,
  startY: number,
  startZ: number,
  endZ: number,
  flightW: number,
  riseH: number,
  steps: number,
  treadMat: THREE.Material,
  rccMat: THREE.Material,
  railMat: THREE.Material,
  railOnLeft: boolean,
  railOnRight: boolean
): void {
  const runZ = endZ - startZ;
  const stepZ = runZ / steps;
  const stepH = riseH / steps;
  const dirZ = Math.sign(runZ) || 1;
  const absStepZ = Math.abs(stepZ);

  // Sloped RCC waist slab underneath treads (exact point-to-point orientation!)
  const wStart = new THREE.Vector3(startX, Math.max(0.04, startY - 0.05), startZ);
  const wEnd = new THREE.Vector3(startX, startY + riseH - 0.11, endZ);
  addSegmentBar(group, wStart, wEnd, flightW - 0.01, 0.14, rccMat);

  // Individual concrete risers & marble/tile treads with crisp nosing
  for (let i = 0; i < steps; i++) {
    const ty = startY + (i + 1) * stepH;
    const tz = startZ + (i + 0.5) * stepZ;
    // Solid step core
    addBox(group, flightW, stepH + 0.02, absStepZ + 0.015, startX, ty - stepH * 0.5 - 0.01, tz, rccMat);
    // Finished tread slab
    addBox(
      group,
      flightW + 0.008,
      0.032,
      absStepZ + 0.022,
      startX,
      ty - 0.016,
      tz - dirZ * 0.006,
      treadMat
    );
  }

  const addRailingSide = (sideSign: -1 | 1) => {
    const rx = startX + sideSign * (flightW * 0.5 - 0.045);
    const railH = 0.92;
    const postCount = Math.max(3, Math.ceil(steps / 2) + 1);
    for (let i = 0; i < postCount; i++) {
      const frac = i / (postCount - 1);
      const py = startY + frac * riseH;
      const pz = startZ + frac * runZ;
      addCyl(group, 0.014, 0.014, railH, rx, py + railH * 0.5, pz, railMat, 8);
    }
    // Exact sloped top handrail + mid safety bar
    const pBotTop = new THREE.Vector3(rx, startY + railH, startZ);
    const pTopTop = new THREE.Vector3(rx, startY + riseH + railH, endZ);
    addSegmentBar(group, pBotTop, pTopTop, 0.045, 0.038, railMat);

    const pBotMid = new THREE.Vector3(rx, startY + railH * 0.52, startZ);
    const pTopMid = new THREE.Vector3(rx, startY + riseH + railH * 0.52, endZ);
    addSegmentBar(group, pBotMid, pTopMid, 0.022, 0.022, railMat);
  };

  if (railOnLeft) addRailingSide(-1);
  if (railOnRight) addRailingSide(1);
}

/** Explicit registry of every dedicated 3D asset builder (audited by Phase 4 diagnostics) */
export const DEDICATED_ASSET_BUILDERS: Set<string> = new Set([
  'stair-u-dogleg',
  'stair-l-turn',
  'stair-straight',
  'elevator-shaft',
  'collapsible-gate',
  'sofa-3seat',
  'sofa-2seat',
  'tea-table',
  'tv-console',
  'dining-6seat',
  'dining-4seat',
  'crockery-showcase',
  'dining-basin',
  'shoe-rack',
  'ceiling-fan',
  'split-ac',
  'bed-king-khat',
  'bed-queen-khat',
  'bed-single',
  'almari-3door',
  'almari-2door',
  'dressing-table',
  'study-desk',
  'kitchen-l-gas',
  'kitchen-straight-gas',
  'fridge-double',
  'washing-machine',
  'wc-high-bidet',
  'wc-low-asian',
  'vanity-basin',
  'rain-shower',
  'geyser-heater',
  'car-sedan',
  'motorcycle-bd',
  'shop-counter',
  'meter-ips-panel',
  'ugr-hatch',
  'water-tank-gazi',
  'tubewell-nolkup',
  'pukur-ghat',
  'veranda-dolna',
  'veranda-chair-set',
  'tree-coconut',
  'tree-mango',
]);

export function hasDedicatedAssetBuilder(assetId: string): boolean {
  return DEDICATED_ASSET_BUILDERS.has(assetId);
}

/**
 * Build a crisp, multi-part, architecturally proportioned Three.js Group for any cataloged Bangladeshi asset.
 * Origin sits cleanly at (x=0 center, y=0 floor/ground contact, z=0 center) with local +Z facing front.
 */
export function buildAsset3DGroup(
  assetId: string,
  w: number,
  d: number,
  h: number,
  options: AssetBuildOptions = {}
): THREE.Group {
  const g = new THREE.Group();
  const cOpts = {
    heatmapColor: options.heatmapColor,
    selected: options.selected,
    clippingPlanes: options.clippingPlanes,
  };

  const woodPrimary = makeMat(options.colorOverride ?? 0x764928, 0.52, 0.05, cOpts);
  const woodDark = makeMat(0x52311a, 0.58, 0.05, cOpts);
  const fabricWarm = makeMat(0xe5dfd3, 0.88, 0.0, cOpts);
  const fabricAccent = makeMat(0x9a4b32, 0.84, 0.0, cOpts);
  const cushionSlate = makeMat(0xcbd5e1, 0.86, 0.0, cOpts);
  const ceramicWhite = makeMat(0xf8fafc, 0.18, 0.05, cOpts);
  const graniteDark = makeMat(0x27313d, 0.28, 0.12, cOpts);
  const rccGrey = makeMat(0xd5d8dc, 0.86, 0.03, cOpts);
  const steelDark = makeMat(0x334155, 0.34, 0.62, cOpts);
  const chrome = makeMat(0xdce3ec, 0.18, 0.85, cOpts);
  const glassMat = makeMat(0xbcd8ee, 0.08, 0.12, {
    ...cOpts,
    transparent: true,
    opacity: 0.48,
  });
  const mirrorMat = makeMat(0xcde2f2, 0.06, 0.78, cOpts);

  switch (assetId) {
    // ======================== STAIRS & CORE ========================
    case 'stair-u-dogleg': {
      const wellGap = 0.16;
      const flightW = Math.max(0.75, (w - wellGap) * 0.5);
      const landD = Math.min(1.15, Math.max(0.85, d * 0.28));
      const runD = Math.max(1.2, d - landD);
      const halfH = h * 0.5;
      const treadMat = makeMat(options.colorOverride ?? 0xe3dfd7, 0.55, 0.04, cOpts);

      // Flight 1 (left side, ascending from front +d/2 toward mid-landing -d/2 + landD)
      buildAccurateFlight(
        g,
        -(flightW * 0.5 + wellGap * 0.5),
        0,
        d * 0.5,
        -d * 0.5 + landD,
        flightW,
        halfH,
        9,
        treadMat,
        rccGrey,
        steelDark,
        false,
        true
      );

      // Mid-landing slab spanning full width
      addBox(g, w, 0.15, landD, 0, halfH - 0.075, -d * 0.5 + landD * 0.5, rccGrey);
      addBox(g, w, 0.025, landD, 0, halfH + 0.012, -d * 0.5 + landD * 0.5, treadMat);
      // Landing back safety rail
      addBox(g, w - 0.12, 0.04, 0.04, 0, halfH + 0.92, -d * 0.5 + 0.06, steelDark);
      for (const lx of [-w * 0.44, 0, w * 0.44]) {
        addCyl(g, 0.015, 0.015, 0.92, lx, halfH + 0.46, -d * 0.5 + 0.06, steelDark, 8);
      }

      // Flight 2 (right side, ascending from mid-landing back toward front +d/2)
      buildAccurateFlight(
        g,
        flightW * 0.5 + wellGap * 0.5,
        halfH,
        -d * 0.5 + landD,
        -d * 0.5 + landD + runD,
        flightW,
        halfH,
        9,
        treadMat,
        rccGrey,
        steelDark,
        true,
        false
      );
      break;
    }

    case 'stair-l-turn': {
      const flightW = Math.min(w * 0.48, d * 0.42, 1.15);
      const treadMat = makeMat(options.colorOverride ?? 0xd8c3a5, 0.5, 0.04, cOpts);
      const halfH = h * 0.5;
      // Lower run along Z (left side)
      buildAccurateFlight(
        g,
        -w * 0.5 + flightW * 0.5,
        0,
        d * 0.5,
        -d * 0.5 + flightW,
        flightW,
        halfH,
        8,
        treadMat,
        rccGrey,
        steelDark,
        false,
        true
      );
      // Corner landing
      addBox(
        g,
        flightW,
        0.14,
        flightW,
        -w * 0.5 + flightW * 0.5,
        halfH - 0.07,
        -d * 0.5 + flightW * 0.5,
        rccGrey
      );
      // Upper run rotated +90 deg along +X
      const upper = new THREE.Group();
      const upperRun = Math.max(1.0, w - flightW);
      buildAccurateFlight(
        upper,
        0,
        halfH,
        0,
        upperRun,
        flightW,
        halfH,
        8,
        treadMat,
        rccGrey,
        steelDark,
        true,
        false
      );
      upper.rotation.y = Math.PI * 0.5;
      upper.position.set(-w * 0.5 + flightW, 0, -d * 0.5 + flightW * 0.5);
      g.add(upper);
      break;
    }

    case 'stair-straight': {
      const treadMat = makeMat(options.colorOverride ?? 0xe2ddd4, 0.52, 0.04, cOpts);
      buildAccurateFlight(
        g,
        0,
        0,
        d * 0.5,
        -d * 0.5,
        w,
        h,
        15,
        treadMat,
        rccGrey,
        steelDark,
        true,
        true
      );
      break;
    }

    case 'elevator-shaft': {
      const wallT = 0.16;
      const shaftMat = makeMat(0x94a3b8, 0.78, 0.08, cOpts);
      // 3-sided concrete shear core (back, left, right)
      addBox(g, w, h, wallT, 0, h * 0.5, -d * 0.5 + wallT * 0.5, shaftMat);
      addBox(g, wallT, h, d - wallT, -w * 0.5 + wallT * 0.5, h * 0.5, wallT * 0.5, shaftMat);
      addBox(g, wallT, h, d - wallT, w * 0.5 - wallT * 0.5, h * 0.5, wallT * 0.5, shaftMat);
      // Front header transom & jambs
      const doorW = Math.min(0.95, w - wallT * 2 - 0.16);
      const doorH = Math.min(2.12, h - 0.25);
      const sideW = Math.max(0.08, (w - doorW) * 0.5);
      addBox(g, sideW, h, wallT, -w * 0.5 + sideW * 0.5, h * 0.5, d * 0.5 - wallT * 0.5, shaftMat);
      addBox(g, sideW, h, wallT, w * 0.5 - sideW * 0.5, h * 0.5, d * 0.5 - wallT * 0.5, shaftMat);
      addBox(g, doorW, Math.max(0.15, h - doorH), wallT, 0, doorH + (h - doorH) * 0.5, d * 0.5 - wallT * 0.5, shaftMat);
      // Brushed stainless steel center-opening lift doors
      const steelDoor = makeMat(0xcbd5e1, 0.24, 0.78, cOpts);
      addBox(g, doorW * 0.48, doorH - 0.02, 0.05, -doorW * 0.25, doorH * 0.5, d * 0.5 - 0.06, steelDoor);
      addBox(g, doorW * 0.48, doorH - 0.02, 0.05, doorW * 0.25, doorH * 0.5, d * 0.5 - 0.06, steelDoor);
      // Digital floor indicator & call button panel
      addBox(g, 0.24, 0.09, 0.03, 0, doorH + 0.11, d * 0.5 + 0.015, steelDark);
      addBox(g, 0.08, 0.22, 0.025, doorW * 0.5 + 0.12, 1.15, d * 0.5 + 0.015, chrome);
      break;
    }

    case 'collapsible-gate': {
      // Authentic Dhaka apartment MS collapsible scissor gate
      addBox(g, w, 0.04, d, 0, 0.02, 0, steelDark); // bottom channel track
      addBox(g, w, 0.05, d, 0, h - 0.025, 0, steelDark); // top channel track
      const pickets = Math.max(6, Math.round(w / 0.14));
      for (let i = 0; i <= pickets; i++) {
        const px = -w * 0.48 + (i / pickets) * (w * 0.96);
        addBox(g, 0.022, h - 0.08, 0.026, px, h * 0.5, 0, steelDark);
      }
      // Diagonal diamond lattice links
      for (const ly of [h * 0.25, h * 0.55, h * 0.82]) {
        for (let i = 0; i < pickets; i++) {
          const x0 = -w * 0.48 + (i / pickets) * (w * 0.96);
          const x1 = -w * 0.48 + ((i + 1) / pickets) * (w * 0.96);
          addSegmentBar(
            g,
            new THREE.Vector3(x0, ly - 0.12, 0.016),
            new THREE.Vector3(x1, ly + 0.12, 0.016),
            0.012,
            0.014,
            chrome
          );
          addSegmentBar(
            g,
            new THREE.Vector3(x0, ly + 0.12, -0.016),
            new THREE.Vector3(x1, ly - 0.12, -0.016),
            0.012,
            0.014,
            chrome
          );
        }
      }
      break;
    }

    // ======================== DRAWING & DINING ========================
    case 'sofa-3seat':
    case 'sofa-2seat': {
      const seats = assetId === 'sofa-3seat' ? 3 : 2;
      const sofaFabric = makeMat(options.colorOverride ?? 0xded8cc, 0.86, 0.0, cOpts);
      // Segun wood perimeter base & 4 tapered legs
      addBox(g, w - 0.04, 0.08, d - 0.06, 0, 0.16, 0, woodPrimary);
      for (const lx of [-w * 0.45, w * 0.45]) {
        for (const lz of [-d * 0.42, d * 0.42]) {
          addBox(g, 0.055, 0.14, 0.055, lx, 0.07, lz, woodDark);
        }
      }
      // Wood-trimmed arms
      addBox(g, 0.11, h * 0.58, d - 0.04, -w * 0.5 + 0.055, 0.16 + h * 0.29, 0, woodPrimary);
      addBox(g, 0.11, h * 0.58, d - 0.04, w * 0.5 - 0.055, 0.16 + h * 0.29, 0, woodPrimary);
      // Back frame
      addBox(g, w - 0.14, h * 0.66, 0.12, 0, 0.18 + h * 0.33, -d * 0.5 + 0.08, woodPrimary);
      // Individual seat & back cushions
      const innerW = w - 0.24;
      const cw = innerW / seats;
      for (let i = 0; i < seats; i++) {
        const cx = -innerW * 0.5 + (i + 0.5) * cw;
        addBox(g, cw - 0.025, 0.17, d - 0.22, cx, 0.285, 0.06, sofaFabric);
        addBox(g, cw - 0.03, h * 0.44, 0.14, cx, 0.42 + h * 0.18, -d * 0.5 + 0.19, sofaFabric);
      }
      // Two accent throw cushions
      addBox(g, 0.26, 0.24, 0.09, -innerW * 0.36, 0.48, -d * 0.5 + 0.29, fabricAccent);
      addBox(g, 0.26, 0.24, 0.09, innerW * 0.36, 0.48, -d * 0.5 + 0.29, fabricAccent);
      break;
    }

    case 'tea-table': {
      // Wooden frame + lower shelf + tempered glass top
      for (const lx of [-w * 0.44, w * 0.44]) {
        for (const lz of [-d * 0.42, d * 0.42]) {
          addBox(g, 0.045, h - 0.03, 0.045, lx, (h - 0.03) * 0.5, lz, woodPrimary);
        }
      }
      addBox(g, w - 0.08, 0.03, d - 0.08, 0, h * 0.35, 0, woodDark);
      addBox(g, w, 0.025, d, 0, h - 0.013, 0, glassMat);
      // Rim rail
      addBox(g, w - 0.04, 0.04, 0.03, 0, h - 0.045, -d * 0.44, woodPrimary);
      addBox(g, w - 0.04, 0.04, 0.03, 0, h - 0.045, d * 0.44, woodPrimary);
      break;
    }

    case 'tv-console': {
      const cabH = 0.48;
      // Low cabinet with 3 wood drawers
      addBox(g, w, cabH - 0.06, d, 0, 0.06 + (cabH - 0.06) * 0.5, 0, woodPrimary);
      for (const lx of [-w * 0.44, w * 0.44]) {
        for (const lz of [-d * 0.38, d * 0.38]) {
          addBox(g, 0.04, 0.06, 0.04, lx, 0.03, lz, steelDark);
        }
      }
      for (const dx of [-w * 0.31, 0, w * 0.31]) {
        addBox(g, w * 0.29, cabH * 0.62, 0.02, dx, cabH * 0.54, d * 0.5 + 0.008, woodDark);
        addBox(g, 0.1, 0.015, 0.02, dx, cabH * 0.58, d * 0.5 + 0.02, chrome);
      }
      // LED TV screen & stand
      const tvW = Math.min(w * 0.82, 1.24);
      const tvH = Math.min(h - cabH - 0.14, 0.72);
      const screenMat = makeMat(0x0f172a, 0.14, 0.25, cOpts);
      addBox(g, 0.16, 0.12, 0.06, 0, cabH + 0.06, -0.02, steelDark);
      addBox(g, 0.4, 0.02, 0.18, 0, cabH + 0.01, 0, steelDark);
      addBox(g, tvW, tvH, 0.045, 0, cabH + 0.12 + tvH * 0.5, -0.02, screenMat);
      break;
    }

    case 'dining-6seat':
    case 'dining-4seat': {
      const perSide = assetId === 'dining-6seat' ? 3 : 2;
      const tableW = w * 0.86;
      const tableD = d * 0.62;
      // Table top + apron + 4 legs
      addBox(g, tableW, 0.045, tableD, 0, h - 0.022, 0, woodPrimary);
      addBox(g, tableW - 0.12, 0.07, tableD - 0.12, 0, h - 0.075, 0, woodDark);
      for (const lx of [-tableW * 0.44, tableW * 0.44]) {
        for (const lz of [-tableD * 0.42, tableD * 0.42]) {
          addBox(g, 0.055, h - 0.045, 0.055, lx, (h - 0.045) * 0.5, lz, woodPrimary);
        }
      }
      // Chairs tucked cleanly along both long sides
      const chairW = 0.42;
      const chairD = 0.4;
      const seatH = 0.46;
      for (const side of [-1, 1]) {
        for (let i = 0; i < perSide; i++) {
          const cx = -tableW * 0.36 + (i / Math.max(1, perSide - 1)) * tableW * 0.72;
          const cz = side * (tableD * 0.5 + chairD * 0.36);
          addBox(g, chairW, 0.045, chairD, cx, seatH, cz, fabricWarm);
          addBox(g, chairW, 0.42, 0.04, cx, seatH + 0.22, cz + side * (chairD * 0.46), woodPrimary);
          for (const clx of [-chairW * 0.42, chairW * 0.42]) {
            for (const clz of [-chairD * 0.42, chairD * 0.42]) {
              addBox(g, 0.032, seatH, 0.032, cx + clx, seatH * 0.5, cz + clz, woodDark);
            }
          }
        }
      }
      break;
    }

    case 'crockery-showcase': {
      // Lower solid wooden sideboard + upper glass display cabinet with shelves
      const lowH = h * 0.38;
      addBox(g, w, lowH, d, 0, lowH * 0.5, 0, woodPrimary);
      addBox(g, w, h - lowH, d * 0.88, 0, lowH + (h - lowH) * 0.5, -d * 0.06, woodDark);
      // Recessed bright interior + 3 shelves
      addBox(g, w - 0.1, h - lowH - 0.12, 0.03, 0, lowH + (h - lowH) * 0.5, -d * 0.42, fabricWarm);
      for (let s = 1; s <= 3; s++) {
        const sy = lowH + ((h - lowH) * s) / 4;
        addBox(g, w - 0.1, 0.025, d * 0.74, 0, sy, -d * 0.05, woodPrimary);
      }
      // Glass doors + vertical stiles
      addBox(g, w - 0.08, h - lowH - 0.08, 0.02, 0, lowH + (h - lowH) * 0.5, d * 0.38, glassMat);
      addBox(g, 0.04, h - lowH, 0.04, 0, lowH + (h - lowH) * 0.5, d * 0.39, woodPrimary);
      break;
    }

    case 'dining-basin':
    case 'vanity-basin': {
      const cabH = 0.78;
      // Under-counter waterproof vanity cabinet
      addBox(g, w * 0.92, cabH - 0.08, d * 0.86, 0, (cabH - 0.08) * 0.5 + 0.08, -d * 0.04, graniteDark);
      // Countertop + recessed ceramic basin rim + faucet
      addBox(g, w, 0.05, d, 0, cabH, 0, ceramicWhite);
      addBox(g, w * 0.68, 0.12, d * 0.62, 0, cabH + 0.07, 0.02, ceramicWhite);
      addBox(g, w * 0.54, 0.04, d * 0.46, 0, cabH + 0.115, 0.02, cushionSlate);
      addCyl(g, 0.018, 0.02, 0.16, 0, cabH + 0.12, -d * 0.34, chrome, 10);
      addBox(g, 0.022, 0.022, 0.12, 0, cabH + 0.18, -d * 0.28, chrome);
      // Wall mirror with slim frame above basin
      const mirH = Math.max(0.55, h - cabH - 0.25);
      addBox(g, w * 0.94, mirH, 0.03, 0, cabH + 0.24 + mirH * 0.5, -d * 0.47, woodDark);
      addBox(g, w * 0.86, mirH - 0.08, 0.02, 0, cabH + 0.24 + mirH * 0.5, -d * 0.45, mirrorMat);
      break;
    }

    case 'shoe-rack': {
      addBox(g, w, h - 0.06, d, 0, (h - 0.06) * 0.5 + 0.06, 0, woodPrimary);
      addBox(g, w + 0.02, 0.035, d + 0.02, 0, h - 0.018, 0, woodDark);
      for (const dy of [0.24, 0.52, 0.8]) {
        if (dy < h - 0.1) {
          addBox(g, w - 0.08, 0.22, 0.02, 0, dy, d * 0.5 + 0.008, woodDark);
          addBox(g, 0.14, 0.015, 0.02, 0, dy + 0.05, d * 0.5 + 0.02, chrome);
        }
      }
      break;
    }

    case 'ceiling-fan': {
      addCyl(g, 0.045, 0.055, 0.06, 0, h - 0.03, 0, ceramicWhite, 12);
      addCyl(g, 0.014, 0.014, h - 0.14, 0, h * 0.5, 0, chrome, 10);
      addCyl(g, 0.12, 0.12, 0.08, 0, 0.08, 0, ceramicWhite, 16);
      for (let i = 0; i < 3; i++) {
        const ang = (i * Math.PI * 2) / 3;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(w * 0.44, 0.012, 0.11), ceramicWhite);
        blade.position.set(Math.cos(ang) * w * 0.26, 0.08, Math.sin(ang) * w * 0.26);
        blade.rotation.y = -ang;
        blade.castShadow = true;
        g.add(blade);
      }
      break;
    }

    case 'split-ac': {
      addBox(g, w, h, d, 0, h * 0.5, 0, ceramicWhite);
      addBox(g, w - 0.08, 0.045, 0.02, 0, h * 0.2, d * 0.5 + 0.005, steelDark);
      addBox(g, 0.12, 0.03, 0.01, w * 0.34, h * 0.65, d * 0.5 + 0.006, chrome);
      break;
    }

    // ======================== BEDROOM ========================
    case 'bed-king-khat':
    case 'bed-queen-khat':
    case 'bed-single': {
      const boxH = 0.34;
      const matH = 0.2;
      // Solid Bangladeshi box-bed base + footboard + carved headboard
      addBox(g, w, boxH, d, 0, boxH * 0.5, 0, woodPrimary);
      addBox(g, w + 0.03, h, 0.09, 0, h * 0.5, -d * 0.5 + 0.045, woodDark);
      addBox(g, w - 0.1, h * 0.35, 0.03, 0, h * 0.72, -d * 0.5 + 0.095, woodPrimary);
      addBox(g, w + 0.02, boxH + 0.14, 0.06, 0, (boxH + 0.14) * 0.5, d * 0.5 - 0.03, woodDark);
      // Mattress
      addBox(g, w - 0.08, matH, d - 0.16, 0, boxH + matH * 0.5, 0.02, fabricWarm);
      // Folded Kantha / quilt runner at foot of bed
      addBox(g, w - 0.04, matH * 0.35, d * 0.32, 0, boxH + matH + 0.01, d * 0.26, fabricAccent);
      // Pillows + cylindrical bolster (Koil Balish — iconic Bangladeshi bed detail!)
      const pillowCount = assetId === 'bed-single' ? 1 : 2;
      for (let i = 0; i < pillowCount; i++) {
        const px = pillowCount === 1 ? 0 : (i === 0 ? -w * 0.23 : w * 0.23);
        addBox(g, w * (pillowCount === 1 ? 0.58 : 0.38), 0.12, 0.36, px, boxH + matH + 0.06, -d * 0.5 + 0.32, ceramicWhite);
      }
      const bolster = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, w * 0.54, 12),
        makeMat(0x0f766e, 0.85, 0.0, cOpts)
      );
      bolster.rotation.z = Math.PI * 0.5;
      bolster.position.set(0, boxH + matH + 0.08, -d * 0.5 + 0.65);
      g.add(bolster);
      break;
    }

    case 'almari-3door':
    case 'almari-2door': {
      const doors = assetId === 'almari-3door' ? 3 : 2;
      // Plinth + main cabinet carcase + top cornice
      addBox(g, w - 0.04, 0.08, d - 0.04, 0, 0.04, 0, woodDark);
      addBox(g, w, h - 0.12, d, 0, 0.08 + (h - 0.12) * 0.5, 0, woodPrimary);
      addBox(g, w + 0.04, 0.045, d + 0.04, 0, h - 0.022, 0, woodDark);
      const dw = (w - 0.06) / doors;
      for (let i = 0; i < doors; i++) {
        const dx = -(w - 0.06) * 0.5 + (i + 0.5) * dw;
        addBox(g, dw - 0.02, h - 0.22, 0.022, dx, h * 0.5, d * 0.5 + 0.01, woodDark);
        // Center door mirror on 3-door almari
        if (doors === 3 && i === 1) {
          addBox(g, dw * 0.72, h * 0.62, 0.012, dx, h * 0.54, d * 0.5 + 0.025, mirrorMat);
        }
        addBox(g, 0.018, 0.18, 0.022, dx + (i === 0 ? dw * 0.34 : -dw * 0.34), h * 0.52, d * 0.5 + 0.026, chrome);
      }
      break;
    }

    case 'dressing-table': {
      const deskH = 0.74;
      addBox(g, w, deskH - 0.06, d, 0, 0.06 + (deskH - 0.06) * 0.5, 0, woodPrimary);
      addBox(g, w * 0.78, h - deskH, 0.04, 0, deskH + (h - deskH) * 0.5, -d * 0.44, woodDark);
      addBox(g, w * 0.68, h - deskH - 0.1, 0.02, 0, deskH + (h - deskH) * 0.5, -d * 0.41, mirrorMat);
      // Small tucked stool
      addBox(g, 0.34, 0.42, 0.3, 0, 0.21, d * 0.35, fabricWarm);
      break;
    }

    case 'study-desk': {
      // Desk top + side drawer pedestal + ergonomic chair
      addBox(g, w, 0.04, d, 0, h - 0.02, 0, woodPrimary);
      addBox(g, 0.36, h - 0.04, d - 0.06, w * 0.5 - 0.2, (h - 0.04) * 0.5, 0, woodDark);
      addBox(g, 0.045, h - 0.04, d - 0.06, -w * 0.5 + 0.04, (h - 0.04) * 0.5, 0, steelDark);
      // Chair
      addBox(g, 0.44, 0.05, 0.42, -0.15, 0.45, d * 0.42, steelDark);
      addBox(g, 0.42, 0.42, 0.04, -0.15, 0.68, d * 0.62, steelDark);
      addCyl(g, 0.025, 0.025, 0.42, -0.15, 0.22, d * 0.42, chrome, 10);
      addCyl(g, 0.22, 0.22, 0.04, -0.15, 0.03, d * 0.42, steelDark, 10);
      break;
    }

    // ======================== KITCHEN ========================
    case 'kitchen-l-gas': {
      const cD = Math.min(0.62, d * 0.4);
      // Main back concrete-and-cabinet run
      addBox(g, w, h - 0.05, cD, 0, (h - 0.05) * 0.5, -d * 0.5 + cD * 0.5, rccGrey);
      addBox(g, w + 0.02, 0.05, cD + 0.02, 0, h - 0.025, -d * 0.5 + cD * 0.5, graniteDark);
      // L-return wing on right side
      const wingD = Math.max(0.4, d - cD);
      addBox(g, cD, h - 0.05, wingD, w * 0.5 - cD * 0.5, (h - 0.05) * 0.5, -d * 0.5 + cD + wingD * 0.5, rccGrey);
      addBox(g, cD + 0.02, 0.05, wingD + 0.02, w * 0.5 - cD * 0.5, h - 0.025, -d * 0.5 + cD + wingD * 0.5, graniteDark);
      // 2-Burner Bangladeshi gas stove on main run
      addBox(g, 0.68, 0.06, 0.38, -w * 0.2, h + 0.03, -d * 0.5 + cD * 0.5, chrome);
      addCyl(g, 0.09, 0.09, 0.025, -w * 0.32, h + 0.065, -d * 0.5 + cD * 0.5, steelDark, 14);
      addCyl(g, 0.09, 0.09, 0.025, -w * 0.08, h + 0.065, -d * 0.5 + cD * 0.5, steelDark, 14);
      // Red LP gas cylinder tucked cleanly under stove
      addCyl(g, 0.14, 0.14, 0.54, -w * 0.24, 0.27, -d * 0.5 + cD * 0.55, makeMat(0xc83e2b, 0.45, 0.25, cOpts), 14);
      // Stainless steel sink + swan-neck tap on L wing
      addBox(g, 0.42, 0.02, 0.48, w * 0.5 - cD * 0.5, h + 0.01, -d * 0.5 + cD + wingD * 0.52, chrome);
      addCyl(g, 0.015, 0.015, 0.24, w * 0.5 - 0.08, h + 0.12, -d * 0.5 + cD + wingD * 0.52, chrome, 8);
      // Overhead wooden cabinet above back run
      addBox(g, w * 0.88, 0.62, 0.34, 0, h + 0.92, -d * 0.5 + 0.17, woodPrimary);
      break;
    }

    case 'kitchen-straight-gas': {
      addBox(g, w, h - 0.05, d, 0, (h - 0.05) * 0.5, 0, rccGrey);
      addBox(g, w + 0.02, 0.05, d + 0.02, 0, h - 0.025, 0, graniteDark);
      // 2-Burner gas stove (left) + recessed sink (right)
      addBox(g, 0.66, 0.055, 0.38, -w * 0.24, h + 0.028, 0, chrome);
      addCyl(g, 0.085, 0.085, 0.02, -w * 0.34, h + 0.06, 0, steelDark, 12);
      addCyl(g, 0.085, 0.085, 0.02, -w * 0.14, h + 0.06, 0, steelDark, 12);
      addBox(g, 0.52, 0.02, 0.42, w * 0.26, h + 0.01, 0, chrome);
      addCyl(g, 0.015, 0.015, 0.24, w * 0.26, h + 0.12, -d * 0.36, chrome, 8);
      // Overhead wall cabinet
      addBox(g, w * 0.9, 0.58, 0.32, 0, h + 0.9, -d * 0.5 + 0.16, woodPrimary);
      break;
    }

    case 'fridge-double': {
      const fridgeMat = makeMat(options.colorOverride ?? 0xd8dee6, 0.25, 0.55, cOpts);
      addBox(g, w, h, d - 0.04, 0, h * 0.5, -0.02, fridgeMat);
      addBox(g, w - 0.02, h * 0.34, 0.04, 0, h * 0.82, d * 0.5 - 0.02, fridgeMat);
      addBox(g, w - 0.02, h * 0.62, 0.04, 0, h * 0.32, d * 0.5 - 0.02, fridgeMat);
      addBox(g, 0.022, 0.24, 0.03, -w * 0.42, h * 0.78, d * 0.5 + 0.015, steelDark);
      addBox(g, 0.022, 0.34, 0.03, -w * 0.42, h * 0.46, d * 0.5 + 0.015, steelDark);
      break;
    }

    case 'washing-machine': {
      addBox(g, w, h, d, 0, h * 0.5, 0, ceramicWhite);
      addBox(g, w - 0.04, 0.12, 0.02, 0, h - 0.08, d * 0.5 + 0.008, cushionSlate);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.3, w * 0.3, 0.05, 18), steelDark);
      drum.rotation.x = Math.PI * 0.5;
      drum.position.set(0, h * 0.46, d * 0.5 + 0.01);
      g.add(drum);
      const doorGlass = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.22, w * 0.22, 0.055, 18), glassMat);
      doorGlass.rotation.x = Math.PI * 0.5;
      doorGlass.position.set(0, h * 0.46, d * 0.5 + 0.015);
      g.add(doorGlass);
      break;
    }

    // ======================== BATHROOM ========================
    case 'wc-high-bidet': {
      // Ceramic cistern tank against wall
      addBox(g, w * 0.88, h * 0.52, 0.18, 0, h * 0.72, -d * 0.5 + 0.09, ceramicWhite);
      addCyl(g, 0.025, 0.025, 0.02, 0, h * 0.99, -d * 0.5 + 0.09, chrome, 10);
      // Pedestal + oval bowl + seat lid
      addCyl(g, w * 0.32, w * 0.26, 0.36, 0, 0.18, 0.06, ceramicWhite, 16);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.34, 0.14, 18), ceramicWhite);
      bowl.scale.set(1, 1, 1.28);
      bowl.position.set(0, 0.38, 0.08);
      g.add(bowl);
      // Handheld Muslim bidet spray mounted on right wall side
      addCyl(g, 0.016, 0.014, 0.12, w * 0.48, 0.52, -d * 0.2, chrome, 8);
      break;
    }

    case 'wc-low-asian': {
      // Raised ceramic squat pan platform with footrests + wall cistern
      addBox(g, w, 0.07, d * 0.82, 0, 0.035, 0.05, ceramicWhite);
      addBox(g, w * 0.34, 0.04, d * 0.56, 0, 0.06, 0.06, cushionSlate);
      addBox(g, w * 0.22, 0.025, d * 0.45, -w * 0.32, 0.075, 0.08, ceramicWhite);
      addBox(g, w * 0.22, 0.025, d * 0.45, w * 0.32, 0.075, 0.08, ceramicWhite);
      // Wall flush cistern
      addBox(g, w * 0.78, 0.34, 0.16, 0, h * 0.82, -d * 0.5 + 0.08, ceramicWhite);
      addCyl(g, 0.018, 0.018, h * 0.65, 0, h * 0.38, -d * 0.5 + 0.06, chrome, 8);
      break;
    }

    case 'rain-shower': {
      // Stainless floor drain grate + wall riser pipe + mixer valve + rain head
      addBox(g, 0.16, 0.012, 0.16, 0, 0.006, 0.05, chrome);
      addBox(g, 0.22, 0.07, 0.07, 0, 1.05, -d * 0.46, chrome);
      addCyl(g, 0.015, 0.015, 1.0, 0, 1.55, -d * 0.46, chrome, 10);
      addBox(g, 0.025, 0.025, 0.34, 0, 2.04, -d * 0.46 + 0.17, chrome);
      addCyl(g, 0.13, 0.13, 0.022, 0, 2.01, -d * 0.46 + 0.32, chrome, 16);
      break;
    }

    case 'geyser-heater': {
      addCyl(g, w * 0.46, w * 0.46, h, 0, h * 0.5, 0, ceramicWhite, 16);
      addCyl(g, w * 0.47, w * 0.47, 0.05, 0, h * 0.12, 0, makeMat(0x1d4ed8, 0.35, 0.2, cOpts), 16);
      addCyl(g, 0.012, 0.012, 0.14, -0.07, -0.06, 0, chrome, 8);
      addCyl(g, 0.012, 0.012, 0.14, 0.07, -0.06, 0, makeMat(0xdc2626, 0.4, 0.4, cOpts), 8);
      break;
    }

    // ======================== PARKING, COMMERCIAL, UTILITY & VILLAGE SITE ========================
    case 'car-sedan': {
      const bodyMat = makeMat(options.colorOverride ?? 0xdce2ea, 0.24, 0.58, cOpts);
      const wheelMat = makeMat(0x1e293b, 0.85, 0.1, cOpts);
      // Lower chassis
      addBox(g, w * 0.94, h * 0.38, d * 0.96, 0, 0.22 + h * 0.19, 0, bodyMat);
      // Cabin greenhouse
      addBox(g, w * 0.8, h * 0.34, d * 0.48, 0, 0.22 + h * 0.54, -d * 0.04, bodyMat);
      // Windshield & rear glass
      addBox(g, w * 0.76, h * 0.26, d * 0.5, 0, 0.22 + h * 0.53, -d * 0.04, glassMat);
      // Headlights & taillights
      addBox(g, 0.28, 0.12, 0.04, -w * 0.32, 0.52, d * 0.48, ceramicWhite);
      addBox(g, 0.28, 0.12, 0.04, w * 0.32, 0.52, d * 0.48, ceramicWhite);
      addBox(g, 0.3, 0.12, 0.04, -w * 0.32, 0.54, -d * 0.48, makeMat(0xdc2626, 0.3, 0.2, cOpts));
      addBox(g, 0.3, 0.12, 0.04, w * 0.32, 0.54, -d * 0.48, makeMat(0xdc2626, 0.3, 0.2, cOpts));
      // 4 wheels
      for (const wx of [-w * 0.45, w * 0.45]) {
        for (const wz of [-d * 0.3, d * 0.3]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), wheelMat);
          wh.rotation.z = Math.PI * 0.5;
          wh.position.set(wx, 0.3, wz);
          wh.castShadow = true;
          g.add(wh);
        }
      }
      break;
    }

    case 'motorcycle-bd': {
      const tankMat = makeMat(options.colorOverride ?? 0xb91c1c, 0.25, 0.55, cOpts);
      const wheelMat = makeMat(0x1e293b, 0.85, 0.1, cOpts);
      for (const wz of [-d * 0.34, d * 0.34]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.11, 14), wheelMat);
        wh.rotation.z = Math.PI * 0.5;
        wh.position.set(0, 0.28, wz);
        g.add(wh);
      }
      addBox(g, 0.22, 0.28, d * 0.46, 0, 0.46, 0, steelDark);
      addBox(g, 0.28, 0.2, 0.48, 0, 0.72, 0.14, tankMat);
      addBox(g, 0.24, 0.12, 0.62, 0, 0.68, -0.28, wheelMat);
      addBox(g, 0.68, 0.04, 0.04, 0, 0.94, 0.32, chrome);
      break;
    }

    case 'shop-counter': {
      addBox(g, w, h * 0.62, d, 0, h * 0.31, 0, steelDark);
      addBox(g, w - 0.04, h * 0.34, d - 0.04, 0, h * 0.8, 0, glassMat);
      addBox(g, w, 0.035, d, 0, h - 0.018, 0, ceramicWhite);
      break;
    }

    case 'meter-ips-panel': {
      // Wall-mounted DESCO/DPDC meter box + bottom IPS battery rack
      addBox(g, w * 0.9, 0.58, d, 0, 0.29, 0, steelDark);
      addBox(g, w * 0.74, 0.26, d * 0.78, 0, 0.18, 0.02, makeMat(0x0f172a, 0.4, 0.2, cOpts));
      addBox(g, w * 0.86, 0.68, 0.18, 0, h - 0.36, -d * 0.5 + 0.09, cushionSlate);
      addBox(g, w * 0.62, 0.22, 0.02, 0, h - 0.32, -d * 0.5 + 0.19, steelDark);
      break;
    }

    case 'ugr-hatch': {
      addBox(g, w, 0.05, d, 0, 0.025, 0, rccGrey);
      addBox(g, w - 0.14, 0.065, d - 0.14, 0, 0.033, 0, steelDark);
      addBox(g, 0.18, 0.025, 0.03, 0, 0.075, 0, chrome);
      break;
    }

    case 'water-tank-gazi': {
      // Concrete support pedestal + black ribbed polymer 2000L Gazi tank + blue cap & pipe
      const tankBlack = makeMat(options.colorOverride ?? 0x1e293b, 0.42, 0.15, cOpts);
      const blueAccent = makeMat(0x2563eb, 0.35, 0.1, cOpts);
      addBox(g, w, 0.22, d, 0, 0.11, 0, rccGrey);
      const r = Math.min(w, d) * 0.43;
      const bodyH = Math.max(0.85, h - 0.34);
      addCyl(g, r, r, bodyH, 0, 0.22 + bodyH * 0.5, 0, tankBlack, 20);
      // Horizontal structural ribs
      for (const frac of [0.25, 0.5, 0.75]) {
        addCyl(g, r + 0.025, r + 0.025, 0.05, 0, 0.22 + bodyH * frac, 0, tankBlack, 20);
      }
      addCyl(g, r * 0.42, r * 0.45, 0.12, 0, 0.22 + bodyH + 0.06, 0, blueAccent, 16);
      // Outlet riser pipe
      addCyl(g, 0.028, 0.028, bodyH * 0.85, r + 0.06, 0.22 + bodyH * 0.42, 0, chrome, 8);
      break;
    }

    case 'tubewell-nolkup': {
      // Authentic Bangladesh rural cast-iron green hand-pump on concrete apron
      const pumpGreen = makeMat(options.colorOverride ?? 0x15803d, 0.42, 0.52, cOpts);
      addBox(g, w, 0.11, d, 0, 0.055, 0, rccGrey);
      // Perimeter drainage curb
      addBox(g, w, 0.05, 0.08, 0, 0.13, -d * 0.5 + 0.04, rccGrey);
      addBox(g, 0.08, 0.05, d, -w * 0.5 + 0.04, 0.13, 0, rccGrey);
      addBox(g, 0.08, 0.05, d, w * 0.5 - 0.04, 0.13, 0, rccGrey);
      // Cast-iron pump barrel, spout & lever handle
      addCyl(g, 0.09, 0.11, 0.22, 0, 0.22, -0.1, pumpGreen, 12);
      addCyl(g, 0.055, 0.065, 0.68, 0, 0.64, -0.1, pumpGreen, 12);
      addCyl(g, 0.075, 0.06, 0.18, 0, 0.96, -0.1, pumpGreen, 12);
      // Water spout
      addSegmentBar(
        g,
        new THREE.Vector3(0, 0.64, -0.04),
        new THREE.Vector3(0, 0.58, 0.2),
        0.045,
        0.045,
        pumpGreen
      );
      // Lever handle
      addSegmentBar(
        g,
        new THREE.Vector3(0, 0.92, -0.16),
        new THREE.Vector3(0, 0.72, -0.58),
        0.032,
        0.038,
        steelDark
      );
      break;
    }

    case 'pukur-ghat': {
      // Recessed rural homestead pond sitting AT and BELOW ground datum (y <= 0.05)!
      const bankMat = makeMat(0x9a8f7e, 0.92, 0.02, cOpts);
      const waterMat = makeMat(0x287898, 0.12, 0.18, {
        ...cOpts,
        transparent: true,
        opacity: 0.88,
      });
      // Subtle low concrete/brick coping rim flush with earth (+4cm only, NEVER a tall floating box!)
      const rimW = 0.24;
      addBox(g, w, 0.08, rimW, 0, 0.01, -d * 0.5 + rimW * 0.5, bankMat);
      addBox(g, w, 0.08, rimW, 0, 0.01, d * 0.5 - rimW * 0.5, bankMat);
      addBox(g, rimW, 0.08, d - rimW * 2, -w * 0.5 + rimW * 0.5, 0.01, 0, bankMat);
      addBox(g, rimW, 0.08, d - rimW * 2, w * 0.5 - rimW * 0.5, 0.01, 0, bankMat);
      // Recessed dark pond basin bed + clear water surface recessed below rim
      addBox(g, w - rimW * 2, 0.06, d - rimW * 2, 0, -0.45, 0, makeMat(0x164458, 0.9, 0.0, cOpts));
      addBox(g, w - rimW * 1.9, 0.05, d - rimW * 1.9, 0, -0.05, 0, waterMat, false);
      // Stepped concrete Ghat (stairs descending into pond along building-facing edge)
      const ghatW = Math.min(1.5, w * 0.42);
      for (let s = 0; s < 4; s++) {
        addBox(
          g,
          ghatW,
          0.11,
          0.26,
          0,
          0.02 - s * 0.085,
          -d * 0.5 + rimW + 0.13 + s * 0.24,
          rccGrey
        );
      }
      break;
    }

    case 'veranda-dolna': {
      // Proper architectural A-frame wooden veranda swing (replaces ugly fallback crate!)
      const postW = 0.065;
      const topY = h - 0.06;
      // Left & right A-frame legs
      for (const side of [-1, 1]) {
        const sx = side * (w * 0.46);
        addSegmentBar(
          g,
          new THREE.Vector3(sx, 0, -d * 0.44),
          new THREE.Vector3(sx, topY, 0),
          postW,
          postW,
          woodDark
        );
        addSegmentBar(
          g,
          new THREE.Vector3(sx, 0, d * 0.44),
          new THREE.Vector3(sx, topY, 0),
          postW,
          postW,
          woodDark
        );
        addBox(g, postW, 0.05, d * 0.62, sx, 0.38, 0, woodPrimary);
      }
      // Top crossbeam
      addBox(g, w, 0.08, 0.08, 0, topY, 0, woodDark);
      // Steel suspension chains + wooden bench with cushion
      const benchW = w * 0.72;
      for (const cx of [-benchW * 0.45, benchW * 0.45]) {
        addCyl(g, 0.01, 0.01, topY - 0.48, cx, 0.48 + (topY - 0.48) * 0.5, 0, chrome, 8);
      }
      addBox(g, benchW, 0.06, 0.46, 0, 0.48, 0, woodPrimary);
      addBox(g, benchW - 0.06, 0.07, 0.42, 0, 0.545, 0.01, fabricWarm);
      addBox(g, benchW, 0.36, 0.05, 0, 0.68, -0.21, woodPrimary);
      break;
    }

    case 'veranda-chair-set': {
      // Round cane/wood tea table + 2 facing veranda chairs
      addCyl(g, 0.28, 0.28, 0.035, 0, 0.56, 0, woodPrimary, 16);
      addCyl(g, 0.035, 0.05, 0.54, 0, 0.27, 0, woodDark, 10);
      addCyl(g, 0.18, 0.2, 0.03, 0, 0.015, 0, woodDark, 14);
      for (const side of [-1, 1]) {
        const cx = side * (w * 0.34);
        addBox(g, 0.44, 0.045, 0.44, cx, 0.43, 0, fabricWarm);
        addBox(g, 0.045, 0.4, 0.44, cx + side * 0.2, 0.64, 0, woodPrimary);
        for (const lx of [-0.18, 0.18]) {
          for (const lz of [-0.18, 0.18]) {
            addBox(g, 0.032, 0.43, 0.032, cx + lx, 0.215, lz, woodDark);
          }
        }
      }
      break;
    }

    case 'tree-coconut': {
      // Organic tapered multi-segment palm trunk + graceful downward-arching green fronds
      const trunkMat = makeMat(0x70533c, 0.9, 0.02, cOpts);
      const frondMat = makeMat(0x3a7a36, 0.78, 0.02, cOpts);
      const segs = 5;
      const segH = (h * 0.84) / segs;
      let prev = new THREE.Vector3(0, 0, 0);
      for (let i = 1; i <= segs; i++) {
        const lean = Math.sin((i / segs) * Math.PI * 0.5) * 0.24;
        const next = new THREE.Vector3(lean, i * segH, lean * 0.4);
        const r = 0.14 - i * 0.014;
        addSegmentBar(g, prev, next, r * 1.6, r * 1.6, trunkMat);
        prev = next;
      }
      // Crown of 9 arched multi-segment palm fronds
      const crown = prev;
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        const reach = Math.min(w, d) * 0.52;
        const mid = new THREE.Vector3(
          crown.x + Math.cos(ang) * reach * 0.55,
          crown.y + 0.35,
          crown.z + Math.sin(ang) * reach * 0.55
        );
        const tip = new THREE.Vector3(
          crown.x + Math.cos(ang) * reach,
          crown.y - 0.28,
          crown.z + Math.sin(ang) * reach
        );
        addSegmentBar(g, crown, mid, 0.22, 0.05, frondMat);
        addSegmentBar(g, mid, tip, 0.15, 0.035, frondMat);
      }
      break;
    }

    case 'tree-mango': {
      // Branched native Aam Gach with multi-cluster layered organic canopy
      const barkMat = makeMat(0x5c3e2b, 0.92, 0.02, cOpts);
      const leafDark = makeMat(0x2c6631, 0.84, 0.02, cOpts);
      const leafMid = makeMat(0x3b7d3c, 0.82, 0.02, cOpts);
      const trunkH = h * 0.46;
      addCyl(g, 0.16, 0.23, trunkH, 0, trunkH * 0.5, 0, barkMat, 12);
      // 3 main boughs
      const boughs: [number, number, number, number][] = [
        [0, trunkH + h * 0.26, 0, Math.min(w, d) * 0.36],
        [-w * 0.22, trunkH + h * 0.14, d * 0.14, Math.min(w, d) * 0.28],
        [w * 0.24, trunkH + h * 0.16, -d * 0.12, Math.min(w, d) * 0.29],
        [w * 0.06, trunkH + h * 0.12, d * 0.24, Math.min(w, d) * 0.25],
        [-w * 0.12, trunkH + h * 0.2, -d * 0.2, Math.min(w, d) * 0.26],
      ];
      for (let i = 0; i < boughs.length; i++) {
        const [bx, by, bz, br] = boughs[i];
        if (i > 0) {
          addSegmentBar(
            g,
            new THREE.Vector3(0, trunkH * 0.85, 0),
            new THREE.Vector3(bx * 0.6, by - br * 0.4, bz * 0.6),
            0.09,
            0.09,
            barkMat
          );
        }
        const puff = new THREE.Mesh(
          new THREE.IcosahedronGeometry(br, 1),
          i % 2 === 0 ? leafDark : leafMid
        );
        puff.scale.set(1.08, 0.82, 1.05);
        puff.position.set(bx, by, bz);
        puff.castShadow = true;
        puff.receiveShadow = true;
        g.add(puff);
      }
      break;
    }

    default: {
      // Defensive architectural block (never hit for any cataloged asset — verified by diagnostics)
      addBox(g, w, h, d, 0, h * 0.5, 0, woodPrimary);
      break;
    }
  }

  return g;
}
