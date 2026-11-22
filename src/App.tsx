import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Calculator,
  Check,
  Compass,
  Download,
  FolderOpen,
  Printer,
  RotateCcw,
  RotateCw,
  Save,
  Share2,
} from 'lucide-react';
import { MiniPlotGuide } from './components/MiniPlotGuide';
import { PlotDiagram } from './components/PlotDiagram';
import { PrintSheet } from './components/PrintSheet';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { SavedPlotsView } from './components/SavedPlotsView';
import { ShareExportModal } from './components/ShareExportModal';
import { UnitReferenceView } from './components/UnitReferenceView';
import {
  DiagramMetadata,
  renderSurveyPNGBlob,
  triggerLocalDownload,
} from './lib/exportDiagram';
import {
  DiagonalType,
  EdgeKey,
  ShapeMode,
  solveQuadrilateral,
} from './lib/geometry';
import { Language, TRANSLATIONS } from './lib/i18n';
import {
  loadSavedPlots,
  PlotPreset,
  SAMPLE_PRESETS,
  SavedPlotRecord,
  savePlotsToStorage,
} from './lib/storage';
import {
  convertAreaFromSqFt,
  formatLengthFromFeet,
  formatNumber,
  fromFeet,
  getUnitShortLabel,
  LengthUnit,
  toFeet,
  trimZeros,
} from './lib/units';

type ActiveView = 'calculator' | 'saved' | 'units';

interface LengthFieldState {
  main: string;
  inches: string;
}

interface MeasurementInputs {
  ab: LengthFieldState;
  bc: LengthFieldState;
  cd: LengthFieldState;
  da: LengthFieldState;
  diagonal: LengthFieldState;
}

function feetToFieldState(feet: number, unit: LengthUnit): LengthFieldState {
  if (!Number.isFinite(feet) || feet <= 0) {
    return { main: '', inches: '' };
  }
  const { main, inches } = fromFeet(feet, unit);
  if (unit === 'ft-in') {
    return {
      main: String(main),
      inches: inches > 0 ? trimZeros(inches, 1) : '0',
    };
  }
  return {
    main: trimZeros(main, 2),
    inches: '',
  };
}

function fieldStateToFeet(field: LengthFieldState, unit: LengthUnit): number {
  const m = parseFloat(field.main);
  const i = parseFloat(field.inches);
  const safeMain = Number.isFinite(m) ? m : 0;
  const safeIn = Number.isFinite(i) ? i : 0;
  return toFeet(safeMain, unit, safeIn);
}

const INITIAL_PRESET = SAMPLE_PRESETS[0];

export default function App() {
  const [view, setView] = useState<ActiveView>('calculator');
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('bhumimap_lang');
      return saved === 'en' || saved === 'bn' ? saved : 'bn';
    } catch {
      return 'bn';
    }
  });
  const [unit, setUnit] = useState<LengthUnit>('ft');

  const [inputs, setInputs] = useState<MeasurementInputs>({
    ab: feetToFieldState(INITIAL_PRESET.abFt, 'ft'),
    bc: feetToFieldState(INITIAL_PRESET.bcFt, 'ft'),
    cd: feetToFieldState(INITIAL_PRESET.cdFt, 'ft'),
    da: feetToFieldState(INITIAL_PRESET.daFt, 'ft'),
    diagonal: feetToFieldState(INITIAL_PRESET.diagonalFt, 'ft'),
  });

  const [diagonalType, setDiagonalType] = useState<DiagonalType>(INITIAL_PRESET.diagonalType);
  const [shapeMode, setShapeMode] = useState<ShapeMode>('convex');

  const [plotName, setPlotName] = useState<string>('');
  const [mouza, setMouza] = useState<string>(INITIAL_PRESET.mouza);
  const [dagNo, setDagNo] = useState<string>(INITIAL_PRESET.dagNo);
  const [khatianNo, setKhatianNo] = useState<string>('');
  const [showRecordFields, setShowRecordFields] = useState<boolean>(false);
  const [showGeometryMode, setShowGeometryMode] = useState<boolean>(false);

  const [northRotationDeg, setNorthRotationDeg] = useState<number>(0);
  const [showAngles, setShowAngles] = useState<boolean>(true);
  const [showTriangulation, setShowTriangulation] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [activeEdge, setActiveEdge] = useState<EdgeKey | null>(null);

  const [savedPlots, setSavedPlots] = useState<SavedPlotRecord[]>(() => loadSavedPlots());
  const [justSaved, setJustSaved] = useState<boolean>(false);
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);
  const [downloadingPng, setDownloadingPng] = useState<boolean>(false);

  const diagramSectionRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef<Record<EdgeKey, HTMLInputElement | null>>({
    ab: null,
    bc: null,
    cd: null,
    da: null,
    diagonal: null,
  });

  useEffect(() => {
    savePlotsToStorage(savedPlots);
  }, [savedPlots]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('bhumimap_lang', lang);
    } catch {
      // ignore storage errors
    }
  }, [lang]);

  const t = TRANSLATIONS[lang];

  const abFt = fieldStateToFeet(inputs.ab, unit);
  const bcFt = fieldStateToFeet(inputs.bc, unit);
  const cdFt = fieldStateToFeet(inputs.cd, unit);
  const daFt = fieldStateToFeet(inputs.da, unit);
  const diagonalFt = fieldStateToFeet(inputs.diagonal, unit);

  const geometry = useMemo(
    () => solveQuadrilateral(abFt, bcFt, cdFt, daFt, diagonalFt, diagonalType, shapeMode),
    [abFt, bcFt, cdFt, daFt, diagonalFt, diagonalType, shapeMode]
  );

  const area = useMemo(
    () => convertAreaFromSqFt(geometry.valid ? geometry.areaSqFt : 0),
    [geometry.valid, geometry.areaSqFt]
  );

  const diagramMeta: DiagramMetadata = {
    plotName,
    mouza,
    dagNo,
    khatianNo,
    unit,
    diagonalType,
    abFt,
    bcFt,
    cdFt,
    daFt,
    diagonalFt,
    northRotationDeg,
    showAngles,
    showTriangulation,
    showGrid,
  };

  const handleUnitChange = (nextUnit: LengthUnit) => {
    if (nextUnit === unit) return;
    setInputs({
      ab: feetToFieldState(abFt, nextUnit),
      bc: feetToFieldState(bcFt, nextUnit),
      cd: feetToFieldState(cdFt, nextUnit),
      da: feetToFieldState(daFt, nextUnit),
      diagonal: feetToFieldState(diagonalFt, nextUnit),
    });
    setUnit(nextUnit);
  };

  const updateEdgeField = (key: EdgeKey, part: 'main' | 'inches', value: string) => {
    setInputs((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [part]: value,
      },
    }));
  };

  const handleApplyPreset = (preset: PlotPreset) => {
    setInputs({
      ab: feetToFieldState(preset.abFt, unit),
      bc: feetToFieldState(preset.bcFt, unit),
      cd: feetToFieldState(preset.cdFt, unit),
      da: feetToFieldState(preset.daFt, unit),
      diagonal: feetToFieldState(preset.diagonalFt, unit),
    });
    setDiagonalType(preset.diagonalType);
    setShapeMode('convex');
    setPlotName(lang === 'bn' ? preset.labelBn : preset.labelEn);
    setMouza(preset.mouza);
    setDagNo(preset.dagNo);
    setKhatianNo('');
    setNorthRotationDeg(0);
  };

  const handleReset = () => {
    setInputs({
      ab: { main: '', inches: '' },
      bc: { main: '', inches: '' },
      cd: { main: '', inches: '' },
      da: { main: '', inches: '' },
      diagonal: { main: '', inches: '' },
    });
    setPlotName('');
    setMouza('');
    setDagNo('');
    setKhatianNo('');
    setShapeMode('convex');
    inputRefs.current.ab?.focus();
  };

  const handleUseMidpointDiagonal = (midpointFt: number) => {
    setInputs((prev) => ({
      ...prev,
      diagonal: feetToFieldState(midpointFt, unit),
    }));
  };

  const handleRightAngleDiagonal = () => {
    const leg1 = abFt;
    const leg2 = diagonalType === 'AC' ? bcFt : daFt;
    if (leg1 <= 0 || leg2 <= 0) return;
    const rightDiag = Math.hypot(leg1, leg2);
    setInputs((prev) => ({
      ...prev,
      diagonal: feetToFieldState(rightDiag, unit),
    }));
  };

  const canComputeRightAngle =
    abFt > 0 && (diagonalType === 'AC' ? bcFt > 0 : daFt > 0);

  const handleSelectEdgeOnDiagram = (edge: EdgeKey) => {
    setActiveEdge(edge);
    const el = inputRefs.current[edge];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleScrollToDiagram = () => {
    diagramSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSaveLocally = () => {
    if (!geometry.valid) return;
    const defaultName =
      plotName.trim() ||
      (mouza.trim()
        ? `${mouza.trim()}${dagNo.trim() ? ` · ${t.dagLabel} ${dagNo.trim()}` : ''}`
        : `${formatNumber(area.shotok, 2)} ${t.unitShotok}`);

    const record: SavedPlotRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: defaultName,
      mouza: mouza.trim(),
      dagNo: dagNo.trim(),
      khatianNo: khatianNo.trim(),
      unit,
      abFt,
      bcFt,
      cdFt,
      daFt,
      diagonalFt,
      diagonalType,
      shapeMode,
      northRotationDeg,
      areaSqFt: geometry.areaSqFt,
      updatedAt: new Date().toISOString(),
    };

    setSavedPlots((prev) => [record, ...prev]);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleLoadSavedPlot = (record: SavedPlotRecord) => {
    setUnit(record.unit);
    setInputs({
      ab: feetToFieldState(record.abFt, record.unit),
      bc: feetToFieldState(record.bcFt, record.unit),
      cd: feetToFieldState(record.cdFt, record.unit),
      da: feetToFieldState(record.daFt, record.unit),
      diagonal: feetToFieldState(record.diagonalFt, record.unit),
    });
    setDiagonalType(record.diagonalType);
    setShapeMode(record.shapeMode);
    setPlotName(record.name);
    setMouza(record.mouza);
    setDagNo(record.dagNo);
    setKhatianNo(record.khatianNo);
    setNorthRotationDeg(record.northRotationDeg ?? 0);
    setView('calculator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSavedPlot = (id: string) => {
    setSavedPlots((prev) => prev.filter((p) => p.id !== id));
  };

  const handleImportPlots = (records: SavedPlotRecord[]) => {
    setSavedPlots((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const merged = [...records.filter((r) => !existingIds.has(r.id)), ...prev];
      return merged;
    });
  };

  const handleQuickDownloadPng = async () => {
    if (!geometry.valid) return;
    setDownloadingPng(true);
    try {
      const blob = await renderSurveyPNGBlob(geometry, area, diagramMeta, lang);
      if (blob) {
        const base =
          (plotName.trim() || 'bhumimap-survey')
            .toLowerCase()
            .replace(/[^a-z0-9\u0980-\u09ff]+/gi, '-')
            .replace(/^-|-$/g, '') || 'bhumimap-survey';
        triggerLocalDownload(blob, `${base}.png`);
      }
    } finally {
      setDownloadingPng(false);
    }
  };

  const handlePrint = () => {
    if (!geometry.valid) return;
    if (view !== 'calculator') {
      setView('calculator');
      setTimeout(() => window.print(), 100);
    } else {
      window.print();
    }
  };

  const edgeOrder: EdgeKey[] = ['ab', 'bc', 'cd', 'da', 'diagonal'];
  const handleEnterAdvance = (key: EdgeKey, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const idx = edgeOrder.indexOf(key);
      if (idx === edgeOrder.length - 1) {
        e.currentTarget.blur();
        return;
      }
      const nextKey = edgeOrder[idx + 1];
      inputRefs.current[nextKey]?.focus();
    }
  };

  const sideRows: Array<{ key: Exclude<EdgeKey, 'diagonal'>; label: string; dir: string }> = [
    { key: 'ab', label: t.sideAB, dir: t.dirNorth },
    { key: 'bc', label: t.sideBC, dir: t.dirEast },
    { key: 'cd', label: t.sideCD, dir: t.dirSouth },
    { key: 'da', label: t.sideDA, dir: t.dirWest },
  ];

  const unitOptions: Array<{ value: LengthUnit; label: string }> = [
    { value: 'ft', label: 'ft' },
    { value: 'ft-in', label: 'ft-in' },
    { value: 'm', label: 'm' },
    { value: 'link', label: 'links' },
    { value: 'haat', label: 'haat' },
  ];

  const { bigha: cBigha, katha: cKatha, chotak: cChotak } = area.compoundBighaKathaChotak;
  const diagonalRange = geometry.validDiagonalRange;
  const diagonalMidpoint = diagonalRange ? (diagonalRange.min + diagonalRange.max) / 2 : null;

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* Compact Sticky Header: 48px on mobile, 3-zone 56px contract on md+ */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 no-print">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-12 md:h-14 flex items-center justify-between gap-4 md:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setView('calculator')}
            className="text-base md:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer min-h-[44px] flex items-center"
          >
            {t.brand}
          </button>

          {/* Zone 2 (Desktop): 4 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            <button
              type="button"
              onClick={() => setView('calculator')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'calculator'
                  ? 'text-teal-900 border-b-2 border-teal-800'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.navCalculator}
            </button>
            <button
              type="button"
              onClick={() => setView('saved')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'saved'
                  ? 'text-teal-900 border-b-2 border-teal-800'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.navSaved}
              {savedPlots.length > 0 ? ` (${savedPlots.length})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setView('units')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'units'
                  ? 'text-teal-900 border-b-2 border-teal-800'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.navUnits}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!geometry.valid}
              className="py-1 text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.printSheet}
            </button>
          </nav>

          {/* Zone 3 (Desktop): 1 primary CTA */}
          <div className="hidden md:flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              disabled={!geometry.valid}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-800 hover:bg-teal-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Share2 className="w-3.5 h-3.5" />
              {t.shareExport}
            </button>
          </div>

          {/* Mobile Right Slot: Clean Language Toggle */}
          <div
            className="inline-flex md:hidden items-center border border-slate-200 bg-white p-0.5 shrink-0"
            role="group"
            aria-label="Language switch"
          >
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('bn')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                lang === 'bn' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              বাংলা
            </button>
          </div>
        </div>
      </header>

      {/* Main Interactive Screen Content */}
      <main className="flex-1 pb-24 md:pb-8 no-print">
        {/* Desktop Utility Bar (Presets, PWA Install, Language) */}
        <div className="hidden md:block border-b border-slate-200 bg-slate-50/50">
          <div className="max-w-[1400px] mx-auto px-8 py-2.5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              {view === 'calculator' ? (
                <>
                  <span className="text-slate-500">{t.presetsLabel}:</span>
                  {SAMPLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="text-slate-700 hover:text-teal-800 underline underline-offset-4 decoration-slate-300 hover:decoration-teal-700 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {lang === 'bn' ? preset.labelBn : preset.labelEn}
                    </button>
                  ))}
                </>
              ) : (
                <span className="text-slate-500">{t.offlinePrivacyNote}</span>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <PWAInstallButton lang={lang} />
              <div
                className="inline-flex items-center border border-slate-200 bg-white p-0.5"
                role="group"
                aria-label="Language switch"
              >
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang('bn')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    lang === 'bn' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  বাংলা
                </button>
              </div>
            </div>
          </div>
        </div>

        {view === 'saved' && (
          <SavedPlotsView
            plots={savedPlots}
            lang={lang}
            onLoadPlot={handleLoadSavedPlot}
            onDeletePlot={handleDeleteSavedPlot}
            onImportPlots={handleImportPlots}
          />
        )}

        {view === 'units' && <UnitReferenceView lang={lang} />}

        {view === 'calculator' && (
          <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
            {/* MOBILE LIVE RESULT SUMMARY STRIP (Visible immediately above inputs without scrolling) */}
            <div className="lg:hidden pt-4 pb-4 border-b border-slate-200">
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <div className="text-[11px] font-medium text-slate-500 truncate">
                    {t.unitShotok}
                  </div>
                  <div className="mt-0.5 text-lg sm:text-xl font-mono font-semibold tabular-nums text-teal-900">
                    {geometry.valid ? formatNumber(area.shotok, 2) : '—'}
                  </div>
                </div>
                <div className="border-l border-slate-200 pl-2.5">
                  <div className="text-[11px] font-medium text-slate-500 truncate">
                    {t.unitKatha}
                  </div>
                  <div className="mt-0.5 text-lg sm:text-xl font-mono font-semibold tabular-nums text-slate-900">
                    {geometry.valid ? formatNumber(area.katha, 2) : '—'}
                  </div>
                </div>
                <div className="border-l border-slate-200 pl-2.5">
                  <div className="text-[11px] font-medium text-slate-500 truncate">
                    {t.unitBigha}
                  </div>
                  <div className="mt-0.5 text-lg sm:text-xl font-mono font-semibold tabular-nums text-slate-900">
                    {geometry.valid ? formatNumber(area.bigha, 3) : '—'}
                  </div>
                </div>
                <div className="border-l border-slate-200 pl-2.5">
                  <div className="text-[11px] font-medium text-slate-500 truncate">
                    {t.unitSqFt}
                  </div>
                  <div className="mt-0.5 text-lg sm:text-xl font-mono font-semibold tabular-nums text-slate-900">
                    {geometry.valid ? formatNumber(area.sqFt, 0) : '—'}
                  </div>
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="font-mono tabular-nums text-slate-600 truncate">
                  {geometry.valid
                    ? `${cBigha} ${t.unitBigha}, ${cKatha} ${t.unitKatha}, ${formatNumber(cChotak, 1)} ${t.unitChotak}`
                    : t.errMissing}
                </span>
                {geometry.valid && (
                  <button
                    type="button"
                    onClick={handleScrollToDiagram}
                    className="text-xs font-medium text-teal-800 hover:text-teal-950 whitespace-nowrap shrink-0 py-1 pl-2"
                  >
                    {t.jumpToDiagram}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-stretch">
              {/* LEFT COLUMN: Effortless Measurement Inputs */}
              <aside className="w-full lg:w-[390px] xl:w-[420px] shrink-0 py-5 lg:py-7 lg:pr-8 lg:border-r border-slate-200 space-y-6">
                {/* Mobile Horizontal Presets + PWA Install */}
                <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  <PWAInstallButton lang={lang} />
                  {SAMPLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="min-h-[36px] px-3 py-1.5 text-xs text-slate-700 border border-slate-200 bg-slate-50/70 active:bg-slate-100 whitespace-nowrap shrink-0"
                    >
                      {lang === 'bn' ? preset.labelBn : preset.labelEn}
                    </button>
                  ))}
                </div>

                {/* Input Unit Selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700">
                      {t.inputUnitLabel}
                    </label>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="min-h-[36px] px-2 -mr-2 text-xs text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                    >
                      {t.resetFields}
                    </button>
                  </div>
                  <div className="grid grid-cols-5 border border-slate-200 bg-slate-50/70 p-0.5">
                    {unitOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleUnitChange(opt.value)}
                        className={`min-h-[42px] py-1.5 text-xs font-mono font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          unit === opt.value
                            ? 'bg-white text-teal-900 font-semibold border border-slate-200'
                            : 'text-slate-600 hover:text-slate-900 border border-transparent'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile Interactive Mini Boundary Guide */}
                <div className="lg:hidden">
                  <MiniPlotGuide
                    activeEdge={activeEdge}
                    diagonalType={diagonalType}
                    abFt={abFt}
                    bcFt={bcFt}
                    cdFt={cdFt}
                    daFt={daFt}
                    diagonalFt={diagonalFt}
                    unit={unit}
                    lang={lang}
                    onSelectEdge={handleSelectEdgeOnDiagram}
                  />
                </div>

                {/* Step 1: Four Boundary Sides */}
                <div>
                  <h2 className="text-xs font-semibold text-slate-700 mb-3">{t.stepSides}</h2>
                  <div className="space-y-3">
                    {sideRows.map((row) => {
                      const isActive = activeEdge === row.key;
                      return (
                        <div
                          key={row.key}
                          onMouseEnter={() => setActiveEdge(row.key)}
                          onMouseLeave={() =>
                            setActiveEdge((curr) => (curr === row.key ? null : curr))
                          }
                          className="flex items-center justify-between gap-3"
                        >
                          <label
                            htmlFor={`input-${row.key}`}
                            className="flex flex-col min-w-[100px] sm:min-w-[112px]"
                          >
                            <span
                              className={`text-sm font-medium transition-colors ${
                                isActive ? 'text-teal-900' : 'text-slate-900'
                              }`}
                            >
                              {row.label}
                            </span>
                            <span className="text-[11px] text-slate-400">{row.dir}</span>
                          </label>

                          {unit === 'ft-in' ? (
                            <div className="flex items-center gap-2 flex-1">
                              <div className="relative flex-1">
                                <input
                                  id={`input-${row.key}`}
                                  ref={(el) => {
                                    inputRefs.current[row.key] = el;
                                  }}
                                  type="number"
                                  inputMode="decimal"
                                  enterKeyHint="next"
                                  min="0"
                                  step="any"
                                  value={inputs[row.key].main}
                                  onFocus={() => setActiveEdge(row.key)}
                                  onBlur={() => setActiveEdge(null)}
                                  onChange={(e) => updateEdgeField(row.key, 'main', e.target.value)}
                                  onKeyDown={(e) => handleEnterAdvance(row.key, e)}
                                  placeholder="0"
                                  className={`w-full min-h-[46px] pl-3 pr-8 py-2 text-base sm:text-sm font-mono tabular-nums text-right border bg-white focus:outline-none transition-colors ${
                                    isActive
                                      ? 'border-teal-800'
                                      : 'border-slate-300 hover:border-slate-400'
                                  }`}
                                />
                                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                                  {t.ftPlaceholder}
                                </span>
                              </div>
                              <div className="relative w-24">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  enterKeyHint="next"
                                  min="0"
                                  max="11.99"
                                  step="any"
                                  value={inputs[row.key].inches}
                                  onFocus={() => setActiveEdge(row.key)}
                                  onBlur={() => setActiveEdge(null)}
                                  onChange={(e) =>
                                    updateEdgeField(row.key, 'inches', e.target.value)
                                  }
                                  onKeyDown={(e) => handleEnterAdvance(row.key, e)}
                                  placeholder="0"
                                  aria-label={`${row.label} inches`}
                                  className={`w-full min-h-[46px] pl-2.5 pr-7 py-2 text-base sm:text-sm font-mono tabular-nums text-right border bg-white focus:outline-none transition-colors ${
                                    isActive
                                      ? 'border-teal-800'
                                      : 'border-slate-300 hover:border-slate-400'
                                  }`}
                                />
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                                  {t.inPlaceholder}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="relative flex-1">
                              <input
                                id={`input-${row.key}`}
                                ref={(el) => {
                                  inputRefs.current[row.key] = el;
                                }}
                                type="number"
                                inputMode="decimal"
                                enterKeyHint="next"
                                min="0"
                                step="any"
                                value={inputs[row.key].main}
                                onFocus={() => setActiveEdge(row.key)}
                                onBlur={() => setActiveEdge(null)}
                                onChange={(e) => updateEdgeField(row.key, 'main', e.target.value)}
                                onKeyDown={(e) => handleEnterAdvance(row.key, e)}
                                placeholder="0.00"
                                className={`w-full min-h-[46px] pl-3.5 pr-12 py-2 text-base sm:text-sm font-mono tabular-nums text-right border bg-white focus:outline-none transition-colors ${
                                  isActive
                                    ? 'border-teal-800'
                                    : 'border-slate-300 hover:border-slate-400'
                                }`}
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                                {getUnitShortLabel(unit)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: Diagonal Measurement */}
                <div className="pt-5 border-t border-slate-200">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-xs font-semibold text-slate-700">{t.stepDiagonal}</h2>
                    <div className="flex items-center gap-2">
                      {canComputeRightAngle && (
                        <button
                          type="button"
                          onClick={handleRightAngleDiagonal}
                          className="min-h-[34px] px-2 text-[11px] font-medium text-teal-800 hover:text-teal-950 underline underline-offset-4 decoration-teal-800/40 cursor-pointer whitespace-nowrap"
                          title="Calculate diagonal assuming a 90° corner"
                        >
                          {t.auto90Corner}
                        </button>
                      )}
                      <div className="inline-flex border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setDiagonalType('AC')}
                          className={`min-h-[34px] px-2.5 py-1 font-mono font-medium transition-colors cursor-pointer ${
                            diagonalType === 'AC'
                              ? 'bg-white text-teal-900 font-semibold border border-slate-200'
                              : 'text-slate-600 border border-transparent'
                          }`}
                        >
                          A–C
                        </button>
                        <button
                          type="button"
                          onClick={() => setDiagonalType('BD')}
                          className={`min-h-[34px] px-2.5 py-1 font-mono font-medium transition-colors cursor-pointer ${
                            diagonalType === 'BD'
                              ? 'bg-white text-teal-900 font-semibold border border-slate-200'
                              : 'text-slate-600 border border-transparent'
                          }`}
                        >
                          B–D
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    onMouseEnter={() => setActiveEdge('diagonal')}
                    onMouseLeave={() =>
                      setActiveEdge((curr) => (curr === 'diagonal' ? null : curr))
                    }
                    className="flex items-center justify-between gap-3"
                  >
                    <label
                      htmlFor="input-diagonal"
                      className="text-sm font-medium text-teal-900 min-w-[100px] sm:min-w-[112px]"
                    >
                      {diagonalType === 'AC' ? t.diagonalAC : t.diagonalBD}
                    </label>

                    {unit === 'ft-in' ? (
                      <div className="flex items-center gap-2 flex-1">
                        <div className="relative flex-1">
                          <input
                            id="input-diagonal"
                            ref={(el) => {
                              inputRefs.current.diagonal = el;
                            }}
                            type="number"
                            inputMode="decimal"
                            enterKeyHint="done"
                            min="0"
                            step="any"
                            value={inputs.diagonal.main}
                            onFocus={() => setActiveEdge('diagonal')}
                            onBlur={() => setActiveEdge(null)}
                            onChange={(e) => updateEdgeField('diagonal', 'main', e.target.value)}
                            onKeyDown={(e) => handleEnterAdvance('diagonal', e)}
                            placeholder="0"
                            className="w-full min-h-[46px] pl-3 pr-8 py-2 text-base sm:text-sm font-mono tabular-nums text-right border border-teal-800/60 bg-teal-50/20 focus:border-teal-800 focus:outline-none"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                            {t.ftPlaceholder}
                          </span>
                        </div>
                        <div className="relative w-24">
                          <input
                            type="number"
                            inputMode="decimal"
                            enterKeyHint="done"
                            min="0"
                            max="11.99"
                            step="any"
                            value={inputs.diagonal.inches}
                            onFocus={() => setActiveEdge('diagonal')}
                            onBlur={() => setActiveEdge(null)}
                            onChange={(e) => updateEdgeField('diagonal', 'inches', e.target.value)}
                            onKeyDown={(e) => handleEnterAdvance('diagonal', e)}
                            placeholder="0"
                            aria-label="Diagonal inches"
                            className="w-full min-h-[46px] pl-2.5 pr-7 py-2 text-base sm:text-sm font-mono tabular-nums text-right border border-teal-800/60 bg-teal-50/20 focus:border-teal-800 focus:outline-none"
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                            {t.inPlaceholder}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex-1">
                        <input
                          id="input-diagonal"
                          ref={(el) => {
                            inputRefs.current.diagonal = el;
                          }}
                          type="number"
                          inputMode="decimal"
                          enterKeyHint="done"
                          min="0"
                          step="any"
                          value={inputs.diagonal.main}
                          onFocus={() => setActiveEdge('diagonal')}
                          onBlur={() => setActiveEdge(null)}
                          onChange={(e) => updateEdgeField('diagonal', 'main', e.target.value)}
                          onKeyDown={(e) => handleEnterAdvance('diagonal', e)}
                          placeholder="0.00"
                          className="w-full min-h-[46px] pl-3.5 pr-12 py-2 text-base sm:text-sm font-mono tabular-nums text-right border border-teal-800/60 bg-teal-50/20 focus:border-teal-800 focus:outline-none"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                          {getUnitShortLabel(unit)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Inline diagonal error helper right beneath the field */}
                  {!geometry.valid && diagonalRange && diagonalMidpoint && (
                    <div className="mt-3 p-3 border border-amber-200 bg-amber-50/60 text-xs text-slate-800 flex flex-col gap-2">
                      <p className="font-mono tabular-nums">
                        {t.validRangeLabel} ({diagonalType}):{' '}
                        <span className="font-semibold">
                          {formatLengthFromFeet(diagonalRange.min, unit, true)} –{' '}
                          {formatLengthFromFeet(diagonalRange.max, unit, true)}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => handleUseMidpointDiagonal(diagonalMidpoint)}
                        className="self-start min-h-[36px] px-3 py-1.5 text-xs font-medium text-white bg-teal-800 hover:bg-teal-900 cursor-pointer"
                      >
                        {t.useMidpointBtn} ({formatLengthFromFeet(diagonalMidpoint, unit, true)})
                      </button>
                    </div>
                  )}
                </div>

                {/* Collapsible Advanced Options (Plot Geometry & Survey Record) */}
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowGeometryMode((v) => !v)}
                      className="w-full min-h-[40px] flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{t.advancedGeometry}</span>
                      <span className="font-mono text-slate-400">
                        {showGeometryMode ? '−' : '+'}
                      </span>
                    </button>

                    {showGeometryMode && (
                      <div className="mt-2 pb-1 flex items-center justify-between text-xs">
                        <span className="text-slate-500">
                          {shapeMode === 'convex' ? t.shapeConvex : t.shapeConcave}
                        </span>
                        <div className="inline-flex border border-slate-200 bg-slate-50 p-0.5">
                          <button
                            type="button"
                            onClick={() => setShapeMode('convex')}
                            className={`min-h-[36px] px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                              shapeMode === 'convex'
                                ? 'bg-white text-slate-900 border border-slate-200'
                                : 'text-slate-500 border border-transparent'
                            }`}
                          >
                            {t.shapeConvex}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShapeMode('concave')}
                            disabled={
                              geometry.valid && !geometry.canBeConcave && shapeMode === 'convex'
                            }
                            className={`min-h-[36px] px-3 py-1 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              shapeMode === 'concave'
                                ? 'bg-white text-slate-900 border border-slate-200'
                                : 'text-slate-500 border border-transparent'
                            }`}
                          >
                            {t.shapeConcave}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRecordFields((v) => !v)}
                      className="w-full min-h-[40px] flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{t.plotDetailsHeading}</span>
                      <span className="font-mono text-slate-400">
                        {showRecordFields ? '−' : '+'}
                      </span>
                    </button>

                    {showRecordFields && (
                      <div className="mt-2.5 space-y-3">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">
                            {t.plotNameLabel}
                          </label>
                          <input
                            type="text"
                            value={plotName}
                            onChange={(e) => setPlotName(e.target.value)}
                            placeholder={t.plotNamePlaceholder}
                            className="w-full min-h-[42px] px-3 py-2 text-base sm:text-sm border border-slate-300 focus:border-teal-800 focus:outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">
                              {t.mouzaLabel}
                            </label>
                            <input
                              type="text"
                              value={mouza}
                              onChange={(e) => setMouza(e.target.value)}
                              placeholder={t.mouzaPlaceholder}
                              className="w-full min-h-[42px] px-2.5 py-2 text-sm sm:text-xs border border-slate-300 focus:border-teal-800 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">
                              {t.dagLabel}
                            </label>
                            <input
                              type="text"
                              value={dagNo}
                              onChange={(e) => setDagNo(e.target.value)}
                              placeholder={t.dagPlaceholder}
                              className="w-full min-h-[42px] px-2.5 py-2 text-sm sm:text-xs font-mono border border-slate-300 focus:border-teal-800 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">
                              {t.khatianLabel}
                            </label>
                            <input
                              type="text"
                              value={khatianNo}
                              onChange={(e) => setKhatianNo(e.target.value)}
                              placeholder={t.khatianPlaceholder}
                              className="w-full min-h-[42px] px-2.5 py-2 text-sm sm:text-xs font-mono border border-slate-300 focus:border-teal-800 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Local Action Row */}
                <div className="pt-1 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveLocally}
                    disabled={!geometry.valid}
                    className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm sm:text-xs font-medium text-slate-900 border border-slate-300 hover:border-slate-900 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {justSaved ? (
                      <>
                        <Check className="w-4 h-4 text-teal-800" />
                        {t.savedConfirmation}
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {t.savePlot}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareModalOpen(true)}
                    disabled={!geometry.valid}
                    className="lg:hidden flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-800 hover:bg-teal-900 active:bg-teal-950 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Share2 className="w-4 h-4" />
                    {t.shareExport}
                  </button>
                </div>
              </aside>

              {/* RIGHT COLUMN: Desktop Live Results & Scaled Survey Diagram */}
              <section
                ref={diagramSectionRef}
                className="flex-1 min-w-0 py-6 lg:py-7 lg:pl-10 space-y-6 border-t lg:border-t-0 border-slate-200 scroll-mt-14"
              >
                {/* Desktop Hero 4-Unit Bangladeshi Area Strip */}
                <div className="hidden lg:grid grid-cols-4 border-b border-slate-200 pb-6 gap-y-5">
                  <div className="pr-4">
                    <div className="text-xs font-medium text-slate-500">{t.unitShotok}</div>
                    <div className="mt-1.5 text-[32px] font-mono font-semibold tabular-nums tracking-tight text-teal-900">
                      {geometry.valid ? formatNumber(area.shotok, 3) : '—'}
                    </div>
                  </div>
                  <div className="border-l border-slate-200 pl-5 pr-4">
                    <div className="text-xs font-medium text-slate-500">{t.unitKatha}</div>
                    <div className="mt-1.5 text-[32px] font-mono font-semibold tabular-nums tracking-tight text-slate-900">
                      {geometry.valid ? formatNumber(area.katha, 3) : '—'}
                    </div>
                  </div>
                  <div className="border-l border-slate-200 pl-5 pr-4">
                    <div className="text-xs font-medium text-slate-500">{t.unitBigha}</div>
                    <div className="mt-1.5 text-[32px] font-mono font-semibold tabular-nums tracking-tight text-slate-900">
                      {geometry.valid ? formatNumber(area.bigha, 4) : '—'}
                    </div>
                  </div>
                  <div className="border-l border-slate-200 pl-5">
                    <div className="text-xs font-medium text-slate-500">{t.unitSqFt}</div>
                    <div className="mt-1.5 text-[32px] font-mono font-semibold tabular-nums tracking-tight text-slate-900">
                      {geometry.valid ? formatNumber(area.sqFt, 2) : '—'}
                    </div>
                  </div>
                </div>

                {/* Unboxed Secondary Units & Breakdown Line */}
                {geometry.valid && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
                    <span className="font-mono tabular-nums text-slate-900 font-medium">
                      {cBigha} {t.unitBigha}, {cKatha} {t.unitKatha}, {formatNumber(cChotak, 2)}{' '}
                      {t.unitChotak}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatNumber(area.acre, 4)} {t.unitAcre}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatNumber(area.sqMeter, 2)} m²
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono tabular-nums">
                      {t.perimeter}: {formatLengthFromFeet(geometry.perimeterFt, unit, true)}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono tabular-nums">
                      {diagonalType === 'AC' ? 'B–D' : 'A–C'}:{' '}
                      {formatLengthFromFeet(geometry.otherDiagonalFt, unit, true)}
                    </span>
                  </div>
                )}

                {/* Diagram Display Controls Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowTriangulation((v) => !v)}
                      className={`min-h-[40px] px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                        showTriangulation
                          ? 'border-teal-800/40 bg-teal-50/60 text-teal-900'
                          : 'border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.diagramTriangles}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAngles((v) => !v)}
                      className={`min-h-[40px] px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                        showAngles
                          ? 'border-teal-800/40 bg-teal-50/60 text-teal-900'
                          : 'border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.diagramAngles}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGrid((v) => !v)}
                      className={`min-h-[40px] px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                        showGrid
                          ? 'border-teal-800/40 bg-teal-50/60 text-teal-900'
                          : 'border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.diagramGrid}
                    </button>

                    {/* Compass North Bearing Control */}
                    <div className="inline-flex items-center border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setNorthRotationDeg((d) => (d - 15 + 360) % 360)}
                        aria-label="Rotate North counter-clockwise"
                        className="min-h-[40px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setNorthRotationDeg(0)}
                        className="min-h-[40px] inline-flex items-center gap-1 px-2 text-[11px] font-mono tabular-nums text-slate-700 hover:text-teal-900 cursor-pointer"
                        title="Reset North bearing"
                      >
                        <Compass className="w-3.5 h-3.5 text-teal-800" />
                        {northRotationDeg}°
                      </button>
                      <button
                        type="button"
                        onClick={() => setNorthRotationDeg((d) => (d + 15) % 360)}
                        aria-label="Rotate North clockwise"
                        className="min-h-[40px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Quick Output Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrint}
                      disabled={!geometry.valid}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-400 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {t.printSheet}
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickDownloadPng}
                      disabled={!geometry.valid || downloadingPng}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-400 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PNG
                    </button>
                  </div>
                </div>

                {/* Live Interactive Vector Plot Diagram */}
                <PlotDiagram
                  geometry={geometry}
                  abFt={abFt}
                  bcFt={bcFt}
                  cdFt={cdFt}
                  daFt={daFt}
                  diagonalFt={diagonalFt}
                  diagonalType={diagonalType}
                  unit={unit}
                  lang={lang}
                  northRotationDeg={northRotationDeg}
                  showAngles={showAngles}
                  showTriangulation={showTriangulation}
                  showGrid={showGrid}
                  activeEdge={activeEdge}
                  onSelectEdge={handleSelectEdgeOnDiagram}
                  onUseMidpointDiagonal={handleUseMidpointDiagonal}
                />

                {/* Mathematical Breakdown & Survey Accuracy Proof */}
                {geometry.valid && geometry.triangle1 && geometry.triangle2 && geometry.anglesDeg && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-200">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900 mb-3">
                        {t.triangulationHeading}
                      </h3>
                      <div className="space-y-2.5 text-xs">
                        <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-slate-100">
                          <div>
                            <span className="font-mono font-semibold text-slate-900">
                              {geometry.triangle1.label}
                            </span>
                            <span className="ml-2 text-slate-500 font-mono tabular-nums">
                              s = {formatNumber(geometry.triangle1.semiPerimeter, 2)} ft
                            </span>
                          </div>
                          <span className="font-mono tabular-nums font-medium text-slate-900">
                            {formatNumber(geometry.triangle1.areaSqFt, 2)} sq ft
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-slate-100">
                          <div>
                            <span className="font-mono font-semibold text-slate-900">
                              {geometry.triangle2.label}
                            </span>
                            <span className="ml-2 text-slate-500 font-mono tabular-nums">
                              s = {formatNumber(geometry.triangle2.semiPerimeter, 2)} ft
                            </span>
                          </div>
                          <span className="font-mono tabular-nums font-medium text-slate-900">
                            {shapeMode === 'concave' ? '± ' : '+ '}
                            {formatNumber(geometry.triangle2.areaSqFt, 2)} sq ft
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between gap-4 pt-0.5">
                          <span className="font-medium text-teal-900">
                            {t.unitSqFt} ({shapeMode === 'convex' ? 'T1 + T2' : '|T1 − T2|'})
                          </span>
                          <span className="font-mono tabular-nums font-semibold text-teal-900">
                            {formatNumber(geometry.areaSqFt, 2)} sq ft
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900 mb-2.5">
                          {t.interiorAngles}
                        </h3>
                        <div className="grid grid-cols-4 gap-2 font-mono tabular-nums text-xs">
                          <div className="py-1.5 border-b border-slate-200">
                            <span className="text-slate-400 mr-1">A</span>
                            <span className="font-medium text-slate-900">
                              {geometry.anglesDeg.A.toFixed(1)}°
                            </span>
                          </div>
                          <div className="py-1.5 border-b border-slate-200">
                            <span className="text-slate-400 mr-1">B</span>
                            <span className="font-medium text-slate-900">
                              {geometry.anglesDeg.B.toFixed(1)}°
                            </span>
                          </div>
                          <div className="py-1.5 border-b border-slate-200">
                            <span className="text-slate-400 mr-1">C</span>
                            <span className="font-medium text-slate-900">
                              {geometry.anglesDeg.C.toFixed(1)}°
                            </span>
                          </div>
                          <div className="py-1.5 border-b border-slate-200">
                            <span className="text-slate-400 mr-1">D</span>
                            <span className="font-medium text-slate-900">
                              {geometry.anglesDeg.D.toFixed(1)}°
                            </span>
                          </div>
                        </div>
                      </div>

                      {Math.abs(geometry.averageOverestimatePct) >= 0.05 && (
                        <div className="text-xs text-slate-600 leading-relaxed">
                          <span className="font-medium text-slate-800">{t.naiveWarningTitle}:</span>{' '}
                          {t.naiveWarningBody}{' '}
                          <span className="font-mono tabular-nums text-slate-900 font-medium">
                            {formatNumber(geometry.averageMethodSqFt, 1)} sq ft
                          </span>{' '}
                          (
                          <span className="font-mono tabular-nums text-amber-700 font-medium">
                            {geometry.averageOverestimatePct > 0 ? '+' : ''}
                            {geometry.averageOverestimatePct.toFixed(2)}%
                          </span>
                          ).
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Quiet Local-Only Footer (Desktop & above bottom bar on mobile) */}
      <footer className="border-t border-slate-200 mt-auto mb-16 md:mb-0 no-print">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-500">
          <span>{t.offlinePrivacyNote}</span>
          <span className="font-mono tabular-nums text-[11px] text-slate-400">
            1 Shotok = 435.6 sq ft · 1 Katha = 720 sq ft · 1 Bigha = 14,400 sq ft
          </span>
        </div>
      </footer>

      {/* Mobile Fixed Thumb-Zone Bottom Tab Bar */}
      <nav
        aria-label="Primary mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe no-print"
      >
        <div className="grid grid-cols-4 h-[58px] items-center">
          <button
            type="button"
            onClick={() => setView('calculator')}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              view === 'calculator' ? 'text-teal-800' : 'text-slate-500'
            }`}
          >
            <Calculator className="w-5 h-5" />
            <span className="text-[10.5px] font-medium whitespace-nowrap">{t.navCalculator}</span>
          </button>

          <button
            type="button"
            onClick={() => setView('saved')}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              view === 'saved' ? 'text-teal-800' : 'text-slate-500'
            }`}
          >
            <FolderOpen className="w-5 h-5" />
            <span className="text-[10.5px] font-medium whitespace-nowrap">
              {t.navSavedShort}
              {savedPlots.length > 0 ? ` (${savedPlots.length})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setView('units')}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              view === 'units' ? 'text-teal-800' : 'text-slate-500'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-[10.5px] font-medium whitespace-nowrap">{t.navUnitsShort}</span>
          </button>

          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            disabled={!geometry.valid}
            className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-teal-800 disabled:opacity-40 transition-colors"
          >
            <Share2 className="w-5 h-5" />
            <span className="text-[10.5px] font-medium whitespace-nowrap">{t.navShareShort}</span>
          </button>
        </div>
      </nav>

      {/* Dedicated A4 Print Layout */}
      <PrintSheet
        geometry={geometry}
        area={area}
        plotName={plotName}
        mouza={mouza}
        dagNo={dagNo}
        khatianNo={khatianNo}
        abFt={abFt}
        bcFt={bcFt}
        cdFt={cdFt}
        daFt={daFt}
        diagonalFt={diagonalFt}
        diagonalType={diagonalType}
        unit={unit}
        lang={lang}
        northRotationDeg={northRotationDeg}
        showAngles={showAngles}
        showTriangulation={showTriangulation}
        showGrid={showGrid}
      />

      {/* Responsive Bottom Sheet (Mobile) / Modal (Desktop) for Print & Share */}
      <ShareExportModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        geometry={geometry}
        area={area}
        meta={diagramMeta}
        lang={lang}
      />

      {/* Subtle Offline Connectivity Notice */}
      <OfflineIndicator lang={lang} />
    </div>
  );
}
