import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  CopyPlus,
  DoorOpen,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Layers,
  Lock,
  LockOpen,
  Magnet,
  Plus,
  RotateCw,
  Ruler,
  Scan,
  ShieldCheck,
  SlidersHorizontal,
  Spline,
  Trash2,
  X,
} from 'lucide-react';
import {
  BlueprintLayerVisibility,
  BlueprintSettings,
  BlueprintSheetMode,
  BuildingProject,
  DimensionBasis,
  ExperienceMode,
  LightingPreset,
  SelectionTarget,
  Story,
  SurveyUnderlay,
  ViewMode,
} from '../types/building';
import { AlignMode, getBlueprintSettings } from '../engine/cad2d';
import { formatBanglaLandSummary } from '../engine/units';
import { CameraPreset } from './Viewport3D';

interface BottomWorkspaceBarProps {
  project: BuildingProject;
  viewMode: ViewMode;
  experienceMode: ExperienceMode;
  stories: Story[];
  activeStoryIndex: number;
  activeAreaM2: number;
  snapEnabled: boolean;
  showAllStories: boolean;
  showCeilingRoof: boolean;
  showDimensions: boolean;
  heatmapMode: boolean;
  xrayStructural: boolean;
  showSetbacks: boolean;
  lightingPreset: LightingPreset;
  showSiteContext: boolean;
  cutawayRatio: number;
  explodeGap: number;
  inspectorOpen: boolean;
  selection: SelectionTarget | null;
  multiSelection: SelectionTarget[];
  selectedLabel: string;
  selectedIsLocked: boolean;
  canDuplicateSelection: boolean;
  canLockSelection: boolean;
  selectedIsAsset: boolean;
  selectedIsWall: boolean;
  selectedWallIsCurved: boolean;
  selectedIsDoor: boolean;
  activeHintText: string | null;
  onSelectStory: (index: number) => void;
  onAddStory: () => void;
  onOpenFloorSetup: () => void;
  onToggleSnap: () => void;
  onToggleInspector: () => void;
  onDoneTool: () => void;
  onRotateSelected: () => void;
  onFlipSelected: () => void;
  onToggleCurveSelectedWall: () => void;
  onFlipDoorSwing: () => void;
  onToggleDoor3D: () => void;
  onDuplicateSelected: () => void;
  onToggleLockSelected: () => void;
  onDeleteSelected: () => void;
  onAlignMulti: (mode: AlignMode) => void;
  onDistributeMulti: (axis: 'x' | 'z') => void;
  onMirrorMulti: (axis: 'horizontal' | 'vertical', clone: boolean) => void;
  onDeleteMulti: () => void;
  onClearSelection: () => void;
  onUpdateBlueprintSettings: (patch: Partial<BlueprintSettings>) => void;
  onUpdateUnderlay: (underlay: SurveyUnderlay | undefined) => void;
  onStartCalibrateUnderlay: () => void;
  onToggleDimensions: () => void;
  onToggleSetbacks: () => void;
  onToggleHeatmap: () => void;
  onToggleXray: () => void;
  onToggleAllStories: () => void;
  onToggleCeilingRoof: () => void;
  onToggleSiteContext: () => void;
  onChangeLightingPreset: (preset: LightingPreset) => void;
  onChangeCutaway: (ratio: number) => void;
  onChangeExplode: (gap: number) => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onReset2DView: () => void;
}

const LAYER_LABELS: Array<{ key: keyof BlueprintLayerVisibility; label: string }> = [
  { key: 'walls', label: 'Walls' },
  { key: 'openings', label: 'Doors & windows' },
  { key: 'structure', label: 'Columns & beams' },
  { key: 'furniture', label: 'Furniture & stairs' },
  { key: 'rooms', label: 'Rooms & hatches' },
  { key: 'dimensions', label: 'Dimensions & tags' },
  { key: 'grid', label: 'Structural grid' },
  { key: 'setbacks', label: 'Plot & setbacks' },
  { key: 'annotations', label: 'Notes & callouts' },
  { key: 'lowerStory', label: 'Lower floor trace' },
  { key: 'underlay', label: 'Survey underlay' },
];

export const BottomWorkspaceBar: React.FC<BottomWorkspaceBarProps> = ({
  project,
  viewMode,
  experienceMode,
  stories,
  activeStoryIndex,
  activeAreaM2,
  snapEnabled,
  showAllStories,
  showCeilingRoof,
  showDimensions,
  heatmapMode,
  xrayStructural,
  showSetbacks,
  lightingPreset,
  showSiteContext,
  cutawayRatio,
  explodeGap,
  inspectorOpen,
  selection,
  multiSelection,
  selectedLabel,
  selectedIsLocked,
  canDuplicateSelection,
  canLockSelection,
  selectedIsAsset,
  selectedIsWall,
  selectedWallIsCurved,
  selectedIsDoor,
  activeHintText,
  onSelectStory,
  onAddStory,
  onOpenFloorSetup,
  onToggleSnap,
  onToggleInspector,
  onDoneTool,
  onRotateSelected,
  onFlipSelected,
  onToggleCurveSelectedWall,
  onFlipDoorSwing,
  onToggleDoor3D,
  onDuplicateSelected,
  onToggleLockSelected,
  onDeleteSelected,
  onAlignMulti,
  onDistributeMulti,
  onMirrorMulti,
  onDeleteMulti,
  onClearSelection,
  onUpdateBlueprintSettings,
  onUpdateUnderlay,
  onStartCalibrateUnderlay,
  onToggleDimensions,
  onToggleSetbacks,
  onToggleHeatmap,
  onToggleXray,
  onToggleAllStories,
  onToggleCeilingRoof,
  onToggleSiteContext,
  onChangeLightingPreset,
  onChangeCutaway,
  onChangeExplode,
  onCameraPreset,
  onReset2DView,
}) => {
  const [openPopover, setOpenPopover] = useState<'layers' | '3d' | null>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const view3dRef = useRef<HTMLDivElement>(null);
  const underlayInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!openPopover) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        openPopover === 'layers' &&
        layersRef.current &&
        !layersRef.current.contains(target)
      ) {
        setOpenPopover(null);
      }
      if (
        openPopover === '3d' &&
        view3dRef.current &&
        !view3dRef.current.contains(target)
      ) {
        setOpenPopover(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPopover(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openPopover]);

  const sorted = [...stories].sort((a, b) => a.index - b.index);
  const has2D = viewMode === '2d' || viewMode === 'split';
  const has3D = viewMode === 'split' || viewMode === '2.5d' || viewMode === '3d';
  const settings = getBlueprintSettings(project);
  const land = formatBanglaLandSummary(activeAreaM2);
  const isPro = experienceMode === 'engineer';

  const handleUnderlayUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const plotW = project.plot?.width ?? 12;
        const aspect = img.naturalHeight / Math.max(1, img.naturalWidth);
        onUpdateUnderlay({
          dataUrl,
          name: file.name,
          originX: project.plot?.originX ?? 0,
          originZ: project.plot?.originZ ?? 0,
          widthM: plotW,
          heightM: Number((plotW * aspect).toFixed(3)),
          opacity: 0.45,
          rotation: 0,
          locked: false,
        });
        onUpdateBlueprintSettings({
          layers: { ...settings.layers, underlay: true },
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <footer className="h-11 shrink-0 bg-white border-t border-slate-200 px-2.5 sm:px-3.5 z-30 flex items-center justify-between gap-2 select-none">
      {/* Left: Floor Switcher & Area */}
      <div className="flex items-center gap-1.5 min-w-0 shrink-0">
        <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-md border border-slate-200">
          {sorted.map((s) => {
            const active = activeStoryIndex === s.index;
            const floorLabel =
              s.index === 0 ? (sorted.length <= 3 ? 'Ground' : 'G') : isPro ? `G+${s.index}` : `F${s.index + 1}`;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStory(s.index)}
                title={`Switch to ${s.name}`}
                className={`px-2 py-0.5 text-[11px] font-semibold tabular-nums rounded whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {floorLabel}
              </button>
            );
          })}
          {sorted.length < 11 && (
            <button
              type="button"
              onClick={onAddStory}
              title="Add floor above (copies columns & beams)"
              aria-label="Add floor above"
              className="p-1 text-slate-500 hover:text-blue-700 hover:bg-white rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenFloorSetup}
          title="Open Floor Setup (sq ft, Shotok, Katha)"
          className="hidden lg:inline-flex items-center px-1.5 py-1 text-[11px] font-medium text-slate-600 hover:text-blue-700 tabular-nums whitespace-nowrap rounded transition-colors"
        >
          {land.sqft}
          <span className="hidden xl:inline text-slate-400"> · {land.shotok}</span>
        </button>
      </div>

      {/* Center: Dynamic Contextual Bar (Multi-Select OR Single-Selection OR Tool Guide) */}
      <div className="flex-1 min-w-0 flex items-center justify-center overflow-x-auto no-scrollbar">
        {multiSelection.length > 1 ? (
          <div className="flex items-center gap-0.5 text-xs">
            <span className="font-semibold text-blue-700 px-1.5 whitespace-nowrap tabular-nums">
              {multiSelection.length} selected
            </span>
            <div className="h-4 w-px bg-slate-200 mx-0.5 shrink-0" />
            <button
              type="button"
              onClick={() => onAlignMulti('left')}
              title="Align left edges"
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
            >
              <AlignStartVertical className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAlignMulti('center-x')}
              title="Align horizontal centers"
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
            >
              <AlignCenterVertical className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAlignMulti('right')}
              title="Align right edges"
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
            >
              <AlignEndVertical className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAlignMulti('top')}
              title="Align top edges"
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
            >
              <AlignStartHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAlignMulti('center-z')}
              title="Align vertical middles"
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
            >
              <AlignCenterHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAlignMulti('bottom')}
              title="Align bottom edges"
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
            >
              <AlignEndHorizontal className="w-3.5 h-3.5" />
            </button>
            {multiSelection.length >= 3 && (
              <>
                <div className="h-4 w-px bg-slate-200 mx-0.5 shrink-0" />
                <button
                  type="button"
                  onClick={() => onDistributeMulti('x')}
                  title="Distribute evenly horizontally"
                  className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
                >
                  <AlignHorizontalSpaceAround className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDistributeMulti('z')}
                  title="Distribute evenly vertically"
                  className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
                >
                  <AlignVerticalSpaceAround className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <div className="h-4 w-px bg-slate-200 mx-0.5 shrink-0" />
            <button
              type="button"
              onClick={() => onMirrorMulti('horizontal', false)}
              title="Mirror selection horizontally"
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMirrorMulti('vertical', false)}
              title="Mirror selection vertically"
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors shrink-0"
            >
              <FlipVertical2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMirrorMulti('horizontal', true)}
              title="Create mirrored twin unit beside selection"
              className="flex items-center gap-1 px-2 py-1 text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              <CopyPlus className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Twin unit</span>
            </button>
            <div className="h-4 w-px bg-slate-200 mx-0.5 shrink-0" />
            <button
              type="button"
              onClick={onDeleteMulti}
              title="Delete all selected (Del)"
              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              title="Clear selection (Esc)"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : selection ? (
          <div className="flex items-center gap-1 text-xs">
            <span className="font-semibold text-slate-900 px-1.5 max-w-[160px] truncate tabular-nums">
              {selectedLabel}
            </span>
            <div className="h-4 w-px bg-slate-200 shrink-0" />
            <button
              type="button"
              onClick={onToggleInspector}
              title="Open properties panel (I)"
              className={`flex items-center gap-1 px-2 py-1 rounded font-medium whitespace-nowrap transition-colors ${
                inspectorOpen
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Properties</span>
            </button>
            {selectedIsAsset && (
              <>
                <button
                  type="button"
                  onClick={onRotateSelected}
                  title="Rotate 90° (R)"
                  className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onFlipSelected}
                  title="Mirror item"
                  className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {selectedIsWall && (
              <button
                type="button"
                onClick={onToggleCurveSelectedWall}
                title={selectedWallIsCurved ? 'Straighten wall' : 'Curve wall'}
                className={`p-1.5 rounded transition-colors ${
                  selectedWallIsCurved
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Spline className="w-3.5 h-3.5" />
              </button>
            )}
            {selectedIsDoor && (
              <>
                <button
                  type="button"
                  onClick={onFlipDoorSwing}
                  title="Flip door swing side"
                  className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onToggleDoor3D}
                  title="Open or close door in 3D"
                  className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                >
                  <DoorOpen className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {canDuplicateSelection && (
              <button
                type="button"
                onClick={onDuplicateSelected}
                title="Duplicate (Ctrl+D)"
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
              >
                <CopyPlus className="w-3.5 h-3.5" />
              </button>
            )}
            {canLockSelection && (
              <button
                type="button"
                onClick={onToggleLockSelected}
                title="Lock or unlock (L)"
                className={`p-1.5 rounded transition-colors ${
                  selectedIsLocked
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {selectedIsLocked ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <LockOpen className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onDeleteSelected}
              title="Delete (Del)"
              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : activeHintText ? (
          <div className="flex items-center gap-2 text-xs text-slate-700 max-w-full">
            <span className="truncate font-medium">{activeHintText}</span>
            <button
              type="button"
              onClick={onDoneTool}
              className="shrink-0 px-2 py-0.5 text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <span className="hidden md:inline text-[11px] text-slate-500 truncate">
            Click any item to edit · Shift+Drag to box-select · Press ? for guide &amp; shortcuts
          </span>
        )}
      </div>

      {/* Right: Snap, Unified Display & Layers Popover, and 3D Options */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggleSnap}
          title="Snap to grid & corners (Hold Alt to bypass)"
          className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border whitespace-nowrap transition-colors ${
            snapEnabled
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-white text-slate-500 border-slate-200 hover:text-slate-800'
          }`}
        >
          <Magnet className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Snap</span>
        </button>

        {/* Unified Display & Layers Popover */}
        <div className="relative" ref={layersRef}>
          <button
            type="button"
            onClick={() => setOpenPopover((v) => (v === 'layers' ? null : 'layers'))}
            aria-expanded={openPopover === 'layers'}
            title="Blueprint style, dimensions, layers, setbacks & survey tracing"
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border whitespace-nowrap transition-colors ${
              openPopover === 'layers'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Display</span>
          </button>

          {openPopover === 'layers' && (
            <div className="absolute bottom-full right-0 mb-2 w-[min(19rem,calc(100vw-1rem))] max-h-[min(32rem,calc(100dvh-7rem))] overflow-y-auto studio-scroll bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 space-y-3.5 z-50">
              {has2D && (
                <>
                  {/* Blueprint Visual Style */}
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-semibold text-slate-900">
                      Blueprint look
                    </span>
                    <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                      {(
                        [
                          { id: 'draft', label: 'Draft' },
                          { id: 'presentation', label: 'Present' },
                          { id: 'print', label: 'Print Sheet' },
                        ] as { id: BlueprintSheetMode; label: string }[]
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onUpdateBlueprintSettings({ sheetMode: m.id })}
                          className={`py-1 text-[11px] font-semibold rounded transition-colors ${
                            settings.sheetMode === m.id
                              ? 'bg-white text-blue-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dimension Reference Basis */}
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-semibold text-slate-900">
                      Room measurements
                    </span>
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                      {(
                        [
                          { id: 'interior', label: 'Clear interior' },
                          { id: 'centerline', label: 'Wall centerline' },
                        ] as { id: DimensionBasis; label: string }[]
                      ).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => onUpdateBlueprintSettings({ dimensionBasis: b.id })}
                          className={`py-1 text-[11px] font-medium rounded transition-colors ${
                            settings.dimensionBasis === b.id
                              ? 'bg-white text-blue-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Key Visual Overlays */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <span className="block text-[11px] font-semibold text-slate-900">
                  Overlays &amp; checks
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleSetbacks}
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-md border transition-colors ${
                      showSetbacks
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    Setbacks
                  </button>
                  <button
                    type="button"
                    onClick={onToggleHeatmap}
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-md border transition-colors ${
                      heatmapMode
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5 shrink-0" />
                    Stress map
                  </button>
                  {has2D && (
                    <>
                      <button
                        type="button"
                        onClick={onToggleDimensions}
                        className={`px-2 py-1.5 text-[11px] font-medium rounded-md border text-left transition-colors ${
                          showDimensions
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Dimensions: {showDimensions ? 'On' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateBlueprintSettings({
                            showExteriorChains: !settings.showExteriorChains,
                          })
                        }
                        className={`px-2 py-1.5 text-[11px] font-medium rounded-md border text-left transition-colors ${
                          settings.showExteriorChains
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Outer chains: {settings.showExteriorChains ? 'On' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateBlueprintSettings({
                            showScheduleTags: !settings.showScheduleTags,
                          })
                        }
                        className={`px-2 py-1.5 text-[11px] font-medium rounded-md border text-left transition-colors ${
                          settings.showScheduleTags
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        D1/W1 tags: {settings.showScheduleTags ? 'On' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onReset2DView();
                          setOpenPopover(null);
                        }}
                        className="px-2 py-1.5 text-[11px] font-medium rounded-md border bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 text-left transition-colors"
                      >
                        Fit 2D plan
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 2D Layer Visibility */}
              {has2D && (
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <span className="block text-[11px] font-semibold text-slate-900 mb-1">
                    Visible layers
                  </span>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                    {LAYER_LABELS.map((item) => {
                      const visible = settings.layers[item.key];
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() =>
                            onUpdateBlueprintSettings({
                              layers: {
                                ...settings.layers,
                                [item.key]: !visible,
                              },
                            })
                          }
                          className="flex items-center justify-between px-1.5 py-1 rounded text-[11px] hover:bg-slate-50 transition-colors"
                        >
                          <span
                            className={`truncate ${
                              visible ? 'text-slate-800 font-medium' : 'text-slate-400'
                            }`}
                          >
                            {item.label}
                          </span>
                          {visible ? (
                            <Eye className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Survey / Hand Sketch Underlay */}
              {has2D && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-900">
                      Trace survey or sketch
                    </span>
                    <button
                      type="button"
                      onClick={() => underlayInputRef.current?.click()}
                      className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      {project.underlay ? 'Replace' : 'Upload image'}
                    </button>
                    <input
                      ref={underlayInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUnderlayUpload}
                      className="hidden"
                    />
                  </div>

                  {project.underlay ? (
                    <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-medium text-slate-800 truncate">
                          {project.underlay.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateUnderlay(undefined)}
                          title="Remove underlay image"
                          className="text-red-600 hover:text-red-700 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <label className="block space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-600">
                          <span>Image opacity</span>
                          <span className="tabular-nums font-mono">
                            {Math.round(project.underlay.opacity * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={0.95}
                          step={0.05}
                          value={project.underlay.opacity}
                          onChange={(e) =>
                            onUpdateUnderlay({
                              ...project.underlay!,
                              opacity: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-blue-700 cursor-pointer"
                        />
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenPopover(null);
                            onStartCalibrateUnderlay();
                          }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-semibold rounded-md transition-colors"
                        >
                          <Ruler className="w-3 h-3" />
                          Calibrate scale
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateUnderlay({
                              ...project.underlay!,
                              locked: !project.underlay!.locked,
                            })
                          }
                          title="Lock underlay"
                          className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-100"
                        >
                          {project.underlay.locked ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <LockOpen className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Upload a Mouza map, plot deed, or hand sketch to trace walls to exact real-world scale.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Compact 3D View Controls Popover */}
        {has3D && (
          <div className="relative" ref={view3dRef}>
            <button
              type="button"
              onClick={() => setOpenPopover((v) => (v === '3d' ? null : '3d'))}
              aria-expanded={openPopover === '3d'}
              title="3D camera angles, section cutaway, roof, lighting & structural X-Ray"
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border whitespace-nowrap transition-colors ${
                openPopover === '3d' || xrayStructural
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>3D</span>
            </button>

            {openPopover === '3d' && (
              <div className="absolute bottom-full right-0 mb-2 w-[min(17rem,calc(100vw-1rem))] max-h-[min(28rem,calc(100dvh-7rem))] overflow-y-auto studio-scroll bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 space-y-3 z-50">
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-slate-900">
                    Camera angle
                  </span>
                  <div className="grid grid-cols-5 gap-1">
                    {(
                      [
                        { id: 'exterior', label: '3/4' },
                        { id: 'street', label: 'Street' },
                        { id: 'front', label: 'Front' },
                        { id: 'corner', label: 'Side' },
                        { id: 'top', label: 'Top' },
                      ] as { id: CameraPreset; label: string }[]
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onCameraPreset(p.id)}
                        className="py-1 text-[11px] font-medium text-slate-700 hover:text-blue-700 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-md transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block space-y-1 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs text-slate-700">
                    <span>Section cutaway</span>
                    <span className="tabular-nums font-mono text-[11px] text-slate-500">
                      {Math.round(cutawayRatio * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={1.0}
                    step={0.05}
                    value={cutawayRatio}
                    onChange={(e) => onChangeCutaway(parseFloat(e.target.value))}
                    className="w-full accent-blue-700 cursor-pointer"
                  />
                </label>

                {sorted.length > 1 && (
                  <label className="block space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-700">
                      <span>Separate floors</span>
                      <span className="tabular-nums font-mono text-[11px] text-slate-500">
                        {explodeGap.toFixed(1)}m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2.6}
                      step={0.1}
                      value={explodeGap}
                      onChange={(e) => onChangeExplode(parseFloat(e.target.value))}
                      className="w-full accent-blue-700 cursor-pointer"
                    />
                  </label>
                )}

                <div className="space-y-1.5">
                  <span className="block text-[11px] font-medium text-slate-500">Lighting</span>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                    {(
                      [
                        { id: 'daylight', label: 'Day' },
                        { id: 'golden', label: 'Golden' },
                        { id: 'studio', label: 'Studio' },
                      ] as { id: LightingPreset; label: string }[]
                    ).map((lp) => (
                      <button
                        key={lp.id}
                        type="button"
                        onClick={() => onChangeLightingPreset(lp.id)}
                        className={`py-1 text-xs font-medium rounded transition-colors ${
                          lightingPreset === lp.id
                            ? 'bg-white text-blue-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {lp.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={onToggleXray}
                    className={`flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-md border transition-colors ${
                      xrayStructural
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <Scan className="w-3.5 h-3.5" />
                    RCC X-Ray
                  </button>
                  <button
                    type="button"
                    onClick={onToggleAllStories}
                    className={`py-1.5 text-[11px] font-medium rounded-md border transition-colors ${
                      showAllStories
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {showAllStories ? 'All floors' : 'Active floor'}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleCeilingRoof}
                    className={`py-1.5 text-[11px] font-medium rounded-md border transition-colors ${
                      showCeilingRoof
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Roof: {showCeilingRoof ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleSiteContext}
                    className={`py-1.5 text-[11px] font-medium rounded-md border transition-colors ${
                      showSiteContext
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Site &amp; road
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </footer>
  );
};
