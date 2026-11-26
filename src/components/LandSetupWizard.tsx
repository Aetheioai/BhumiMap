import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Search, X } from 'lucide-react';
import {
  BnbcSeismicZone,
  BuildingProject,
  LandContext,
  LandPlot,
  RoadSide,
  TemplateCategory,
  UnitSystem,
} from '../types/building';
import {
  createCustomLandProject,
  TEMPLATE_CATEGORIES,
  TEMPLATE_PRESETS,
} from '../engine/templates';
import {
  formatBanglaLandSummary,
  formatLength,
  ft,
  getUnitSuffix,
  inputToMeters,
  metersToInput,
} from '../engine/units';

interface LandSetupWizardProps {
  initialUnit: UnitSystem;
  initialPlot?: LandPlot;
  initialStep?: 1 | 2;
  onCreateProject: (project: BuildingProject, openMode: '2d' | 'split' | '3d') => void;
  onClose: () => void;
}

interface PlotPreset {
  id: string;
  label: string;
  context: LandContext;
  sizeNote: string;
  widthFt: number;
  depthFt: number;
  frontFt: number;
  rearFt: number;
  leftFt: number;
  rightFt: number;
  roadFt: number;
}

const BANGLA_PLOT_PRESETS: PlotPreset[] = [
  {
    id: '2-katha',
    label: '2 Katha Urban',
    context: 'urban',
    sizeNote: "32' × 46'",
    widthFt: 32,
    depthFt: 46,
    frontFt: 6,
    rearFt: 4.25,
    leftFt: 4,
    rightFt: 4,
    roadFt: 20,
  },
  {
    id: '3-katha',
    label: '3 Katha Dhaka',
    context: 'urban',
    sizeNote: "40' × 54'",
    widthFt: 40,
    depthFt: 54,
    frontFt: 7,
    rearFt: 5.75,
    leftFt: 4.25,
    rightFt: 4.25,
    roadFt: 20,
  },
  {
    id: '5-katha',
    label: '5 Katha City',
    context: 'urban',
    sizeNote: "56' × 65'",
    widthFt: 56,
    depthFt: 65,
    frontFt: 8,
    rearFt: 8.5,
    leftFt: 5.5,
    rightFt: 5.5,
    roadFt: 30,
  },
  {
    id: '1.5-katha',
    label: '1.5 Katha Starter',
    context: 'semi-urban',
    sizeNote: "26' × 42'",
    widthFt: 26,
    depthFt: 42,
    frontFt: 5.5,
    rearFt: 4,
    leftFt: 3.5,
    rightFt: 3.5,
    roadFt: 16,
  },
  {
    id: '8-shotok',
    label: '8 Shotok Village',
    context: 'village',
    sizeNote: "52' × 66'",
    widthFt: 52,
    depthFt: 66,
    frontFt: 12,
    rearFt: 5,
    leftFt: 7,
    rightFt: 7,
    roadFt: 15,
  },
];

const ROAD_SIDES: { id: RoadSide; label: string }[] = [
  { id: 'south', label: 'South' },
  { id: 'north', label: 'North' },
  { id: 'east', label: 'East' },
  { id: 'west', label: 'West' },
];

export const LandSetupWizard: React.FC<LandSetupWizardProps> = ({
  initialUnit,
  initialPlot,
  initialStep = 1,
  onCreateProject,
  onClose,
}) => {
  const [step, setStep] = useState<1 | 2>(initialStep);
  const [unit, setUnit] = useState<UnitSystem>(initialUnit);

  const [landContext, setLandContext] = useState<LandContext>(
    initialPlot?.landContext ?? 'urban'
  );
  const [plotWidth, setPlotWidth] = useState<number>(initialPlot?.width ?? ft(40));
  const [plotDepth, setPlotDepth] = useState<number>(initialPlot?.depth ?? ft(54));
  const [roadSide, setRoadSide] = useState<RoadSide>(initialPlot?.roadSide ?? 'south');
  const [roadWidthM, setRoadWidthM] = useState<number>(initialPlot?.roadWidthM ?? ft(20));
  const [seismicZone, setSeismicZone] = useState<BnbcSeismicZone>(2);
  const [frontSetback, setFrontSetback] = useState<number>(initialPlot?.setbacks.front ?? ft(7));
  const [rearSetback, setRearSetback] = useState<number>(initialPlot?.setbacks.rear ?? ft(5, 9));
  const [leftSetback, setLeftSetback] = useState<number>(initialPlot?.setbacks.left ?? ft(4, 3));
  const [rightSetback, setRightSetback] = useState<number>(initialPlot?.setbacks.right ?? ft(4, 3));
  const [hasBoundaryWall, setHasBoundaryWall] = useState<boolean>(
    initialPlot?.hasBoundaryWall ?? true
  );
  const [customStories, setCustomStories] = useState<number>(3);
  const [customProjectName, setCustomProjectName] = useState<string>('My Bangladesh Building');

  // Step 2: 12 architect-verified Bangladeshi templates
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTplId, setSelectedTplId] = useState<string>(TEMPLATE_PRESETS[0].id);

  const unitLabel = getUnitSuffix(unit, 'length');
  const plotAreaM2 = plotWidth * plotDepth;
  const plotLand = formatBanglaLandSummary(plotAreaM2);
  const buildableW = Math.max(ft(14), plotWidth - leftSetback - rightSetback);
  const buildableD = Math.max(ft(16), plotDepth - frontSetback - rearSetback);
  const buildableLand = formatBanglaLandSummary(buildableW * buildableD);

  const applyPreset = (p: PlotPreset) => {
    setLandContext(p.context);
    setPlotWidth(ft(p.widthFt));
    setPlotDepth(ft(p.depthFt));
    setFrontSetback(ft(p.frontFt));
    setRearSetback(ft(p.rearFt));
    setLeftSetback(ft(p.leftFt));
    setRightSetback(ft(p.rightFt));
    setRoadWidthM(ft(p.roadFt));
    setHasBoundaryWall(p.context !== 'village');
  };

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return TEMPLATE_PRESETS.filter((t) => {
      if (activeCategory !== 'all' && t.category !== activeCategory) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q) ||
        t.landLabel.toLowerCase().includes(q)
      );
    });
  }, [activeCategory, templateSearch]);

  const handleCreateBlankPlot = (openMode: '2d' | 'split' | '3d') => {
    const project = createCustomLandProject({
      name: customProjectName.trim() || 'My Bangladesh Building',
      plotWidthM: plotWidth,
      plotDepthM: plotDepth,
      roadSide,
      landContext,
      roadWidthM,
      seismicZone,
      floors: customStories,
      setbacks: {
        front: frontSetback,
        rear: rearSetback,
        left: leftSetback,
        right: rightSetback,
      },
    });
    if (project.plot) {
      project.plot.hasBoundaryWall = hasBoundaryWall;
      project.plot.hasGate = hasBoundaryWall;
    }
    project.unitSystem = unit;
    onCreateProject(project, openMode);
  };

  const handleLoadSelectedTemplate = (openMode: '2d' | 'split' | '3d') => {
    const found = TEMPLATE_PRESETS.find((t) => t.id === selectedTplId) ?? TEMPLATE_PRESETS[0];
    const proj = found.build();
    proj.unitSystem = unit;
    onCreateProject(proj, openMode);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">
              {step === 1
                ? 'Step 1: Define Your Land Plot & Legal Setbacks'
                : 'Step 2: Choose an Architect-Verified Bangladeshi Template'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === 1
                ? 'Set land size in Katha, Shotok, or Feet with automatic RAJUK / BNBC neighbor clearances.'
                : 'Every template passes 100% RAJUK setbacks, MGC, FAR, column continuity, and spatial fit checks.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`px-2.5 py-1 text-xs font-semibold rounded ${
                  step === 1 ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Custom Plot
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className={`px-2.5 py-1 text-xs font-semibold rounded ${
                  step === 2 ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                12 Templates
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close land setup"
              className="p-1.5 text-slate-400 hover:text-slate-800 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {step === 1 ? (
          <div className="flex-1 overflow-y-auto studio-scroll p-5 grid grid-cols-1 md:grid-cols-[1.25fr_1fr] gap-6">
            {/* Left Form */}
            <div className="space-y-4">
              {/* Quick Bangladesh Plot Presets */}
              <div>
                <span className="block text-xs font-semibold text-slate-800 mb-2">
                  Standard Bangladesh land sizes
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {BANGLA_PLOT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="text-left p-2 rounded-lg border border-slate-200 hover:border-blue-600 hover:bg-blue-50/40 transition-colors"
                    >
                      <div className="text-xs font-semibold text-slate-900">{p.label}</div>
                      <div className="text-[11px] font-mono text-slate-500">{p.sizeNote}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Project Name & Context */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">
                    Project name
                  </span>
                  <input
                    type="text"
                    value={customProjectName}
                    onChange={(e) => setCustomProjectName(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-2 focus:bg-white focus:border-blue-600"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">
                    Location context
                  </span>
                  <select
                    value={landContext}
                    onChange={(e) => setLandContext(e.target.value as LandContext)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-2"
                  >
                    <option value="urban">Urban (Dhaka / City Corp / RAJUK)</option>
                    <option value="semi-urban">Semi-Urban / District Paurashava</option>
                    <option value="village">Village / Grameen Homestead</option>
                  </select>
                </label>
              </div>

              {/* Plot Width, Depth, Floors, Seismic Zone */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-600 mb-1">
                    Plot width ({unitLabel})
                  </span>
                  <input
                    type="number"
                    value={Number(metersToInput(plotWidth, unit, 'length').toFixed(1))}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isFinite(v) && v >= 15) setPlotWidth(inputToMeters(v, unit, 'length'));
                    }}
                    className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-600 mb-1">
                    Plot depth ({unitLabel})
                  </span>
                  <input
                    type="number"
                    value={Number(metersToInput(plotDepth, unit, 'length').toFixed(1))}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isFinite(v) && v >= 20) setPlotDepth(inputToMeters(v, unit, 'length'));
                    }}
                    className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-600 mb-1">
                    Floors (G+N)
                  </span>
                  <select
                    value={customStories}
                    onChange={(e) => setCustomStories(Number(e.target.value))}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? '1 (Ground)' : `${n} (G+${n - 1})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-600 mb-1">
                    BNBC seismic zone
                  </span>
                  <select
                    value={seismicZone}
                    onChange={(e) => setSeismicZone(Number(e.target.value) as BnbcSeismicZone)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                  >
                    <option value={1}>Z1 Khulna</option>
                    <option value={2}>Z2 Dhaka</option>
                    <option value={3}>Z3 Ctg</option>
                    <option value={4}>Z4 Sylhet</option>
                  </select>
                </label>
              </div>

              {/* Road Side & Mandatory Neighbor Setbacks */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Road side &amp; legal neighbor setbacks
                  </span>
                  <div className="flex items-center gap-1">
                    {ROAD_SIDES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRoadSide(r.id)}
                        className={`px-2 py-1 text-[11px] font-medium rounded border ${
                          roadSide === r.id
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Front', val: frontSetback, set: setFrontSetback },
                    { label: 'Rear', val: rearSetback, set: setRearSetback },
                    { label: 'Left', val: leftSetback, set: setLeftSetback },
                    { label: 'Right', val: rightSetback, set: setRightSetback },
                  ].map((s) => (
                    <label key={s.label} className="block">
                      <span className="block text-[11px] text-slate-500 mb-1">
                        {s.label} ({unitLabel})
                      </span>
                      <input
                        type="number"
                        step={0.25}
                        value={Number(metersToInput(s.val, unit, 'length').toFixed(2))}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (Number.isFinite(v) && v >= 0) s.set(inputToMeters(v, unit, 'length'));
                        }}
                        className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5"
                      />
                    </label>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={hasBoundaryWall}
                    onChange={(e) => setHasBoundaryWall(e.target.checked)}
                    className="accent-blue-700"
                  />
                  Include compound boundary wall &amp; sliding steel gate
                </label>
              </div>
            </div>

            {/* Right Live Architectural Plot Diagram */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-900">Plot &amp; Setback Envelope</div>
                <div className="text-[11px] font-mono text-slate-600 tabular-nums">
                  Total land: {plotLand.sqft} ({plotLand.katha} · {plotLand.shotok})
                </div>
                <div className="text-[11px] font-mono text-emerald-700 tabular-nums">
                  Buildable footprint: {buildableLand.sqft} ({((buildableW * buildableD) / plotAreaM2 * 100).toFixed(1)}% MGC)
                </div>
              </div>

              <div className="my-4 flex items-center justify-center">
                <svg viewBox="0 0 240 220" className="w-full max-w-[260px] h-auto">
                  {/* Road indicator */}
                  {roadSide === 'south' && (
                    <rect x="28" y="182" width="184" height="24" fill="#334155" rx="2" />
                  )}
                  {roadSide === 'north' && (
                    <rect x="28" y="14" width="184" height="24" fill="#334155" rx="2" />
                  )}
                  {roadSide === 'west' && (
                    <rect x="10" y="38" width="22" height="144" fill="#334155" rx="2" />
                  )}
                  {roadSide === 'east' && (
                    <rect x="208" y="38" width="22" height="144" fill="#334155" rx="2" />
                  )}

                  {/* Plot Box */}
                  <rect
                    x="36"
                    y="40"
                    width="168"
                    height="140"
                    fill="#ecfdf5"
                    stroke="#475569"
                    strokeWidth="1.6"
                  />
                  {/* Buildable Inner Rectangle */}
                  <rect
                    x="56"
                    y="58"
                    width="128"
                    height="100"
                    fill="#dbeafe"
                    stroke="#1d4ed8"
                    strokeWidth="1.4"
                    strokeDasharray="4 3"
                  />
                  <text
                    x="120"
                    y="104"
                    textAnchor="middle"
                    className="fill-blue-900 text-[10px] font-semibold"
                  >
                    Buildable Core
                  </text>
                  <text
                    x="120"
                    y="119"
                    textAnchor="middle"
                    className="fill-blue-700 text-[9px] font-mono"
                  >
                    {formatLength(buildableW, unit)} × {formatLength(buildableD, unit)}
                  </text>
                </svg>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                <span>Units:</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setUnit('imperial')}
                    className={`px-2 py-0.5 rounded font-medium ${
                      unit === 'imperial' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200'
                    }`}
                  >
                    ft-in
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit('metric')}
                    className={`px-2 py-0.5 rounded font-medium ${
                      unit === 'metric' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200'
                    }`}
                  >
                    m
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Step 2: 12 Architect-Verified Bangladeshi Templates */
          <div className="flex-1 overflow-y-auto studio-scroll p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setActiveCategory('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border ${
                    activeCategory === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All ({TEMPLATE_PRESETS.length})
                </button>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border ${
                      activeCategory === cat.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Filter by Katha, curved, village..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTemplates.map((tpl) => {
                const selected = selectedTplId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTplId(tpl.id)}
                    className={`text-left p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-2 ${
                      selected
                        ? 'border-blue-700 bg-blue-50/40 ring-1 ring-blue-700'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 leading-snug">
                          {tpl.name}
                        </span>
                        {selected && <Check className="w-4 h-4 text-blue-700 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {tpl.subtitle}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] font-mono text-slate-500">
                      <span>{tpl.landLabel}</span>
                      <span>{tpl.floorsLabel}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900"
              >
                Or pick from 12 verified templates
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleCreateBlankPlot('2d')}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-md transition-colors"
              >
                Create plot &amp; structural grid
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to custom land setup
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadSelectedTemplate('2d')}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold rounded-md transition-colors"
                >
                  Open in 2D Plan
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSelectedTemplate('3d')}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-md transition-colors"
                >
                  Open in 3D View
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
