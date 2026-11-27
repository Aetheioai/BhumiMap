import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  BoxSelect,
  Columns3,
  CopyPlus,
  DoorOpen,
  Ellipsis,
  Grid2x2,
  Hand,
  LayoutGrid,
  MessageSquareText,
  Minus,
  MousePointer2,
  MoveHorizontal,
  Pentagon,
  Ruler,
  Scissors,
  Sofa,
  Spline,
  Split,
  Square,
  SquareDashed,
} from 'lucide-react';
import { ExperienceMode, ToolMode, ViewMode } from '../types/building';

interface LeftToolRailProps {
  tool: ToolMode;
  viewMode: ViewMode;
  experienceMode: ExperienceMode;
  assetsOpen: boolean;
  boxSelectMode: boolean;
  onSelectTool: (tool: ToolMode) => void;
  onToggleAssets: () => void;
  onToggleBoxSelect: () => void;
  onChangeExperienceMode: (mode: ExperienceMode) => void;
}

export interface ToolMeta {
  id: ToolMode;
  label: string;
  fullTitle: string;
  shortcut: string;
  summary: string;
  howTo: string;
  icon: React.ReactNode;
}

export const CORE_RAIL_TOOLS: ToolMeta[] = [
  {
    id: 'select',
    label: 'Select',
    fullTitle: 'Select & Move',
    shortcut: 'V',
    summary: 'Pick any wall, door, room, or furniture item to move or edit it.',
    howTo: 'Click an item to select, drag to move, or hold Shift and drag to box-select a group.',
    icon: <MousePointer2 className="w-[18px] h-[18px]" />,
  },
  {
    id: 'room',
    label: 'Room',
    fullTitle: 'Draw a Room',
    shortcut: 'G',
    summary: 'Create a complete 4-walled room with an automatic size label in one motion.',
    howTo: 'Click and drag from one corner of the room to the opposite corner.',
    icon: <LayoutGrid className="w-[18px] h-[18px]" />,
  },
  {
    id: 'wall',
    label: 'Wall',
    fullTitle: 'Draw Wall',
    shortcut: 'W',
    summary: 'Sketch straight exterior or partition walls with clean mitered corners.',
    howTo: 'Click start and end points. Type a length like 12\'6" and press Enter for exact sizing.',
    icon: <Minus className="w-[18px] h-[18px] rotate-45" />,
  },
  {
    id: 'door',
    label: 'Door',
    fullTitle: 'Add Door',
    shortcut: 'D',
    summary: 'Insert a hinged, double, or sliding door directly into any wall.',
    howTo: 'Click anywhere along a wall. Drag the door later to slide it smoothly.',
    icon: <DoorOpen className="w-[18px] h-[18px]" />,
  },
  {
    id: 'window',
    label: 'Window',
    fullTitle: 'Add Window',
    shortcut: 'N',
    summary: 'Place casement or picture windows with optional rain chajja and grill.',
    howTo: 'Click on any exterior or interior wall to insert a window.',
    icon: <Grid2x2 className="w-[18px] h-[18px]" />,
  },
  {
    id: 'pillar',
    label: 'Pillar',
    fullTitle: 'Add Column / Pillar',
    shortcut: 'C',
    summary: 'Place structural RCC columns that automatically link to structural safety checks.',
    howTo: 'Click at wall corners or grid intersections to drop a column.',
    icon: <Square className="w-4 h-4 fill-current" />,
  },
];

export const PRO_TOOL_GROUPS: { title: string; items: ToolMeta[] }[] = [
  {
    title: 'Modify Walls',
    items: [
      {
        id: 'curved-wall',
        label: 'Curve',
        fullTitle: 'Curved Wall',
        shortcut: 'U',
        summary: 'Draw smooth arched walls for curved verandas, foyers, or bays.',
        howTo: 'Draw start and end points, then drag the cyan midpoint handle to bend.',
        icon: <Spline className="w-4 h-4" />,
      },
      {
        id: 'split-wall',
        label: 'Split',
        fullTitle: 'Split Wall',
        shortcut: 'P',
        summary: 'Break one wall into two separate segments at an exact point.',
        howTo: 'Hover any wall and click where you want the joint.',
        icon: <Split className="w-4 h-4" />,
      },
      {
        id: 'offset-wall',
        label: 'Offset',
        fullTitle: 'Offset Parallel Wall',
        shortcut: 'J',
        summary: 'Create a parallel copy of any wall at an exact spacing distance.',
        howTo: 'Hover the side of a wall and click. Type a distance + Enter to override.',
        icon: <CopyPlus className="w-4 h-4" />,
      },
      {
        id: 'trim-wall',
        label: 'Trim / Ext',
        fullTitle: 'Trim or Extend Wall',
        shortcut: 'T',
        summary: 'Clean up overhanging wall tails or extend an open wall to meet another.',
        howTo: 'Click an overhanging tail to trim, or click near an open end to extend.',
        icon: <Scissors className="w-4 h-4" />,
      },
    ],
  },
  {
    title: 'Structure',
    items: [
      {
        id: 'beam',
        label: 'Beam',
        fullTitle: 'Drop Beam',
        shortcut: 'B',
        summary: 'Connect columns with reinforced concrete drop beams for span support.',
        howTo: 'Click two columns or endpoints to span a beam between them.',
        icon: <Columns3 className="w-4 h-4 rotate-90" />,
      },
      {
        id: 'slab',
        label: 'Slab',
        fullTitle: 'Floor or Balcony Slab',
        shortcut: 'S',
        summary: 'Add main floor decks, cantilevered balconies (baranda), or roof slabs.',
        howTo: 'Click and drag opposite corners to place a rectangular slab.',
        icon: <Box className="w-4 h-4" />,
      },
      {
        id: 'cutout',
        label: 'Cutout',
        fullTitle: 'Stair / Void Cutout',
        shortcut: 'K',
        summary: 'Cut a clean opening through an upper floor slab for stairs or a duplex void.',
        howTo: 'Drag a rectangle over an existing slab to cut the opening.',
        icon: <SquareDashed className="w-4 h-4" />,
      },
    ],
  },
  {
    title: 'Notes & Measure',
    items: [
      {
        id: 'note',
        label: 'Callout',
        fullTitle: 'Note or Leader Callout',
        shortcut: 'E',
        summary: 'Add construction notes or leader arrows directly onto the blueprint.',
        howTo: 'Click once for a note, or drag from arrow tip to text box for a callout.',
        icon: <MessageSquareText className="w-4 h-4" />,
      },
      {
        id: 'dim-line',
        label: 'Dim line',
        fullTitle: 'Custom Dimension Line',
        shortcut: 'Q',
        summary: 'Pin a permanent linear measurement between any two snapped points.',
        howTo: 'Click start and end points to place a blueprint dimension line.',
        icon: <MoveHorizontal className="w-4 h-4" />,
      },
      {
        id: 'ruler',
        label: 'Ruler',
        fullTitle: 'Quick Measuring Tape',
        shortcut: 'M',
        summary: 'Measure multi-segment distances temporarily without changing the plan.',
        howTo: 'Click points to chain measurements. Double-click or right-click to finish.',
        icon: <Ruler className="w-4 h-4" />,
      },
      {
        id: 'area',
        label: 'Area',
        fullTitle: 'Measure Area (Sq Ft / Shotok)',
        shortcut: 'A',
        summary: 'Calculate the exact square feet and Shotok of any custom polygon.',
        howTo: 'Click 3 or more corners and double-click to close the region.',
        icon: <Pentagon className="w-4 h-4" />,
      },
      {
        id: 'pan',
        label: 'Pan',
        fullTitle: 'Pan View',
        shortcut: 'Space',
        summary: 'Move freely around the floor plan without selecting elements.',
        howTo: 'Drag anywhere on the canvas (or hold Space while using any tool).',
        icon: <Hand className="w-4 h-4" />,
      },
    ],
  },
];

export const ALL_PRO_TOOLS: ToolMeta[] = PRO_TOOL_GROUPS.flatMap((g) => g.items);

const PRO_PINNED_IDS: ToolMode[] = ['split-wall', 'offset-wall', 'trim-wall', 'dim-line'];

interface HoverTooltipState {
  title: string;
  summary: string;
  howTo: string;
  shortcut?: string;
  top: number;
}

export const LeftToolRail: React.FC<LeftToolRailProps> = ({
  tool,
  viewMode,
  experienceMode,
  assetsOpen,
  boxSelectMode,
  onSelectTool,
  onToggleAssets,
  onToggleBoxSelect,
  onChangeExperienceMode,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [hoveredTip, setHoveredTip] = useState<HoverTooltipState | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const tipTimerRef = useRef<number | null>(null);

  const isPro = experienceMode === 'engineer';
  const show2D = viewMode === '2d' || viewMode === 'split';
  const activeProTool = ALL_PRO_TOOLS.find((t) => t.id === tool);
  const proPinnedTools = ALL_PRO_TOOLS.filter((t) => PRO_PINNED_IDS.includes(t.id));

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    return () => {
      if (tipTimerRef.current !== null) window.clearTimeout(tipTimerRef.current);
    };
  }, []);

  const showTip = (
    el: HTMLElement,
    info: { title: string; summary: string; howTo: string; shortcut?: string }
  ) => {
    if (moreOpen) return;
    if (tipTimerRef.current !== null) window.clearTimeout(tipTimerRef.current);
    const rect = el.getBoundingClientRect();
    tipTimerRef.current = window.setTimeout(() => {
      setHoveredTip({
        ...info,
        top: Math.max(58, Math.min(window.innerHeight - 150, rect.top)),
      });
    }, 120);
  };

  const hideTip = () => {
    if (tipTimerRef.current !== null) {
      window.clearTimeout(tipTimerRef.current);
      tipTimerRef.current = null;
    }
    setHoveredTip(null);
  };

  return (
    <>
      {/* Desktop Docked Left Architectural Tool Rail */}
      <aside
        aria-label="Drafting and design tools"
        className="hidden md:flex flex-col items-center w-[68px] shrink-0 bg-white border-r border-slate-200 z-30 py-2 select-none"
      >
        <div className="flex-1 w-full flex flex-col items-center gap-0.5 px-1.5 overflow-y-auto no-scrollbar">
          {CORE_RAIL_TOOLS.map((item) => {
            const active = tool === item.id && !assetsOpen;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  hideTip();
                  onSelectTool(item.id);
                }}
                onMouseEnter={(e) =>
                  showTip(e.currentTarget, {
                    title: item.fullTitle,
                    summary: item.summary,
                    howTo: item.howTo,
                    shortcut: item.shortcut,
                  })
                }
                onMouseLeave={hideTip}
                onFocus={(e) =>
                  showTip(e.currentTarget, {
                    title: item.fullTitle,
                    summary: item.summary,
                    howTo: item.howTo,
                    shortcut: item.shortcut,
                  })
                }
                onBlur={hideTip}
                aria-label={`${item.fullTitle} (${item.shortcut})`}
                aria-pressed={active}
                className={`w-full flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg transition-colors ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span className="text-[10.5px] font-medium leading-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}

          {show2D && tool === 'select' && (
            <button
              type="button"
              onClick={() => {
                hideTip();
                onToggleBoxSelect();
              }}
              onMouseEnter={(e) =>
                showTip(e.currentTarget, {
                  title: 'Box Multi-Select',
                  summary: 'Drag a box to select multiple walls, columns, or items at once.',
                  howTo:
                    'Drag left-to-right to select items fully inside, or right-to-left to select anything touched.',
                  shortcut: 'Shift+Drag',
                })
              }
              onMouseLeave={hideTip}
              aria-pressed={boxSelectMode}
              className={`w-full flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg transition-colors ${
                boxSelectMode
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <BoxSelect className="w-[17px] h-[17px]" />
              <span className="text-[10.5px] font-medium leading-tight whitespace-nowrap">
                Box
              </span>
            </button>
          )}

          <div className="w-8 h-px bg-slate-200 my-1 shrink-0" />

          {/* Furniture & Fixtures Library Toggle */}
          <button
            type="button"
            onClick={() => {
              hideTip();
              onToggleAssets();
            }}
            onMouseEnter={(e) =>
              showTip(e.currentTarget, {
                title: 'Furniture & Fixtures',
                summary: 'Add stairs, lifts, kitchens, beds, sofas, bathrooms, and trees.',
                howTo: 'Click any item from the library and stamp or drag it onto your floor plan.',
                shortcut: 'O',
              })
            }
            onMouseLeave={hideTip}
            aria-pressed={assetsOpen}
            className={`w-full flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg transition-colors ${
              assetsOpen
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Sofa className="w-[18px] h-[18px]" />
            <span className="text-[10.5px] font-medium leading-tight whitespace-nowrap">
              Items
            </span>
          </button>

          {/* Progressive Disclosure: Pin Pro CAD Tools directly when in Pro CAD Mode */}
          {isPro && (
            <>
              <div className="w-8 h-px bg-slate-200 my-1 shrink-0" />
              {proPinnedTools.map((item) => {
                const active = tool === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      hideTip();
                      onSelectTool(item.id);
                    }}
                    onMouseEnter={(e) =>
                      showTip(e.currentTarget, {
                        title: item.fullTitle,
                        summary: item.summary,
                        howTo: item.howTo,
                        shortcut: item.shortcut,
                      })
                    }
                    onMouseLeave={hideTip}
                    aria-label={`${item.fullTitle} (${item.shortcut})`}
                    aria-pressed={active}
                    className={`w-full flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg transition-colors ${
                      active
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {item.icon}
                    <span className="text-[10px] font-medium leading-tight whitespace-nowrap">
                      {item.label === 'Trim / Ext' ? 'Trim' : item.label === 'Dim line' ? 'Dim' : item.label}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Bottom of Rail: Pro CAD / More Tools Flyout */}
        <div className="relative w-full px-1.5 pt-1.5 border-t border-slate-100 shrink-0" ref={moreRef}>
          <button
            type="button"
            onClick={() => {
              hideTip();
              setMoreOpen((v) => !v);
            }}
            onMouseEnter={(e) =>
              showTip(e.currentTarget, {
                title: 'More Tools & Pro CAD',
                summary: 'Curved walls, Split, Offset, Trim, Beams, Slabs, Cutouts, Notes & Rulers.',
                howTo: 'Click to open all drafting, structural, and measurement tools.',
              })
            }
            onMouseLeave={hideTip}
            aria-expanded={moreOpen}
            aria-label="More CAD and measurement tools"
            className={`w-full flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg transition-colors ${
              activeProTool && (!isPro || !PRO_PINNED_IDS.includes(activeProTool.id))
                ? 'bg-blue-700 text-white'
                : moreOpen
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {activeProTool && (!isPro || !PRO_PINNED_IDS.includes(activeProTool.id)) ? (
              activeProTool.icon
            ) : (
              <Ellipsis className="w-[18px] h-[18px]" />
            )}
            <span className="text-[10.5px] font-medium leading-tight whitespace-nowrap">
              {activeProTool && (!isPro || !PRO_PINNED_IDS.includes(activeProTool.id))
                ? activeProTool.label.split(' ')[0]
                : 'More'}
            </span>
          </button>

          {moreOpen && (
            <div className="fixed left-[74px] bottom-14 w-[312px] max-h-[calc(100dvh-7rem)] overflow-y-auto studio-scroll bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-3 z-50">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div>
                  <div className="text-xs font-semibold text-slate-900">Additional Tools</div>
                  <div className="text-[11px] text-slate-500">
                    {isPro ? 'Pro CAD workspace active' : 'Switch to Pro CAD to pin modify tools'}
                  </div>
                </div>
                <div className="inline-flex bg-slate-100 p-0.5 rounded-md border border-slate-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => onChangeExperienceMode('simple')}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors ${
                      !isPro ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeExperienceMode('engineer')}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors ${
                      isPro ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Pro CAD
                  </button>
                </div>
              </div>

              {PRO_TOOL_GROUPS.map((group) => (
                <div key={group.title} className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500 px-1">
                    {group.title}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = tool === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onSelectTool(item.id);
                            setMoreOpen(false);
                          }}
                          className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                            active
                              ? 'bg-blue-700 text-white'
                              : 'text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          <span className="mt-0.5 shrink-0">{item.icon}</span>
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold truncate">{item.fullTitle}</span>
                              <span
                                className={`text-[10px] font-mono shrink-0 ${
                                  active ? 'text-blue-100' : 'text-slate-400'
                                }`}
                              >
                                {item.shortcut}
                              </span>
                            </span>
                            <span
                              className={`block text-[11px] leading-snug mt-0.5 ${
                                active ? 'text-blue-100' : 'text-slate-500'
                              }`}
                            >
                              {item.summary}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Calm Visual Hover Tooltip Card (Desktop Only) */}
      {hoveredTip && !moreOpen && (
        <div
          style={{ top: hoveredTip.top }}
          className="hidden md:block pointer-events-none fixed left-[76px] z-50 w-60 bg-slate-900 text-white rounded-xl shadow-lg p-3 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{hoveredTip.title}</span>
            {hoveredTip.shortcut && (
              <span className="text-[10px] font-mono text-slate-300 bg-white/10 px-1.5 py-0.5 rounded">
                {hoveredTip.shortcut}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-200 leading-relaxed">{hoveredTip.summary}</p>
          <p className="text-[10.5px] text-slate-400 leading-snug border-t border-white/10 pt-1.5">
            {hoveredTip.howTo}
          </p>
        </div>
      )}

      {/* Mobile Compact Bottom Tool Strip (< md) */}
      <nav
        aria-label="Mobile drafting tools"
        className="md:hidden fixed bottom-11 inset-x-0 z-30 h-12 bg-white border-t border-slate-200 px-2 flex items-center gap-1 overflow-x-auto no-scrollbar"
      >
        {CORE_RAIL_TOOLS.map((item) => {
          const active = tool === item.id && !assetsOpen;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTool(item.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                active ? 'bg-blue-700 text-white' : 'text-slate-700 bg-slate-50'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onToggleAssets}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
            assetsOpen ? 'bg-slate-900 text-white' : 'text-slate-700 bg-slate-50'
          }`}
        >
          <Sofa className="w-4 h-4" />
          <span>Items</span>
        </button>
        {ALL_PRO_TOOLS.map((item) => {
          const active = tool === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTool(item.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                active ? 'bg-blue-700 text-white' : 'text-slate-600 bg-slate-50'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
