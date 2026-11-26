import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FlipHorizontal2,
  Layers,
  Lock,
  LockOpen,
  Plus,
  RotateCw,
  ScanSearch,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  BalconyRailingStyle,
  Beam,
  BnbcConfig,
  BnbcSeismicZone,
  BuildingProject,
  ExperienceMode,
  OccupancyClass,
  OpeningKind,
  PhysicsIssue,
  PhysicsReport,
  Pillar,
  PillarShape,
  PlacedAsset,
  SelectionTarget,
  Slab,
  SlabCutout,
  SlabType,
  SoilSiteClass,
  Story,
  StructuralGrade,
  Wall,
  WallMaterial,
  WallOpening,
} from '../types/building';
import { getBnbcConfig, getWallArcLength } from '../engine/geometryKernel';
import {
  formatArea,
  formatBanglaLandSummary,
  formatForce,
  formatLength,
  ft,
  getUnitSuffix,
  inch,
  inputToMeters,
  metersToInput,
} from '../engine/units';

interface RightInspectorProps {
  project: BuildingProject;
  activeStory: Story;
  physics: PhysicsReport;
  experienceMode: ExperienceMode;
  selection: SelectionTarget | null;
  onClose: () => void;
  onUpdateStory: (storyIndex: number, patch: Partial<Story>) => void;
  onUpdateBnbc: (patch: Partial<BnbcConfig>) => void;
  onAddStoryAbove: (copyStructure: boolean) => void;
  onDeleteStory: (storyIndex: number) => void;
  onAutoDetectRooms: () => void;
  onUpdateWall: (wallId: string, patch: Partial<Wall>) => void;
  onDeleteWall: (wallId: string) => void;
  onUpdateOpening: (wallId: string, openingId: string, patch: Partial<WallOpening>) => void;
  onDeleteOpening: (wallId: string, openingId: string) => void;
  onUpdatePillar: (pillarId: string, patch: Partial<Pillar>) => void;
  onDeletePillar: (pillarId: string) => void;
  onUpdateBeam: (beamId: string, patch: Partial<Beam>) => void;
  onDeleteBeam: (beamId: string) => void;
  onUpdateSlab: (slabId: string, patch: Partial<Slab>) => void;
  onDeleteSlab: (slabId: string) => void;
  onUpdateCutout: (slabId: string, cutoutId: string, patch: Partial<SlabCutout>) => void;
  onDeleteCutout: (slabId: string, cutoutId: string) => void;
  onUpdateAsset: (assetId: string, patch: Partial<PlacedAsset>) => void;
  onDeleteAsset: (assetId: string) => void;
  onSelectIssue: (issue: PhysicsIssue) => void;
}

const WALL_MAT_OPTIONS: { id: WallMaterial; label: string }[] = [
  { id: 'brick-1st', label: '1st-Class Brick (Plastered)' },
  { id: 'exposed-brick', label: 'Exposed Red Brick' },
  { id: 'fair-concrete', label: 'Fair-Faced Concrete' },
  { id: 'hollow-block', label: 'Hollow Concrete Block' },
  { id: 'rcc', label: 'RCC Shear Wall' },
  { id: 'jala-brick', label: 'Jala Brick Screen' },
  { id: 'timber-louver', label: 'Timber Louver' },
  { id: 'gypsum-board', label: 'Gypsum Partition' },
];

const OPENING_KIND_OPTIONS: { id: OpeningKind; label: string }[] = [
  { id: 'door-single', label: 'Single Hinged Door' },
  { id: 'door-double', label: 'Double Main Door' },
  { id: 'door-sliding', label: 'Sliding Glass Door' },
  { id: 'window-casement', label: 'Casement Window' },
  { id: 'window-picture', label: 'Fixed Picture Window' },
  { id: 'shutter-shop', label: 'Dokan Rolling Shutter' },
  { id: 'arch-opening', label: 'Open Archway' },
];

export const RightInspector: React.FC<RightInspectorProps> = ({
  project,
  activeStory,
  physics,
  experienceMode,
  selection,
  onClose,
  onUpdateStory,
  onUpdateBnbc,
  onAddStoryAbove,
  onDeleteStory,
  onAutoDetectRooms,
  onUpdateWall,
  onDeleteWall,
  onUpdateOpening,
  onDeleteOpening,
  onUpdatePillar,
  onDeletePillar,
  onUpdateBeam,
  onDeleteBeam,
  onUpdateSlab,
  onDeleteSlab,
  onUpdateCutout,
  onDeleteCutout,
  onUpdateAsset,
  onDeleteAsset,
  onSelectIssue,
}) => {
  const unit = project.unitSystem;
  const unitLabel = getUnitSuffix(unit, 'length');
  const isEngineer = experienceMode === 'engineer';
  const bnbc = getBnbcConfig(project);

  const selectedWall =
    selection?.type === 'wall' ? activeStory.walls.find((w) => w.id === selection.id) : undefined;
  const selectedOpeningParent =
    selection?.type === 'opening' && selection.parentWallId
      ? activeStory.walls.find((w) => w.id === selection.parentWallId)
      : undefined;
  const selectedOpening = selectedOpeningParent?.openings.find((o) => o.id === selection?.id);
  const selectedPillar =
    selection?.type === 'pillar'
      ? activeStory.pillars.find((p) => p.id === selection.id)
      : undefined;
  const selectedBeam =
    selection?.type === 'beam' ? activeStory.beams.find((b) => b.id === selection.id) : undefined;
  const selectedSlab =
    selection?.type === 'slab' ? activeStory.slabs.find((s) => s.id === selection.id) : undefined;
  const selectedCutoutParent =
    selection?.type === 'cutout' && selection.parentSlabId
      ? activeStory.slabs.find((s) => s.id === selection.parentSlabId)
      : undefined;
  const selectedCutout = selectedCutoutParent?.cutouts?.find((c) => c.id === selection?.id);
  const selectedAsset =
    selection?.type === 'asset' ? activeStory.assets.find((a) => a.id === selection.id) : undefined;

  const selPhys = selection ? physics.elements[selection.id] : undefined;

  const activeAreaM2 = activeStory.slabs.reduce((s, sl) => s + sl.width * sl.depth, 0);
  const landSummary = formatBanglaLandSummary(activeAreaM2);
  const rajuk = physics.rajuk;
  const sw = physics.seismicWind;

  const renderNumberInput = (
    label: string,
    metersValue: number,
    onChangeMeters: (m: number) => void,
    minM = 0.05,
    maxM = 40
  ) => (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-500 mb-1">
        {label} ({unitLabel})
      </span>
      <input
        type="number"
        step={unit === 'imperial' ? 0.25 : 0.05}
        value={Number(metersToInput(metersValue, unit, 'length').toFixed(2))}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isFinite(val)) return;
          const m = Math.max(minM, Math.min(maxM, inputToMeters(val, unit, 'length')));
          onChangeMeters(Number(m.toFixed(4)));
        }}
        className="w-full text-xs font-mono tabular-nums text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:bg-white focus:border-blue-600"
      />
    </label>
  );

  return (
    <>
      <div
        onClick={onClose}
        className="md:hidden fixed inset-0 bg-slate-900/15 z-30"
        aria-hidden="true"
      />

      <aside
        aria-label="Architectural and Structural Inspector"
        className="fixed inset-x-0 bottom-0 h-[72dvh] max-h-[78dvh] rounded-t-2xl border-t border-slate-200 bg-white shadow-xl z-40 flex flex-col overflow-hidden md:absolute md:inset-x-auto md:top-3 md:right-3 md:bottom-20 md:h-auto md:max-h-none md:w-[min(348px,calc(100vw-1.5rem))] md:rounded-xl md:border md:shadow-lg md:z-30"
      >
        <div className="md:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-slate-900">
            {selection
              ? `Selected ${selection.type.charAt(0).toUpperCase() + selection.type.slice(1)}`
              : isEngineer
              ? 'BNBC 2020 & RAJUK Inspector'
              : 'Floor Plan & Safety Check'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="p-1 text-slate-400 hover:text-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto studio-scroll p-3.5 space-y-4">
          {/* ============== ELEMENT PHYSICS CARD ============== */}
          {selPhys && (
            <div
              className={`rounded-lg border p-2.5 space-y-1.5 ${
                selPhys.status === 'critical'
                  ? 'bg-red-50 border-red-200'
                  : selPhys.status === 'warning'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50/70 border-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-900">{selPhys.simpleSummary}</span>
                <span className="font-mono tabular-nums text-[11px]">
                  D/C {(selPhys.utilization * 100).toFixed(0)}%
                </span>
              </div>
              {isEngineer && (
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono tabular-nums text-slate-700">
                  <div>
                    <span className="text-slate-500 block">{selPhys.primaryMetricLabel}</span>
                    {selPhys.primaryMetricValue}
                  </div>
                  {selPhys.secondaryMetricLabel && (
                    <div>
                      <span className="text-slate-500 block">{selPhys.secondaryMetricLabel}</span>
                      {selPhys.secondaryMetricValue}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============== SELECTED WALL ============== */}
          {selectedWall && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">
                  Wall ({formatLength(getWallArcLength(selectedWall), unit)})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdateWall(selectedWall.id, { locked: !selectedWall.locked })}
                    title="Lock wall against accidental move (L)"
                    className={`p-1.5 rounded border text-xs ${
                      selectedWall.locked
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {selectedWall.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteWall(selectedWall.id)}
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                    title="Delete wall"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Curved Wall Arc Bulge Control */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-700">Curved wall arc bulge</span>
                  <span className="text-[11px] font-mono tabular-nums text-blue-700">
                    {formatLength(selectedWall.curveOffset ?? 0, unit)}
                  </span>
                </div>
                <input
                  type="range"
                  min={-2.5}
                  max={2.5}
                  step={0.05}
                  value={selectedWall.curveOffset ?? 0}
                  onChange={(e) =>
                    onUpdateWall(selectedWall.id, { curveOffset: parseFloat(e.target.value) })
                  }
                  className="w-full accent-blue-700 cursor-pointer"
                />
                {(selectedWall.curveOffset ?? 0) !== 0 && (
                  <button
                    type="button"
                    onClick={() => onUpdateWall(selectedWall.id, { curveOffset: 0 })}
                    className="text-[11px] font-medium text-blue-700 hover:underline"
                  >
                    Reset to straight wall
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">
                    Wall thickness
                  </span>
                  <select
                    value={selectedWall.thickness >= inch(8) ? 'ext' : 'int'}
                    onChange={(e) =>
                      onUpdateWall(selectedWall.id, {
                        thickness: e.target.value === 'ext' ? inch(10) : inch(5),
                        role: e.target.value === 'ext' ? 'load-bearing' : 'partition',
                      })
                    }
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                  >
                    <option value="ext">10&quot; Exterior Brick</option>
                    <option value="int">5&quot; Partition Brick</option>
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">
                    Material finish
                  </span>
                  <select
                    value={selectedWall.material}
                    onChange={(e) =>
                      onUpdateWall(selectedWall.id, { material: e.target.value as WallMaterial })
                    }
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                  >
                    {WALL_MAT_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}

          {/* ============== SELECTED OPENING (DOOR / WINDOW / SHUTTER) ============== */}
          {selectedOpening && selectedOpeningParent && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Opening</span>
                <button
                  type="button"
                  onClick={() => onDeleteOpening(selectedOpeningParent.id, selectedOpening.id)}
                  className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <label className="block">
                <span className="block text-[11px] font-medium text-slate-500 mb-1">Type</span>
                <select
                  value={selectedOpening.kind}
                  onChange={(e) => {
                    const kind = e.target.value as OpeningKind;
                    const isWin = kind.startsWith('window');
                    onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, {
                      kind,
                      sillHeight: isWin ? ft(2, 6) : 0,
                      height: isWin ? ft(4, 6) : kind === 'shutter-shop' ? ft(8) : ft(7),
                    });
                  }}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                >
                  {OPENING_KIND_OPTIONS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                {renderNumberInput(
                  'Width',
                  selectedOpening.width,
                  (m) => onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, { width: m }),
                  0.6,
                  5
                )}
                {renderNumberInput(
                  'Height',
                  selectedOpening.height,
                  (m) => onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, { height: m }),
                  0.6,
                  3.2
                )}
              </div>

              {selectedOpening.kind.startsWith('door') && (
                <div className="space-y-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between text-[11px] text-slate-700">
                    <span>3D Door open angle</span>
                    <span className="font-mono tabular-nums">
                      {Math.round((selectedOpening.openRatio ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedOpening.openRatio ?? 0.35}
                    onChange={(e) =>
                      onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, {
                        openRatio: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-blue-700 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, {
                        swing: selectedOpening.swing === 1 ? -1 : 1,
                      })
                    }
                    className="w-full py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    Flip door swing side
                  </button>
                </div>
              )}

              {selectedOpening.kind.startsWith('window') && (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, {
                        hasChajja: !(selectedOpening.hasChajja ?? true),
                      })
                    }
                    className={`py-1.5 text-xs font-medium rounded-md border ${
                      selectedOpening.hasChajja ?? true
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Rain Chajja
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, {
                        hasGrill: !(selectedOpening.hasGrill ?? true),
                      })
                    }
                    className={`py-1.5 text-xs font-medium rounded-md border ${
                      selectedOpening.hasGrill ?? true
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    MS Security Grill
                  </button>
                </div>
              )}
            </section>
          )}

          {/* ============== SELECTED PILLAR / COLUMN ============== */}
          {selectedPillar && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">
                  RCC Column {selectedPillar.label}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdatePillar(selectedPillar.id, { locked: !selectedPillar.locked })}
                    className={`p-1.5 rounded border ${
                      selectedPillar.locked
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {selectedPillar.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeletePillar(selectedPillar.id)}
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {renderNumberInput(
                  'Width',
                  selectedPillar.width,
                  (m) => onUpdatePillar(selectedPillar.id, { width: m }),
                  inch(10),
                  inch(30)
                )}
                {renderNumberInput(
                  'Depth',
                  selectedPillar.depth,
                  (m) => onUpdatePillar(selectedPillar.id, { depth: m }),
                  inch(10),
                  inch(30)
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Shape</span>
                  <select
                    value={selectedPillar.shape}
                    onChange={(e) =>
                      onUpdatePillar(selectedPillar.id, { shape: e.target.value as PillarShape })
                    }
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                  >
                    <option value="square">Square RCC</option>
                    <option value="rectangular">Rectangular RCC</option>
                    <option value="circular">Circular Veranda</option>
                    <option value="steel-h">Steel H-Column</option>
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">
                    Concrete grade
                  </span>
                  <select
                    value={selectedPillar.grade}
                    onChange={(e) =>
                      onUpdatePillar(selectedPillar.id, { grade: e.target.value as StructuralGrade })
                    }
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                  >
                    <option value="rcc-3000">3000 PSI (21 MPa)</option>
                    <option value="rcc-3500">3500 PSI (24 MPa)</option>
                    <option value="rcc-4000">4000 PSI (28 MPa)</option>
                    <option value="steel-a992">Steel A992</option>
                  </select>
                </label>
              </div>
            </section>
          )}

          {/* ============== SELECTED BEAM ============== */}
          {selectedBeam && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">RCC Drop Beam</span>
                <button
                  type="button"
                  onClick={() => onDeleteBeam(selectedBeam.id)}
                  className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {renderNumberInput(
                  'Width',
                  selectedBeam.width,
                  (m) => onUpdateBeam(selectedBeam.id, { width: m }),
                  inch(8),
                  inch(24)
                )}
                {renderNumberInput(
                  'Depth',
                  selectedBeam.depth,
                  (m) => onUpdateBeam(selectedBeam.id, { depth: m }),
                  inch(12),
                  inch(36)
                )}
              </div>
            </section>
          )}

          {/* ============== SELECTED SLAB ============== */}
          {selectedSlab && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">{selectedSlab.label}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdateSlab(selectedSlab.id, { locked: !selectedSlab.locked })}
                    className={`p-1.5 rounded border ${
                      selectedSlab.locked
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {selectedSlab.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSlab(selectedSlab.id)}
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {renderNumberInput('Width', selectedSlab.width, (m) =>
                  onUpdateSlab(selectedSlab.id, { width: m })
                )}
                {renderNumberInput('Depth', selectedSlab.depth, (m) =>
                  onUpdateSlab(selectedSlab.id, { depth: m })
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Slab type</span>
                  <select
                    value={selectedSlab.type}
                    onChange={(e) =>
                      onUpdateSlab(selectedSlab.id, { type: e.target.value as SlabType })
                    }
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                  >
                    <option value="floor">Main Floor</option>
                    <option value="balcony">Balcony / Baranda</option>
                    <option value="roof">Roof Slab</option>
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Thickness</span>
                  <select
                    value={selectedSlab.thickness >= inch(5.5) ? '6' : '5'}
                    onChange={(e) =>
                      onUpdateSlab(selectedSlab.id, {
                        thickness: e.target.value === '6' ? inch(6) : inch(5),
                      })
                    }
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                  >
                    <option value="5">5&quot; (127 mm)</option>
                    <option value="6">6&quot; (152 mm)</option>
                  </select>
                </label>
              </div>

              {selectedSlab.type === 'balcony' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate-500 mb-1">Railing</span>
                    <select
                      value={selectedSlab.railingStyle ?? 'ms-grill'}
                      onChange={(e) =>
                        onUpdateSlab(selectedSlab.id, {
                          railingStyle: e.target.value as BalconyRailingStyle,
                        })
                      }
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                    >
                      <option value="ms-grill">MS Grill</option>
                      <option value="glass-ms">Glass &amp; MS</option>
                      <option value="baluster">Concrete Baluster</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSlab(selectedSlab.id, { hasRoofSlab: !selectedSlab.hasRoofSlab })
                    }
                    className={`self-end py-1.5 text-xs font-medium rounded-md border ${
                      selectedSlab.hasRoofSlab
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Roofed Baranda
                  </button>
                </div>
              )}

              {(selectedSlab.cutouts?.length ?? 0) > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <span className="text-[11px] font-medium text-slate-500">
                    Slab cutouts ({selectedSlab.cutouts!.length})
                  </span>
                  {selectedSlab.cutouts!.map((cut) => (
                    <div
                      key={cut.id}
                      className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                    >
                      <span className="font-mono text-[11px]">
                        {cut.label || 'Void'} ({formatLength(cut.width, unit)} ×{' '}
                        {formatLength(cut.depth, unit)})
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteCutout(selectedSlab.id, cut.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ============== SELECTED CUTOUT ============== */}
          {selectedCutout && selectedCutoutParent && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">
                  Slab Cutout ({selectedCutout.label || 'Void'})
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteCutout(selectedCutoutParent.id, selectedCutout.id)}
                  className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {renderNumberInput('Width', selectedCutout.width, (m) =>
                  onUpdateCutout(selectedCutoutParent.id, selectedCutout.id, { width: m })
                )}
                {renderNumberInput('Depth', selectedCutout.depth, (m) =>
                  onUpdateCutout(selectedCutoutParent.id, selectedCutout.id, { depth: m })
                )}
              </div>
            </section>
          )}

          {/* ============== SELECTED ASSET ============== */}
          {selectedAsset && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">{selectedAsset.label}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAsset(selectedAsset.id, {
                        rotation: (selectedAsset.rotation + Math.PI / 2) % (Math.PI * 2),
                      })
                    }
                    title="Rotate 90 degrees (R)"
                    className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateAsset(selectedAsset.id, { flipX: !selectedAsset.flipX })}
                    title="Mirror item"
                    className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <FlipHorizontal2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateAsset(selectedAsset.id, { locked: !selectedAsset.locked })}
                    title="Lock item (L)"
                    className={`p-1.5 rounded border ${
                      selectedAsset.locked
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {selectedAsset.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteAsset(selectedAsset.id)}
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {renderNumberInput('Width', selectedAsset.width, (m) =>
                  onUpdateAsset(selectedAsset.id, { width: m })
                )}
                {renderNumberInput('Depth', selectedAsset.depth, (m) =>
                  onUpdateAsset(selectedAsset.id, { depth: m })
                )}
                {renderNumberInput('Height', selectedAsset.height, (m) =>
                  onUpdateAsset(selectedAsset.id, { height: m })
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Use Arrow keys to nudge by 1&quot; (Shift+Arrow for 6&quot;), or drag the blue center handle.
              </p>
            </section>
          )}

          {/* ============== ACTIVE FLOOR & BUILDING CONTROLS (NO SELECTION) ============== */}
          {!selection && (
            <>
              {/* Floor Controls */}
              <section className="space-y-2.5 pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-700" />
                    {activeStory.name}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                    {landSummary.sqft} ({landSummary.shotok})
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {renderNumberInput(
                    'Floor height',
                    activeStory.height,
                    (m) => onUpdateStory(activeStory.index, { height: m }),
                    ft(8),
                    ft(16)
                  )}
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate-500 mb-1">
                      Occupancy
                    </span>
                    <select
                      value={activeStory.occupancy}
                      onChange={(e) =>
                        onUpdateStory(activeStory.index, {
                          occupancy: e.target.value as OccupancyClass,
                        })
                      }
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                    >
                      <option value="residential">Residential</option>
                      <option value="commercial">Commercial / Dokan</option>
                      <option value="office">Office</option>
                      <option value="storage">Storage / Parking</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAddStoryAbove(true)}
                    disabled={project.stories.length >= 11}
                    className="flex items-center justify-center gap-1 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md disabled:opacity-40"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy floor up
                  </button>
                  <button
                    type="button"
                    onClick={onAutoDetectRooms}
                    className="flex items-center justify-center gap-1 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md"
                  >
                    <ScanSearch className="w-3.5 h-3.5 text-blue-700" />
                    Detect rooms
                  </button>
                </div>

                {project.stories.length > 1 && activeStory.index === project.stories.length - 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteStory(activeStory.index)}
                    className="w-full py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md"
                  >
                    Remove top floor ({activeStory.name})
                  </button>
                )}
              </section>

              {/* RAJUK / BNBC Legal Setbacks, MGC & FAR Card */}
              {rajuk.hasPlot && (
                <section className="space-y-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">
                      RAJUK / Neighbor Setbacks
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        rajuk.setbacksOk && rajuk.mgcOk && rajuk.farOk
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }`}
                    >
                      {rajuk.setbacksOk && rajuk.mgcOk && rajuk.farOk ? 'Compliant' : 'Check limits'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-2">
                      <span className="text-[11px] text-slate-500 block">Ground coverage (MGC)</span>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          rajuk.mgcOk ? 'text-slate-900' : 'text-red-700'
                        }`}
                      >
                        {rajuk.actualMgcPct.toFixed(1)}% / {rajuk.maxMgcPct}%
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-2">
                      <span className="text-[11px] text-slate-500 block">Floor area ratio (FAR)</span>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          rajuk.farOk ? 'text-slate-900' : 'text-red-700'
                        }`}
                      >
                        {rajuk.actualFar.toFixed(2)} / {rajuk.maxFar}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-center text-[11px] font-mono tabular-nums">
                    {(
                      [
                        { label: 'Front', act: rajuk.actualSetbacks.front, req: rajuk.requiredSetbacks.front },
                        { label: 'Rear', act: rajuk.actualSetbacks.rear, req: rajuk.requiredSetbacks.rear },
                        { label: 'Left', act: rajuk.actualSetbacks.left, req: rajuk.requiredSetbacks.left },
                        { label: 'Right', act: rajuk.actualSetbacks.right, req: rajuk.requiredSetbacks.right },
                      ] as const
                    ).map((s) => {
                      const ok = s.act >= s.req - 0.04;
                      return (
                        <div
                          key={s.label}
                          className={`rounded border py-1 px-1 ${
                            ok
                              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                              : 'bg-red-50 border-red-200 text-red-700'
                          }`}
                        >
                          <div className="text-[10px] text-slate-500 font-sans">{s.label}</div>
                          <div className="font-semibold">{formatLength(s.act, unit)}</div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* BNBC 2020 Seismic, Soil & Foundation Engineering Controls (Engineer Mode) */}
              {isEngineer && (
                <section className="space-y-2.5 pb-3 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-900 block">
                    BNBC 2020 Seismic &amp; Soil (ETABS / SAFE)
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[11px] text-slate-500 mb-1">Seismic zone</span>
                      <select
                        value={bnbc.seismicZone}
                        onChange={(e) =>
                          onUpdateBnbc({ seismicZone: Number(e.target.value) as BnbcSeismicZone })
                        }
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                      >
                        <option value={1}>Zone 1 Khulna (0.12)</option>
                        <option value={2}>Zone 2 Dhaka (0.20)</option>
                        <option value={3}>Zone 3 Chattogram (0.28)</option>
                        <option value={4}>Zone 4 Sylhet (0.36)</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-slate-500 mb-1">Soil site class</span>
                      <select
                        value={bnbc.soilClass}
                        onChange={(e) =>
                          onUpdateBnbc({ soilClass: e.target.value as SoilSiteClass })
                        }
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                      >
                        <option value="SA">SA Hard Rock</option>
                        <option value="SB">SB Rock</option>
                        <option value="SC">SC Dense Soil</option>
                        <option value="SD">SD Dhaka Clay</option>
                        <option value="SE">SE Soft Alluvium</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
                    <div className="bg-slate-50 border border-slate-200 rounded p-2">
                      <span className="text-slate-500 font-sans block">Seismic base shear</span>
                      <span className="font-semibold text-slate-900">
                        {formatForce(sw.baseShearKn, unit)}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded p-2">
                      <span className="text-slate-500 font-sans block">Story drift ratio</span>
                      <span
                        className={`font-semibold ${sw.driftOk ? 'text-emerald-700' : 'text-red-700'}`}
                      >
                        {(sw.driftRatio * 100).toFixed(2)}% / {(sw.maxDriftRatio * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded p-2">
                      <span className="text-slate-500 font-sans block">Max footing soil q</span>
                      <span
                        className={`font-semibold ${sw.footingOk ? 'text-slate-900' : 'text-red-700'}`}
                      >
                        {sw.maxFootingPressureKpa.toFixed(0)} / {sw.allowBearingKpa} kPa
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded p-2">
                      <span className="text-slate-500 font-sans block">Est. structure cost</span>
                      <span className="font-semibold text-blue-700">
                        ৳ {physics.takeoff.estimatedBdtLakhs.toFixed(1)} Lakh
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* Live Structural & Spatial Fit Audit List */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">
                    Physics &amp; Spatial Audit
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                    {formatArea(physics.takeoff.totalGrossAreaM2, unit)} gross
                  </span>
                </div>

                {physics.issues.length === 0 ? (
                  <div className="flex items-start gap-2 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">All checks pass</div>
                      <p className="text-[11px] text-emerald-800 mt-0.5">
                        Columns, beams, slabs, footings, stair cutouts, door swings, and RAJUK neighbor setbacks are verified.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {physics.issues.map((iss) => (
                      <button
                        key={iss.id}
                        type="button"
                        onClick={() => onSelectIssue(iss)}
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                          iss.severity === 'critical'
                            ? 'bg-red-50/80 border-red-200 hover:bg-red-100/70'
                            : 'bg-amber-50/80 border-amber-200 hover:bg-amber-100/70'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {iss.severity === 'critical' ? (
                            <ShieldAlert className="w-3.5 h-3.5 text-red-700 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900">
                              {isEngineer ? iss.title : iss.simpleTitle}
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5">
                              {isEngineer ? iss.detail : iss.simpleFix}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
};
