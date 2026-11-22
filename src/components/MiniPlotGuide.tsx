import React from 'react';
import { DiagonalType, EdgeKey } from '../lib/geometry';
import { Language, TRANSLATIONS } from '../lib/i18n';
import { formatLengthFromFeet, LengthUnit } from '../lib/units';

interface MiniPlotGuideProps {
  activeEdge: EdgeKey | null;
  diagonalType: DiagonalType;
  abFt: number;
  bcFt: number;
  cdFt: number;
  daFt: number;
  diagonalFt: number;
  unit: LengthUnit;
  lang: Language;
  onSelectEdge: (edge: EdgeKey) => void;
}

export const MiniPlotGuide: React.FC<MiniPlotGuideProps> = ({
  activeEdge,
  diagonalType,
  abFt,
  bcFt,
  cdFt,
  daFt,
  diagonalFt,
  unit,
  lang,
  onSelectEdge,
}) => {
  const t = TRANSLATIONS[lang];

  // Clean stylized irregular quadrilateral guide showing exact corner & edge mapping
  const A = { x: 58, y: 34 };
  const B = { x: 256, y: 24 };
  const C = { x: 274, y: 118 };
  const D = { x: 44, y: 124 };

  const diagStart = diagonalType === 'AC' ? A : B;
  const diagEnd = diagonalType === 'AC' ? C : D;

  const isEdge = (k: EdgeKey) => activeEdge === k;

  const edges: Array<{
    key: Exclude<EdgeKey, 'diagonal'>;
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    lx: number;
    ly: number;
    label: string;
    valFt: number;
  }> = [
    { key: 'ab', p1: A, p2: B, lx: 158, ly: 15, label: 'AB', valFt: abFt },
    { key: 'bc', p1: B, p2: C, lx: 298, ly: 73, label: 'BC', valFt: bcFt },
    { key: 'cd', p1: C, p2: D, lx: 158, ly: 141, label: 'CD', valFt: cdFt },
    { key: 'da', p1: D, p2: A, lx: 22, ly: 80, label: 'DA', valFt: daFt },
  ];

  return (
    <div className="border border-slate-200 bg-slate-50/50 px-3 py-2.5">
      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
        <span>{t.tapEdgeHint}</span>
        <span className="font-mono text-teal-900 font-medium">
          {activeEdge === 'diagonal'
            ? diagonalType
            : activeEdge
              ? activeEdge.toUpperCase()
              : `${diagonalType}`}
        </span>
      </div>
      <svg
        viewBox="0 0 326 154"
        className="w-full max-w-[320px] mx-auto h-auto block select-none"
        role="img"
        aria-label="Interactive boundary guide"
      >
        <polygon
          points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`}
          fill="#0F6E56"
          fillOpacity="0.06"
        />

        {/* Diagonal */}
        <line
          x1={diagStart.x}
          y1={diagStart.y}
          x2={diagEnd.x}
          y2={diagEnd.y}
          stroke={isEdge('diagonal') ? '#0D5C48' : '#0F6E56'}
          strokeOpacity={isEdge('diagonal') ? 1 : 0.6}
          strokeWidth={isEdge('diagonal') ? 3.2 : 1.6}
          strokeDasharray="6 4"
        />
        <line
          x1={diagStart.x}
          y1={diagStart.y}
          x2={diagEnd.x}
          y2={diagEnd.y}
          stroke="transparent"
          strokeWidth="22"
          className="cursor-pointer"
          onClick={() => onSelectEdge('diagonal')}
        />
        <g className="cursor-pointer" onClick={() => onSelectEdge('diagonal')}>
          <rect
            x="118"
            y="64"
            width="88"
            height="22"
            rx="3"
            fill={isEdge('diagonal') ? '#0F6E56' : '#EBF5F2'}
            stroke="#0F6E56"
            strokeWidth="1"
          />
          <text
            x="162"
            y="78.5"
            textAnchor="middle"
            className={`font-mono text-[10.5px] font-semibold ${
              isEdge('diagonal') ? 'fill-white' : 'fill-teal-900'
            }`}
          >
            {diagonalType} {diagonalFt > 0 ? formatLengthFromFeet(diagonalFt, unit, true) : '?'}
          </text>
        </g>

        {/* Four outer sides */}
        {edges.map((e) => {
          const active = isEdge(e.key);
          return (
            <g key={e.key} className="cursor-pointer" onClick={() => onSelectEdge(e.key)}>
              <line
                x1={e.p1.x}
                y1={e.p1.y}
                x2={e.p2.x}
                y2={e.p2.y}
                stroke={active ? '#0F6E56' : '#64748B'}
                strokeWidth={active ? 3.5 : 1.8}
                strokeLinecap="round"
              />
              <line
                x1={e.p1.x}
                y1={e.p1.y}
                x2={e.p2.x}
                y2={e.p2.y}
                stroke="transparent"
                strokeWidth="22"
              />
              <text
                x={e.lx}
                y={e.ly}
                textAnchor="middle"
                className={`font-mono text-[10.5px] font-semibold ${
                  active ? 'fill-teal-900' : 'fill-slate-700'
                }`}
              >
                {e.label}
                {e.valFt > 0 ? ` ${formatLengthFromFeet(e.valFt, unit, true)}` : ''}
              </text>
            </g>
          );
        })}

        {/* Corner dots & labels */}
        {[
          { k: 'A', pt: A, dx: -11, dy: -6 },
          { k: 'B', pt: B, dx: 11, dy: -6 },
          { k: 'C', pt: C, dx: 12, dy: 9 },
          { k: 'D', pt: D, dx: -12, dy: 9 },
        ].map((v) => (
          <g key={v.k} className="pointer-events-none">
            <circle cx={v.pt.x} cy={v.pt.y} r="3.5" fill="#0F6E56" stroke="#FFFFFF" strokeWidth="1.5" />
            <text
              x={v.pt.x + v.dx}
              y={v.pt.y + v.dy}
              textAnchor="middle"
              className="text-[11px] font-bold fill-teal-900"
            >
              {v.k}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
