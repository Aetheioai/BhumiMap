import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Download,
  Keyboard,
  LayoutGrid,
  Sofa,
  Wrench,
  X,
} from 'lucide-react';
import { ToolMode } from '../types/building';
import { CORE_RAIL_TOOLS, PRO_TOOL_GROUPS } from './LeftToolRail';

interface QuickHelpModalProps {
  onClose: () => void;
  onSelectTool: (tool: ToolMode) => void;
  onOpenWizard: (step: 1 | 2) => void;
  onOpenCatalog: () => void;
  onOpenExport: () => void;
}

type HelpTab = 'start' | 'tools' | 'shortcuts';

const SHORTCUT_GROUPS: { title: string; rows: Array<{ keys: string; action: string }> }[] = [
  {
    title: 'Core Drawing',
    rows: [
      { keys: 'V', action: 'Select & move items' },
      { keys: 'G', action: 'Draw a 4-walled room' },
      { keys: 'W / U', action: 'Draw straight or curved wall' },
      { keys: 'D / N', action: 'Add door or window on any wall' },
      { keys: 'C', action: 'Place structural column / pillar' },
      { keys: 'O', action: 'Open Furniture & Fixtures library' },
      { keys: 'I', action: 'Open Properties & Safety inspector' },
    ],
  },
  {
    title: 'Pro CAD & Blueprints',
    rows: [
      { keys: 'P / J / T', action: 'Split wall, Offset parallel wall, Trim / Extend' },
      { keys: 'B / S / K', action: 'Drop beam, Floor/Balcony slab, Stair cutout' },
      { keys: 'E / Q', action: 'Place Note/Callout or permanent Dim line' },
      { keys: 'M / A', action: 'Temporary Ruler tape or Area polygon' },
      { keys: 'Type + Enter', action: 'Enter exact length while drawing (Tab for angle)' },
      { keys: 'Alt (hold)', action: 'Bypass grid snap or detach a shared wall corner' },
    ],
  },
  {
    title: 'Selection, Editing & Views',
    rows: [
      { keys: 'Shift + Drag', action: 'Box-select group (L→R enclosed, R→L crossing)' },
      { keys: 'R', action: 'Rotate selected item or column by 90°' },
      { keys: 'Arrow / Shift+Arrow', action: 'Nudge selected item by 1" (or 6" with Shift)' },
      { keys: 'Ctrl+D / Del', action: 'Duplicate or delete selected items' },
      { keys: 'Ctrl+Z / Ctrl+Y', action: 'Undo / Redo up to 50 steps' },
      { keys: '1 / 2 / 3 / 4', action: 'Switch 2D Plan, Split, 2.5D, and 3D views' },
      { keys: 'F / Space+Drag', action: 'Fit building to screen / Pan canvas freely' },
    ],
  },
];

export const QuickHelpModal: React.FC<QuickHelpModalProps> = ({
  onClose,
  onSelectTool,
  onOpenWizard,
  onOpenCatalog,
  onOpenExport,
}) => {
  const [tab, setTab] = useState<HelpTab>('start');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick help and tool guide"
        className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden shadow-xl"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900">BhumiMap Studio Guide</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Plain-English walkthroughs for homeowners and fast keyboard shortcuts for pros.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 border-b border-slate-200 flex items-center gap-6 shrink-0 bg-slate-50/60">
          {(
            [
              { id: 'start', label: 'Start in 4 Steps', icon: <Compass className="w-3.5 h-3.5" /> },
              { id: 'tools', label: 'Every Tool Explained', icon: <Wrench className="w-3.5 h-3.5" /> },
              { id: 'shortcuts', label: 'Shortcuts & Mouse', icon: <Keyboard className="w-3.5 h-3.5" /> },
            ] as { id: HelpTab; label: string; icon: React.ReactNode }[]
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-1.5 pb-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto studio-scroll p-5">
          {tab === 'start' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-2.5">
                  <div className="text-xs font-bold text-slate-900">
                    1. Set your plot or pick a template
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Start with your real land size in Katha, Shotok, or feet, or open one of 12 verified Bangladeshi house and apartment plans to customize immediately.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenWizard(1);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
                    >
                      Set land plot <ArrowRight className="w-3 h-3" />
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenWizard(2);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
                    >
                      <LayoutGrid className="w-3 h-3" />
                      Browse templates
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-2.5">
                  <div className="text-xs font-bold text-slate-900">
                    2. Draw rooms and adjust walls
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Use the Room tool to sketch 4 walls at once, or click any wall corner and drag so connected walls stretch cleanly together. Type any exact size like 12&apos;6&quot; and press Enter.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTool('room');
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 pt-1"
                  >
                    Try Room tool <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-2.5">
                  <div className="text-xs font-bold text-slate-900">
                    3. Place doors, windows &amp; furniture
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Click any wall with Door or Window to drop an opening, then open the Items library to place stairs, kitchens, beds, sofas, toilets, and trees in both 2D and 3D simultaneously.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCatalog();
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 pt-1"
                  >
                    <Sofa className="w-3.5 h-3.5" />
                    Open Furniture &amp; Fixtures <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-2.5">
                  <div className="text-xs font-bold text-slate-900">
                    4. Review safety &amp; print scaled blueprints
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Check the top-right safety indicator for instant structural and setback checks. When ready, export scaled multi-floor PDF blueprints, AutoCAD DXF files, Vector SVGs, or a full Bangladesh material BOQ.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenExport();
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 pt-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Open Export &amp; Print <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex items-start gap-2.5 text-xs text-slate-600">
                <BookOpen className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-900">Homeowner vs Pro CAD mode: </span>
                  Start in Simple Homeowner mode for plain-English labels and an uncluttered workspace. Switch to Pro CAD anytime from the top-left project menu or the More tools panel to reveal BNBC 2020 seismic/soil metrics and pin Split, Offset, Trim, and Dimension tools directly onto the left rail.
                </div>
              </div>
            </div>
          )}

          {tab === 'tools' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-900">Essential Building Tools</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {CORE_RAIL_TOOLS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onSelectTool(t.id);
                        onClose();
                      }}
                      className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-colors"
                    >
                      <span className="p-1.5 rounded-md bg-slate-100 text-slate-700 shrink-0">
                        {t.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900">{t.fullTitle}</span>
                          <span className="text-[10px] font-mono text-slate-400">{t.shortcut}</span>
                        </span>
                        <span className="block text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {t.summary}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {PRO_TOOL_GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-900">{group.title}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {group.items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          onSelectTool(t.id);
                          onClose();
                        }}
                        className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-colors"
                      >
                        <span className="p-1.5 rounded-md bg-slate-100 text-slate-700 shrink-0">
                          {t.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900">{t.fullTitle}</span>
                            <span className="text-[10px] font-mono text-slate-400">{t.shortcut}</span>
                          </span>
                          <span className="block text-[11px] text-slate-600 mt-0.5 leading-snug">
                            {t.summary}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'shortcuts' && (
            <div className="space-y-5">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-900">{group.title}</h3>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {group.rows.map((row) => (
                      <div
                        key={row.keys}
                        className="flex items-center justify-between gap-4 px-3.5 py-2 text-xs bg-white"
                      >
                        <span className="text-slate-700">{row.action}</span>
                        <kbd className="font-mono text-[11px] font-medium text-slate-800 bg-slate-100 border border-slate-200 rounded px-2 py-0.5 whitespace-nowrap shrink-0">
                          {row.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
