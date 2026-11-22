import React, { useRef } from 'react';
import { Download, FolderOpen, Trash2, Upload } from 'lucide-react';
import { triggerLocalDownload } from '../lib/exportDiagram';
import { Language, TRANSLATIONS } from '../lib/i18n';
import { SavedPlotRecord } from '../lib/storage';
import { convertAreaFromSqFt, formatLengthFromFeet, formatNumber } from '../lib/units';

interface SavedPlotsViewProps {
  plots: SavedPlotRecord[];
  lang: Language;
  onLoadPlot: (record: SavedPlotRecord) => void;
  onDeletePlot: (id: string) => void;
  onImportPlots: (records: SavedPlotRecord[]) => void;
}

export const SavedPlotsView: React.FC<SavedPlotsViewProps> = ({
  plots,
  lang,
  onLoadPlot,
  onDeletePlot,
  onImportPlots,
}) => {
  const t = TRANSLATIONS[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportBackup = () => {
    const blob = new Blob([JSON.stringify(plots, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    triggerLocalDownload(blob, 'bhumimap-saved-plots.json');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (item): item is SavedPlotRecord =>
              item &&
              typeof item.id === 'string' &&
              typeof item.abFt === 'number' &&
              typeof item.bcFt === 'number' &&
              typeof item.cdFt === 'number' &&
              typeof item.daFt === 'number' &&
              typeof item.diagonalFt === 'number'
          );
          if (valid.length > 0) {
            onImportPlots(valid);
          }
        }
      } catch {
        // Ignore malformed JSON file
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <section className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t.savedPlotsTitle}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">{t.savedPlotsSubtitle}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            {t.importJson}
          </button>
          {plots.length > 0 && (
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              {t.exportJson}
            </button>
          )}
        </div>
      </div>

      {plots.length === 0 ? (
        <div className="py-20 text-center border-b border-slate-200">
          <p className="text-base font-medium text-slate-800">{t.savedEmptyTitle}</p>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">{t.savedEmptyDesc}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {plots.map((plot) => {
            const conv = convertAreaFromSqFt(plot.areaSqFt);
            const refs = [
              plot.mouza ? `${t.mouzaLabel}: ${plot.mouza}` : '',
              plot.dagNo ? `${t.dagLabel}: ${plot.dagNo}` : '',
              plot.khatianNo ? `${t.khatianLabel}: ${plot.khatianNo}` : '',
            ].filter(Boolean);

            return (
              <div
                key={plot.id}
                className="py-6 flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900 truncate">
                    {plot.name || t.printReportTitle}
                  </h2>
                  {refs.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">{refs.join('  ·  ')}</p>
                  )}
                  <p className="mt-2 text-xs font-mono tabular-nums text-slate-500">
                    AB {formatLengthFromFeet(plot.abFt, plot.unit, true)} · BC{' '}
                    {formatLengthFromFeet(plot.bcFt, plot.unit, true)} · CD{' '}
                    {formatLengthFromFeet(plot.cdFt, plot.unit, true)} · DA{' '}
                    {formatLengthFromFeet(plot.daFt, plot.unit, true)} · {plot.diagonalType}{' '}
                    {formatLengthFromFeet(plot.diagonalFt, plot.unit, true)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-6 shrink-0">
                  <div className="flex items-center gap-5 font-mono tabular-nums">
                    <div>
                      <div className="text-[11px] font-sans text-slate-500">{t.unitShotok}</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {formatNumber(conv.shotok, 3)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-sans text-slate-500">{t.unitKatha}</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {formatNumber(conv.katha, 3)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-sans text-slate-500">{t.unitSqFt}</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {formatNumber(conv.sqFt, 1)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onLoadPlot(plot)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-800 hover:bg-teal-900 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      {t.loadPlot}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePlot(plot.id)}
                      aria-label={t.deletePlot}
                      className="p-2 text-slate-400 hover:text-rose-700 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
