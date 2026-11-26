import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  LayoutGrid,
  Lock,
  LockOpen,
  Plus,
  Redo2,
  ShieldAlert,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';
import {
  BuildingProject,
  ExperienceMode,
  GuidedStep,
  PhysicsReport,
  UnitSystem,
  ViewMode,
} from '../types/building';
import { TEMPLATE_PRESETS } from '../engine/templates';

interface TopBarProps {
  project: BuildingProject;
  physics: PhysicsReport;
  viewMode: ViewMode;
  experienceMode: ExperienceMode;
  guidedStep: GuidedStep;
  inspectorOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onChangeViewMode: (mode: ViewMode) => void;
  onSelectGuidedStep: (step: GuidedStep) => void;
  onRenameProject: (name: string) => void;
  onLoadTemplate: (templateId: string) => void;
  onChangeExperienceMode: (mode: ExperienceMode) => void;
  onChangeUnit: (unit: UnitSystem) => void;
  onToggleStrictLock: () => void;
  onToggleLayerLock: (layer: 'pillars' | 'beams' | 'walls' | 'slabs') => void;
  onToggleInspector: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenNewWizard: (initialStep?: 1 | 2) => void;
  onOpenTakeoff: () => void;
}

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: '2d', label: '2D Plan' },
  { id: 'split', label: 'Split' },
  { id: '2.5d', label: '2.5D' },
  { id: '3d', label: '3D' },
];

const GUIDED_STEPS: { id: GuidedStep; num: number; label: string; hint: string }[] = [
  { id: 'land', num: 1, label: 'Land & Law', hint: 'Plot size, road side & RAJUK setbacks' },
  { id: 'structure', num: 2, label: 'Structure', hint: 'RCC columns, drop beams & slabs' },
  { id: 'walls', num: 3, label: 'Walls & Curves', hint: 'Straight 5"/10" & curved arc walls' },
  { id: 'openings', num: 4, label: 'Doors & Stairs', hint: 'Doors, windows, shutters & cutouts' },
  { id: 'essentials', num: 5, label: 'Essentials', hint: 'Bangladeshi functional interiors & site' },
  { id: 'physics', num: 6, label: 'Physics & BOQ', hint: 'BNBC 2020 safety check & cost estimate' },
];

export const TopBar: React.FC<TopBarProps> = ({
  project,
  physics,
  viewMode,
  experienceMode,
  guidedStep,
  inspectorOpen,
  canUndo,
  canRedo,
  onChangeViewMode,
  onSelectGuidedStep,
  onRenameProject,
  onLoadTemplate,
  onChangeExperienceMode,
  onChangeUnit,
  onToggleStrictLock,
  onToggleLayerLock,
  onToggleInspector,
  onUndo,
  onRedo,
  onOpenNewWizard,
  onOpenTakeoff,
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
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const isEngineer = experienceMode === 'engineer';
  const hasCritical = physics.criticalCount > 0;
  const hasWarning = physics.warningCount > 0;
  const lockedLayers = project.lockedLayers ?? {};

  const statusLabel = hasCritical
    ? `${physics.criticalCount} ${physics.criticalCount === 1 ? 'issue' : 'issues'}`
    : hasWarning
    ? `${physics.warningCount} ${physics.warningCount === 1 ? 'note' : 'notes'}`
    : isEngineer
    ? 'BNBC OK'
    : 'Safe';

  const statusTone = hasCritical
    ? 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100'
    : hasWarning
    ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
    : 'text-emerald-700 bg-white border-slate-200 hover:border-slate-300';

  return (
    <div className="bg-white border-b border-slate-200 shrink-0 z-30">
      {/* Row 1: Primary Studio Header */}
      <header className="h-12 px-2.5 sm:px-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {/* Left Zone */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="text-[16px] sm:text-[17px] font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            BhumiMap
          </span>

          <button
            type="button"
            onClick={() => onOpenNewWizard(1)}
            title="Set land plot size, road side, and RAJUK setbacks"
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-blue-700" />
            <span className="hidden lg:inline">Land setup</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenNewWizard(2)}
            title="Browse 12 verified Bangladeshi architectural templates"
            className="hidden md:flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md whitespace-nowrap shrink-0 transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden xl:inline">Templates</span>
          </button>

          <span className="hidden 2xl:inline text-slate-300 select-none shrink-0" aria-hidden="true">
            /
          </span>
          <input
            type="text"
            value={project.name}
            onChange={(e) => onRenameProject(e.target.value)}
            aria-label="Project name"
            className="hidden 2xl:block text-xs font-medium text-slate-700 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-600 focus:bg-white px-1.5 py-1 min-w-0 w-48 truncate rounded"
          />
        </div>

        {/* Center Zone: View Mode Switcher */}
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
                className={`px-2 sm:px-3 py-1 text-xs font-semibold rounded whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Right Zone: Undo/Redo, Mode Switch, Safety Status, Options, Export */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
          {/* Quick Homeowner / Engineer Segmented Switch on desktop */}
          <div className="hidden xl:flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => onChangeExperienceMode('simple')}
              className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                experienceMode === 'simple'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Homeowner
            </button>
            <button
              type="button"
              onClick={() => onChangeExperienceMode('engineer')}
              className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                experienceMode === 'engineer'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Engineer
            </button>
          </div>

          <div className="hidden lg:flex items-center border border-slate-200 rounded-md bg-white shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed border-r border-slate-200 transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className="p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleInspector}
            title="Open Inspector, BNBC 2020 Physics & RAJUK Compliance"
            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-md border whitespace-nowrap shrink-0 transition-colors ${
              inspectorOpen
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : statusTone
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

          {/* Options Popover */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label="Studio settings and layer locks"
              title="Settings, Templates, Units & Layer Locks"
              className={`flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                menuOpen
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">Options</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-3.5 space-y-3.5 z-50">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Project name
                  </label>
                  <input
                    type="text"
                    value={project.name}
                    onChange={(e) => onRenameProject(e.target.value)}
                    className="w-full text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 focus:bg-white focus:border-blue-600"
                  />
                </div>

                {/* Quick Switch 12 Verified Templates */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-500">
                      Bangladeshi templates
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenNewWizard(2);
                      }}
                      className="text-[11px] font-semibold text-blue-700 hover:text-blue-800"
                    >
                      Open gallery
                    </button>
                  </div>
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
                      Switch verified template...
                    </option>
                    {TEMPLATE_PRESETS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.landLabel})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Homeowner vs Engineer */}
                <div>
                  <span className="block text-[11px] font-medium text-slate-500 mb-1">
                    Workspace mode
                  </span>
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
                    <button
                      type="button"
                      onClick={() => onChangeExperienceMode('simple')}
                      className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                        experienceMode === 'simple'
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
                        experienceMode === 'engineer'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Engineer
                    </button>
                  </div>
                </div>

                {/* Measurement Units */}
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

                {/* Structural Layer Locks (Zero Accidental Drag Protection) */}
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <span className="block text-[11px] font-medium text-slate-500">
                    Layer locks (prevent accidental drag)
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
                </div>

                {/* Strict Physics Lock */}
                <div className="pt-2 border-t border-slate-100">
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
                      Strict physics lock
                    </span>
                    <span className="text-[11px] opacity-80">
                      {project.strictPhysicsLock ? 'On' : 'Off'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenTakeoff}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">BOQ &amp; Export</span>
          </button>
        </div>
      </header>

      {/* Row 2: Calm 6-Step Guided Design Rail */}
      <nav
        aria-label="Guided building design workflow"
        className="h-9 px-2.5 sm:px-4 border-t border-slate-100 bg-slate-50/70 flex items-center gap-1 overflow-x-auto no-scrollbar"
      >
        {GUIDED_STEPS.map((st, idx) => {
          const active = guidedStep === st.id;
          return (
            <React.Fragment key={st.id}>
              <button
                type="button"
                onClick={() => onSelectGuidedStep(st.id)}
                title={st.hint}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-white text-blue-700 font-semibold border border-slate-200 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full text-[10px] font-semibold tabular-nums flex items-center justify-center ${
                    active ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {st.num}
                </span>
                <span>{st.label}</span>
              </button>
              {idx < GUIDED_STEPS.length - 1 && (
                <span className="text-slate-300 text-xs select-none shrink-0" aria-hidden="true">
                  /
                </span>
              )}
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
};
