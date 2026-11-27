export type UnitSystem = 'imperial' | 'metric';
export type ViewMode = '2d' | 'split' | '2.5d' | '3d';
export type ExperienceMode = 'simple' | 'engineer';
export type LightingPreset = 'daylight' | 'golden' | 'studio';
export type RoadSide = 'south' | 'north' | 'east' | 'west';
export type LandContext = 'urban' | 'semi-urban' | 'village';
export type GuidedStep = 'land' | 'structure' | 'walls' | 'openings' | 'essentials' | 'physics';

export type BnbcSeismicZone = 1 | 2 | 3 | 4;
export type SoilSiteClass = 'SA' | 'SB' | 'SC' | 'SD' | 'SE';

export type BlueprintSheetMode = 'draft' | 'presentation' | 'print';
export type DimensionBasis = 'interior' | 'centerline';
export type PaperSize = 'A4' | 'A3' | 'Letter';
export type PaperOrientation = 'landscape' | 'portrait';
export type PrintScale = 'auto' | '1:50' | '1:100' | '1/4"=1\'' | '1/8"=1\'';

export type ToolMode =
  | 'select'
  | 'room'
  | 'wall'
  | 'curved-wall'
  | 'pillar'
  | 'beam'
  | 'slab'
  | 'cutout'
  | 'door'
  | 'window'
  | 'split-wall'
  | 'offset-wall'
  | 'trim-wall'
  | 'note'
  | 'dim-line'
  | 'ruler'
  | 'area'
  | 'pan';

export type WallMaterial =
  | 'brick-1st'
  | 'exposed-brick'
  | 'fair-concrete'
  | 'hollow-block'
  | 'rcc'
  | 'jala-brick'
  | 'timber-louver'
  | 'gypsum-board';

export type WallRole = 'load-bearing' | 'partition';

export type PillarShape = 'square' | 'rectangular' | 'circular' | 'steel-h';
export type StructuralGrade = 'rcc-3000' | 'rcc-3500' | 'rcc-4000' | 'steel-a992';

export type BeamMaterial = 'rcc' | 'steel' | 'timber';
export type SlabType = 'floor' | 'balcony' | 'roof';
export type BalconyRailingStyle = 'glass-ms' | 'ms-grill' | 'baluster';
export type OccupancyClass = 'residential' | 'office' | 'commercial' | 'storage';

export type OpeningKind =
  | 'door-single'
  | 'door-double'
  | 'door-sliding'
  | 'window-casement'
  | 'window-picture'
  | 'shutter-shop'
  | 'arch-opening';

export interface Vec2 {
  x: number; // meters
  z: number; // meters (Y on 2D plan, Z in 3D space)
}

export interface LandSetbacks {
  front: number; // meters
  rear: number; // meters
  left: number; // meters
  right: number; // meters
}

export interface BnbcConfig {
  seismicZone: BnbcSeismicZone; // 1=Khulna(0.12), 2=Dhaka(0.20), 3=Chattogram(0.28), 4=Sylhet(0.36)
  soilClass: SoilSiteClass; // SC/SD typical Dhaka
  windSpeedMs: number; // BNBC 2020 basic wind speed (Dhaka 65.7 m/s, Ctg 80 m/s)
  soilBearingKpa: number; // Allowable soil bearing pressure q_allow (typical Dhaka 140-190 kPa)
  concretePsi: 3000 | 3500 | 4000;
  steelGradeKsi: 60 | 72.5; // 60 Grade or 500W TMT (72.5 ksi)
  roadWidthM: number; // adjoining road width in meters (affects RAJUK FAR)
  landContext: LandContext;
}

export interface LandPlot {
  width: number; // total plot X width in meters
  depth: number; // total plot Z depth in meters
  originX: number; // top-left X in world meters
  originZ: number; // top-left Z in world meters
  roadSide: RoadSide;
  setbacks: LandSetbacks;
  hasBoundaryWall: boolean;
  hasGate: boolean;
  hasLandscaping: boolean;
  landContext?: LandContext;
  roadWidthM?: number;
}

export interface WallOpening {
  id: string;
  kind: OpeningKind;
  offset: number; // distance from wall start along centerline (meters)
  width: number; // meters
  height: number; // meters
  sillHeight: number; // meters (0 for doors)
  swing: 1 | -1; // swing side for doors
  openRatio?: number; // 0 = closed, 1 = fully open in 3D
  hasChajja?: boolean; // Bangladeshi monsoon rain sunshade over exterior windows
  hasGrill?: boolean; // MS security grill on windows
}

export interface Wall {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  curveOffset?: number; // perpendicular arc bulge at midpoint in meters (0 = straight)
  thickness: number; // meters (e.g., 0.127m = 5", 0.254m = 10")
  height: number | null; // null = full story clear height (storyHeight - slabThickness)
  material: WallMaterial;
  role: WallRole;
  openings: WallOpening[];
  locked?: boolean;
}

export interface Pillar {
  id: string;
  label: string;
  x: number;
  z: number;
  width: number; // meters (X dimension or diameter)
  depth: number; // meters (Z dimension)
  shape: PillarShape;
  grade: StructuralGrade;
  rotation: number; // radians
  locked?: boolean;
}

export interface Beam {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number; // meters
  depth: number; // meters (vertical depth of beam)
  material: BeamMaterial;
  locked?: boolean;
}

export interface SlabCutout {
  id: string;
  label?: string;
  x: number; // top-left X (meters)
  z: number; // top-left Z (meters)
  width: number; // meters
  depth: number; // meters
}

export interface Slab {
  id: string;
  label: string;
  x: number; // top-left X (meters)
  z: number; // top-left Z (meters)
  width: number; // meters
  depth: number; // meters
  thickness: number; // meters
  type: SlabType;
  railingStyle?: BalconyRailingStyle;
  hasPlanter?: boolean;
  hasRoofSlab?: boolean; // true for Bangladeshi roofed Baranda (veranda)
  cutouts?: SlabCutout[]; // true slab holes for staircases, lifts, and duplex voids
  locked?: boolean;
}

export interface RoomZone {
  id: string;
  name: string;
  x: number; // top-left X (meters)
  z: number; // top-left Z (meters)
  width: number; // meters
  depth: number; // meters
  polygon?: Vec2[]; // auto-detected enclosed wall polygon when available
}

export type TemplateCategory =
  | 'apartments'
  | 'duplex-villas'
  | 'village-bari'
  | 'mixed-commercial'
  | 'compact-starter';

export type AssetCategory =
  | 'circulation'
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bath'
  | 'exterior';

export type AssetElevationBand =
  | 'floor'
  | 'wall-high'
  | 'ceiling'
  | 'recessed'
  | 'surface-flush';

export type AssetCompanionRelation =
  | 'front-center'
  | 'opposite'
  | 'side-flush'
  | 'overhead-center'
  | 'parallel-bay';

export interface AssetCompanionRule {
  targetAssetIds: string[];
  relation: AssetCompanionRelation;
  /** Desired gap in meters between facing/adjacent edges */
  gapM: number;
  /** How this asset should face relative to the target */
  facing: 'same' | 'opposite' | 'keep';
  /** Short HUD snap label e.g. "Centered on Sofa" */
  snapLabel: string;
}

export interface AssetQuickCompanion {
  assetId: string;
  buttonLabel: string;
  relation: AssetCompanionRelation;
  gapM: number;
  facing: 'same' | 'opposite' | 'keep';
}

export interface AssetPreviewCamera {
  yawDeg?: number;
  pitchDeg?: number;
  zoom?: number;
}

export interface AssetDefinition {
  id: string;
  name: string;
  category: AssetCategory;
  defaultWidth: number; // meters (local X)
  defaultDepth: number; // meters (local Z)
  defaultHeight: number; // meters (local Y)
  color: string;
  accentColor: string;
  deadLoadKn: number; // approximate self weight in kN
  description: string;
  /** Extra search terms (Bangladeshi & architectural aliases) */
  keywords?: string[];
  isStair?: boolean;
  isCore?: boolean;
  isExterior?: boolean;
  isRecessed?: boolean; // e.g., recessed village pukur cut below ground datum
  wallSnappable?: boolean; // auto-snaps flush against nearest wall
  cornerSnappable?: boolean; // locks cleanly into 90-degree wall corners
  elevationBand?: AssetElevationBand; // vertical separation band for smart conflict detection
  defaultElevationY?: number; // default mount height above floor (e.g., ceiling fan, split AC)
  companions?: AssetCompanionRule[]; // magnetic auto-alignment rules with partner assets
  quickCompanion?: AssetQuickCompanion; // 1-click companion spawn button in floating toolbar
  previewCamera?: AssetPreviewCamera; // studio 3D thumbnail framing override
}

export interface PlacedAsset {
  id: string;
  assetId: string;
  label: string;
  x: number; // center X (meters)
  z: number; // center Z (meters)
  width: number; // meters
  depth: number; // meters
  height: number; // meters
  rotation: number; // radians
  colorOverride?: string; // user-selected primary finish hex
  elevationY?: number; // height above floor slab in meters
  flipX?: boolean; // mirror left/right
  locked?: boolean;
}

export type AnnotationKind = 'note' | 'callout' | 'dimension';

export interface BlueprintAnnotation {
  id: string;
  kind: AnnotationKind;
  x1: number; // anchor X (or start point for dimension / leader tip for callout)
  z1: number; // anchor Z
  x2?: number; // text box anchor for callout, or end point for custom dimension
  z2?: number;
  offset?: number; // perpendicular offset for custom dimension line (meters)
  text: string;
  locked?: boolean;
}

export interface BlueprintLayerVisibility {
  walls: boolean;
  openings: boolean;
  structure: boolean;
  furniture: boolean;
  rooms: boolean;
  dimensions: boolean;
  grid: boolean;
  setbacks: boolean;
  annotations: boolean;
  lowerStory: boolean;
  underlay: boolean;
}

export interface SurveyUnderlay {
  dataUrl: string;
  name: string;
  originX: number; // top-left world X (meters)
  originZ: number; // top-left world Z (meters)
  widthM: number; // calibrated real-world width (meters)
  heightM: number; // calibrated real-world height (meters)
  opacity: number; // 0.1 - 1.0
  rotation: number; // radians
  locked?: boolean;
}

export interface BlueprintSettings {
  sheetMode: BlueprintSheetMode;
  dimensionBasis: DimensionBasis;
  showExteriorChains: boolean;
  showScheduleTags: boolean;
  paperSize: PaperSize;
  paperOrientation: PaperOrientation;
  printScale: PrintScale;
  layers: BlueprintLayerVisibility;
  /** Internal defaults revision so older autosaves upgrade cleanly once without losing user edits */
  uiRev?: number;
}

export const DEFAULT_LAYER_VISIBILITY: BlueprintLayerVisibility = {
  walls: true,
  openings: true,
  structure: true,
  furniture: true,
  rooms: true,
  dimensions: true,
  grid: false,
  setbacks: true,
  annotations: true,
  lowerStory: true,
  underlay: true,
};

export const DEFAULT_BLUEPRINT_SETTINGS: BlueprintSettings = {
  sheetMode: 'draft',
  dimensionBasis: 'interior',
  showExteriorChains: true,
  showScheduleTags: false,
  paperSize: 'A3',
  paperOrientation: 'landscape',
  printScale: 'auto',
  layers: { ...DEFAULT_LAYER_VISIBILITY },
  uiRev: 2,
};

export interface Story {
  id: string;
  index: number; // 0 = Ground, 1 = G+1, etc.
  name: string;
  height: number; // floor-to-floor height in meters (e.g., 3.048m = 10')
  slabThickness: number; // default ceiling/floor slab thickness (e.g., 0.127m = 5")
  occupancy: OccupancyClass;
  walls: Wall[];
  pillars: Pillar[];
  beams: Beam[];
  slabs: Slab[];
  rooms: RoomZone[];
  assets: PlacedAsset[];
  annotations?: BlueprintAnnotation[];
}

export interface BuildingProject {
  id: string;
  name: string;
  updatedAt: number;
  unitSystem: UnitSystem;
  gridSnap: number; // meters (e.g., 0.1524m = 6" or 0.25m)
  strictPhysicsLock: boolean;
  plot?: LandPlot;
  bnbc?: BnbcConfig;
  lockedLayers?: {
    pillars?: boolean;
    beams?: boolean;
    walls?: boolean;
    slabs?: boolean;
  };
  blueprintSettings?: BlueprintSettings;
  underlay?: SurveyUnderlay;
  stories: Story[];
}

export type SelectableType =
  | 'wall'
  | 'pillar'
  | 'beam'
  | 'slab'
  | 'room'
  | 'asset'
  | 'opening'
  | 'cutout'
  | 'annotation';

export interface SelectionTarget {
  type: SelectableType;
  id: string;
  storyIndex: number;
  parentWallId?: string; // when selecting an opening
  parentSlabId?: string; // when selecting a slab cutout
}

export interface RulerChain {
  id: string;
  points: Vec2[];
}

export interface AreaPoly {
  id: string;
  points: Vec2[];
}

export type PhysicsStatus = 'ok' | 'warning' | 'critical';

export interface ElementPhysics {
  id: string;
  storyIndex: number;
  type: 'wall' | 'pillar' | 'beam' | 'slab' | 'asset' | 'opening';
  utilization: number; // 0.0 to 2.0+ (1.0 = 100% allowable limit)
  status: PhysicsStatus;
  simpleSummary: string;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  secondaryMetricLabel?: string;
  secondaryMetricValue?: string;
  axialLoadKn?: number;
  capacityKn?: number;
  clearSpanM?: number;
  slenderness?: number;
  footingSizeM?: number;
  footingPressureKpa?: number;
}

export interface PhysicsIssue {
  id: string;
  severity: 'warning' | 'critical';
  storyIndex: number;
  elementId: string;
  elementType: SelectableType;
  category?: 'structural' | 'legal' | 'spatial' | 'circulation';
  title: string;
  detail: string;
  fixHint: string;
  simpleTitle: string;
  simpleFix: string;
}

export interface RajukCompliance {
  hasPlot: boolean;
  landContext: LandContext;
  plotAreaM2: number;
  plotKatha: number;
  plotShotok: number;
  footprintAreaM2: number;
  grossFloorAreaM2: number;
  actualMgcPct: number;
  maxMgcPct: number;
  mgcOk: boolean;
  actualFar: number;
  maxFar: number;
  farOk: boolean;
  requiredSetbacks: LandSetbacks;
  actualSetbacks: LandSetbacks;
  setbacksOk: boolean;
}

export interface SeismicWindSummary {
  zone: BnbcSeismicZone;
  zoneFactorZ: number;
  soilClass: SoilSiteClass;
  windSpeedMs: number;
  baseShearKn: number;
  windBaseShearKn: number;
  driftRatio: number;
  maxDriftRatio: number;
  driftOk: boolean;
  maxFootingPressureKpa: number;
  allowBearingKpa: number;
  footingOk: boolean;
}

export interface TakeoffSummary {
  totalGrossAreaM2: number;
  footprintAreaM2: number;
  perStoryAreaM2: { storyIndex: number; name: string; areaM2: number; clearHeightM: number }[];
  totalWallLengthM: number;
  concreteVolumeM3: number;
  footingConcreteM3: number;
  stairConcreteM3: number;
  masonryVolumeM3: number;
  estimatedBricks: number;
  estimatedCementBags: number;
  steelWeightKg: number;
  sandLocalCft: number;
  sandSylhetCft: number;
  stoneChipsCft: number;
  tileAreaM2: number;
  paintAreaM2: number;
  doorCount: number;
  windowCount: number;
  estimatedBdtLakhs: number;
  totalDeadLoadKn: number;
  totalLiveLoadKn: number;
  totalFactoredLoadKn: number;
  pillarCount: number;
  beamCount: number;
}

export interface PhysicsReport {
  overallStatus: PhysicsStatus;
  maxUtilization: number;
  criticalCount: number;
  warningCount: number;
  elements: Record<string, ElementPhysics>;
  issues: PhysicsIssue[];
  takeoff: TakeoffSummary;
  rajuk: RajukCompliance;
  seismicWind: SeismicWindSummary;
}

export interface PlacementValidation {
  allowed: boolean;
  reason?: string;
  fixHint?: string;
}

export interface StructuralGridLines {
  xLines: { label: string; coord: number }[];
  zLines: { label: string; coord: number }[];
}

export const DEFAULT_BNBC_CONFIG: BnbcConfig = {
  seismicZone: 2, // Dhaka Zone 2 (Z = 0.20)
  soilClass: 'SD', // Dhaka stiff/soft alluvial clay
  windSpeedMs: 65.7, // Dhaka BNBC 2020
  soilBearingKpa: 165, // ~3.45 ksf (typical Dhaka compacted soil)
  concretePsi: 3500,
  steelGradeKsi: 72.5, // 500W TMT (BSRM/AKS/KSRM standard)
  roadWidthM: 6.1, // 20 ft residential road
  landContext: 'urban',
};
