import * as THREE from 'three';
import {
  BuildingProject,
  LandPlot,
  PhysicsReport,
  PhysicsStatus,
  Pillar,
  SelectionTarget,
  Slab,
  Story,
  Wall,
  WallMaterial,
  WallOpening,
} from '../types/building';
import { buildAsset3DGroup } from './assetModels3D';
import { getAssetDefinition } from './assets';
import {
  BEAM_PROUD_EPS,
  COLUMN_PROUD_EPS,
  computeActualPlotSetbacks,
  computeRequiredRajukRules,
  computeWallCornerExtensions,
  getBnbcConfig,
  GROUND_LEVEL_Y,
  isCurvedWall,
  PLINTH_HEIGHT_M,
  pointAtWallOffset,
  ROAD_LEVEL_Y,
  sampleWallPolyline,
  SLAB_INSET_EPS,
  subtractPillarIntervals,
} from './geometryKernel';
import {
  cloneWithRepeat,
  getAsphaltTextures,
  getExposedBrickTextures,
  getFairConcreteTextures,
  getFloorTileTextures,
  getGrassTextures,
  getPaverTextures,
  getPlasterTextures,
  getWoodTextures,
} from './textures3D';

export interface BuildSceneOptions {
  activeStoryIndex: number;
  visibleMaxStoryIndex: number;
  cutawayRatio: number; // 0.15..1.0 — drives GPU local clipping plane on active/top visible story
  explodedView: boolean;
  heatmapMode: boolean;
  xrayStructural: boolean; // ETABS/Revit structural RCC frame X-Ray mode
  showSetbacks: boolean; // RAJUK legal setback wireframe envelope
  showCeilingRoof: boolean;
  selected: SelectionTarget | null;
  physics: PhysicsReport;
}

export interface BuiltBuildingScene {
  root: THREE.Group;
  storyGroups: { index: number; baseY: number; height: number; group: THREE.Group }[];
  clickables: THREE.Object3D[];
  selectableMap: Map<string, THREE.Object3D>;
  topVisibleIdx: number;
  topVisibleH: number;
  boundsCenter: THREE.Vector3;
  boundsRadius: number;
  clipPlane: THREE.Plane;
  ownedTextures: THREE.Texture[];
}

export function selectionKey(target: SelectionTarget): string {
  return `${target.type}:${target.storyIndex}:${target.id}`;
}

const HEATMAP_COLORS: Record<PhysicsStatus, number> = {
  ok: 0x16a34a,
  warning: 0xd97706,
  critical: 0xdc2626,
};

function tagClickable(
  obj: THREE.Object3D,
  type: SelectionTarget['type'],
  id: string,
  storyIndex: number,
  clickables: THREE.Object3D[],
  selectableMap: Map<string, THREE.Object3D>,
  extra?: { parentWallId?: string; isInteractiveDoor?: boolean; draggable?: boolean }
) {
  const selectTarget: SelectionTarget = {
    type,
    id,
    storyIndex,
    ...(extra?.parentWallId ? { parentWallId: extra.parentWallId } : {}),
  };
  const dragRoot = extra?.draggable ? obj : undefined;
  obj.traverse((child) => {
    child.userData = {
      ...child.userData,
      selectTarget,
      ...(dragRoot ? { dragRoot } : {}),
      ...(extra?.isInteractiveDoor ? { isInteractiveDoor: true } : {}),
    };
  });
  clickables.push(obj);
  selectableMap.set(selectionKey(selectTarget), obj);
}

function trackTex(list: THREE.Texture[], tex: THREE.Texture): THREE.Texture {
  list.push(tex);
  return tex;
}

/** Build a clean material for walls with GPU clipping plane and zero-leak cloned textures */
function createWallMaterial(
  mat: WallMaterial,
  repeatX: number,
  repeatY: number,
  ownedTextures: THREE.Texture[],
  clippingPlanes: THREE.Plane[],
  heatmapColor?: number,
  selected?: boolean
): THREE.MeshStandardMaterial {
  const baseOpts = {
    clippingPlanes,
    clipShadows: true,
    emissive: selected ? new THREE.Color(0x1d4ed8) : new THREE.Color(0x000000),
    emissiveIntensity: selected ? 0.16 : 0,
  };

  if (heatmapColor !== undefined) {
    return new THREE.MeshStandardMaterial({
      color: heatmapColor,
      roughness: 0.72,
      metalness: 0.05,
      ...baseOpts,
    });
  }

  if (mat === 'exposed-brick' || mat === 'jala-brick') {
    const tex = getExposedBrickTextures();
    return new THREE.MeshStandardMaterial({
      map: trackTex(ownedTextures, cloneWithRepeat(tex.map, Math.max(0.5, repeatX * 0.75), Math.max(0.5, repeatY * 0.75))),
      bumpMap: trackTex(ownedTextures, cloneWithRepeat(tex.bumpMap, Math.max(0.5, repeatX * 0.75), Math.max(0.5, repeatY * 0.75))),
      bumpScale: 0.018,
      roughness: 0.88,
      metalness: 0.02,
      ...baseOpts,
    });
  }

  if (mat === 'fair-concrete' || mat === 'rcc') {
    const tex = getFairConcreteTextures();
    return new THREE.MeshStandardMaterial({
      map: trackTex(ownedTextures, cloneWithRepeat(tex.map, Math.max(0.5, repeatX * 0.45), Math.max(0.5, repeatY * 0.45))),
      bumpMap: trackTex(ownedTextures, cloneWithRepeat(tex.bumpMap, Math.max(0.5, repeatX * 0.45), Math.max(0.5, repeatY * 0.45))),
      bumpScale: 0.012,
      roughness: 0.82,
      metalness: 0.04,
      ...baseOpts,
    });
  }

  if (mat === 'timber-louver') {
    const tex = getWoodTextures();
    return new THREE.MeshStandardMaterial({
      map: trackTex(ownedTextures, cloneWithRepeat(tex.map, repeatX, repeatY)),
      roughness: 0.62,
      metalness: 0.05,
      ...baseOpts,
    });
  }

  const plaster = getPlasterTextures();
  const tint = mat === 'hollow-block' ? 0xe7ebef : mat === 'gypsum-board' ? 0xf6f7f9 : 0xf4f0e8;
  return new THREE.MeshStandardMaterial({
    color: tint,
    map: trackTex(ownedTextures, cloneWithRepeat(plaster.map, Math.max(0.5, repeatX * 0.5), Math.max(0.5, repeatY * 0.5))),
    bumpMap: trackTex(ownedTextures, cloneWithRepeat(plaster.bumpMap, Math.max(0.5, repeatX * 0.5), Math.max(0.5, repeatY * 0.5))),
    bumpScale: 0.005,
    roughness: 0.9,
    metalness: 0.01,
    ...baseOpts,
  });
}

/** Build a true extruded floor/roof slab with exact rectangular cutouts (stairwells, lifts, duplex voids) */
function buildSlabMeshWithCutouts(
  slab: Slab,
  yBottom: number,
  thickness: number,
  topMat: THREE.Material,
  sideMat: THREE.Material
): THREE.Mesh {
  const inset = SLAB_INSET_EPS;
  const x0 = slab.x + inset;
  const z0 = slab.z + inset;
  const w = Math.max(0.1, slab.width - inset * 2);
  const d = Math.max(0.1, slab.depth - inset * 2);

  // Shape lives in XY plane; rotated -PI/2 around X so shape X -> world +X, shape Y -> world -Z!
  // Thus world Z maps to shape Y = -z!
  const shape = new THREE.Shape();
  shape.moveTo(x0, -z0);
  shape.lineTo(x0 + w, -z0);
  shape.lineTo(x0 + w, -(z0 + d));
  shape.lineTo(x0, -(z0 + d));
  shape.closePath();

  for (const c of slab.cutouts ?? []) {
    const cx0 = Math.max(x0 + 0.04, c.x);
    const cx1 = Math.min(x0 + w - 0.04, c.x + c.width);
    const cz0 = Math.max(z0 + 0.04, c.z);
    const cz1 = Math.min(z0 + d - 0.04, c.z + c.depth);
    if (cx1 - cx0 > 0.12 && cz1 - cz0 > 0.12) {
      const hole = new THREE.Path();
      hole.moveTo(cx0, -cz0);
      hole.lineTo(cx0, -cz1);
      hole.lineTo(cx1, -cz1);
      hole.lineTo(cx1, -cz0);
      hole.closePath();
      shape.holes.push(hole);
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI * 0.5);
  // Normalize world-scale UVs on horizontal faces so porcelain tiles never stretch!
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ny = Math.abs(norm.getY(i));
    if (ny > 0.5) {
      uv.setXY(i, pos.getX(i) * 0.42, pos.getZ(i) * 0.42);
    } else {
      uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 0.5, pos.getY(i));
    }
  }
  uv.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, [topMat, sideMat]);
  mesh.position.y = yBottom;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Build a smooth extruded curved arc wall (ExtrudeGeometry from offset left/right Bezier curves) */
function buildCurvedWallMesh(
  wall: Wall,
  wallH: number,
  mat: THREE.Material
): THREE.Mesh {
  const pts = sampleWallPolyline(wall, 24);
  const halfT = wall.thickness * 0.5;
  const shape = new THREE.Shape();

  // Left offset boundary (shape X = world X, shape Y = -world Z)
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const lx = p.x + p.nx * halfT;
    const lz = p.z + p.nz * halfT;
    if (i === 0) shape.moveTo(lx, -lz);
    else shape.lineTo(lx, -lz);
  }
  // Right offset boundary in reverse
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    const rx = p.x - p.nx * halfT;
    const rz = p.z - p.nz * halfT;
    shape.lineTo(rx, -rz);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: wallH,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI * 0.5);

  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 0.45, pos.getY(i) * 0.45);
  }
  uv.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Build authentic Bangladeshi Doors, Thai Aluminum + MS Grill Windows, Rolling Shutters & Monsoon Chajjas */
function buildOpening3DGroup(
  wall: Wall,
  op: WallOpening,
  storyIndex: number,
  clickables: THREE.Object3D[],
  selectableMap: Map<string, THREE.Object3D>,
  clippingPlanes: THREE.Plane[],
  selected?: boolean
): THREE.Group {
  const g = new THREE.Group();
  const pt = pointAtWallOffset(wall, op.offset + op.width * 0.5);
  g.position.set(pt.x, op.sillHeight, pt.z);
  g.rotation.y = -pt.angle;

  const t = wall.thickness;
  const frameDepth = t + 0.024;
  const openRatio = op.openRatio ?? (op.kind.startsWith('door') ? 0.18 : 0);

  const cOpts = {
    clippingPlanes,
    clipShadows: true,
    emissive: selected ? new THREE.Color(0x1d4ed8) : new THREE.Color(0x000000),
    emissiveIntensity: selected ? 0.2 : 0,
  };

  const segunWood = new THREE.MeshStandardMaterial({ color: 0x6b3e22, roughness: 0.48, metalness: 0.05, ...cOpts });
  const segunDark = new THREE.MeshStandardMaterial({ color: 0x4b2a16, roughness: 0.55, metalness: 0.05, ...cOpts });
  const alumFrame = new THREE.MeshStandardMaterial({ color: 0x263240, roughness: 0.34, metalness: 0.58, ...cOpts });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a44a, roughness: 0.28, metalness: 0.85, ...cOpts });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xb7d6ec,
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.44,
    ...cOpts,
  });
  const chajjaMat = new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.85, metalness: 0.02, ...cOpts });

  const addPart = (
    pw: number, ph: number, pd: number, px: number, py: number, pz: number, mat: THREE.Material, parent: THREE.Object3D = g
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), mat);
    m.position.set(px, py, pz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const isDoor = op.kind === 'door-single' || op.kind === 'door-double' || op.kind === 'door-sliding';

  if (op.kind === 'arch-opening') {
    // Clean cased plastered portal arch trim
    addPart(0.06, op.height, frameDepth, -op.width * 0.5 + 0.03, op.height * 0.5, 0, chajjaMat);
    addPart(0.06, op.height, frameDepth, op.width * 0.5 - 0.03, op.height * 0.5, 0, chajjaMat);
    addPart(op.width, 0.08, frameDepth, 0, op.height - 0.04, 0, chajjaMat);
  } else if (op.kind === 'shutter-shop') {
    // Commercial Bangladeshi rolling MS shutter + hood box
    addPart(0.07, op.height, frameDepth, -op.width * 0.5 + 0.035, op.height * 0.5, 0, alumFrame);
    addPart(0.07, op.height, frameDepth, op.width * 0.5 - 0.035, op.height * 0.5, 0, alumFrame);
    addPart(op.width + 0.14, 0.24, frameDepth + 0.16, 0, op.height - 0.12, 0.06, alumFrame);
    const closedFrac = 1 - Math.min(0.85, openRatio > 0 ? openRatio : 0.72);
    const shutterH = Math.max(0.28, (op.height - 0.24) * closedFrac);
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.45, metalness: 0.55, ...cOpts });
    addPart(op.width - 0.12, shutterH, 0.04, 0, op.height - 0.24 - shutterH * 0.5, 0, slatMat);
  } else if (op.kind === 'door-single' || op.kind === 'door-double') {
    const jW = 0.055;
    // Wooden Choukath jambs + top transom
    addPart(jW, op.height, frameDepth, -op.width * 0.5 + jW * 0.5, op.height * 0.5, 0, segunDark);
    addPart(jW, op.height, frameDepth, op.width * 0.5 - jW * 0.5, op.height * 0.5, 0, segunDark);
    addPart(op.width, jW, frameDepth, 0, op.height - jW * 0.5, 0, segunDark);

    const innerW = op.width - jW * 2;
    const innerH = op.height - jW - 0.015;
    const maxAngle = (Math.PI * 0.48) * openRatio;

    const buildLeaf = (leafW: number, hingeX: number, dir: 1 | -1) => {
      const pivot = new THREE.Group();
      pivot.position.set(hingeX, 0.01, op.swing * (t * 0.42));
      // Rotate into swing side cleanly
      pivot.rotation.y = dir * -op.swing * maxAngle;
      // Paneled Segun wood leaf
      addPart(leafW, innerH, 0.044, dir * leafW * 0.5, innerH * 0.5, 0, segunWood, pivot);
      // Carved architectural inset panels
      addPart(leafW * 0.68, innerH * 0.36, 0.054, dir * leafW * 0.5, innerH * 0.72, 0, segunDark, pivot);
      addPart(leafW * 0.68, innerH * 0.32, 0.054, dir * leafW * 0.5, innerH * 0.26, 0, segunDark, pivot);
      // Brass handle both sides
      addPart(0.03, 0.14, 0.09, dir * (leafW - 0.085), 1.0, 0, brassMat, pivot);
      g.add(pivot);
    };

    if (op.kind === 'door-single') {
      buildLeaf(innerW - 0.008, -innerW * 0.5, 1);
    } else {
      const halfW = innerW * 0.5 - 0.006;
      buildLeaf(halfW, -innerW * 0.5, 1);
      buildLeaf(halfW, innerW * 0.5, -1);
    }
  } else if (op.kind === 'door-sliding') {
    // Thai aluminum sliding balcony glass door with bottom track & double sashes
    const fW = 0.05;
    addPart(fW, op.height, frameDepth, -op.width * 0.5 + fW * 0.5, op.height * 0.5, 0, alumFrame);
    addPart(fW, op.height, frameDepth, op.width * 0.5 - fW * 0.5, op.height * 0.5, 0, alumFrame);
    addPart(op.width, fW, frameDepth, 0, op.height - fW * 0.5, 0, alumFrame);
    addPart(op.width, 0.03, frameDepth, 0, 0.015, 0, alumFrame);

    const sashW = (op.width - fW * 2) * 0.52;
    const sashH = op.height - fW - 0.04;
    const slideShift = openRatio * (sashW * 0.78);
    // Fixed pane
    addPart(sashW, sashH, 0.02, -op.width * 0.25 + fW * 0.5, sashH * 0.5 + 0.03, -0.025, glassMat);
    addPart(0.035, sashH, 0.035, -op.width * 0.25 + sashW * 0.5, sashH * 0.5 + 0.03, -0.025, alumFrame);
    // Sliding pane
    addPart(sashW, sashH, 0.02, op.width * 0.25 - fW * 0.5 - slideShift, sashH * 0.5 + 0.03, 0.025, glassMat);
    addPart(0.035, sashH, 0.035, op.width * 0.25 - sashW * 0.5 - slideShift, sashH * 0.5 + 0.03, 0.025, alumFrame);
  } else {
    // Authentic Bangladeshi Thai Aluminum Sliding Window with MS Security Grill & Monsoon Chajja Sunshade!
    const fW = 0.045;
    addPart(fW, op.height, frameDepth, -op.width * 0.5 + fW * 0.5, op.height * 0.5, 0, alumFrame);
    addPart(fW, op.height, frameDepth, op.width * 0.5 - fW * 0.5, op.height * 0.5, 0, alumFrame);
    addPart(op.width, fW, frameDepth, 0, op.height - fW * 0.5, 0, alumFrame);
    addPart(op.width + 0.06, 0.04, frameDepth + 0.04, 0, 0.02, 0, chajjaMat); // sloped sill
    // Center vertical mullion + glazed panes
    addPart(0.035, op.height - fW * 2, 0.045, 0, op.height * 0.5, 0, alumFrame);
    addPart(op.width - fW * 2, op.height - fW * 2, 0.018, 0, op.height * 0.5, 0, glassMat);

    // Authentic MS security window grill bars (standard on 99% of Bangladeshi homes)
    if (op.hasGrill !== false) {
      const barCount = Math.max(3, Math.round((op.height - 0.12) / 0.24));
      for (let i = 1; i < barCount; i++) {
        const by = (op.height * i) / barCount;
        addPart(op.width - fW * 2, 0.014, 0.014, 0, by, -t * 0.24, alumFrame);
      }
      const vBars = Math.max(2, Math.round(op.width / 0.36));
      for (let i = 1; i < vBars; i++) {
        const bx = -op.width * 0.5 + (op.width * i) / vBars;
        addPart(0.014, op.height - fW * 2, 0.014, bx, op.height * 0.5, -t * 0.24, alumFrame);
      }
    }

    // Monsoon RCC Chajja (rain sunshade overhang) on exterior windows
    if (op.hasChajja !== false && wall.thickness >= 0.19) {
      const chajjaDepth = 0.44;
      addPart(
        op.width + 0.28,
        0.075,
        chajjaDepth,
        0,
        op.height + 0.04,
        op.swing * (t * 0.5 + chajjaDepth * 0.5 - 0.02),
        chajjaMat
      );
    }
  }

  tagClickable(g, 'opening', op.id, storyIndex, clickables, selectableMap, {
    parentWallId: wall.id,
    isInteractiveDoor: isDoor || op.kind === 'shutter-shop',
  });
  return g;
}

/**
 * Parametric Bangladeshi Site Context:
 * Supports ALL 4 road orientations ('south' | 'north' | 'east' | 'west') seamlessly!
 * Renders road asphalt + footpath curb + boundary walls + brick gate piers + MS main gate + paved approach apron
 * + clean RAJUK Setback Wireframe envelope when enabled.
 */
function buildPlotContextGroup(
  project: BuildingProject,
  plot: LandPlot,
  showSetbacks: boolean,
  ownedTextures: THREE.Texture[]
): THREE.Group {
  const site = new THREE.Group();
  const bnbc = getBnbcConfig(project);
  const isVillage = (plot.landContext ?? bnbc.landContext) === 'village';

  // Infinite neutral drafting horizon plane well below road asphalt (zero Z-fighting)
  const horizonMat = new THREE.MeshStandardMaterial({
    color: 0xe8edf2,
    roughness: 0.96,
    metalness: 0.0,
  });
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), horizonMat);
  horizon.rotation.x = -Math.PI * 0.5;
  horizon.position.set(plot.originX + plot.width * 0.5, ROAD_LEVEL_Y - 0.06, plot.originZ + plot.depth * 0.5);
  horizon.receiveShadow = true;
  site.add(horizon);

  // Plot ground surface at GL (-0.45m):
  // Urban plots use clean paved concrete/interlocking drainage apron (no fake Western lawn!);
  // Village plots use practical earth/grass Uthan with paved porch approach.
  const plotTex = isVillage ? getGrassTextures() : getPaverTextures();
  const plotGroundMat = new THREE.MeshStandardMaterial({
    map: trackTex(ownedTextures, cloneWithRepeat(plotTex.map, Math.max(2, plot.width * 0.4), Math.max(2, plot.depth * 0.4))),
    bumpMap: trackTex(ownedTextures, cloneWithRepeat(plotTex.bumpMap, Math.max(2, plot.width * 0.4), Math.max(2, plot.depth * 0.4))),
    bumpScale: 0.012,
    color: isVillage ? 0x6f9852 : 0xd5dae0,
    roughness: 0.92,
    metalness: 0.01,
  });
  const plotSlab = new THREE.Mesh(new THREE.BoxGeometry(plot.width, 0.16, plot.depth), plotGroundMat);
  plotSlab.position.set(plot.originX + plot.width * 0.5, GROUND_LEVEL_Y - 0.08, plot.originZ + plot.depth * 0.5);
  plotSlab.receiveShadow = true;
  site.add(plotSlab);

  // Parametric road, footpath, boundary wall & gate in local plot frame rotated by roadSide!
  // Local frame: origin at plot center, +Z is the ROAD side, local width = frontEdgeLen, local depth = sideEdgeLen.
  const isNS = plot.roadSide === 'south' || plot.roadSide === 'north';
  const frontLen = isNS ? plot.width : plot.depth;
  const sideLen = isNS ? plot.depth : plot.width;
  const roadRotY =
    plot.roadSide === 'south'
      ? 0
      : plot.roadSide === 'east'
      ? Math.PI * 0.5
      : plot.roadSide === 'north'
      ? Math.PI
      : -Math.PI * 0.5;

  const oriented = new THREE.Group();
  oriented.position.set(plot.originX + plot.width * 0.5, 0, plot.originZ + plot.depth * 0.5);
  oriented.rotation.y = roadRotY;
  site.add(oriented);

  const roadW = Math.max(4.2, plot.roadWidthM ?? bnbc.roadWidthM ?? 6.1);
  const footW = 1.25;
  const asphaltTex = getAsphaltTextures();
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: trackTex(ownedTextures, cloneWithRepeat(asphaltTex.map, 6, 2)),
    roughness: 0.9,
    metalness: 0.02,
  });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xcbd2da, roughness: 0.85, metalness: 0.02 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });

  const roadLen = frontLen + 14;
  // Footpath curb directly outside plot front edge (+sideLen/2)
  const foot = new THREE.Mesh(new THREE.BoxGeometry(roadLen, 0.14, footW), curbMat);
  foot.position.set(0, GROUND_LEVEL_Y - 0.07, sideLen * 0.5 + footW * 0.5);
  foot.receiveShadow = true;
  oriented.add(foot);

  // Asphalt road strip
  const road = new THREE.Mesh(new THREE.BoxGeometry(roadLen, 0.1, roadW), asphaltMat);
  road.position.set(0, ROAD_LEVEL_Y - 0.05, sideLen * 0.5 + footW + roadW * 0.5);
  road.receiveShadow = true;
  oriented.add(road);

  // Road centerline dashes
  const dashCount = Math.max(4, Math.floor(roadLen / 3.2));
  for (let i = 0; i < dashCount; i++) {
    const dx = -roadLen * 0.44 + (i / Math.max(1, dashCount - 1)) * (roadLen * 0.88);
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.01, 0.14), dashMat);
    dash.position.set(dx, ROAD_LEVEL_Y + 0.008, sideLen * 0.5 + footW + roadW * 0.5);
    oriented.add(dash);
  }

  // Perimeter boundary wall + parametric front main gate (positioned cleanly on the ROAD edge!)
  if (plot.hasBoundaryWall) {
    const wallH = 1.65;
    const wallT = 0.16;
    const plasterMat = new THREE.MeshStandardMaterial({ color: 0xebe6dd, roughness: 0.9, metalness: 0.01 });
    const brickTex = getExposedBrickTextures();
    const pierMat = new THREE.MeshStandardMaterial({
      map: trackTex(ownedTextures, cloneWithRepeat(brickTex.map, 0.6, 1.2)),
      roughness: 0.88,
    });
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x2c3847, roughness: 0.36, metalness: 0.65 });

    const addWallSeg = (bw: number, bd: number, bx: number, bz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, wallH, bd), plasterMat);
      m.position.set(bx, GROUND_LEVEL_Y + wallH * 0.5, bz);
      m.castShadow = true;
      m.receiveShadow = true;
      oriented.add(m);
    };

    const addPier = (px: number, pz: number) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.32, wallH + 0.22, 0.32), pierMat);
      p.position.set(px, GROUND_LEVEL_Y + (wallH + 0.22) * 0.5, pz);
      p.castShadow = true;
      p.receiveShadow = true;
      oriented.add(p);
    };

    // Rear, Left, Right walls
    addWallSeg(frontLen, wallT, 0, -sideLen * 0.5 + wallT * 0.5);
    addWallSeg(wallT, sideLen, -frontLen * 0.5 + wallT * 0.5, 0);
    addWallSeg(wallT, sideLen, frontLen * 0.5 - wallT * 0.5, 0);
    addPier(-frontLen * 0.5 + 0.16, -sideLen * 0.5 + 0.16);
    addPier(frontLen * 0.5 - 0.16, -sideLen * 0.5 + 0.16);
    addPier(-frontLen * 0.5 + 0.16, sideLen * 0.5 - 0.16);
    addPier(frontLen * 0.5 - 0.16, sideLen * 0.5 - 0.16);

    // Front wall along +sideLen/2 with centered or right-offset MS main gate
    const gateW = Math.min(3.6, Math.max(2.4, frontLen * 0.3));
    const gateCenterX = isVillage ? 0 : Math.min(frontLen * 0.22, frontLen * 0.5 - gateW * 0.5 - 1.0);
    const leftSegW = gateCenterX - gateW * 0.5 - (-frontLen * 0.5);
    const rightSegW = frontLen * 0.5 - (gateCenterX + gateW * 0.5);

    if (plot.hasGate) {
      if (leftSegW > 0.25) {
        addWallSeg(leftSegW, wallT, -frontLen * 0.5 + leftSegW * 0.5, sideLen * 0.5 - wallT * 0.5);
      }
      if (rightSegW > 0.25) {
        addWallSeg(rightSegW, wallT, frontLen * 0.5 - rightSegW * 0.5, sideLen * 0.5 - wallT * 0.5);
      }
      addPier(gateCenterX - gateW * 0.5, sideLen * 0.5 - 0.16);
      addPier(gateCenterX + gateW * 0.5, sideLen * 0.5 - 0.16);

      // Clean architectural horizontal-slat MS main gate
      const gateH = 1.62;
      const gateFrame = new THREE.Mesh(new THREE.BoxGeometry(gateW - 0.14, gateH, 0.06), gateMat);
      gateFrame.position.set(gateCenterX, GROUND_LEVEL_Y + gateH * 0.5 + 0.04, sideLen * 0.5 - 0.14);
      gateFrame.castShadow = true;
      oriented.add(gateFrame);

      // Concrete ramp from road across footpath into gate
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(gateW + 0.4, 0.14, footW + 0.4), curbMat);
      ramp.position.set(gateCenterX, GROUND_LEVEL_Y - 0.065, sideLen * 0.5 + footW * 0.5);
      ramp.receiveShadow = true;
      oriented.add(ramp);
    } else {
      addWallSeg(frontLen, wallT, 0, sideLen * 0.5 - wallT * 0.5);
    }
  }

  // Optional RAJUK Legal Setback Envelope Wireframe (shows exact legal buildable box!)
  if (showSetbacks) {
    const rules = computeRequiredRajukRules(plot, bnbc, project.stories.length);
    const req = rules.requiredSetbacks;
    const legalW = Math.max(1, frontLen - req.left - req.right);
    const legalD = Math.max(1, sideLen - req.front - req.rear);
    const totalH = Math.max(3.2, project.stories.reduce((s, st) => s + st.height, 0) + 1.0);
    const boxGeo = new THREE.BoxGeometry(legalW, totalH, legalD);
    const edges = new THREE.EdgesGeometry(boxGeo);
    boxGeo.dispose();
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x1d4ed8,
      transparent: true,
      opacity: 0.72,
    });
    const wire = new THREE.LineSegments(edges, lineMat);
    const offsetX = (req.left - req.right) * 0.5;
    const offsetZ = (req.rear - req.front) * 0.5;
    wire.position.set(offsetX, GROUND_LEVEL_Y + totalH * 0.5, offsetZ);
    oriented.add(wire);
  }

  return site;
}

/** Build the complete Three.js scene for BhumiMap with exact joinery, curved walls, GPU cutaway & X-Ray */
export function buildBuildingScene(
  project: BuildingProject,
  options: BuildSceneOptions
): BuiltBuildingScene {
  const root = new THREE.Group();
  const storyGroups: BuiltBuildingScene['storyGroups'] = [];
  const clickables: THREE.Object3D[] = [];
  const selectableMap = new Map<string, THREE.Object3D>();
  const ownedTextures: THREE.Texture[] = [];

  // Compute exact world cutaway plane elevation on the top visible story (baseY is always un-exploded; Viewport3D animates explodeGap!)
  const visibleStories = project.stories.filter((s) => s.index <= options.visibleMaxStoryIndex);
  const topVisibleIdx = visibleStories[visibleStories.length - 1]?.index ?? 0;

  let topVisibleBaseY = 0;
  let topVisibleH = 3.048;
  const storyBaseYs = new Map<number, number>();
  let accY = 0;
  for (const s of project.stories) {
    storyBaseYs.set(s.index, accY);
    if (s.index === topVisibleIdx) {
      topVisibleBaseY = accY;
      topVisibleH = s.height;
    }
    accY += s.height;
  }

  const isCutawayActive = options.cutawayRatio < 0.985;
  const cutY = isCutawayActive
    ? topVisibleBaseY + Math.max(0.35, (topVisibleH - 0.12) * options.cutawayRatio)
    : 1000;
  // Three.js clips fragments where dot(normal, p) + constant < 0 => keep y <= cutY
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY);
  const activeClipPlanes = isCutawayActive ? [clipPlane] : [];

  // 1. Plot & Parametric Road Context (never clipped by floor cutaway)
  if (project.plot) {
    const plotGroup = buildPlotContextGroup(project, project.plot, options.showSetbacks, ownedTextures);
    root.add(plotGroup);
  }

  // Shared PBR base textures
  const tileTex = getFloorTileTextures();
  const concreteTex = getFairConcreteTextures();

  // 2. Plinth Foundation Apron & Isolated RCC Footings (under Ground Story!)
  const groundStory = project.stories[0];
  if (groundStory) {
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0xcbd2da,
      roughness: 0.88,
      metalness: 0.02,
    });
    const footingMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.84,
      metalness: 0.04,
      transparent: options.xrayStructural,
      opacity: options.xrayStructural ? 0.9 : 1.0,
    });

    // Solid plinth skirting from GL (-0.45m) up to Ground Slab soffit (-slabThickness) so building NEVER floats!
    for (const s of groundStory.slabs) {
      const plinthH = Math.max(0.1, PLINTH_HEIGHT_M - s.thickness);
      const pMesh = new THREE.Mesh(
        new THREE.BoxGeometry(s.width - 0.02, plinthH, s.depth - 0.02),
        plinthMat
      );
      pMesh.position.set(s.x + s.width * 0.5, GROUND_LEVEL_Y + plinthH * 0.5, s.z + s.depth * 0.5);
      pMesh.castShadow = true;
      pMesh.receiveShadow = true;
      root.add(pMesh);
    }

    // In Structural X-Ray mode, render the isolated RCC footings & grade pedestals below GL!
    if (options.xrayStructural) {
      for (const p of groundStory.pillars) {
        const phys = options.physics.elements[p.id];
        const fSize = phys?.footingSizeM ?? 1.5;
        const ped = new THREE.Mesh(
          new THREE.BoxGeometry(p.width + 0.04, 1.05, p.depth + 0.04),
          footingMat
        );
        ped.position.set(p.x, GROUND_LEVEL_Y - 0.52, p.z);
        root.add(ped);

        const pad = new THREE.Mesh(new THREE.BoxGeometry(fSize, 0.36, fSize), footingMat);
        pad.position.set(p.x, GROUND_LEVEL_Y - 1.18, p.z);
        root.add(pad);
      }
    }
  }

  // 3. Build Every Visible Story
  for (const story of visibleStories) {
    const baseY = storyBaseYs.get(story.index) ?? 0;
    const storyGroup = new THREE.Group();
    storyGroup.position.y = baseY;
    const clearH = Math.max(2.2, story.height - story.slabThickness);
    const isTopVisible = story.index === topVisibleIdx;
    const storyClips = isTopVisible ? activeClipPlanes : [];

    // 3A. Floor Slabs & Balcony/Veranda Railings (with TRUE Stairwell Cutouts!)
    for (const slab of story.slabs) {
      const isSelected = options.selected?.type === 'slab' && options.selected.id === slab.id;
      const phys = options.physics.elements[slab.id];
      const heatColor = options.heatmapMode && phys ? HEATMAP_COLORS[phys.status] : undefined;

      const slabTopMat = new THREE.MeshStandardMaterial({
        color: heatColor ?? (slab.type === 'balcony' ? 0xe7e3db : 0xf4f2ed),
        map: heatColor
          ? undefined
          : trackTex(ownedTextures, cloneWithRepeat(tileTex.map, 1, 1)),
        roughness: 0.62,
        metalness: 0.04,
        transparent: options.xrayStructural,
        opacity: options.xrayStructural ? 0.52 : 1.0,
        emissive: isSelected ? new THREE.Color(0x1d4ed8) : new THREE.Color(0x000000),
        emissiveIntensity: isSelected ? 0.16 : 0,
        clippingPlanes: storyClips,
        clipShadows: true,
      });
      const slabSideMat = new THREE.MeshStandardMaterial({
        color: heatColor ?? 0xd7dce2,
        roughness: 0.85,
        metalness: 0.02,
        clippingPlanes: storyClips,
        clipShadows: true,
      });

      const slabMesh = buildSlabMeshWithCutouts(slab, -slab.thickness, slab.thickness, slabTopMat, slabSideMat);
      tagClickable(slabMesh, 'slab', slab.id, story.index, clickables, selectableMap);
      storyGroup.add(slabMesh);

      // Balcony / Veranda Railing along open outer edges (cleanly stopping at columns — zero clipping!)
      if (slab.type === 'balcony' && !options.xrayStructural) {
        const railH = 0.96;
        const railMat = new THREE.MeshStandardMaterial({
          color: slab.railingStyle === 'baluster' ? 0xe8e4dc : 0x263240,
          roughness: slab.railingStyle === 'baluster' ? 0.85 : 0.35,
          metalness: slab.railingStyle === 'baluster' ? 0.02 : 0.65,
          clippingPlanes: storyClips,
          clipShadows: true,
        });
        const railGlass = new THREE.MeshStandardMaterial({
          color: 0xb9d7ec,
          roughness: 0.1,
          metalness: 0.12,
          transparent: true,
          opacity: 0.42,
          clippingPlanes: storyClips,
        });

        // Determine which slab edges border the building (interior) vs exterior open edge
        const touchesFloorSlab = (px: number, pz: number) =>
          story.slabs.some(
            (other) =>
              other.id !== slab.id &&
              px >= other.x - 0.15 &&
              px <= other.x + other.width + 0.15 &&
              pz >= other.z - 0.15 &&
              pz <= other.z + other.depth + 0.15
          );

        const edges: [number, number, number, number][] = [
          [slab.x + 0.06, slab.z + slab.depth - 0.06, slab.x + slab.width - 0.06, slab.z + slab.depth - 0.06], // South
          [slab.x + 0.06, slab.z + 0.06, slab.x + slab.width - 0.06, slab.z + 0.06], // North
          [slab.x + 0.06, slab.z + 0.06, slab.x + 0.06, slab.z + slab.depth - 0.06], // West
          [slab.x + slab.width - 0.06, slab.z + 0.06, slab.x + slab.width - 0.06, slab.z + slab.depth - 0.06], // East
        ];

        for (const [ex1, ez1, ex2, ez2] of edges) {
          const mx = (ex1 + ex2) * 0.5;
          const mz = (ez1 + ez2) * 0.5;
          if (touchesFloorSlab(mx, mz)) continue;
          // Also skip edges that already have a full-length wall on them
          const hasWallOnEdge = story.walls.some((w) => {
            const wmx = (w.x1 + w.x2) * 0.5;
            const wmz = (w.z1 + w.z2) * 0.5;
            return Math.hypot(wmx - mx, wmz - mz) < 0.35;
          });
          if (hasWallOnEdge) continue;

          const edgeLen = Math.hypot(ex2 - ex1, ez2 - ez1);
          const ang = Math.atan2(ez2 - ez1, ex2 - ex1);
          const railGroup = new THREE.Group();
          railGroup.position.set(mx, 0, mz);
          railGroup.rotation.y = -ang;

          // Top handrail + bottom curb
          const topBar = new THREE.Mesh(new THREE.BoxGeometry(edgeLen, 0.045, 0.05), railMat);
          topBar.position.set(0, railH, 0);
          topBar.castShadow = true;
          railGroup.add(topBar);

          const botBar = new THREE.Mesh(new THREE.BoxGeometry(edgeLen, 0.08, 0.08), railMat);
          botBar.position.set(0, 0.04, 0);
          railGroup.add(botBar);

          if (slab.railingStyle === 'glass-ms') {
            const pane = new THREE.Mesh(new THREE.BoxGeometry(edgeLen - 0.08, railH - 0.14, 0.018), railGlass);
            pane.position.set(0, 0.08 + (railH - 0.14) * 0.5, 0);
            railGroup.add(pane);
          }

          const postStep = slab.railingStyle === 'baluster' ? 0.24 : 0.95;
          const count = Math.max(2, Math.floor(edgeLen / postStep));
          for (let i = 0; i <= count; i++) {
            const px = -edgeLen * 0.5 + (i / count) * edgeLen;
            // Skip posts that coincide with a veranda column!
            const wx = mx + Math.cos(ang) * px;
            const wz = mz + Math.sin(ang) * px;
            const hitsCol = story.pillars.some((p) => Math.hypot(p.x - wx, p.z - wz) < Math.max(p.width, p.depth) * 0.65);
            if (hitsCol) continue;
            const post = new THREE.Mesh(
              new THREE.BoxGeometry(slab.railingStyle === 'baluster' ? 0.055 : 0.032, railH - 0.06, 0.036),
              railMat
            );
            post.position.set(px, railH * 0.5, 0);
            post.castShadow = true;
            railGroup.add(post);
          }
          storyGroup.add(railGroup);
        }
      }
    }

    // 3B. Structural Columns / Pillars (Stand proud by +COLUMN_PROUD_EPS to eliminate ALL Z-fighting!)
    for (const p of story.pillars) {
      const isSelected = options.selected?.type === 'pillar' && options.selected.id === p.id;
      const phys = options.physics.elements[p.id];
      const heatColor =
        options.heatmapMode && phys
          ? HEATMAP_COLORS[phys.status]
          : phys?.status === 'critical'
          ? HEATMAP_COLORS.critical
          : undefined;

      const pMat = new THREE.MeshStandardMaterial({
        color: heatColor ?? (p.grade === 'steel-a992' ? 0x475569 : 0xcbd2da),
        map: heatColor
          ? undefined
          : trackTex(ownedTextures, cloneWithRepeat(concreteTex.map, 0.4, 1.4)),
        roughness: p.grade === 'steel-a992' ? 0.35 : 0.78,
        metalness: p.grade === 'steel-a992' ? 0.68 : 0.05,
        emissive: isSelected ? new THREE.Color(0x1d4ed8) : new THREE.Color(0x000000),
        emissiveIntensity: isSelected ? 0.22 : 0,
        clippingPlanes: storyClips,
        clipShadows: true,
      });

      const colH = story.height; // runs continuously slab-to-slab through beam joint!
      let mesh: THREE.Mesh;
      if (p.shape === 'circular') {
        const r = p.width * 0.5 + COLUMN_PROUD_EPS;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, colH, 20), pMat);
      } else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(p.width + COLUMN_PROUD_EPS * 2, colH, p.depth + COLUMN_PROUD_EPS * 2),
          pMat
        );
      }
      mesh.position.set(p.x, colH * 0.5 - story.slabThickness, p.z);
      mesh.rotation.y = -p.rotation;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      tagClickable(mesh, 'pillar', p.id, story.index, clickables, selectableMap, { draggable: true });
      storyGroup.add(mesh);
    }

    // 3C. Structural Drop Beams (Inset slightly behind column outer face, proud of masonry walls!)
    for (const b of story.beams) {
      const dx = b.x2 - b.x1;
      const dz = b.z2 - b.z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.08) continue;

      const isSelected = options.selected?.type === 'beam' && options.selected.id === b.id;
      const phys = options.physics.elements[b.id];
      const heatColor =
        options.heatmapMode && phys
          ? HEATMAP_COLORS[phys.status]
          : phys?.status === 'critical'
          ? HEATMAP_COLORS.critical
          : undefined;

      const bMat = new THREE.MeshStandardMaterial({
        color: heatColor ?? (b.material === 'steel' ? 0x475569 : 0xcfd5dc),
        roughness: b.material === 'steel' ? 0.35 : 0.8,
        metalness: b.material === 'steel' ? 0.65 : 0.04,
        emissive: isSelected ? new THREE.Color(0x1d4ed8) : new THREE.Color(0x000000),
        emissiveIntensity: isSelected ? 0.2 : 0,
        clippingPlanes: storyClips,
        clipShadows: true,
      });

      const dropH = Math.max(0.12, b.depth - story.slabThickness);
      const beamMesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.05, len - 0.02), dropH, b.width + BEAM_PROUD_EPS * 2),
        bMat
      );
      beamMesh.position.set(
        (b.x1 + b.x2) * 0.5,
        clearH - dropH * 0.5,
        (b.z1 + b.z2) * 0.5
      );
      beamMesh.rotation.y = -Math.atan2(dz, dx);
      beamMesh.castShadow = true;
      beamMesh.receiveShadow = true;
      tagClickable(beamMesh, 'beam', b.id, story.index, clickables, selectableMap);
      storyGroup.add(beamMesh);
    }

    // 3D. Straight & Curved Walls (Hidden in Structural RCC Frame X-Ray Mode!)
    if (!options.xrayStructural) {
      const cornerExts = computeWallCornerExtensions(story.walls, story.pillars);
      // Determine drop beam soffit height for exterior perimeter walls so wall masonry ends cleanly under beam!
      const defaultDropBeam = story.beams.reduce((m, b) => Math.max(m, b.depth - story.slabThickness), 0);

      for (const wall of story.walls) {
        const isSelected = options.selected?.type === 'wall' && options.selected.id === wall.id;
        const phys = options.physics.elements[wall.id];
        const heatColor = options.heatmapMode && phys ? HEATMAP_COLORS[phys.status] : undefined;

        const baseWallH = wall.height !== null ? Math.min(wall.height, clearH) : clearH;
        // If a beam runs directly along this wall centerline, stop masonry cleanly at beam soffit (zero Z-fighting!)
        const hasOverheadBeam =
          !isCurvedWall(wall) &&
          story.beams.some((b) => {
            const bmx = (b.x1 + b.x2) * 0.5;
            const bmz = (b.z1 + b.z2) * 0.5;
            const wmx = (wall.x1 + wall.x2) * 0.5;
            const wmz = (wall.z1 + wall.z2) * 0.5;
            const dist = Math.hypot(bmx - wmx, bmz - wmz);
            const wallLen = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
            const beamLen = Math.hypot(b.x2 - b.x1, b.z2 - b.z1);
            // Collinear overlap check
            const wx = (wall.x2 - wall.x1) / Math.max(0.01, wallLen);
            const wz = (wall.z2 - wall.z1) / Math.max(0.01, wallLen);
            const bx = (b.x2 - b.x1) / Math.max(0.01, beamLen);
            const bz = (b.z2 - b.z1) / Math.max(0.01, beamLen);
            const parallel = Math.abs(wx * bx + wz * bz) > 0.96;
            const perpDist = Math.abs((b.x1 - wall.x1) * -wz + (b.z1 - wall.z1) * wx);
            return parallel && perpDist < 0.12 && dist < (wallLen + beamLen) * 0.55;
          });

        const wallH = hasOverheadBeam
          ? Math.max(2.15, Math.min(baseWallH, clearH - defaultDropBeam + 0.002))
          : baseWallH;

        const wallGroup = new THREE.Group();

        if (isCurvedWall(wall)) {
          // Smooth curved arc wall mesh
          const mat = createWallMaterial(wall.material, 3, 1.5, ownedTextures, storyClips, heatColor, isSelected);
          const curvedMesh = buildCurvedWallMesh(wall, wallH, mat);
          wallGroup.add(curvedMesh);
        } else {
          const dx = wall.x2 - wall.x1;
          const dz = wall.z2 - wall.z1;
          const rawLen = Math.hypot(dx, dz);
          if (rawLen < 0.05) continue;

          const ux = dx / rawLen;
          const uz = dz / rawLen;
          const angle = Math.atan2(dz, dx);
          const ext = cornerExts.get(wall.id) ?? { extStart: 0, extEnd: 0 };

          // 1. Subtract pillar footprints first so walls NEVER Z-fight through columns!
          const pillarClearRuns = subtractPillarIntervals(
            wall,
            -ext.extStart,
            rawLen + ext.extEnd,
            story.pillars
          );

          // 2. Subtract door/window openings inside each clear run
          const ops = [...wall.openings].sort((a, b) => a.offset - b.offset);

          const addWallPiece = (s0: number, s1: number, y0: number, y1: number) => {
            const pLen = s1 - s0;
            const pH = y1 - y0;
            if (pLen < 0.02 || pH < 0.02) return;
            const midS = (s0 + s1) * 0.5;
            const mat = createWallMaterial(
              wall.material,
              Math.max(0.4, pLen * 0.55),
              Math.max(0.4, pH * 0.55),
              ownedTextures,
              storyClips,
              heatColor,
              isSelected
            );
            const piece = new THREE.Mesh(new THREE.BoxGeometry(pLen, pH, wall.thickness), mat);
            piece.position.set(wall.x1 + ux * midS, y0 + pH * 0.5, wall.z1 + uz * midS);
            piece.rotation.y = -angle;
            piece.castShadow = true;
            piece.receiveShadow = true;
            wallGroup.add(piece);
          };

          for (const [r0, r1] of pillarClearRuns) {
            let cursor = r0;
            for (const op of ops) {
              const o0 = Math.max(r0, op.offset);
              const o1 = Math.min(r1, op.offset + op.width);
              if (o1 <= o0 + 0.01) continue;
              if (o0 > cursor + 0.015) {
                addWallPiece(cursor, o0, 0, wallH);
              }
              // Sill below window
              if (op.sillHeight > 0.02) {
                addWallPiece(o0, o1, 0, Math.min(op.sillHeight, wallH));
              }
              // Lintel masonry header above opening
              const opTop = op.sillHeight + op.height;
              if (opTop < wallH - 0.02) {
                addWallPiece(o0, o1, opTop, wallH);
              }
              cursor = Math.max(cursor, o1);
            }
            if (r1 > cursor + 0.015) {
              addWallPiece(cursor, r1, 0, wallH);
            }
          }
        }

        tagClickable(wallGroup, 'wall', wall.id, story.index, clickables, selectableMap);
        storyGroup.add(wallGroup);

        // Build Interactive 3D Doors, Windows, Rolling Shutters & Monsoon Chajjas
        for (const op of wall.openings) {
          const opSel = options.selected?.type === 'opening' && options.selected.id === op.id;
          const opGroup = buildOpening3DGroup(wall, op, story.index, clickables, selectableMap, storyClips, opSel);
          storyGroup.add(opGroup);
        }
      }
    }

    // 3E. Functional Bangladeshi Assets (Grounded on exact datum: GL for exterior, FFL for interior!)
    for (const asset of story.assets) {
      const def = getAssetDefinition(asset.assetId);
      // In Structural X-Ray mode, keep only stairs & lift core visible so engineers inspect the vertical core!
      if (options.xrayStructural && !def?.isStair && !def?.isCore) continue;

      const isSelected = options.selected?.type === 'asset' && options.selected.id === asset.id;
      const phys = options.physics.elements[asset.id];
      const heatColor =
        options.heatmapMode && phys
          ? HEATMAP_COLORS[phys.status]
          : phys?.status === 'critical'
          ? HEATMAP_COLORS.critical
          : undefined;

      // Exterior assets ALWAYS sit strictly at GROUND_LEVEL_Y (-0.45m), NEVER floating at plinth level!
      const isExterior = Boolean(def?.isExterior);
      const yPos = isExterior
        ? GROUND_LEVEL_Y
        : Math.max(0.002, asset.elevationY ?? def?.defaultElevationY ?? 0.002);

      // NEVER squash asset height in cutaway mode — GPU clipping plane slices cleanly!
      const assetClips = isExterior ? [] : storyClips;
      const aObj = buildAsset3DGroup(asset.assetId, asset.width, asset.depth, asset.height, {
        colorOverride: asset.colorOverride,
        heatmapColor: heatColor,
        selected: isSelected,
        clippingPlanes: assetClips,
      });
      aObj.position.set(asset.x, yPos, asset.z);
      aObj.rotation.y = -asset.rotation;
      if (asset.flipX) aObj.scale.x = -1;

      tagClickable(aObj, 'asset', asset.id, story.index, clickables, selectableMap, { draggable: true });
      storyGroup.add(aObj);
    }

    // 3F. Unified Authentic Bangladeshi RCC Roof, Veranda Roof, Outer Parapet, Chilerkotha & Gazi Water Tank!
    if (isTopVisible && options.showCeilingRoof && !isCutawayActive) {
      const roofTopY = clearH + story.slabThickness;
      const roofMat = new THREE.MeshStandardMaterial({
        map: trackTex(ownedTextures, cloneWithRepeat(concreteTex.map, 3, 3)),
        color: 0xe6ebf0,
        roughness: 0.84,
        metalness: 0.02,
      });
      const parapetMat = new THREE.MeshStandardMaterial({
        color: 0xf4f0e8,
        roughness: 0.88,
        metalness: 0.02,
      });
      const copingMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.72,
        metalness: 0.08,
      });

      // Cover ALL floor slabs AND any roofed Bangladeshi Baranda (veranda) slabs!
      const roofableSlabs = story.slabs.filter((s) => s.type === 'floor' || s.hasRoofSlab);
      let rMinX = Infinity;
      let rMaxX = -Infinity;
      let rMinZ = Infinity;
      let rMaxZ = -Infinity;

      for (const s of roofableSlabs) {
        // Roof slab keeps stairwell cutout hole if a Chilerkotha stairhead covers it, otherwise solid RCC roof
        const hasStair = story.assets.some((a) => getAssetDefinition(a.assetId)?.isStair);
        const roofSlabDef: Slab = {
          ...s,
          cutouts: hasStair ? s.cutouts : [],
        };
        const rMesh = buildSlabMeshWithCutouts(roofSlabDef, clearH, story.slabThickness, roofMat, copingMat);
        storyGroup.add(rMesh);

        rMinX = Math.min(rMinX, s.x);
        rMaxX = Math.max(rMaxX, s.x + s.width);
        rMinZ = Math.min(rMinZ, s.z);
        rMaxZ = Math.max(rMaxZ, s.z + s.depth);
      }

      // Single clean outer-perimeter RCC parapet (3'-6" = 1.05m BNBC roof safety parapet) — NEVER splits through veranda!
      if (Number.isFinite(rMinX) && rMaxX - rMinX > 1 && rMaxZ - rMinZ > 1 && !options.xrayStructural) {
        const rw = rMaxX - rMinX;
        const rd = rMaxZ - rMinZ;
        const rcx = (rMinX + rMaxX) * 0.5;
        const rcz = (rMinZ + rMaxZ) * 0.5;
        const parapetH = 1.02;
        const pt = 0.14;

        const sides: [number, number, number, number][] = [
          [rw, pt, rcx, rMinZ + pt * 0.5],
          [rw, pt, rcx, rMaxZ - pt * 0.5],
          [pt, rd - pt * 2, rMinX + pt * 0.5, rcz],
          [pt, rd - pt * 2, rMaxX - pt * 0.5, rcz],
        ];
        for (const [pw, pd, px, pz] of sides) {
          const wallP = new THREE.Mesh(new THREE.BoxGeometry(pw, parapetH, pd), parapetMat);
          wallP.position.set(px, roofTopY + parapetH * 0.5, pz);
          wallP.castShadow = true;
          wallP.receiveShadow = true;
          const cap = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.04, 0.055, pd + 0.04), copingMat);
          cap.position.set(px, roofTopY + parapetH + 0.028, pz);
          storyGroup.add(wallP, cap);
        }

        // Authentic Bangladeshi Chilerkotha (stairhead room with access door) + Gazi Overhead Water Tank
        const stairAsset = story.assets.find((a) => getAssetDefinition(a.assetId)?.isStair);
        if (stairAsset) {
          const chW = Math.min(rw - 0.5, Math.max(2.3, stairAsset.width + 0.32));
          const chD = Math.min(rd - 0.5, Math.max(3.2, stairAsset.depth + 0.35));
          const chH = 2.55;
          // Clamp Chilerkotha cleanly inside roof parapet bounds!
          const chX = Math.max(rMinX + chW * 0.5 + 0.18, Math.min(rMaxX - chW * 0.5 - 0.18, stairAsset.x));
          const chZ = Math.max(rMinZ + chD * 0.5 + 0.18, Math.min(rMaxZ - chD * 0.5 - 0.18, stairAsset.z));

          const chRoom = new THREE.Mesh(new THREE.BoxGeometry(chW, chH, chD), parapetMat);
          chRoom.position.set(chX, roofTopY + chH * 0.5, chZ);
          chRoom.castShadow = true;
          chRoom.receiveShadow = true;
          const chRoof = new THREE.Mesh(new THREE.BoxGeometry(chW + 0.44, 0.15, chD + 0.44), copingMat);
          chRoof.position.set(chX, roofTopY + chH + 0.075, chZ);
          chRoof.castShadow = true;
          // Rooftop access door on Chilerkotha
          const chDoor = new THREE.Mesh(
            new THREE.BoxGeometry(0.86, 2.05, 0.06),
            new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.4 })
          );
          const doorSideZ = chZ > rcz ? chZ - chD * 0.5 - 0.02 : chZ + chD * 0.5 + 0.02;
          chDoor.position.set(chX, roofTopY + 1.025, doorSideZ);
          storyGroup.add(chRoom, chRoof, chDoor);

          // Overhead Gazi black water tank neatly perched on Chilerkotha roof!
          const tank = buildAsset3DGroup('water-tank-gazi', 1.35, 1.35, 1.6, {});
          tank.position.set(chX, roofTopY + chH + 0.15, chZ);
          storyGroup.add(tank);
        } else {
          // Single-story home: neat Gazi overhead water tank on back-left concrete plinth
          const tank = buildAsset3DGroup('water-tank-gazi', 1.3, 1.3, 1.55, {});
          tank.position.set(rMinX + 1.15, roofTopY, rMinZ + 1.15);
          storyGroup.add(tank);
        }
      }
    }

    root.add(storyGroup);
    storyGroups.push({ index: story.index, baseY, height: story.height, group: storyGroup });
  }

  // Compute crisp camera framing strictly around building footprint & height
  const { buildingBounds } = computeActualPlotSetbacks(project);
  const totalBuildingH = Math.max(
    3.2,
    visibleStories.reduce((s, st) => s + st.height, 0) + (options.explodedView ? visibleStories.length * 1.4 : 0)
  );
  const bw = Math.max(6, buildingBounds.maxX - buildingBounds.minX);
  const bd = Math.max(6, buildingBounds.maxZ - buildingBounds.minZ);
  const boundsCenter = new THREE.Vector3(
    (buildingBounds.minX + buildingBounds.maxX) * 0.5,
    totalBuildingH * 0.44,
    (buildingBounds.minZ + buildingBounds.maxZ) * 0.5
  );
  const boundsRadius = Math.max(5.5, Math.hypot(bw, bd, totalBuildingH) * 0.55);

  return {
    root,
    storyGroups,
    clickables,
    selectableMap,
    topVisibleIdx,
    topVisibleH,
    boundsCenter,
    boundsRadius,
    clipPlane,
    ownedTextures,
  };
}

/** Zero-leak strict disposal of geometries, materials, and cloned textures */
export function disposeBuiltScene(built: BuiltBuildingScene): void {
  const disposedMats = new Set<THREE.Material>();
  built.root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!disposedMats.has(m)) {
          disposedMats.add(m);
          m.dispose();
        }
      }
    }
  });
  for (const tex of built.ownedTextures) {
    tex.dispose();
  }
}
