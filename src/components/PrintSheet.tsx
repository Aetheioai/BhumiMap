import React from 'react';
import { DiagonalType, QuadGeometryResult } from '../lib/geometry';
import { Language, TRANSLATIONS } from '../lib/i18n';
import { AreaConversion, formatLengthFromFeet, formatNumber, LengthUnit } from '../lib/units';
import { PlotDiagram } from './PlotDiagram';

interface PrintSheetProps {
  geometry: QuadGeometryResult;
  area: AreaConversion;
  plotName: string;
  mouza: string;
  dagNo: string;
  khatianNo: string;
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
}

export const PrintSheet: React.FC<PrintSheetProps> = ({
  geometry,
  area,
  plotName,
  mouza,
  dagNo,
  khatianNo,
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
}) => {
  if (!geometry.valid || !geometry.anglesDeg || !geometry.triangle1 || !geometry.triangle2) {
    return null;
  }

  const t = TRANSLATIONS[lang];
  const dateStr = new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const metaItems: string[] = [];
  if (mouza.trim()) metaItems.push(`${t.mouzaLabel}: ${mouza.trim()}`);
  if (dagNo.trim()) metaItems.push(`${t.dagLabel}: ${dagNo.trim()}`);
  if (khatianNo.trim()) metaItems.push(`${t.khatianLabel}: ${khatianNo.trim()}`);

  const { bigha, katha, chotak } = area.compoundBighaKathaChotak;

  return (
    <div className="hidden print:block bg-white text-slate-900 w-full">
      {/* Header Title Block */}
      <div className="flex items-start justify-between pb-4 border-b border-slate-300">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {plotName.trim() || t.printReportTitle}
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            {metaItems.length > 0 ? metaItems.join('  ·  ') : t.printGeneratedLocally}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-teal-800">{t.brand}</div>
          <div className="text-xs font-mono text-slate-500 mt-0.5">{dateStr}</div>
        </div>
      </div>

      {/* Primary Units Strip */}
      <div className="grid grid-cols-4 border-b border-slate-200 py-5 gap-4">
        <div>
          <div className="text-xs text-slate-500">{t.unitShotok}</div>
          <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-slate-900">
            {formatNumber(area.shotok, 3)}
          </div>
        </div>
        <div className="border-l border-slate-200 pl-4">
          <div className="text-xs text-slate-500">{t.unitKatha}</div>
          <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-slate-900">
            {formatNumber(area.katha, 3)}
          </div>
        </div>
        <div className="border-l border-slate-200 pl-4">
          <div className="text-xs text-slate-500">{t.unitBigha}</div>
          <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-slate-900">
            {formatNumber(area.bigha, 4)}
          </div>
        </div>
        <div className="border-l border-slate-200 pl-4">
          <div className="text-xs text-slate-500">{t.unitSqFt}</div>
          <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-slate-900">
            {formatNumber(area.sqFt, 2)}
          </div>
        </div>
      </div>

      {/* Scaled Vector Diagram */}
      <div className="my-5">
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
          activeEdge={null}
          compact
        />
      </div>

      {/* Detailed Survey Tables */}
      <div className="grid grid-cols-2 gap-8 pt-2">
        <div>
          <h2 className="text-xs font-semibold text-slate-900 pb-2 border-b border-slate-200">
            {t.sidesHeading} &amp; {t.diagonalHeading}
          </h2>
          <table className="w-full text-xs mt-2">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-1.5 text-slate-600">{t.sideAB} ({t.dirNorth})</td>
                <td className="py-1.5 text-right font-mono tabular-nums font-medium">{formatLengthFromFeet(abFt, unit)}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-600">{t.sideBC} ({t.dirEast})</td>
                <td className="py-1.5 text-right font-mono tabular-nums font-medium">{formatLengthFromFeet(bcFt, unit)}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-600">{t.sideCD} ({t.dirSouth})</td>
                <td className="py-1.5 text-right font-mono tabular-nums font-medium">{formatLengthFromFeet(cdFt, unit)}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-600">{t.sideDA} ({t.dirWest})</td>
                <td className="py-1.5 text-right font-mono tabular-nums font-medium">{formatLengthFromFeet(daFt, unit)}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-600">
                  {diagonalType === 'AC' ? t.diagonalAC : t.diagonalBD}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums font-semibold text-teal-800">
                  {formatLengthFromFeet(diagonalFt, unit)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-600">{t.perimeter}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{formatLengthFromFeet(geometry.perimeterFt, unit)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-slate-900 pb-2 border-b border-slate-200">
            {t.triangulationHeading}
          </h2>
          <table className="w-full text-xs mt-2">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-1.5 text-slate-600">{geometry.triangle1.label} ({t.triangleArea})</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{formatNumber(geometry.triangle1.areaSqFt, 2)} sq ft</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-600">{geometry.triangle2.label} ({t.triangleArea})</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{formatNumber(geometry.triangle2.areaSqFt, 2)} sq ft</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-600">{t.traditionalBreakdown}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {bigha} {t.unitBigha} · {katha} {t.unitKatha} · {formatNumber(chotak, 2)} {t.unitChotak}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-600">{t.unitAcre}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{formatNumber(area.acre, 4)}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-600">{t.unitSqMeter}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{formatNumber(area.sqMeter, 2)} m²</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-600">{t.interiorAngles}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  A {geometry.anglesDeg.A.toFixed(1)}° · B {geometry.anglesDeg.B.toFixed(1)}° · C {geometry.anglesDeg.C.toFixed(1)}° · D {geometry.anglesDeg.D.toFixed(1)}°
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-6 pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
        <span>{t.printGeneratedLocally}</span>
        <span className="font-mono">1 Shotok = 435.6 sq ft · 1 Katha = 720 sq ft · 1 Bigha = 14,400 sq ft</span>
      </div>
    </div>
  );
};
