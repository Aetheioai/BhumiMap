import { DiagonalType, Point2D, QuadGeometryResult } from './geometry';
import { Language, TRANSLATIONS } from './i18n';
import {
  AreaConversion,
  formatLengthFromFeet,
  formatNumber,
  LengthUnit,
  METERS_PER_FOOT,
  FEET_PER_LINK,
  FEET_PER_HAAT,
} from './units';

export interface DiagramMetadata {
  plotName: string;
  mouza: string;
  dagNo: string;
  khatianNo: string;
  unit: LengthUnit;
  diagonalType: DiagonalType;
  abFt: number;
  bcFt: number;
  cdFt: number;
  daFt: number;
  diagonalFt: number;
  northRotationDeg: number;
  showAngles: boolean;
  showTriangulation: boolean;
  showGrid: boolean;
}

export interface ProjectedDiagramGeometry {
  svgPts: { A: Point2D; B: Point2D; C: Point2D; D: Point2D };
  tri1Centroid: Point2D;
  tri2Centroid: Point2D;
  scalePxPerFt: number;
  svgSignedArea: number;
  scaleBar: {
    lengthPx: number;
    label: string;
  };
}

export function chooseNiceScaleLength(maxFeet: number, unit: LengthUnit): { feet: number; label: string } {
  const unitFactor =
    unit === 'm'
      ? METERS_PER_FOOT
      : unit === 'link'
        ? 1 / FEET_PER_LINK
        : unit === 'haat'
          ? 1 / FEET_PER_HAAT
          : 1;
  const suffix = unit === 'm' ? 'm' : unit === 'link' ? 'links' : unit === 'haat' ? 'haat' : 'ft';
  const maxInUnit = maxFeet * unitFactor;
  const target = Math.max(0.5, maxInUnit * 0.24);
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / mag;
  const niceMult = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  const niceUnitVal = niceMult * mag;
  const feet = niceUnitVal / unitFactor;
  return {
    feet,
    label: `${Number(niceUnitVal.toFixed(2))} ${suffix}`,
  };
}

export function projectQuadToViewport(
  geometry: QuadGeometryResult,
  width: number,
  height: number,
  paddingX: number,
  paddingY: number,
  unit: LengthUnit
): ProjectedDiagramGeometry | null {
  if (!geometry.valid || !geometry.vertices || !geometry.triangle1 || !geometry.triangle2) {
    return null;
  }

  const { A, B, C, D } = geometry.vertices;
  const allPts = [A, B, C, D];
  const minX = Math.min(...allPts.map((p) => p.x));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxY = Math.max(...allPts.map((p) => p.y));

  const spanX = Math.max(1e-3, maxX - minX);
  const spanY = Math.max(1e-3, maxY - minY);

  const availW = Math.max(80, width - paddingX * 2);
  const availH = Math.max(80, height - paddingY * 2);
  const scalePxPerFt = Math.min(availW / spanX, availH / spanY);

  const midWorldX = (minX + maxX) / 2;
  const midWorldY = (minY + maxY) / 2;
  const cx = width / 2;
  const cy = height / 2;

  const mapPt = (p: Point2D): Point2D => ({
    x: cx + (p.x - midWorldX) * scalePxPerFt,
    y: cy - (p.y - midWorldY) * scalePxPerFt,
  });

  const svgA = mapPt(A);
  const svgB = mapPt(B);
  const svgC = mapPt(C);
  const svgD = mapPt(D);

  const ordered = [svgA, svgB, svgC, svgD];
  let signed = 0;
  for (let i = 0; i < 4; i++) {
    const p = ordered[i];
    const q = ordered[(i + 1) % 4];
    signed += p.x * q.y - q.x * p.y;
  }
  const svgSignedArea = signed / 2;

  const nice = chooseNiceScaleLength(Math.max(spanX, spanY), unit);

  return {
    svgPts: { A: svgA, B: svgB, C: svgC, D: svgD },
    tri1Centroid: mapPt(geometry.triangle1.centroid),
    tri2Centroid: mapPt(geometry.triangle2.centroid),
    scalePxPerFt,
    svgSignedArea,
    scaleBar: {
      lengthPx: nice.feet * scalePxPerFt,
      label: nice.label,
    },
  };
}

export function getOutwardNormal(p1: Point2D, p2: Point2D, svgSignedArea: number): Point2D {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  if (svgSignedArea >= 0) {
    return { x: dy / len, y: -dx / len };
  }
  return { x: -dy / len, y: dx / len };
}

export function getAngleArcPath(
  prev: Point2D,
  curr: Point2D,
  next: Point2D,
  radius: number,
  svgSignedArea: number
): { path: string; labelPos: Point2D } {
  const u = { x: prev.x - curr.x, y: prev.y - curr.y };
  const v = { x: next.x - curr.x, y: next.y - curr.y };
  const uLen = Math.hypot(u.x, u.y) || 1;
  const vLen = Math.hypot(v.x, v.y) || 1;
  const r = Math.min(radius, uLen * 0.32, vLen * 0.32);

  const startVec = svgSignedArea >= 0 ? v : u;
  const endVec = svgSignedArea >= 0 ? u : v;
  const startAngle = Math.atan2(startVec.y, startVec.x);
  const endAngle = Math.atan2(endVec.y, endVec.x);

  let delta = endAngle - startAngle;
  while (delta <= 0) delta += Math.PI * 2;
  while (delta > Math.PI * 2) delta -= Math.PI * 2;

  const sx = curr.x + Math.cos(startAngle) * r;
  const sy = curr.y + Math.sin(startAngle) * r;
  const ex = curr.x + Math.cos(endAngle) * r;
  const ey = curr.y + Math.sin(endAngle) * r;

  const largeArc = delta > Math.PI ? 1 : 0;
  const midAngle = startAngle + delta / 2;
  const labelDist = r + 15;

  return {
    path: `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`,
    labelPos: {
      x: curr.x + Math.cos(midAngle) * labelDist,
      y: curr.y + Math.sin(midAngle) * labelDist,
    },
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateStandaloneSVG(
  geometry: QuadGeometryResult,
  area: AreaConversion,
  meta: DiagramMetadata,
  lang: Language
): string {
  const t = TRANSLATIONS[lang];
  const width = 1200;
  const height = 840;
  const headerH = 104;
  const footerH = 152;
  const drawTop = headerH;
  const drawH = height - headerH - footerH;

  const proj = projectQuadToViewport(geometry, width, drawH, 150, 96, meta.unit);
  if (!proj || !geometry.anglesDeg || !geometry.triangle1 || !geometry.triangle2) {
    return '';
  }

  // Shift projected points down by drawTop
  const shift = (p: Point2D): Point2D => ({ x: p.x, y: p.y + drawTop });
  const A = shift(proj.svgPts.A);
  const B = shift(proj.svgPts.B);
  const C = shift(proj.svgPts.C);
  const D = shift(proj.svgPts.D);
  const c1 = shift(proj.tri1Centroid);
  const c2 = shift(proj.tri2Centroid);

  const diagStart = meta.diagonalType === 'AC' ? A : B;
  const diagEnd = meta.diagonalType === 'AC' ? C : D;
  const diagMid = { x: (diagStart.x + diagEnd.x) / 2, y: (diagStart.y + diagEnd.y) / 2 };

  const edges = [
    { p1: A, p2: B, lenFt: meta.abFt, tag: 'AB' },
    { p1: B, p2: C, lenFt: meta.bcFt, tag: 'BC' },
    { p1: C, p2: D, lenFt: meta.cdFt, tag: 'CD' },
    { p1: D, p2: A, lenFt: meta.daFt, tag: 'DA' },
  ];

  const vertexConfigs = [
    { key: 'A', pt: A, prev: D, next: B, deg: geometry.anglesDeg.A },
    { key: 'B', pt: B, prev: A, next: C, deg: geometry.anglesDeg.B },
    { key: 'C', pt: C, prev: B, next: D, deg: geometry.anglesDeg.C },
    { key: 'D', pt: D, prev: C, next: A, deg: geometry.anglesDeg.D },
  ];

  const titleText = meta.plotName.trim() || t.printReportTitle;
  const metaParts: string[] = [];
  if (meta.mouza.trim()) metaParts.push(`${t.mouzaLabel}: ${meta.mouza.trim()}`);
  if (meta.dagNo.trim()) metaParts.push(`${t.dagLabel}: ${meta.dagNo.trim()}`);
  if (meta.khatianNo.trim()) metaParts.push(`${t.khatianLabel}: ${meta.khatianNo.trim()}`);
  const subtitleLine = metaParts.length > 0 ? metaParts.join('  ·  ') : t.printGeneratedLocally;
  const dateStr = new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const edgeLabelsSvg = edges
    .map((e) => {
      const mid = { x: (e.p1.x + e.p2.x) / 2, y: (e.p1.y + e.p2.y) / 2 };
      const norm = getOutwardNormal(e.p1, e.p2, proj.svgSignedArea);
      const lx = mid.x + norm.x * 28;
      const ly = mid.y + norm.y * 28;
      const txt = `${e.tag}: ${formatLengthFromFeet(e.lenFt, meta.unit, true)}`;
      return `
        <g>
          <rect x="${(lx - 58).toFixed(1)}" y="${(ly - 13).toFixed(1)}" width="116" height="26" rx="4" fill="#FFFFFF" fill-opacity="0.92" stroke="#CBD5E1" stroke-width="1" />
          <text x="${lx.toFixed(1)}" y="${(ly + 4.5).toFixed(1)}" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="12.5" font-weight="600" fill="#0F172A">${escapeXml(txt)}</text>
        </g>`;
    })
    .join('');

  const anglesSvg = meta.showAngles
    ? vertexConfigs
        .map((v) => {
          const arc = getAngleArcPath(v.prev, v.pt, v.next, 28, proj.svgSignedArea);
          return `
            <path d="${arc.path}" fill="none" stroke="#64748B" stroke-width="1.25" />
            <text x="${arc.labelPos.x.toFixed(1)}" y="${(arc.labelPos.y + 4).toFixed(1)}" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="11" fill="#475569">${v.deg.toFixed(1)}°</text>`;
        })
        .join('')
    : '';

  const verticesSvg = vertexConfigs
    .map((v) => {
      // Push vertex letter outward along average of adjacent outward normals
      const n1 = getOutwardNormal(v.prev, v.pt, proj.svgSignedArea);
      const n2 = getOutwardNormal(v.pt, v.next, proj.svgSignedArea);
      const bx = n1.x + n2.x;
      const by = n1.y + n2.y;
      const bl = Math.hypot(bx, by) || 1;
      const vx = v.pt.x + (bx / bl) * 20;
      const vy = v.pt.y + (by / bl) * 20;
      return `
        <circle cx="${v.pt.x.toFixed(1)}" cy="${v.pt.y.toFixed(1)}" r="4.5" fill="#0F6E56" stroke="#FFFFFF" stroke-width="2" />
        <text x="${vx.toFixed(1)}" y="${(vy + 4.5).toFixed(1)}" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-size="14" font-weight="700" fill="#0F6E56">${v.key}</text>`;
    })
    .join('');

  const triSvg = meta.showTriangulation
    ? `
      <line x1="${diagStart.x.toFixed(1)}" y1="${diagStart.y.toFixed(1)}" x2="${diagEnd.x.toFixed(1)}" y2="${diagEnd.y.toFixed(1)}" stroke="#0F6E56" stroke-width="1.8" stroke-dasharray="8 6" />
      <rect x="${(diagMid.x - 62).toFixed(1)}" y="${(diagMid.y - 12).toFixed(1)}" width="124" height="24" rx="4" fill="#EBF5F2" stroke="#0F6E56" stroke-width="1" />
      <text x="${diagMid.x.toFixed(1)}" y="${(diagMid.y + 4).toFixed(1)}" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="11.5" font-weight="600" fill="#0F6E56">${meta.diagonalType}: ${escapeXml(formatLengthFromFeet(meta.diagonalFt, meta.unit, true))}</text>
      <text x="${c1.x.toFixed(1)}" y="${c1.y.toFixed(1)}" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="11" fill="#475569">${escapeXml(geometry.triangle1.label)}: ${formatNumber(geometry.triangle1.areaSqFt, 1)} sq ft</text>
      <text x="${c2.x.toFixed(1)}" y="${c2.y.toFixed(1)}" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="11" fill="#475569">${escapeXml(geometry.triangle2.label)}: ${formatNumber(geometry.triangle2.areaSqFt, 1)} sq ft</text>
    `
    : '';

  const gridSvg = meta.showGrid
    ? `<rect x="40" y="${drawTop}" width="${width - 80}" height="${drawH}" fill="url(#surveyGrid)" />`
    : '';

  // Footer unit columns
  const cols = [
    { label: t.unitShotok, val: formatNumber(area.shotok, 3) },
    { label: t.unitKatha, val: formatNumber(area.katha, 3) },
    { label: t.unitBigha, val: formatNumber(area.bigha, 4) },
    { label: t.unitSqFt, val: formatNumber(area.sqFt, 2) },
  ];
  const colW = (width - 80) / 4;
  const footerColsSvg = cols
    .map((col, idx) => {
      const x = 40 + idx * colW;
      const divider =
        idx > 0
          ? `<line x1="${x}" y1="${height - footerH + 22}" x2="${x}" y2="${height - 46}" stroke="#E2E8F0" stroke-width="1" />`
          : '';
      return `
        ${divider}
        <text x="${x + 18}" y="${height - footerH + 40}" font-family="'Plus Jakarta Sans', sans-serif" font-size="13" font-weight="500" fill="#64748B">${escapeXml(col.label)}</text>
        <text x="${x + 18}" y="${height - footerH + 74}" font-family="'IBM Plex Mono', monospace" font-size="26" font-weight="600" fill="#0F172A">${escapeXml(col.val)}</text>
      `;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <pattern id="surveyGrid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#F1F5F9" stroke-width="1" />
    </pattern>
    <pattern id="plotHatch" width="12" height="12" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="12" stroke="#0F6E56" stroke-opacity="0.11" stroke-width="1.2" />
    </pattern>
  </defs>

  <rect width="${width}" height="${height}" fill="#FFFFFF" />

  <!-- Header -->
  <text x="44" y="48" font-family="'Plus Jakarta Sans', sans-serif" font-size="24" font-weight="700" fill="#0F172A">${escapeXml(titleText)}</text>
  <text x="44" y="74" font-family="'Plus Jakarta Sans', sans-serif" font-size="13" fill="#64748B">${escapeXml(subtitleLine)}</text>
  <text x="${width - 44}" y="48" text-anchor="end" font-family="'Plus Jakarta Sans', sans-serif" font-size="15" font-weight="700" fill="#0F6E56">${escapeXml(t.brand)}</text>
  <text x="${width - 44}" y="72" text-anchor="end" font-family="'IBM Plex Mono', monospace" font-size="12" fill="#64748B">${escapeXml(dateStr)}</text>
  <line x1="40" y1="${headerH - 8}" x2="${width - 40}" y2="${headerH - 8}" stroke="#E2E8F0" stroke-width="1" />

  <!-- Drawing Canvas -->
  ${gridSvg}

  <!-- Compass Rose -->
  <g transform="translate(${width - 92}, ${drawTop + 58}) rotate(${meta.northRotationDeg})">
    <circle cx="0" cy="0" r="24" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />
    <polygon points="0,-17 5,2 0,-2 -5,2" fill="#0F6E56" />
    <polygon points="0,17 5,-2 0,2 -5,-2" fill="#CBD5E1" />
    <text x="0" y="-29" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="11" font-weight="600" fill="#0F172A">N</text>
  </g>

  <!-- Plot Polygon -->
  <polygon points="${A.x.toFixed(1)},${A.y.toFixed(1)} ${B.x.toFixed(1)},${B.y.toFixed(1)} ${C.x.toFixed(1)},${C.y.toFixed(1)} ${D.x.toFixed(1)},${D.y.toFixed(1)}" fill="#0F6E56" fill-opacity="0.06" />
  <polygon points="${A.x.toFixed(1)},${A.y.toFixed(1)} ${B.x.toFixed(1)},${B.y.toFixed(1)} ${C.x.toFixed(1)},${C.y.toFixed(1)} ${D.x.toFixed(1)},${D.y.toFixed(1)}" fill="url(#plotHatch)" stroke="#0F6E56" stroke-width="2.6" stroke-linejoin="round" />

  ${triSvg}
  ${anglesSvg}
  ${edgeLabelsSvg}
  ${verticesSvg}

  <!-- Scale Bar -->
  <g transform="translate(56, ${drawTop + drawH - 28})">
    <line x1="0" y1="0" x2="${proj.scaleBar.lengthPx.toFixed(1)}" y2="0" stroke="#0F172A" stroke-width="2" />
    <line x1="0" y1="-5" x2="0" y2="5" stroke="#0F172A" stroke-width="1.5" />
    <line x1="${proj.scaleBar.lengthPx.toFixed(1)}" y1="-5" x2="${proj.scaleBar.lengthPx.toFixed(1)}" y2="5" stroke="#0F172A" stroke-width="1.5" />
    <text x="${(proj.scaleBar.lengthPx / 2).toFixed(1)}" y="-9" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="11" fill="#475569">${escapeXml(t.scaleLabel)}: ${escapeXml(proj.scaleBar.label)}</text>
  </g>

  <!-- Footer Summary Strip -->
  <line x1="40" y1="${height - footerH}" x2="${width - 40}" y2="${height - footerH}" stroke="#E2E8F0" stroke-width="1.2" />
  ${footerColsSvg}
  <text x="58" y="${height - 20}" font-family="'IBM Plex Mono', monospace" font-size="11.5" fill="#64748B">${escapeXml(t.perimeter)}: ${escapeXml(formatLengthFromFeet(geometry.perimeterFt, meta.unit))}   ·   ${escapeXml(t.unitAcre)}: ${formatNumber(area.acre, 4)}   ·   ${escapeXml(t.unitSqMeter)}: ${formatNumber(area.sqMeter, 2)} m²</text>
</svg>`;
}

export async function renderSurveyPNGBlob(
  geometry: QuadGeometryResult,
  area: AreaConversion,
  meta: DiagramMetadata,
  lang: Language
): Promise<Blob | null> {
  const svgString = generateStandaloneSVG(geometry, area, meta, lang);
  if (!svgString) return null;

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function triggerLocalDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildShareText(
  geometry: QuadGeometryResult,
  area: AreaConversion,
  meta: DiagramMetadata,
  lang: Language
): string {
  const t = TRANSLATIONS[lang];
  const lines: string[] = [];
  const title = meta.plotName.trim() || t.printReportTitle;
  lines.push(`${title} (${t.brand})`);

  const refs: string[] = [];
  if (meta.mouza.trim()) refs.push(`${t.mouzaLabel}: ${meta.mouza.trim()}`);
  if (meta.dagNo.trim()) refs.push(`${t.dagLabel}: ${meta.dagNo.trim()}`);
  if (meta.khatianNo.trim()) refs.push(`${t.khatianLabel}: ${meta.khatianNo.trim()}`);
  if (refs.length) lines.push(refs.join(' | '));

  lines.push('');
  lines.push(`${t.unitShotok}: ${formatNumber(area.shotok, 3)}`);
  lines.push(`${t.unitKatha}: ${formatNumber(area.katha, 3)}`);
  lines.push(`${t.unitBigha}: ${formatNumber(area.bigha, 4)}`);
  lines.push(`${t.unitSqFt}: ${formatNumber(area.sqFt, 2)} sq ft`);
  lines.push(`${t.unitAcre}: ${formatNumber(area.acre, 4)} | ${t.unitSqMeter}: ${formatNumber(area.sqMeter, 2)} m²`);
  lines.push('');
  lines.push(
    `${t.sidesHeading}: AB ${formatLengthFromFeet(meta.abFt, meta.unit, true)}, BC ${formatLengthFromFeet(meta.bcFt, meta.unit, true)}, CD ${formatLengthFromFeet(meta.cdFt, meta.unit, true)}, DA ${formatLengthFromFeet(meta.daFt, meta.unit, true)}`
  );
  lines.push(
    `${meta.diagonalType === 'AC' ? t.diagonalAC : t.diagonalBD}: ${formatLengthFromFeet(meta.diagonalFt, meta.unit, true)} | ${t.perimeter}: ${formatLengthFromFeet(geometry.perimeterFt, meta.unit, true)}`
  );
  return lines.join('\n');
}
