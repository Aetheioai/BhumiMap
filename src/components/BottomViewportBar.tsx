import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Box,
  Columns3,
  DoorOpen,
  Ellipsis,
  Eye,
  Grid2x2,
  Hand,
  LayoutGrid,
  Minus,
  MousePointer2,
  Pentagon,
  Plus,
  RotateCcw,
  Ruler,
  Scan,
  ShieldCheck,
  Sofa,
  Spline,
  Square,
  SquareDashed,
} from 'lucide-react';
import { LightingPreset, Story, ToolMode, ViewMode } from '../types/building';
import { formatBanglaLandSummary } from '../engine/units';
import { CameraPreset } from './Viewport3D';

interface BottomViewportBarProps {
  viewMode: ViewMode;
  tool: ToolMode;
  assetsOpen: boolean;
  stories: Story[];
  activeStoryIndex: number;
  activeAreaM2: number;
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
  onSelectTool: (tool: ToolMode) => void;
  onToggleAssets: () => void;
  onOpenFloorSetup: () => void;
  onSelectStory: (index: number) => void;
  onAddStory: () => void;
  onToggleAllStories: () => void;
  onToggleCeilingRoof: () => void;
  onToggleDimensions: () => void;
  onToggleHeatmap: () => void;
  onToggleXray: () => void;
  onToggleSetbacks: () => void;
  onChangeLightingPreset: (preset: LightingPreset) => void;
  onToggleSiteContext: () => void;
  onChangeCutaway: (ratio: number) => void;
  onChangeExplode: (gap: number) => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onReset2DView: () => void;
}

const PRIMARY_TOOLS: {
  id: ToolMode;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: <MousePointer2 className="w-4 h-4" /> },
  { id: 'wall', label: 'Wall', shortcut: 'W', icon: <Minus className="w-4 h-4 rotate-45" /> },
  { id: 'curved-wall', label: 'Curve', shortcut: 'U', icon: <Spline className="w-4 h-4" /> },
  { id: 'pillar', label: 'Pillar', shortcut: 'C', icon: <Square className="w-3.5 h-3.5 fill-current" /> },
  { id: 'room', label: 'Room', shortcut: 'G', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'door', label: 'Door', shortcut: 'D', icon: <DoorOpen className="w-4 h-4" /> },
  { id: 'window', label: 'Window', shortcut: 'N', icon: <Grid2x2 className="w-4 h-4" /> },
];

const EXTRA_TOOLS: {
  id: ToolMode;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}[] = [
  { id: 'beam', label: 'Beam', shortcut: 'B', icon: <Columns3 className="w-4 h-4 rotate-90" /> },
  { id: 'slab', label: 'Slab', shortcut: 'S', icon: <Box className="w-4 h-4" /> },
  { id: 'cutout', label: 'Cutout', shortcut: 'K', icon: <SquareDashed className="w-4 h-4" /> },
  { id: 'ruler', label: 'Ruler', shortcut: 'M', icon: <Ruler className="w-4 h-4" /> },
  { id: 'area', label: 'Area', shortcut: 'A', icon: <Pentagon className="w-4 h-4" /> },
  { id: 'pan', label: 'Pan', shortcut: 'Space', icon: <Hand className="w-4 h-4" /> },
];

export const BottomViewportBar: React.FC<BottomViewportBarProps> = ({
  viewMode,
  tool,
  assetsOpen,
  stories,
  activeStoryIndex,
  activeAreaM2,
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
  onSelectTool,
  onToggleAssets,
  onOpenFloorSetup,
  onSelectStory,
  onAddStory,
  onToggleAllStories,
  onToggleCeilingRoof,
  onToggleDimensions,
  onToggleHeatmap,
  onToggleXray,
  onToggleSetbacks,
  onChangeLightingPreset,
  onToggleSiteContext,
  onChangeCutaway,
  onChangeExplode,
  onCameraPreset,
  onReset2DView,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewOptOpen, setViewOptOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const viewOptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen && !viewOptOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
      if (viewOptOpen && viewOptRef.current && !viewOptRef.current.contains(e.target as Node)) {
        setViewOptOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [moreOpen, viewOptOpen]);

  const sorted = [...stories].sort((a, b) => a.index - b.index);
  const has2D = viewMode === '2d' || viewMode === 'split';
  const has3D = viewMode === 'split' || viewMode === '2.5d' || viewMode === '3d';
  const isExtraToolActive = EXTRA_TOOLS.some((t) => t.id === tool);
  const land = formatBanglaLandSummary(activeAreaM2);

  return (
    <div className="pointer-events-none absolute bottom-3 inset-x-3 z-20 flex items-end justify-between gap-2">
      {/* Bottom-Left: Floor Levels & Footprint Readout */}
      <div className="hidden md:flex items-center gap-1.5 pointer-events-auto bg-white border border-slate-200 shadow-sm rounded-xl px-2 py-1.5 shrink-0">
        <div className="flex items-center gap-1">
          {sorted.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStory(s.index)}
              className={`px-2 py-1 text-xs font-semibold tabular-nums rounded-md transition-colors ${
                activeStoryIndex === s.index
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {s.index === 0 ? 'G' : `G+${s.index}`}
            </button>
          ))}
          {sorted.length < 11 && (
            <button
              type="button"
              onClick={onAddStory}
              title="Add floor above (copies structural columns & beams)"
              className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        <button
          type="button"
          onClick={onOpenFloorSetup}
          title="Open Floor Setup (sq ft, Shotok, Katha)"
          className="px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:text-blue-700 tabular-nums whitespace-nowrap rounded transition-colors"
        >
          {land.sqft}
          <span className="hidden xl:inline text-slate-400"> · {land.shotok}</span>
        </button>
      </div>

      {/* Bottom-Center: Drafting & Architecture Tool Dock */}
      <div className="pointer-events-auto mx-auto flex items-center gap-0.5 bg-white border border-slate-200 shadow-md rounded-xl p-1">
        {PRIMARY_TOOLS.map((item) => {
          const active = tool === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTool(item.id)}
              title={`${item.label} (${item.shortcut})`}
              aria-label={item.label}
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {item.icon}
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          );
        })}

        <div className="h-5 w-px bg-slate-200 mx-0.5" />

        <button
          type="button"
          onClick={onToggleAssets}
          title="Stairs, Lift, Utilities & Bangladeshi Furniture"
          aria-label="Functional 3D catalog"
          className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            assetsOpen
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Sofa className="w-4 h-4" />
          <span className="hidden lg:inline">Catalog</span>
        </button>

        {/* Extra Tools Popover (Beam, Slab, Cutout, Ruler, Area, Pan) */}
        <div className="relative" ref={moreRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            title="Beam, Slab, Stair Cutout, Ruler, Area & Pan"
            aria-label="More architectural tools"
            aria-expanded={moreOpen}
            className={`flex items-center justify-center p-1.5 sm:px-2 rounded-lg text-xs font-medium transition-colors ${
              moreOpen || isExtraToolActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Ellipsis className="w-4 h-4" />
          </button>

          {moreOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-2 z-50">
              <div className="grid grid-cols-2 gap-1">
                {EXTRA_TOOLS.map((item) => {
                  const active = tool === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectTool(item.id);
                        setMoreOpen(false);
                      }}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? 'bg-blue-700 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Mobile-only quick View toggles */}
              <div className="md:hidden pt-2 border-t border-slate-100 space-y-1.5">
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={onToggleXray}
                    className={`py-1.5 text-[11px] font-medium rounded-md border ${
                      xrayStructural
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    RCC X-Ray
                  </button>
                  <button
                    type="button"
                    onClick={onToggleSetbacks}
                    className={`py-1.5 text-[11px] font-medium rounded-md border ${
                      showSetbacks
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Setbacks
                  </button>
                  <button
                    type="button"
                    onClick={onToggleHeatmap}
                    className={`py-1.5 text-[11px] font-medium rounded-md border ${
                      heatmapMode
                        ? 'bg-amber-700 text-white border-amber-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Stress
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom-Right: Engineering Overlays (X-Ray, Setbacks, Stress) & 3D Camera Controls */}
      <div className="hidden md:flex items-center gap-1 pointer-events-auto bg-white border border-slate-200 shadow-sm rounded-xl p-1 shrink-0">
        {has3D && (
          <button
            type="button"
            onClick={onToggleXray}
            title="Toggle Structural RCC Frame X-Ray (X) — inspect columns, drop beams, slabs & footings"
            className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              xrayStructural
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">X-Ray</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleSetbacks}
          title="Toggle RAJUK / BNBC legal setback buffer envelope"
          className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showSetbacks
              ? 'bg-emerald-700 text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="hidden 2xl:inline">Setbacks</span>
        </button>

        <button
          type="button"
          onClick={onToggleHeatmap}
          title="Toggle structural D/C utilization heatmap (H)"
          className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            heatmapMode
              ? 'bg-amber-700 text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Stress</span>
        </button>

        {has2D && (
          <>
            <button
              type="button"
              onClick={onToggleDimensions}
              title="Toggle plan dimensions"
              className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showDimensions
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Dims
            </button>
            <button
              type="button"
              onClick={onReset2DView}
              title="Fit plan to screen (F)"
              className="p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {has3D && (
          <div className="relative" ref={viewOptRef}>
            <button
              type="button"
              onClick={() => setViewOptOpen((v) => !v)}
              title="3D section cutaway, roof, lighting & camera presets"
              className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewOptOpen
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>3D</span>
            </button>

            {viewOptOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3 space-y-3 z-50">
                <label className="block space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-700">
                    <span>Section cutaway</span>
                    <span className="tabular-nums text-slate-400">
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
                      <span>Explode floors</span>
                      <span className="tabular-nums text-slate-400">
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

                <div>
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">
                    Lighting
                  </span>
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

                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={onToggleAllStories}
                    className={`py-1.5 text-[11px] font-medium rounded-md border transition-colors ${
                      showAllStories
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {showAllStories ? 'All floors' : '1 floor'}
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
                    Roof
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
                    Plot
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className="block text-[11px] font-medium text-slate-500 mb-1.5">
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
