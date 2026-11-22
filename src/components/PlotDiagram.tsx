import React, { useMemo } from 'react';
import { DiagonalType, EdgeKey, QuadGeometryResult } from '../lib/geometry';
import {
  getAngleArcPath,
  getOutwardNormal,
  projectQuadToViewport,
} from '../lib/exportDiagram';
import { Language, TRANSLATIONS } from '../lib/i18n';
import { formatLengthFromFeet, formatNumber, LengthUnit } from '../lib/units';

interface PlotDiagramProps {
  geometry: QuadGeometryResult;
  abFt: number;
  bcFt: number;
  cdFt: number;
  daFt: number;
  diagonalFt: number;
  diagonalType: DiagonalType;
  unit: LengthUnit;
  lang: Language;
  northRotationDeg: number;
  showAngles: boolean;
  showTriangulation: boolean;
  showGrid: boolean;
  activeEdge: EdgeKey | null;
  onSelectEdge?: (edge: EdgeKey) => void;
  onUseMidpointDiagonal?: (midpointFt: number) => void;
  compact?: boolean;
}

export const PlotDiagram: React.FC<PlotDiagramProps> = ({
  geometry,
  abFt,
  bcFt,
  cdFt,
  daFt,
  diagonalFt,
  diagonalType,
  unit,
  lang,
  northRotationDeg,
  showAngles,
  showTriangulation,
  showGrid,
  activeEdge,
  onSelectEdge,
  onUseMidpointDiagonal,
  compact = false,
}) => {
  const t = TRANSLATIONS[lang];
  const width = 760;
  const height = compact ? 430 : 500;

  const projected = useMemo(
    () => projectQuadToViewport(geometry, width, height, 118, 78, unit),
    [geometry, width, height, unit]
  );

  if (!geometry.valid || !projected || !geometry.anglesDeg || !geometry.triangle1 || !geometry.triangle2) {
    let errorTitle = t.errMissing;
    if (geometry.errorCode === 'SIDES_CANNOT_CLOSE') {
      errorTitle = t.errCannotClose;
    } else if (geometry.errorCode === 'DIAGONAL_TOO_SHORT') {
      errorTitle = `${t.errDiagShort} ${geometry.failingTriangle ?? ''}`;
    } else if (geometry.errorCode === 'DIAGONAL_TOO_LONG') {
      errorTitle = `${t.errDiagLong} ${geometry.failingTriangle ?? ''}`;
    } else if (geometry.errorCode === 'SELF_INTERSECTING') {
      errorTitle = t.errSelfIntersecting;
    }

    const range = geometry.validDiagonalRange;
    const midpoint = range ? (range.min + range.max) / 2 : null;

    return (
      <div className="flex flex-col items-center justify-center w-full min-h-[360px] lg:min-h-[460px] border border-slate-200 bg-slate-50/50 px-8 py-12 text-center">
        <svg className="w-24 h-20 text-slate-300 mb-5" viewBox="0 0 120 96" fill="none">
          <polygon
            points="22,26 94,16 104,76 16,82"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="5 5"
          />
          <line
            x1="22"
            y1="26"
            x2="104"
            y2="76"
            stroke="#0F6E56"
            strokeOpacity="0.45"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <circle cx="22" cy="26" r="3.5" fill="currentColor" />
          <circle cx="94" cy="16" r="3.5" fill="currentColor" />
          <circle cx="104" cy="76" r="3.5" fill="currentColor" />
          <circle cx="16" cy="82" r="3.5" fill="currentColor" />
        </svg>

        <p className="max-w-md text-sm font-medium text-slate-800 leading-relaxed">
          {errorTitle}
        </p>

        {range && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <p className="text-xs font-mono tabular-nums text-slate-600">
              {t.validRangeLabel} ({diagonalType}):{' '}
              <span className="font-semibold text-slate-900">
                {formatLengthFromFeet(range.min, unit)} – {formatLengthFromFeet(range.max, unit)}
              </span>
            </p>
            {midpoint && onUseMidpointDiagonal && (
              <button
                type="button"
                onClick={() => onUseMidpointDiagonal(midpoint)}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-800 hover:bg-teal-900 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                {t.useMidpointBtn} ({formatLengthFromFeet(midpoint, unit, true)})
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const { A, B, C, D } = projected.svgPts;
  const diagStart = diagonalType === 'AC' ? A : B;
  const diagEnd = diagonalType === 'AC' ? C : D;
  const diagMid = { x: (diagStart.x + diagEnd.x) / 2, y: (diagStart.y + diagEnd.y) / 2 };

  const edges: Array<{ key: EdgeKey; p1: { x: number; y: number }; p2: { x: number; y: number }; lenFt: number; tag: string }> = [
    { key: 'ab', p1: A, p2: B, lenFt: abFt, tag: 'AB' },
    { key: 'bc', p1: B, p2: C, lenFt: bcFt, tag: 'BC' },
    { key: 'cd', p1: C, p2: D, lenFt: cdFt, tag: 'CD' },
    { key: 'da', p1: D, p2: A, lenFt: daFt, tag: 'DA' },
  ];

  const vertices = [
    { key: 'A', pt: A, prev: D, next: B, deg: geometry.anglesDeg.A },
    { key: 'B', pt: B, prev: A, next: C, deg: geometry.anglesDeg.B },
    { key: 'C', pt: C, prev: B, next: D, deg: geometry.anglesDeg.C },
    { key: 'D', pt: D, prev: C, next: A, deg: geometry.anglesDeg.D },
  ];

  const isDiagActive = activeEdge === 'diagonal';

  return (
    <div className="relative w-full bg-white border border-slate-200 overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block select-none"
        role="img"
        aria-label="Scaled quadrilateral land plot diagram"
      >
        <defs>
          <pattern id="liveSurveyGrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#F1F5F9" strokeWidth="1" />
          </pattern>
          <pattern
            id="livePlotHatch"
            width="11"
            height="11"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="11" stroke="#0F6E56" strokeOpacity="0.1" strokeWidth="1.2" />
          </pattern>
        </defs>

        {showGrid && <rect width={width} height={height} fill="url(#liveSurveyGrid)" />}

        {/* Compass Rose */}
        <g transform={`translate(${width - 46}, 46) rotate(${northRotationDeg})`}>
          <circle cx="0" cy="0" r="20" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1" />
          <polygon points="0,-14 4.2,2 0,-1.8 -4.2,2" fill="#0F6E56" />
          <polygon points="0,14 4.2,-2 0,1.8 -4.2,-2" fill="#CBD5E1" />
          <text
            x="0"
            y="-24"
            textAnchor="middle"
            className="font-mono text-[10px] font-semibold fill-slate-700"
          >
            N
          </text>
        </g>

        {/* Plot Area Fill + Subtle Architectural Hatching */}
        <polygon
          points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`}
          fill="#0F6E56"
          fillOpacity="0.055"
        />
        <polygon
          points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`}
          fill="url(#livePlotHatch)"
        />

        {/* Triangulation Diagonal & Triangle Centroid Labels */}
        {showTriangulation && (
          <g>
            <line
              x1={diagStart.x}
              y1={diagStart.y}
              x2={diagEnd.x}
              y2={diagEnd.y}
              stroke={isDiagActive ? '#0D5C48' : '#0F6E56'}
              strokeWidth={isDiagActive ? 3 : 1.75}
              strokeDasharray="7 5"
              className="transition-all duration-150"
            />
            {onSelectEdge && (
              <line
                x1={diagStart.x}
                y1={diagStart.y}
                x2={diagEnd.x}
                y2={diagEnd.y}
                stroke="transparent"
                strokeWidth="16"
                className="cursor-pointer"
                onClick={() => onSelectEdge('diagonal')}
              />
            )}
            <g
              className={onSelectEdge ? 'cursor-pointer' : undefined}
              onClick={() => onSelectEdge?.('diagonal')}
            >
              <rect
                x={diagMid.x - 62}
                y={diagMid.y - 13}
                width="124"
                height="26"
                rx="3"
                fill={isDiagActive ? '#0F6E56' : '#EBF5F2'}
                stroke="#0F6E56"
                strokeWidth="1.2"
              />
              <text
                x={diagMid.x}
                y={diagMid.y + 4.5}
                textAnchor="middle"
                className={`font-mono text-[12px] font-semibold ${isDiagActive ? 'fill-white' : 'fill-teal-900'}`}
              >
                {diagonalType}: {formatLengthFromFeet(diagonalFt, unit, true)}
              </text>
            </g>

            {/* Triangle 1 & 2 subtle area annotations */}
            <text
              x={projected.tri1Centroid.x}
              y={projected.tri1Centroid.y}
              textAnchor="middle"
              className="font-mono text-[11px] fill-slate-500 pointer-events-none"
            >
              {geometry.triangle1.label} · {formatNumber(geometry.triangle1.areaSqFt, 0)} ft²
            </text>
            <text
              x={projected.tri2Centroid.x}
              y={projected.tri2Centroid.y}
              textAnchor="middle"
              className="font-mono text-[11px] fill-slate-500 pointer-events-none"
            >
              {geometry.triangle2.label} · {formatNumber(geometry.triangle2.areaSqFt, 0)} ft²
            </text>
          </g>
        )}

        {/* Interior Angle Arcs */}
        {showAngles &&
          vertices.map((v) => {
            const arc = getAngleArcPath(v.prev, v.pt, v.next, 26, projected.svgSignedArea);
            return (
              <g key={`arc-${v.key}`} className="pointer-events-none">
                <path d={arc.path} fill="none" stroke="#94A3B8" strokeWidth="1.3" />
                <text
                  x={arc.labelPos.x}
                  y={arc.labelPos.y + 4}
                  textAnchor="middle"
                  className="font-mono text-[11.5px] fill-slate-600"
                >
                  {v.deg.toFixed(1)}°
                </text>
              </g>
            );
          })}

        {/* Individual Interactive Boundary Edges */}
        {edges.map((e) => {
          const isActive = activeEdge === e.key;
          const mid = { x: (e.p1.x + e.p2.x) / 2, y: (e.p1.y + e.p2.y) / 2 };
          const norm = getOutwardNormal(e.p1, e.p2, projected.svgSignedArea);
          const lx = mid.x + norm.x * 28;
          const ly = mid.y + norm.y * 28;
          const labelTxt = `${e.tag}: ${formatLengthFromFeet(e.lenFt, unit, true)}`;

          return (
            <g key={e.key}>
              <line
                x1={e.p1.x}
                y1={e.p1.y}
                x2={e.p2.x}
                y2={e.p2.y}
                stroke={isActive ? '#0D5C48' : '#0F6E56'}
                strokeWidth={isActive ? 4.2 : 2.5}
                strokeLinecap="round"
                className="transition-all duration-150"
              />
              {onSelectEdge && (
                <line
                  x1={e.p1.x}
                  y1={e.p1.y}
                  x2={e.p2.x}
                  y2={e.p2.y}
                  stroke="transparent"
                  strokeWidth="22"
                  className="cursor-pointer"
                  onClick={() => onSelectEdge(e.key)}
                />
              )}
              <g
                className={onSelectEdge ? 'cursor-pointer' : undefined}
                onClick={() => onSelectEdge?.(e.key)}
              >
                <rect
                  x={lx - 58}
                  y={ly - 13}
                  width="116"
                  height="26"
                  rx="3"
                  fill={isActive ? '#0F6E56' : '#FFFFFF'}
                  fillOpacity={isActive ? 1 : 0.96}
                  stroke={isActive ? '#0F6E56' : '#CBD5E1'}
                  strokeWidth="1.1"
                />
                <text
                  x={lx}
                  y={ly + 4.5}
                  textAnchor="middle"
                  className={`font-mono text-[12.5px] font-semibold ${isActive ? 'fill-white' : 'fill-slate-900'}`}
                >
                  {labelTxt}
                </text>
              </g>
            </g>
          );
        })}

        {/* Corner Vertices & Outward Labels */}
        {vertices.map((v) => {
          const n1 = getOutwardNormal(v.prev, v.pt, projected.svgSignedArea);
          const n2 = getOutwardNormal(v.pt, v.next, projected.svgSignedArea);
          const bx = n1.x + n2.x;
          const by = n1.y + n2.y;
          const bl = Math.hypot(bx, by) || 1;
          const vx = v.pt.x + (bx / bl) * 20;
          const vy = v.pt.y + (by / bl) * 20;
          return (
            <g key={`v-${v.key}`} className="pointer-events-none">
              <circle
                cx={v.pt.x}
                cy={v.pt.y}
                r="5"
                fill="#0F6E56"
                stroke="#FFFFFF"
                strokeWidth="2"
              />
              <text
                x={vx}
                y={vy + 4.5}
                textAnchor="middle"
                className="text-[14px] font-bold fill-teal-900"
              >
                {v.key}
              </text>
            </g>
          );
        })}

        {/* Dynamic Scale Bar */}
        <g transform={`translate(24, ${height - 20})`}>
          <line
            x1="0"
            y1="0"
            x2={projected.scaleBar.lengthPx}
            y2="0"
            stroke="#0F172A"
            strokeWidth="1.8"
          />
          <line x1="0" y1="-4.5" x2="0" y2="4.5" stroke="#0F172A" strokeWidth="1.4" />
          <line
            x1={projected.scaleBar.lengthPx}
            y1="-4.5"
            x2={projected.scaleBar.lengthPx}
            y2="4.5"
            stroke="#0F172A"
            strokeWidth="1.4"
          />
          <text
            x={projected.scaleBar.lengthPx / 2}
            y="-7"
            textAnchor="middle"
            className="font-mono text-[10px] fill-slate-500"
          >
            {t.scaleLabel}: {projected.scaleBar.label}
          </text>
        </g>
      </svg>
    </div>
  );
};
