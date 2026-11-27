import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  CopyPlus,
  FlipHorizontal2,
  Layers,
  Lock,
  LockOpen,
  RotateCw,
  ScanSearch,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  BalconyRailingStyle,
  Beam,
  BeamMaterial,
  BlueprintAnnotation,
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
  RoomZone,
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
import { computeRoomClearDimensions } from '../engine/cad2d';
import {
  formatArea,
  formatBanglaLandSummary,
  formatForce,
  formatLength,
  ft,
  inch,
} from '../engine/units';
import { NumericField } from './NumericField';

interface RightInspectorProps {
  project: BuildingProject;
  activeStory: Story;
  physics: PhysicsReport;
  experienceMode: ExperienceMode;
  selection: SelectionTarget | null;
  onChangeExperienceMode: (mode: ExperienceMode) => void;
  onClose: () => void;
  onSelect: (target: SelectionTarget | null) => void;
  onDuplicateSelected: () => void;
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
  onUpdateRoom: (roomId: string, patch: Partial<RoomZone>) => void;
  onDeleteRoom: (roomId: string) => void;
  onUpdateAsset: (assetId: string, patch: Partial<PlacedAsset>) => void;
  onDeleteAsset: (assetId: string) => void;
  onUpdateAnnotation: (annId: string, patch: Partial<BlueprintAnnotation>) => void;
  onDeleteAnnotation: (annId: string) => void;
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

function normalizeDeg(rad: number): number {
  const deg = ((rad * 180) / Math.PI) % 360;
  return deg < 0 ? deg + 360 : deg;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  project,
  activeStory,
  physics,
  experienceMode,
  selection,
  onChangeExperienceMode,
  onClose,
  onSelect,
  onDuplicateSelected,
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
  onUpdateRoom,
  onDeleteRoom,
  onUpdateAsset,
  onDeleteAsset,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onSelectIssue,
}) => {
  const unit = project.unitSystem;
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
  const selectedRoom =
    selection?.type === 'room' ? activeStory.rooms.find((r) => r.id === selection.id) : undefined;
  const selectedAsset =
    selection?.type === 'asset' ? activeStory.assets.find((a) => a.id === selection.id) : undefined;
  const selectedAnnotation =
    selection?.type === 'annotation'
      ? (activeStory.annotations ?? []).find((an) => an.id === selection.id)
      : undefined;

  const hasValidSelection = Boolean(
    selectedWall ||
      selectedOpening ||
      selectedPillar ||
      selectedBeam ||
      selectedSlab ||
      selectedCutout ||
      selectedRoom ||
      selectedAsset ||
      selectedAnnotation
  );

  const selPhys = selection ? physics.elements[selection.id] : undefined;

  const activeAreaM2 = activeStory.slabs.reduce((s, sl) => s + sl.width * sl.depth, 0);
  const landSummary = formatBanglaLandSummary(activeAreaM2);
  const rajuk = physics.rajuk;
  const sw = physics.seismicWind;

  const resizeWallLength = (w: Wall, nextLenM: number) => {
    const chord = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
    if (chord < 0.01) return;
    const ux = (w.x2 - w.x1) / chord;
    const uz = (w.z2 - w.z1) / chord;
    const nextX2 = Number((w.x1 + ux * nextLenM).toFixed(4));
    const nextZ2 = Number((w.z1 + uz * nextLenM).toFixed(4));
    const nextOpenings = w.openings.map((op) => {
      const maxOff = Math.max(0.06, nextLenM - op.width - 0.06);
      return op.offset > maxOff ? { ...op, offset: Number(maxOff.toFixed(3)) } : op;
    });
    onUpdateWall(w.id, { x2: nextX2, z2: nextZ2, openings: nextOpenings });
  };

  return (
    <>
      <div
        onClick={onClose}
        className="md:hidden fixed inset-0 bg-slate-900/15 z-30"
        aria-hidden="true"
      />

      <aside
        aria-label="Architectural and Structural Inspector"
        className="fixed inset-x-0 bottom-0 h-[72dvh] max-h-[78dvh] rounded-t-2xl border-t border-slate-200 bg-white shadow-xl z-40 flex flex-col overflow-hidden md:static md:inset-auto md:h-full md:max-h-none md:w-[332px] md:shrink-0 md:rounded-none md:border-t-0 md:border-l md:shadow-none md:z-20"
      >
        <div className="md:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-slate-900 truncate">
              {hasValidSelection && selection
                ? `${selection.type.charAt(0).toUpperCase() + selection.type.slice(1)} Properties`
                : isEngineer
                ? 'BNBC 2020 & RAJUK Inspector'
                : 'Floor & Safety Check'}
            </span>
            {hasValidSelection && (
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="text-[11px] font-medium text-blue-700 hover:text-blue-800 shrink-0"
              >
                Floor audit
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="p-1 text-slate-400 hover:text-slate-800 rounded transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto studio-scroll p-3.5 space-y-4">
          {/* ============== ELEMENT PHYSICS CARD ============== */}
          {selPhys && hasValidSelection && (
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
                    onClick={onDuplicateSelected}
                    title="Duplicate wall (Ctrl+D)"
                    className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                  </button>
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
                    title="Delete wall (Del)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumericField
                  label="Span length"
                  value={Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.z2 - selectedWall.z1)}
                  unit={unit}
                  min={0.3}
                  max={45}
                  disabled={Boolean(selectedWall.locked)}
                  onCommit={(m) => resizeWallLength(selectedWall, m)}
                />
                <NumericField
                  label="Wall height"
                  value={selectedWall.height ?? activeStory.height - activeStory.slabThickness}
                  unit={unit}
                  min={0.6}
                  max={activeStory.height}
                  onCommit={(m) =>
                    onUpdateWall(selectedWall.id, {
                      height: Math.abs(m - (activeStory.height - activeStory.slabThickness)) < 0.03 ? null : m,
                    })
                  }
                />
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
                  title="Delete opening (Del)"
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
                <NumericField
                  label="Width"
                  value={selectedOpening.width}
                  unit={unit}
                  min={0.5}
                  max={Math.max(0.6, getWallArcLength(selectedOpeningParent) - 0.12)}
                  onCommit={(m) => {
                    const wallLen = getWallArcLength(selectedOpeningParent);
                    const safeOffset = Math.min(selectedOpening.offset, Math.max(0.06, wallLen - m - 0.06));
                    onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, {
                      width: m,
                      offset: Number(safeOffset.toFixed(3)),
                    });
                  }}
                />
                <NumericField
                  label="Height"
                  value={selectedOpening.height}
                  unit={unit}
                  min={0.5}
                  max={activeStory.height - activeStory.slabThickness}
                  onCommit={(m) =>
                    onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, { height: m })
                  }
                />
                <NumericField
                  label="Offset from start"
                  value={selectedOpening.offset}
                  unit={unit}
                  min={0.06}
                  max={Math.max(0.06, getWallArcLength(selectedOpeningParent) - selectedOpening.width - 0.06)}
                  onCommit={(m) =>
                    onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, { offset: m })
                  }
                />
                <NumericField
                  label="Sill height"
                  value={selectedOpening.sillHeight}
                  unit={unit}
                  min={0}
                  max={2.2}
                  onCommit={(m) =>
                    onUpdateOpening(selectedOpeningParent.id, selectedOpening.id, { sillHeight: m })
                  }
                />
              </div>

              <p className="text-[11px] text-slate-500">
                Drag this opening directly along its host wall on the 2D plan to slide it smoothly.
              </p>

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
                    className={`py-1.5 text-xs font-medium rounded-md border transition-colors ${
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
                    className={`py-1.5 text-xs font-medium rounded-md border transition-colors ${
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
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={selectedPillar.label}
                  onChange={(e) => onUpdatePillar(selectedPillar.id, { label: e.target.value })}
                  aria-label="Column label"
                  className="text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-1 w-24 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onDuplicateSelected}
                    title="Duplicate column (Ctrl+D)"
                    className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdatePillar(selectedPillar.id, { locked: !selectedPillar.locked })}
                    title="Lock column (L)"
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
                    title="Delete column (Del)"
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <NumericField
                  label="Width"
                  value={selectedPillar.width}
                  unit={unit}
                  kind="section"
                  min={inch(8)}
                  max={inch(36)}
                  onCommit={(m) => onUpdatePillar(selectedPillar.id, { width: m })}
                />
                <NumericField
                  label="Depth"
                  value={selectedPillar.depth}
                  unit={unit}
                  kind="section"
                  min={inch(8)}
                  max={inch(36)}
                  onCommit={(m) => onUpdatePillar(selectedPillar.id, { depth: m })}
                />
                <NumericField
                  label="Angle"
                  value={normalizeDeg(selectedPillar.rotation)}
                  unit={unit}
                  kind="degrees"
                  min={-360}
                  max={360}
                  onCommit={(deg) =>
                    onUpdatePillar(selectedPillar.id, { rotation: (deg * Math.PI) / 180 })
                  }
                />
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
                <span className="text-xs font-semibold text-slate-900">
                  Drop Beam ({formatLength(Math.hypot(selectedBeam.x2 - selectedBeam.x1, selectedBeam.z2 - selectedBeam.z1), unit)})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdateBeam(selectedBeam.id, { locked: !selectedBeam.locked })}
                    title="Lock beam (L)"
                    className={`p-1.5 rounded border ${
                      selectedBeam.locked
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {selectedBeam.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteBeam(selectedBeam.id)}
                    title="Delete beam (Del)"
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumericField
                  label="Width"
                  value={selectedBeam.width}
                  unit={unit}
                  kind="section"
                  min={inch(6)}
                  max={inch(24)}
                  onCommit={(m) => onUpdateBeam(selectedBeam.id, { width: m })}
                />
                <NumericField
                  label="Depth"
                  value={selectedBeam.depth}
                  unit={unit}
                  kind="section"
                  min={inch(10)}
                  max={inch(36)}
                  onCommit={(m) => onUpdateBeam(selectedBeam.id, { depth: m })}
                />
              </div>
              <label className="block">
                <span className="block text-[11px] font-medium text-slate-500 mb-1">Material</span>
                <select
                  value={selectedBeam.material}
                  onChange={(e) =>
                    onUpdateBeam(selectedBeam.id, { material: e.target.value as BeamMaterial })
                  }
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                >
                  <option value="rcc">Reinforced Concrete (RCC)</option>
                  <option value="steel">Structural Steel I-Beam</option>
                  <option value="timber">Timber Beam</option>
                </select>
              </label>
            </section>
          )}

          {/* ============== SELECTED SLAB ============== */}
          {selectedSlab && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={selectedSlab.label}
                  onChange={(e) => onUpdateSlab(selectedSlab.id, { label: e.target.value })}
                  aria-label="Slab label"
                  className="text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-1 min-w-0 flex-1 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={onDuplicateSelected}
                    title="Duplicate slab (Ctrl+D)"
                    className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSlab(selectedSlab.id, { locked: !selectedSlab.locked })}
                    title="Lock slab (L)"
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
                    title="Delete slab (Del)"
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumericField
                  label="Width"
                  value={selectedSlab.width}
                  unit={unit}
                  min={0.6}
                  max={60}
                  onCommit={(m) => onUpdateSlab(selectedSlab.id, { width: m })}
                />
                <NumericField
                  label="Depth"
                  value={selectedSlab.depth}
                  unit={unit}
                  min={0.6}
                  max={60}
                  onCommit={(m) => onUpdateSlab(selectedSlab.id, { depth: m })}
                />
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
                    className={`self-end py-1.5 text-xs font-medium rounded-md border transition-colors ${
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
                      <button
                        type="button"
                        onClick={() =>
                          onSelect({
                            type: 'cutout',
                            id: cut.id,
                            parentSlabId: selectedSlab.id,
                            storyIndex: activeStory.index,
                          })
                        }
                        className="font-mono text-[11px] text-left hover:text-blue-700 truncate"
                      >
                        {cut.label || 'Void'} ({formatLength(cut.width, unit)} ×{' '}
                        {formatLength(cut.depth, unit)})
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCutout(selectedSlab.id, cut.id)}
                        className="text-red-600 hover:text-red-700 shrink-0 ml-2"
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
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={selectedCutout.label || ''}
                  placeholder="Cutout label"
                  onChange={(e) =>
                    onUpdateCutout(selectedCutoutParent.id, selectedCutout.id, {
                      label: e.target.value,
                    })
                  }
                  className="text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-1 min-w-0 flex-1 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onDeleteCutout(selectedCutoutParent.id, selectedCutout.id)}
                  title="Delete cutout (Del)"
                  className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumericField
                  label="Width"
                  value={selectedCutout.width}
                  unit={unit}
                  min={0.4}
                  max={25}
                  onCommit={(m) =>
                    onUpdateCutout(selectedCutoutParent.id, selectedCutout.id, { width: m })
                  }
                />
                <NumericField
                  label="Depth"
                  value={selectedCutout.depth}
                  unit={unit}
                  min={0.4}
                  max={25}
                  onCommit={(m) =>
                    onUpdateCutout(selectedCutoutParent.id, selectedCutout.id, { depth: m })
                  }
                />
              </div>
            </section>
          )}

          {/* ============== SELECTED ROOM ============== */}
          {selectedRoom && (() => {
            const roomDims = computeRoomClearDimensions(selectedRoom, activeStory);
            return (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={selectedRoom.name}
                    onChange={(e) => onUpdateRoom(selectedRoom.id, { name: e.target.value })}
                    aria-label="Room name"
                    className="text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-1 min-w-0 flex-1 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => onDeleteRoom(selectedRoom.id)}
                    title="Remove room label"
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-blue-50/60 border border-blue-200 rounded-md p-2">
                    <span className="text-[11px] text-blue-700 block">Clear interior</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {formatLength(roomDims.clearW, unit)} × {formatLength(roomDims.clearD, unit)}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 block mt-0.5">
                      {formatArea(roomDims.clearAreaM2, unit)}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-2">
                    <span className="text-[11px] text-slate-500 block">Wall centerline</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {formatLength(roomDims.centerlineW, unit)} × {formatLength(roomDims.centerlineD, unit)}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 block mt-0.5">
                      {formatArea(roomDims.centerlineAreaM2, unit)}
                    </span>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ============== SELECTED ASSET ============== */}
          {selectedAsset && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={selectedAsset.label}
                  onChange={(e) => onUpdateAsset(selectedAsset.id, { label: e.target.value })}
                  aria-label="Item label"
                  className="text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-1 min-w-0 flex-1 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
                <div className="flex items-center gap-1 shrink-0">
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
                    onClick={onDuplicateSelected}
                    title="Duplicate item (Ctrl+D)"
                    className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
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
                    title="Delete item (Del)"
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <NumericField
                  label="Width"
                  value={selectedAsset.width}
                  unit={unit}
                  min={0.2}
                  max={25}
                  onCommit={(m) => onUpdateAsset(selectedAsset.id, { width: m })}
                />
                <NumericField
                  label="Depth"
                  value={selectedAsset.depth}
                  unit={unit}
                  min={0.2}
                  max={25}
                  onCommit={(m) => onUpdateAsset(selectedAsset.id, { depth: m })}
                />
                <NumericField
                  label="Height"
                  value={selectedAsset.height}
                  unit={unit}
                  min={0.1}
                  max={10}
                  onCommit={(m) => onUpdateAsset(selectedAsset.id, { height: m })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumericField
                  label="Rotation"
                  value={normalizeDeg(selectedAsset.rotation)}
                  unit={unit}
                  kind="degrees"
                  min={-360}
                  max={360}
                  onCommit={(deg) =>
                    onUpdateAsset(selectedAsset.id, { rotation: (deg * Math.PI) / 180 })
                  }
                />
                <NumericField
                  label="Mount height"
                  value={selectedAsset.elevationY ?? 0}
                  unit={unit}
                  min={0}
                  max={activeStory.height}
                  onCommit={(m) => onUpdateAsset(selectedAsset.id, { elevationY: m })}
                />
              </div>

              <p className="text-[11px] text-slate-500">
                Arrow keys nudge by 1&quot; (Shift+Arrow for 6&quot;). Drag the top handle on 2D plan to rotate freely, or press R for 90°.
              </p>
            </section>
          )}

          {/* ============== SELECTED ANNOTATION ============== */}
          {selectedAnnotation && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">
                  {selectedAnnotation.kind === 'dimension'
                    ? 'Custom Dimension Line'
                    : selectedAnnotation.kind === 'callout'
                    ? 'Leader Callout'
                    : 'Blueprint Note'}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAnnotation(selectedAnnotation.id, {
                        locked: !selectedAnnotation.locked,
                      })
                    }
                    title="Lock annotation (L)"
                    className={`p-1.5 rounded border ${
                      selectedAnnotation.locked
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {selectedAnnotation.locked ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <LockOpen className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteAnnotation(selectedAnnotation.id)}
                    title="Delete annotation (Del)"
                    className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {selectedAnnotation.kind === 'dimension' ? (
                <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs">
                  <span className="text-[11px] text-slate-500 block">Measured distance</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 text-sm">
                    {formatLength(
                      Math.hypot(
                        (selectedAnnotation.x2 ?? selectedAnnotation.x1) - selectedAnnotation.x1,
                        (selectedAnnotation.z2 ?? selectedAnnotation.z1) - selectedAnnotation.z1
                      ),
                      unit
                    )}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Drag either blue endpoint handle on the 2D plan to re-measure cleanly with OSNAP.
                  </p>
                </div>
              ) : (
                <>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-slate-500 mb-1">
                      Note text
                    </span>
                    <textarea
                      rows={3}
                      value={selectedAnnotation.text}
                      onChange={(e) =>
                        onUpdateAnnotation(selectedAnnotation.id, { text: e.target.value })
                      }
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-2 focus:bg-white focus:border-blue-600 focus:outline-none"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateAnnotation(selectedAnnotation.id, {
                          kind: 'note',
                          x2: undefined,
                          z2: undefined,
                        })
                      }
                      className={`py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        selectedAnnotation.kind === 'note'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      Plain Note
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateAnnotation(selectedAnnotation.id, {
                          kind: 'callout',
                          x2: selectedAnnotation.x2 ?? selectedAnnotation.x1 + 1.2,
                          z2: selectedAnnotation.z2 ?? selectedAnnotation.z1 - 0.8,
                        })
                      }
                      className={`py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        selectedAnnotation.kind === 'callout'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      Leader Arrow
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ============== ACTIVE FLOOR & BUILDING CONTROLS (NO SELECTION) ============== */}
          {!hasValidSelection && (
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
                  <NumericField
                    label="Floor height"
                    value={activeStory.height}
                    unit={unit}
                    min={ft(8)}
                    max={ft(16)}
                    onCommit={(m) => onUpdateStory(activeStory.index, { height: m })}
                  />
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
                    className="flex items-center justify-center gap-1 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md disabled:opacity-40 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy floor up
                  </button>
                  <button
                    type="button"
                    onClick={onAutoDetectRooms}
                    className="flex items-center justify-center gap-1 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
                  >
                    <ScanSearch className="w-3.5 h-3.5 text-blue-700" />
                    Detect rooms
                  </button>
                </div>

                {project.stories.length > 1 && activeStory.index === project.stories.length - 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteStory(activeStory.index)}
                    className="w-full py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
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

              {/* Progressive Disclosure Toggle: Plain-English vs Full BNBC 2020 Engineering */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <span className="text-xs font-semibold text-slate-900 block">
                    Engineering detail
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {isEngineer ? 'Showing BNBC 2020 seismic & soil' : 'Plain-English safety summary'}
                  </span>
                </div>
                <div className="inline-flex bg-slate-100 p-0.5 rounded-md border border-slate-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => onChangeExperienceMode('simple')}
                    className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                      !isEngineer ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeExperienceMode('engineer')}
                    className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                      isEngineer ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Pro CAD
                  </button>
                </div>
              </div>

              {/* BNBC 2020 Seismic, Soil & Foundation Engineering Controls */}
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
