import React, { useState } from 'react';
import { Check, Copy, Download, FileCode2, Printer, Share2, X } from 'lucide-react';
import {
  buildShareText,
  DiagramMetadata,
  generateStandaloneSVG,
  renderSurveyPNGBlob,
  triggerLocalDownload,
} from '../lib/exportDiagram';
import { QuadGeometryResult } from '../lib/geometry';
import { Language, TRANSLATIONS } from '../lib/i18n';
import { AreaConversion } from '../lib/units';

interface ShareExportModalProps {
  open: boolean;
  onClose: () => void;
  geometry: QuadGeometryResult;
  area: AreaConversion;
  meta: DiagramMetadata;
  lang: Language;
}

export const ShareExportModal: React.FC<ShareExportModalProps> = ({
  open,
  onClose,
  geometry,
  area,
  meta,
  lang,
}) => {
  const [busy, setBusy] = useState<'png' | 'share' | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;
  const t = TRANSLATIONS[lang];
  const safeBaseName =
    (meta.plotName.trim() || 'bhumimap-survey')
      .toLowerCase()
      .replace(/[^a-z0-9\u0980-\u09ff]+/gi, '-')
      .replace(/^-|-$/g, '') || 'bhumimap-survey';

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handlePrint = () => {
    onClose();
    setTimeout(() => window.print(), 120);
  };

  const handleDownloadPNG = async () => {
    setBusy('png');
    try {
      const blob = await renderSurveyPNGBlob(geometry, area, meta, lang);
      if (blob) {
        triggerLocalDownload(blob, `${safeBaseName}.png`);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadSVG = () => {
    const svg = generateStandaloneSVG(geometry, area, meta, lang);
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    triggerLocalDownload(blob, `${safeBaseName}.svg`);
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    setBusy('share');
    try {
      const text = buildShareText(geometry, area, meta, lang);
      const blob = await renderSurveyPNGBlob(geometry, area, meta, lang);
      if (blob && typeof File !== 'undefined') {
        const file = new File([blob], `${safeBaseName}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: meta.plotName.trim() || t.printReportTitle,
            text,
            files: [file],
          });
          return;
        }
      }
      await navigator.share({
        title: meta.plotName.trim() || t.printReportTitle,
        text,
      });
    } catch {
      // User dismissed share dialog
    } finally {
      setBusy(null);
    }
  };

  const handleCopyText = async () => {
    const text = buildShareText(geometry, area, meta, lang);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard blocked in restricted context; ignore gracefully
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 sm:p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-export-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white border-t sm:border border-slate-200 rounded-t-2xl sm:rounded-none px-5 pt-3 pb-6 sm:p-8 pb-safe max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab handle */}
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" aria-hidden="true" />

        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 id="share-export-title" className="text-lg font-semibold text-slate-900">
              {t.modalTitle}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{t.modalSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!geometry.valid ? (
          <p className="py-8 text-sm text-slate-600">{t.errMissing}</p>
        ) : (
          <div className="divide-y divide-slate-100 mt-2">
            {canNativeShare && (
              <button
                type="button"
                onClick={handleNativeShare}
                disabled={busy === 'share'}
                className="w-full min-h-[56px] py-3.5 flex items-center gap-4 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors px-2 -mx-2 cursor-pointer disabled:opacity-50"
              >
                <Share2 className="w-5 h-5 text-teal-800 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900">{t.actionNativeShare}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{t.actionNativeShareDesc}</div>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadPNG}
              disabled={busy === 'png'}
              className="w-full min-h-[56px] py-3.5 flex items-center gap-4 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors px-2 -mx-2 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-5 h-5 text-teal-800 shrink-0" />
              <div>
                <div className="text-sm font-medium text-slate-900">
                  {busy === 'png' ? '...' : t.actionPng}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{t.actionPngDesc}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="w-full min-h-[56px] py-3.5 flex items-center gap-4 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors px-2 -mx-2 cursor-pointer"
            >
              <Printer className="w-5 h-5 text-teal-800 shrink-0" />
              <div>
                <div className="text-sm font-medium text-slate-900">{t.actionPrint}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t.actionPrintDesc}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleCopyText}
              className="w-full min-h-[56px] py-3.5 flex items-center gap-4 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors px-2 -mx-2 cursor-pointer"
            >
              {copied ? (
                <Check className="w-5 h-5 text-teal-700 shrink-0" />
              ) : (
                <Copy className="w-5 h-5 text-teal-800 shrink-0" />
              )}
              <div>
                <div className="text-sm font-medium text-slate-900">
                  {copied ? t.copiedToast : t.actionCopyText}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{t.actionCopyTextDesc}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleDownloadSVG}
              className="w-full min-h-[56px] py-3.5 flex items-center gap-4 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors px-2 -mx-2 cursor-pointer"
            >
              <FileCode2 className="w-5 h-5 text-teal-800 shrink-0" />
              <div>
                <div className="text-sm font-medium text-slate-900">{t.actionSvg}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t.actionSvgDesc}</div>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
