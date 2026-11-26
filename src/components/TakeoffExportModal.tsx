import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, FolderOpen, Image, Save, Trash2, Upload, X } from 'lucide-react';
import { BuildingProject, ExperienceMode, PhysicsReport } from '../types/building';
import {
  deleteSavedProject,
  exportProjectJson,
  listSavedProjects,
  sanitizeProject,
  SavedProjectMeta,
  saveProjectToLibrary,
} from '../engine/projectStorage';
import {
  formatArea,
  formatBanglaLandSummary,
  formatForce,
  formatLength,
  formatVolume,
} from '../engine/units';

interface TakeoffExportModalProps {
  project: BuildingProject;
  physics: PhysicsReport;
  experienceMode: ExperienceMode;
  onClose: () => void;
  onLoadProject: (project: BuildingProject) => void;
  onExportViewportPng: () => void;
}

export const TakeoffExportModal: React.FC<TakeoffExportModalProps> = ({
  project,
  physics,
  experienceMode,
  onClose,
  onLoadProject,
  onExportViewportPng,
}) => {
  const [savedList, setSavedList] = useState<SavedProjectMeta[]>(() => listSavedProjects());
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const unit = project.unitSystem;
  const isEngineer = experienceMode === 'engineer';
  const t = physics.takeoff;
  const rajuk = physics.rajuk;
  const sw = physics.seismicWind;
  const footprintLand = formatBanglaLandSummary(t.footprintAreaM2);
  const grossLand = formatBanglaLandSummary(t.totalGrossAreaM2);

  const handleSave = () => {
    const next = saveProjectToLibrary(project);
    setSavedList(next);
    setSavedNotice('Saved to browser storage.');
    window.setTimeout(() => setSavedNotice(null), 2500);
  };

  const handleExportCsv = () => {
    const rows = [
      ['BhumiMap Bangladesh Civil BOQ & RAJUK Summary'],
      ['Project', project.name],
      ['Floors', String(project.stories.length)],
      ['Ground Footprint', `${footprintLand.sqft} (${footprintLand.katha} / ${footprintLand.shotok})`],
      ['Total Built Area', `${grossLand.sqft}`],
      ['RAJUK MGC (%)', `${rajuk.actualMgcPct.toFixed(1)} / ${rajuk.maxMgcPct}`],
      ['RAJUK FAR', `${rajuk.actualFar.toFixed(2)} / ${rajuk.maxFar}`],
      ['Seismic Zone / Soil', `Zone ${sw.zone} / ${sw.soilClass}`],
      [],
      ['Material / Item', 'Quantity', 'Unit'],
      ['1st-Class Bricks', String(t.estimatedBricks), 'pcs'],
      ['Portland Cement (50 kg)', String(t.estimatedCementBags), 'bags'],
      ['500W TMT Steel Rod', (t.steelWeightKg / 1000).toFixed(2), 'tons'],
      ['Sylhet Coarse Sand', String(t.sandSylhetCft), 'CFT'],
      ['Local Filling/Plaster Sand', String(t.sandLocalCft), 'CFT'],
      ['Stone Chips / Khoa', String(t.stoneChipsCft), 'CFT'],
      ['Total RCC Concrete (incl. Footings & Stairs)', t.concreteVolumeM3.toFixed(2), 'm3'],
      ['Floor Tiles Area', formatArea(t.tileAreaM2, unit), ''],
      ['Interior & Exterior Paint Area', formatArea(t.paintAreaM2, unit), ''],
      ['Doors', String(t.doorCount), 'nos'],
      ['Windows / Shutters', String(t.windowCount), 'nos'],
      ['Estimated Structural + Finish Cost', `${t.estimatedBdtLakhs.toFixed(1)}`, 'BDT Lakhs'],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bhumimap'}-boq.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = sanitizeProject(JSON.parse(String(reader.result)) as BuildingProject);
        if (parsed) {
          onLoadProject(parsed);
          onClose();
        } else {
          setSavedNotice('Invalid BhumiMap project JSON file.');
        }
      } catch {
        setSavedNotice('Invalid BhumiMap project JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {isEngineer
                ? 'BNBC 2020 Material BOQ, RAJUK Sheet & Export'
                : 'Bangladesh Building Estimate & Blueprint Export'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {project.name} · {project.stories.length}{' '}
              {project.stories.length === 1 ? 'floor' : 'floors'} · Ground footprint{' '}
              {footprintLand.shotok} ({footprintLand.katha})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto studio-scroll p-5 space-y-6">
          {/* Primary Material Schedule */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                Bill of Quantities (Bangladesh Construction Standard)
              </h3>
              <span className="text-xs font-mono font-bold text-blue-700 tabular-nums">
                Est. ৳ {t.estimatedBdtLakhs.toFixed(1)} Lakh
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-b border-slate-200 py-3.5">
              <div>
                <div className="text-[11px] text-slate-500">Ground footprint</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {footprintLand.sqft}
                </div>
                <div className="text-[11px] font-mono text-blue-700">
                  {footprintLand.katha} · {footprintLand.shotok}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Total built area</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {grossLand.sqft}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  MGC {rajuk.actualMgcPct.toFixed(1)}% · FAR {rajuk.actualFar.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">1st-class bricks</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {t.estimatedBricks.toLocaleString()} pcs
                </div>
                <div className="text-[11px] text-slate-500">10&quot; &amp; 5&quot; masonry</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Cement (50 kg)</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {t.estimatedCementBags.toLocaleString()} bags
                </div>
                <div className="text-[11px] text-slate-500">RCC + mortar + plaster</div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500">500W TMT steel rod</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {(t.steelWeightKg / 1000).toFixed(2)} ton
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {Math.round(t.steelWeightKg).toLocaleString()} kg
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Sylhet / Local sand</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {t.sandSylhetCft.toLocaleString()} / {t.sandLocalCft.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500">CFT coarse &amp; fine</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Stone chips / Khoa</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {t.stoneChipsCft.toLocaleString()} CFT
                </div>
                <div className="text-[11px] text-slate-500">
                  RCC {formatVolume(t.concreteVolumeM3, unit)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Doors / Windows</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {t.doorCount} / {t.windowCount}
                </div>
                <div className="text-[11px] text-slate-500">
                  Tiles {formatArea(t.tileAreaM2, unit)}
                </div>
              </div>
            </div>
          </section>

          {/* RAJUK & BNBC 2020 Compliance Summary */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-1.5">
              <div className="text-xs font-semibold text-slate-900">RAJUK / Setback Summary</div>
              <div className="text-xs text-slate-600 font-mono tabular-nums space-y-1">
                <div>
                  Front: {formatLength(rajuk.actualSetbacks.front, unit)} (min{' '}
                  {formatLength(rajuk.requiredSetbacks.front, unit)})
                </div>
                <div>
                  Rear: {formatLength(rajuk.actualSetbacks.rear, unit)} (min{' '}
                  {formatLength(rajuk.requiredSetbacks.rear, unit)})
                </div>
                <div>
                  Sides: L {formatLength(rajuk.actualSetbacks.left, unit)} · R{' '}
                  {formatLength(rajuk.actualSetbacks.right, unit)}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-1.5">
              <div className="text-xs font-semibold text-slate-900">BNBC 2020 Structural Summary</div>
              <div className="text-xs text-slate-600 font-mono tabular-nums space-y-1">
                <div>
                  Seismic Zone {sw.zone} (Z={sw.zoneFactorZ}) · Soil {sw.soilClass}
                </div>
                <div>
                  Base Shear: {formatForce(sw.baseShearKn, unit)} · Drift:{' '}
                  {(sw.driftRatio * 100).toFixed(2)}%
                </div>
                <div>
                  Max Footing Pressure: {sw.maxFootingPressureKpa.toFixed(0)} /{' '}
                  {sw.allowBearingKpa} kPa
                </div>
              </div>
            </div>
          </section>

          {/* Export Buttons */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900">Export &amp; Save</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-md transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                BOQ CSV
              </button>
              <button
                type="button"
                onClick={onExportViewportPng}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md transition-colors"
              >
                <Image className="w-3.5 h-3.5" />
                Blueprint PNG
              </button>
              <button
                type="button"
                onClick={() => exportProjectJson(project)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-md transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Save JSON
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-md transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Import JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800"
              >
                <Save className="w-3.5 h-3.5" />
                Save to browser library
              </button>
              {savedNotice && <span className="text-xs text-emerald-700">{savedNotice}</span>}
            </div>
          </section>

          {/* Saved Browser Projects */}
          {savedList.length > 0 && (
            <section className="space-y-2 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-900">Saved projects</h3>
              <div className="space-y-1.5">
                {savedList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {item.storyCount} {item.storyCount === 1 ? 'floor' : 'floors'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onLoadProject(item.project);
                          onClose();
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded hover:bg-slate-100 text-xs font-medium"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => setSavedList(deleteSavedProject(item.id))}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            Conceptual engineering mockup and preliminary BOQ estimate. Final structural drawings, reinforcement detailing, and soil test foundation design must be signed by a licensed civil engineer (BNBC 2020).
          </p>
        </div>
      </div>
    </div>
  );
};
