import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Compass,
  Download,
  HelpCircle,
  LayoutGrid,
  Lock,
  LockOpen,
  Redo2,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import {
  BuildingProject,
  ExperienceMode,
  PhysicsReport,
  UnitSystem,
  ViewMode,
} from '../types/building';
import { TEMPLATE_PRESETS } from '../engine/templates';
import { inch } from '../engine/units';

interface TopBarProps {
  project: BuildingProject;
  physics: PhysicsReport;
  viewMode: ViewMode;
  experienceMode: ExperienceMode;
  inspectorOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onChangeViewMode: (mode: ViewMode) => void;
  onRenameProject: (name: string) => void;
  onLoadTemplate: (templateId: string) => void;
  onChangeExperienceMode: (mode: ExperienceMode) => void;
  onChangeUnit: (unit: UnitSystem) => void;
  onChangeGridSnap: (snapMeters: number) => void;
  onToggleStrictLock: () => void;
  onToggleLayerLock: (layer: 'pillars' | 'beams' | 'walls' | 'slabs') => void;
  onToggleInspector: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenNewWizard: (initialStep?: 1 | 2) => void;
  onOpenTakeoff: () => void;
  onOpenHelp: () => void;
}

const VIEW_MODES: { id: ViewMode; label: string; short: string; keyHint: string }[] = [
  { id: '2d', label: '2D Plan', short: '2D', keyHint: '1' },
  { id: 'split', label: 'Split', short: 'Split', keyHint: '2' },
  { id: '2.5d', label: '2.5D', short: '2.5D', keyHint: '3' },
  { id: '3d', label: '3D', short: '3D', keyHint: '4' },
];

export const TopBar: React.FC<TopBarProps> = ({
  project,
  physics,
  viewMode,
  experienceMode,
  inspectorOpen,
  canUndo,
  canRedo,
  onChangeViewMode,
  onRenameProject,
  onLoadTemplate,
  onChangeExperienceMode,
  onChangeUnit,
  onChangeGridSnap,
  onToggleStrictLock,
  onToggleLayerLock,
  onToggleInspector,
  onUndo,
  onRedo,
  onOpenNewWizard,
  onOpenTakeoff,
  onOpenHelp,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const isPro = experienceMode === 'engineer';
  const hasCritical = physics.criticalCount > 0;
  const hasWarning = physics.warningCount > 0;
  const lockedLayers = project.lockedLayers ?? {};
  const lockedCount = (['pillars', 'walls', 'slabs', 'beams'] as const).filter(
    (k) => lockedLayers[k]
  ).length;

  const statusLabel = hasCritical
    ? `${physics.criticalCount} ${
        isPro
          ? physics.criticalCount === 1
            ? 'issue'
            : 'issues'
          : physics.criticalCount === 1
          ? 'check'
          : 'checks'
      }`
    : hasWarning
    ? `${physics.warningCount} ${physics.warningCount === 1 ? 'note' : 'notes'}`
    : isPro
    ? 'BNBC OK'
    : 'All Safe';

  const statusTone = hasCritical
    ? 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100'
    : hasWarning
    ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
    : 'text-emerald-700 bg-white border-slate-200 hover:border-slate-300';

  const snapPresets =
    project.unitSystem === 'imperial'
      ? [
          { label: '1"', value: inch(1) },
          { label: '3"', value: inch(3) },
          { label: '6"', value: inch(6) },
          { label: "1'", value: inch(12) },
        ]
      : [
          { label: '50 mm', value: 0.05 },
          { label: '100 mm', value: 0.1 },
          { label: '250 mm', value: 0.25 },
          { label: '500 mm', value: 0.5 },
        ];

  return (
    <header className="h-12 bg-white border-b border-slate-200 shrink-0 z-30 px-2.5 sm:px-3.5 flex items-center justify-between gap-2 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      {/* Left Zone: Brand Wordmark + Consolidated Project & Settings Menu */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[16px] sm:text-[17px] font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          BhumiMap
        </span>

        <span className="hidden sm:inline-block h-4 w-px bg-slate-200 shrink-0" aria-hidden="true" />

        <div className="relative min-w-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Project menu, plot setup, templates and studio settings"
            title="Project setup, templates, Homeowner/Pro CAD mode, units & layer locks"
            className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md border max-w-[155px] sm:max-w-[230px] transition-colors ${
              menuOpen
                ? 'bg-slate-900 text-white border-slate-900'
                : lockedCount > 0 || project.strictPhysicsLock
                ? 'bg-slate-50 text-slate-900 border-slate-300 hover:bg-slate-100'
                : 'bg-white text-slate-700 border-transparent hover:border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className="truncate">{project.name || 'Untitled Plan'}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
          </button>

          {menuOpen && (
            <div className="absolute left-0 mt-1.5 w-[min(21rem,calc(100vw-1rem))] max-h-[calc(100dvh-4.25rem)] overflow-y-auto studio-scroll bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 space-y-3.5 z-50">
              {/* Mobile Undo/Redo */}
              <div className="sm:hidden grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onUndo();
                    setMenuOpen(false);
                  }}
                  disabled={!canUndo}
                  className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md disabled:opacity-40"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRedo();
                    setMenuOpen(false);
                  }}
                  disabled={!canRedo}
                  className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md disabled:opacity-40"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                  Redo
                </button>
              </div>

              {/* Editable Project Name */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Project name
                </label>
                <input
                  type="text"
                  value={project.name}
                  onChange={(e) => onRenameProject(e.target.value)}
                  className="w-full text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Primary Project Setup Actions */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenNewWizard(1);
                  }}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                >
                  <Compass className="w-3.5 h-3.5 shrink-0" />
                  Land &amp; Plot
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenNewWizard(2);
                  }}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                >
                  <LayoutGrid className="w-3.5 h-3.5 shrink-0 text-slate-600" />
                  Templates
                </button>
              </div>

              {/* Progressive Disclosure: Homeowner vs Pro CAD Mode */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-900">
                    Workspace complexity
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {isPro ? 'Full CAD & BNBC' : 'Clean & simple'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                  <button
                    type="button"
                    onClick={() => onChangeExperienceMode('simple')}
                    className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                      !isPro
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Homeowner
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeExperienceMode('engineer')}
                    className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                      isPro
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Pro CAD
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  {isPro
                    ? 'Pins Split, Offset, Trim & Dim tools on the left rail and shows BNBC 2020 seismic & footing metrics.'
                    : 'Plain-English labels and essential tools up front. All pro CAD tools remain 1 click away under More.'}
                </p>
              </div>

              {/* Measurement Units & Grid Snap */}
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <div>
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">
                    Measurement units
                  </span>
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                    <button
                      type="button"
                      onClick={() => onChangeUnit('imperial')}
                      className={`py-1.5 text-xs font-medium rounded transition-colors ${
                        project.unitSystem === 'imperial'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Feet &amp; inches (BD)
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeUnit('metric')}
                      className={`py-1.5 text-xs font-medium rounded transition-colors ${
                        project.unitSystem === 'metric'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Meters / mm
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">
                    Grid snap step
                  </span>
                  <div className="grid grid-cols-4 gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                    {snapPresets.map((sp) => {
                      const active = Math.abs((project.gridSnap || inch(6)) - sp.value) < 0.008;
                      return (
                        <button
                          key={sp.label}
                          type="button"
                          onClick={() => onChangeGridSnap(sp.value)}
                          className={`py-1 text-[11px] font-mono tabular-nums font-medium rounded transition-colors ${
                            active
                              ? 'bg-white text-blue-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {sp.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Quick Switch Verified Templates */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <span className="block text-[11px] font-medium text-slate-500">
                  Quick switch starter plan
                </span>
                <select
                  aria-label="Quick switch Bangladeshi template"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      onLoadTemplate(e.target.value);
                      setMenuOpen(false);
                    }
                  }}
                  className="w-full text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 hover:border-slate-300 cursor-pointer"
                >
                  <option value="" disabled>
                    Choose a verified Bangladeshi plan...
                  </option>
                  {TEMPLATE_PRESETS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.landLabel})
                    </option>
                  ))}
                </select>
              </div>

              {/* Layer Locks & Strict Safety Lock */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <span className="block text-[11px] font-medium text-slate-500">
                  Lock layers (prevent accidental drag)
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'pillars', label: 'Columns' },
                      { id: 'walls', label: 'Walls' },
                      { id: 'slabs', label: 'Slabs' },
                      { id: 'beams', label: 'Beams' },
                    ] as const
                  ).map((layer) => {
                    const locked = Boolean(lockedLayers[layer.id]);
                    return (
                      <button
                        key={layer.id}
                        type="button"
                        onClick={() => onToggleLayerLock(layer.id)}
                        className={`flex items-center justify-between px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          locked
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span>{layer.label}</span>
                        {locked ? (
                          <Lock className="w-3 h-3" />
                        ) : (
                          <LockOpen className="w-3 h-3 opacity-50" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={onToggleStrictLock}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
                    project.strictPhysicsLock
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {project.strictPhysicsLock ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <LockOpen className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    Strict safety lock
                  </span>
                  <span className="text-[11px] opacity-80">
                    {project.strictPhysicsLock ? 'On' : 'Off'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center Zone: Clean 4-Way Viewport Switcher */}
      <div
        role="group"
        aria-label="Viewport mode"
        className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 shrink-0"
      >
        {VIEW_MODES.map((m) => {
          const active = viewMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChangeViewMode(m.id)}
              title={`${m.label} (${m.keyHint})`}
              className={`px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold rounded whitespace-nowrap transition-colors ${
                active ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="sm:hidden">{m.short}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right Zone: Undo/Redo, Quick Help, Safety/Inspector Toggle, Single Primary Export CTA */}
      <div className="flex items-center justify-end gap-1.5 min-w-0">
        <div className="hidden sm:flex items-center border border-slate-200 rounded-md bg-white shrink-0">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed border-r border-slate-200 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            className="p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenHelp}
          title="Studio Guide, Tool Explanations & Shortcuts (?)"
          aria-label="Open Studio Guide and Shortcuts"
          className="p-1.5 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-md shrink-0 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleInspector}
          title="Toggle Properties & Safety Check Inspector (I)"
          className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-md border whitespace-nowrap shrink-0 transition-colors ${
            inspectorOpen ? 'border-blue-600 bg-blue-50 text-blue-700' : statusTone
          }`}
        >
          {hasCritical ? (
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          ) : hasWarning ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="hidden sm:inline">{statusLabel}</span>
        </button>

        <button
          type="button"
          onClick={onOpenTakeoff}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export &amp; Print</span>
        </button>
      </div>
    </header>
  );
};
