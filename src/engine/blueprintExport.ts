import {
  BlueprintSettings,
  BuildingProject,
  PaperOrientation,
  PaperSize,
  PhysicsReport,
  PrintScale,
  Story,
} from '../types/building';
import {
  computeActualPlotSetbacks,
  computeStructuralGrid,
  pointAtWallOffset,
} from './geometryKernel';
import {
  computeExteriorDimensionChains,
  computeRoomClearDimensions,
  computeScheduleData,
  computeWallPolygons,
  getBlueprintSettings,
} from './cad2d';
import { formatArea, formatBanglaLandSummary, formatLength, METERS_PER_FOOT } from './units';

export interface PaperSpecMm {
  widthMm: number;
  heightMm: number;
  label: string;
}

export function getPaperDimensionsMm(
  size: PaperSize,
  orientation: PaperOrientation
): PaperSpecMm {
  const base =
    size === 'A3'
      ? { w: 420, h: 297, label: 'A3' }
      : size === 'Letter'
      ? { w: 279.4, h: 215.9, label: 'Letter' }
      : { w: 297, h: 210, label: 'A4' };

  return orientation === 'landscape'
    ? { widthMm: base.w, heightMm: base.h, label: `${base.label} Landscape` }
    : { widthMm: base.h, heightMm: base.w, label: `${base.label} Portrait` };
}

/** Architectural scale ratio denominator (e.g. 1:100 => 100, 1/4"=1'-0" => 48) */
export function resolveScaleDenominator(
  scale: PrintScale,
  worldWidthM: number,
  worldDepthM: number,
  availWidthMm: number,
  availHeightMm: number,
  unit: 'imperial' | 'metric'
): { denom: number; label: string } {
  if (scale === '1:50') return { denom: 50, label: '1 : 50' };
  if (scale === '1:100') return { denom: 100, label: '1 : 100' };
  if (scale === '1/4"=1\'') return { denom: 48, label: '1/4" = 1\'-0" (1:48)' };
  if (scale === '1/8"=1\'') return { denom: 96, label: '1/8" = 1\'-0" (1:96)' };

  // Auto-select cleanest standard architectural scale that fits comfortably
  const reqDenomW = (worldWidthM * 1000) / Math.max(40, availWidthMm);
  const reqDenomH = (worldDepthM * 1000) / Math.max(40, availHeightMm);
  const req = Math.max(reqDenomW, reqDenomH, 10);

  const candidates =
    unit === 'imperial'
      ? [
          { denom: 24, label: '1/2" = 1\'-0" (1:24)' },
          { denom: 48, label: '1/4" = 1\'-0" (1:48)' },
          { denom: 64, label: '3/16" = 1\'-0" (1:64)' },
          { denom: 96, label: '1/8" = 1\'-0" (1:96)' },
          { denom: 120, label: '1" = 10\'-0" (1:120)' },
          { denom: 192, label: '1/16" = 1\'-0" (1:192)' },
          { denom: 240, label: '1" = 20\'-0" (1:240)' },
        ]
      : [
          { denom: 25, label: '1 : 25' },
          { denom: 50, label: '1 : 50' },
          { denom: 75, label: '1 : 75' },
          { denom: 100, label: '1 : 100' },
          { denom: 150, label: '1 : 150' },
          { denom: 200, label: '1 : 200' },
          { denom: 250, label: '1 : 250' },
        ];

  for (const c of candidates) {
    if (c.denom >= req * 1.04) return c;
  }
  const fallback = Math.ceil((req * 1.05) / 50) * 50;
  return { denom: fallback, label: `1 : ${fallback}` };
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function computeStoryWorldBounds(project: BuildingProject, story: Story): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const expand = (x: number, z: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };

  if (project.plot) {
    expand(project.plot.originX, project.plot.originZ);
    expand(project.plot.originX + project.plot.width, project.plot.originZ + project.plot.depth);
  }
  for (const sl of story.slabs) {
    expand(sl.x, sl.z);
    expand(sl.x + sl.width, sl.z + sl.depth);
  }
  for (const w of story.walls) {
    expand(w.x1, w.z1);
    expand(w.x2, w.z2);
  }
  for (const p of story.pillars) {
    expand(p.x - p.width, p.z - p.depth);
    expand(p.x + p.width, p.z + p.depth);
  }
  for (const an of story.annotations ?? []) {
    expand(an.x1, an.z1);
    if (an.x2 !== undefined && an.z2 !== undefined) expand(an.x2, an.z2);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 12, minZ: 0, maxZ: 12 };
  }
  // Leave breathing margin for 3-tier exterior dimension chains & grid bubbles
  return {
    minX: minX - 2.6,
    maxX: maxX + 2.6,
    minZ: minZ - 2.6,
    maxZ: maxZ + 2.6,
  };
}

/**
 * Generates a self-contained, crisp architectural Vector SVG blueprint sheet
 * with ISO/ANSI line-weight hierarchy, wall hatches, 3-tier exterior dimension chains,
 * auto-numbered D1/W1/C1 schedule tags, Door/Window schedule table, North Arrow,
 * graphic scale bar, and Bangladeshi land & BNBC 2020 title block.
 */
export function generateBlueprintSvg(
  project: BuildingProject,
  story: Story,
  physics: PhysicsReport,
  overrideSettings?: Partial<BlueprintSettings>
): { svg: string; paper: PaperSpecMm; scaleLabel: string } {
  const settings: BlueprintSettings = {
    ...getBlueprintSettings(project),
    ...(overrideSettings ?? {}),
    layers: {
      ...getBlueprintSettings(project).layers,
      ...(overrideSettings?.layers ?? {}),
    },
  };
  const paper = getPaperDimensionsMm(settings.paperSize, settings.paperOrientation);
  const unit = project.unitSystem;
  const isMono = settings.sheetMode === 'print';
  const isPres = settings.sheetMode === 'presentation';

  // Work in exact millimeter viewBox units (1 SVG unit = 1 mm on printed paper!)
  const W = paper.widthMm;
  const H = paper.heightMm;
  const margin = 8;
  const titleBarH = 26;
  const rightScheduleW = settings.showScheduleTags && W >= 320 ? 64 : 0;

  const drawX = margin + 2;
  const drawY = margin + 2;
  const drawW = W - margin * 2 - rightScheduleW - 4;
  const drawH = H - margin * 2 - titleBarH - 4;

  const bounds = computeStoryWorldBounds(project, story);
  const worldW = Math.max(2, bounds.maxX - bounds.minX);
  const worldD = Math.max(2, bounds.maxZ - bounds.minZ);

  const scaleInfo = resolveScaleDenominator(
    settings.printScale,
    worldW,
    worldD,
    drawW,
    drawH,
    unit
  );

  // mm per world meter at chosen scale
  const mmPerM = 1000 / scaleInfo.denom;
  const contentWmm = worldW * mmPerM;
  const contentHmm = worldD * mmPerM;
  const originMmX = drawX + (drawW - contentWmm) * 0.5 - bounds.minX * mmPerM;
  const originMmY = drawY + (drawH - contentHmm) * 0.5 - bounds.minZ * mmPerM;

  const tx = (xM: number) => Number((originMmX + xM * mmPerM).toFixed(3));
  const ty = (zM: number) => Number((originMmY + zM * mmPerM).toFixed(3));
  const ts = (lenM: number) => Number((lenM * mmPerM).toFixed(3));

  const ink = '#0f172a';
  const muted = '#475569';
  const faint = '#94a3b8';
  const accent = isMono ? '#0f172a' : '#1d4ed8';

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" style="background:#ffffff;font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;">`
  );

  // Hatch patterns & clip path for the drawing viewport
  parts.push(`<defs>
    <clipPath id="plan-clip">
      <rect x="${drawX}" y="${drawY}" width="${drawW}" height="${drawH}" />
    </clipPath>
    <pattern id="hatch-brick" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="2.2" height="2.2" fill="${isMono ? '#f8fafc' : '#f1f5f9'}" />
      <line x1="0" y1="0" x2="0" y2="2.2" stroke="${isMono ? '#1e293b' : '#475569'}" stroke-width="0.22" />
    </pattern>
    <pattern id="hatch-block" width="2.6" height="2.6" patternUnits="userSpaceOnUse">
      <rect width="2.6" height="2.6" fill="#f8fafc" />
      <path d="M 0 1.3 L 2.6 1.3 M 1.3 0 L 1.3 2.6" stroke="#64748b" stroke-width="0.16" />
    </pattern>
    <pattern id="hatch-wet" width="3" height="3" patternUnits="userSpaceOnUse">
      <path d="M 3 0 L 0 0 0 3" fill="none" stroke="${isMono ? '#cbd5e1' : '#bae6fd'}" stroke-width="0.18" />
    </pattern>
    <pattern id="hatch-cutout" width="2.8" height="2.8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <line x1="0" y1="0" x2="0" y2="2.8" stroke="#94a3b8" stroke-width="0.18" />
    </pattern>
  </defs>`);

  // Sheet background & crisp double architectural frame
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />`);
  parts.push(
    `<rect x="${margin}" y="${margin}" width="${W - margin * 2}" height="${H - margin * 2}" fill="none" stroke="${ink}" stroke-width="0.55" />`
  );
  parts.push(
    `<rect x="${margin + 1.2}" y="${margin + 1.2}" width="${W - (margin + 1.2) * 2}" height="${H - (margin + 1.2) * 2}" fill="none" stroke="${ink}" stroke-width="0.18" />`
  );

  // Clipped architectural plan viewport
  parts.push(`<g clip-path="url(#plan-clip)">`);

  // 1. Plot Boundary & Setbacks
  if (project.plot && settings.layers.setbacks) {
    const p = project.plot;
    const px = tx(p.originX);
    const py = ty(p.originZ);
    const pw = ts(p.width);
    const pd = ts(p.depth);

    parts.push(
      `<rect x="${px}" y="${py}" width="${pw}" height="${pd}" fill="${isPres ? '#f8fafc' : 'none'}" stroke="${ink}" stroke-width="0.35" stroke-dasharray="3 1.2 0.6 1.2" />`
    );

    const sb = p.setbacks;
    let sLeft = sb.left;
    let sRight = sb.right;
    let sTop = sb.rear;
    let sBot = sb.front;
    if (p.roadSide === 'north') {
      sTop = sb.front;
      sBot = sb.rear;
      sLeft = sb.right;
      sRight = sb.left;
    } else if (p.roadSide === 'east') {
      sRight = sb.front;
      sLeft = sb.rear;
      sTop = sb.right;
      sBot = sb.left;
    } else if (p.roadSide === 'west') {
      sLeft = sb.front;
      sRight = sb.rear;
      sTop = sb.left;
      sBot = sb.right;
    }
    const bx = tx(p.originX + sLeft);
    const by = ty(p.originZ + sTop);
    const bw = Math.max(0, ts(p.width - sLeft - sRight));
    const bd = Math.max(0, ts(p.depth - sTop - sBot));
    if (bw > 1 && bd > 1) {
      parts.push(
        `<rect x="${bx}" y="${by}" width="${bw}" height="${bd}" fill="none" stroke="${isMono ? muted : '#15803d'}" stroke-width="0.2" stroke-dasharray="1.8 1.2" />`
      );
    }

    // Road side callout
    const roadLabel = `ACCESS ROAD (${p.roadSide.toUpperCase()})`;
    const rX = p.roadSide === 'west' ? px - 3 : p.roadSide === 'east' ? px + pw + 3 : px + pw * 0.5;
    const rY = p.roadSide === 'north' ? py - 3 : p.roadSide === 'south' ? py + pd + 4.5 : py + pd * 0.5;
    parts.push(
      `<text x="${rX}" y="${rY}" text-anchor="middle" font-size="2.2" font-weight="600" fill="${muted}" letter-spacing="0.4">${escapeXml(roadLabel)}</text>`
    );
  }

  // 2. Structural Gridlines (A, B, C / 1, 2, 3)
  if (settings.layers.grid) {
    const grid = computeStructuralGrid(story);
    const gTop = ty(bounds.minZ + 0.7);
    const gBot = ty(bounds.maxZ - 0.7);
    const gLeft = tx(bounds.minX + 0.7);
    const gRight = tx(bounds.maxX - 0.7);
    for (const gx of grid.xLines) {
      const sx = tx(gx.coord);
      parts.push(
        `<line x1="${sx}" y1="${gTop}" x2="${sx}" y2="${gBot}" stroke="${faint}" stroke-width="0.16" stroke-dasharray="2.5 1.1 0.5 1.1" />`
      );
      parts.push(
        `<circle cx="${sx}" cy="${gTop - 2.3}" r="2.1" fill="#ffffff" stroke="${ink}" stroke-width="0.22" />`
      );
      parts.push(
        `<text x="${sx}" y="${gTop - 1.55}" text-anchor="middle" font-size="2.2" font-weight="700" fill="${ink}">${escapeXml(gx.label)}</text>`
      );
    }
    for (const gz of grid.zLines) {
      const sy = ty(gz.coord);
      parts.push(
        `<line x1="${gLeft}" y1="${sy}" x2="${gRight}" y2="${sy}" stroke="${faint}" stroke-width="0.16" stroke-dasharray="2.5 1.1 0.5 1.1" />`
      );
      parts.push(
        `<circle cx="${gLeft - 2.3}" cy="${sy}" r="2.1" fill="#ffffff" stroke="${ink}" stroke-width="0.22" />`
      );
      parts.push(
        `<text x="${gLeft - 2.3}" y="${sy + 0.75}" text-anchor="middle" font-size="2.2" font-weight="700" fill="${ink}">${escapeXml(gz.label)}</text>`
      );
    }
  }

  // 3. Floor Slabs & Cutouts
  for (const sl of story.slabs) {
    const fill =
      sl.type === 'balcony'
        ? isMono
          ? '#f8fafc'
          : '#f1f5f9'
        : isPres
        ? '#fafaf9'
        : '#ffffff';
    parts.push(
      `<rect x="${tx(sl.x)}" y="${ty(sl.z)}" width="${ts(sl.width)}" height="${ts(sl.depth)}" fill="${fill}" stroke="${faint}" stroke-width="0.2" />`
    );
    for (const cut of sl.cutouts ?? []) {
      const cx = tx(cut.x);
      const cy = ty(cut.z);
      const cw = ts(cut.width);
      const cd = ts(cut.depth);
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${cw}" height="${cd}" fill="url(#hatch-cutout)" stroke="${muted}" stroke-width="0.22" stroke-dasharray="1.4 0.8" />`
      );
      parts.push(
        `<line x1="${cx}" y1="${cy}" x2="${cx + cw}" y2="${cy + cd}" stroke="${faint}" stroke-width="0.16" />`
      );
      parts.push(
        `<line x1="${cx + cw}" y1="${cy}" x2="${cx}" y2="${cy + cd}" stroke="${faint}" stroke-width="0.16" />`
      );
    }
  }

  // 4. Rooms (Presentation tints / wet-area tile hatch + Clear Interior or Centerline Labels)
  if (settings.layers.rooms) {
    for (const rm of story.rooms) {
      const lower = rm.name.toLowerCase();
      const isWet =
        lower.includes('bath') ||
        lower.includes('toilet') ||
        lower.includes('wc') ||
        lower.includes('kitchen') ||
        lower.includes('wash');

      const fill = isWet
        ? 'url(#hatch-wet)'
        : isPres
        ? lower.includes('bed')
          ? '#f8fafc'
          : lower.includes('living') || lower.includes('drawing') || lower.includes('dining')
          ? '#fefce8'
          : '#f1f5f9'
        : 'none';

      if (fill !== 'none') {
        if (rm.polygon && rm.polygon.length >= 3) {
          const pts = rm.polygon.map((pt) => `${tx(pt.x)},${ty(pt.z)}`).join(' ');
          parts.push(`<polygon points="${pts}" fill="${fill}" stroke="none" />`);
        } else {
          parts.push(
            `<rect x="${tx(rm.x)}" y="${ty(rm.z)}" width="${ts(rm.width)}" height="${ts(rm.depth)}" fill="${fill}" stroke="none" />`
          );
        }
      }

      const dims = computeRoomClearDimensions(rm, story);
      const useClear = settings.dimensionBasis === 'interior';
      const wDisp = useClear ? dims.clearW : dims.centerlineW;
      const dDisp = useClear ? dims.clearD : dims.centerlineD;
      const aDisp = useClear ? dims.clearAreaM2 : dims.centerlineAreaM2;

      const cx = tx(rm.x + rm.width * 0.5);
      const cy = ty(rm.z + rm.depth * 0.5);
      parts.push(
        `<text x="${cx}" y="${cy - 1.2}" text-anchor="middle" font-size="2.6" font-weight="700" fill="${ink}">${escapeXml(rm.name)}</text>`
      );
      parts.push(
        `<text x="${cx}" y="${cy + 1.5}" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="2.0" fill="${muted}">${escapeXml(`${formatLength(wDisp, unit)} × ${formatLength(dDisp, unit)}`)}</text>`
      );
      parts.push(
        `<text x="${cx}" y="${cy + 3.9}" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="1.8" fill="${faint}">${escapeXml(formatArea(aDisp, unit))}</text>`
      );
    }
  }

  // 5. Overhead Beams (dashed structural lines)
  if (settings.layers.structure) {
    for (const bm of story.beams) {
      parts.push(
        `<line x1="${tx(bm.x1)}" y1="${ty(bm.z1)}" x2="${tx(bm.x2)}" y2="${ty(bm.z2)}" stroke="${muted}" stroke-width="0.2" stroke-dasharray="1.8 1.2" />`
      );
    }
  }

  // 6. Architectural Furniture & Circulation Symbols
  if (settings.layers.furniture) {
    for (const a of story.assets) {
      const cx = tx(a.x);
      const cy = ty(a.z);
      const w = ts(a.width);
      const d = ts(a.depth);
      const deg = Number(((a.rotation * 180) / Math.PI).toFixed(2));
      const stroke = isMono ? '#334155' : '#475569';
      parts.push(`<g transform="translate(${cx},${cy}) rotate(${deg})">`);
      parts.push(
        `<rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" fill="${isPres ? '#ffffff' : 'none'}" stroke="${stroke}" stroke-width="0.22" />`
      );
      if (a.assetId.includes('stair')) {
        const steps = 10;
        for (let i = 1; i < steps; i++) {
          const sy = -d / 2 + (d * i) / steps;
          parts.push(
            `<line x1="${-w / 2}" y1="${sy}" x2="${w / 2}" y2="${sy}" stroke="${stroke}" stroke-width="0.16" />`
          );
        }
        parts.push(
          `<line x1="0" y1="${d * 0.36}" x2="0" y2="${-d * 0.36}" stroke="${ink}" stroke-width="0.22" />`
        );
        parts.push(
          `<polyline points="${-w * 0.14},${-d * 0.18} 0,${-d * 0.36} ${w * 0.14},${-d * 0.18}" fill="none" stroke="${ink}" stroke-width="0.22" />`
        );
      } else if (a.assetId.includes('bed')) {
        parts.push(
          `<rect x="${-w * 0.44}" y="${-d * 0.44}" width="${w * 0.4}" height="${d * 0.2}" fill="none" stroke="${stroke}" stroke-width="0.16" />`
        );
        parts.push(
          `<rect x="${w * 0.04}" y="${-d * 0.44}" width="${w * 0.4}" height="${d * 0.2}" fill="none" stroke="${stroke}" stroke-width="0.16" />`
        );
        parts.push(
          `<line x1="${-w / 2}" y1="${-d * 0.1}" x2="${w / 2}" y2="${-d * 0.1}" stroke="${stroke}" stroke-width="0.16" />`
        );
      } else if (a.assetId.includes('lift')) {
        parts.push(
          `<line x1="${-w / 2}" y1="${-d / 2}" x2="${w / 2}" y2="${d / 2}" stroke="${stroke}" stroke-width="0.18" />`
        );
        parts.push(
          `<line x1="${w / 2}" y1="${-d / 2}" x2="${-w / 2}" y2="${d / 2}" stroke="${stroke}" stroke-width="0.18" />`
        );
      }
      parts.push(`</g>`);
    }
  }

  // 7. Mitered Architectural Walls with Material Poche & Heavy Cut Lines
  if (settings.layers.walls) {
    const wallPolys = computeWallPolygons(story);
    for (const wall of story.walls) {
      const poly = wallPolys.get(wall.id);
      if (!poly) continue;
      const fill =
        wall.material === 'rcc' || wall.material === 'fair-concrete'
          ? '#1e293b'
          : wall.material === 'hollow-block'
          ? 'url(#hatch-block)'
          : isPres
          ? '#1e293b'
          : 'url(#hatch-brick)';

      for (const q of poly.quads) {
        const pts = q.map((pt) => `${tx(pt.x)},${ty(pt.z)}`).join(' ');
        parts.push(`<polygon points="${pts}" fill="${fill}" stroke="none" />`);
      }
      for (const [a, b] of poly.outlineEdges) {
        parts.push(
          `<line x1="${tx(a.x)}" y1="${ty(a.z)}" x2="${tx(b.x)}" y2="${ty(b.z)}" stroke="${ink}" stroke-width="0.46" stroke-linecap="square" />`
        );
      }
    }
  }

  // 8. Doors & Windows (Standard Architectural CAD Symbols)
  if (settings.layers.openings) {
    for (const wall of story.walls) {
      const halfTmm = ts(wall.thickness * 0.5);
      for (const op of wall.openings) {
        const startPt = pointAtWallOffset(wall, op.offset);
        const midPt = pointAtWallOffset(wall, op.offset + op.width * 0.5);
        const wMm = ts(op.width);
        const deg = Number(((midPt.angle * 180) / Math.PI).toFixed(2));
        const sx = tx(startPt.x);
        const sy = ty(startPt.z);

        parts.push(`<g transform="translate(${sx},${sy}) rotate(${deg})">`);
        if (op.kind === 'door-single' || op.kind === 'door-double') {
          const dir = op.swing;
          if (op.kind === 'door-single') {
            // Door leaf + 90-degree quadrant swing arc
            const leaf = wMm;
            const arcSweep = dir > 0 ? 1 : 0;
            parts.push(
              `<line x1="0" y1="0" x2="0" y2="${dir * leaf}" stroke="${ink}" stroke-width="0.34" />`
            );
            parts.push(
              `<path d="M 0 ${dir * leaf} A ${leaf} ${leaf} 0 0 ${arcSweep} ${leaf} 0" fill="none" stroke="${muted}" stroke-width="0.2" stroke-dasharray="1.1 0.8" />`
            );
          } else {
            const leaf = wMm * 0.5;
            const sweepL = dir > 0 ? 1 : 0;
            const sweepR = dir > 0 ? 0 : 1;
            parts.push(
              `<line x1="0" y1="0" x2="0" y2="${dir * leaf}" stroke="${ink}" stroke-width="0.34" />`
            );
            parts.push(
              `<path d="M 0 ${dir * leaf} A ${leaf} ${leaf} 0 0 ${sweepL} ${leaf} 0" fill="none" stroke="${muted}" stroke-width="0.2" stroke-dasharray="1.1 0.8" />`
            );
            parts.push(
              `<line x1="${wMm}" y1="0" x2="${wMm}" y2="${dir * leaf}" stroke="${ink}" stroke-width="0.34" />`
            );
            parts.push(
              `<path d="M ${wMm} ${dir * leaf} A ${leaf} ${leaf} 0 0 ${sweepR} ${leaf} 0" fill="none" stroke="${muted}" stroke-width="0.2" stroke-dasharray="1.1 0.8" />`
            );
          }
        } else if (op.kind === 'door-sliding') {
          parts.push(
            `<rect x="0" y="${-halfTmm * 0.45}" width="${wMm * 0.55}" height="${halfTmm * 0.45}" fill="#ffffff" stroke="${ink}" stroke-width="0.24" />`
          );
          parts.push(
            `<rect x="${wMm * 0.45}" y="0" width="${wMm * 0.55}" height="${halfTmm * 0.45}" fill="#ffffff" stroke="${ink}" stroke-width="0.24" />`
          );
        } else if (op.kind === 'arch-opening') {
          parts.push(
            `<line x1="0" y1="${-halfTmm}" x2="${wMm}" y2="${-halfTmm}" stroke="${muted}" stroke-width="0.18" stroke-dasharray="1 0.8" />`
          );
          parts.push(
            `<line x1="0" y1="${halfTmm}" x2="${wMm}" y2="${halfTmm}" stroke="${muted}" stroke-width="0.18" stroke-dasharray="1 0.8" />`
          );
        } else {
          // Window sill & double glazing lines
          parts.push(
            `<rect x="0" y="${-halfTmm}" width="${wMm}" height="${halfTmm * 2}" fill="#ffffff" stroke="${ink}" stroke-width="0.22" />`
          );
          parts.push(
            `<line x1="0" y1="${-halfTmm * 0.28}" x2="${wMm}" y2="${-halfTmm * 0.28}" stroke="${accent}" stroke-width="0.26" />`
          );
          parts.push(
            `<line x1="0" y1="${halfTmm * 0.28}" x2="${wMm}" y2="${halfTmm * 0.28}" stroke="${accent}" stroke-width="0.26" />`
          );
        }
        parts.push(`</g>`);
      }
    }
  }

  // 9. Structural Columns (Solid dark RCC cut)
  if (settings.layers.structure) {
    for (const p of story.pillars) {
      const cx = tx(p.x);
      const cy = ty(p.z);
      const w = ts(p.width);
      const d = ts(p.depth);
      const deg = Number(((p.rotation * 180) / Math.PI).toFixed(2));
      parts.push(`<g transform="translate(${cx},${cy}) rotate(${deg})">`);
      if (p.shape === 'circular') {
        parts.push(`<circle cx="0" cy="0" r="${w / 2}" fill="${ink}" stroke="${ink}" stroke-width="0.3" />`);
      } else {
        parts.push(
          `<rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" fill="${ink}" stroke="${ink}" stroke-width="0.3" />`
        );
      }
      parts.push(`</g>`);
    }
  }

  // 10. Auto-Numbered Schedule Tags (D1, W1, C1)
  const schedule = computeScheduleData(story, unit);
  if (settings.showScheduleTags && settings.layers.dimensions) {
    for (const tg of schedule.tags) {
      const gx = tx(tg.x);
      const gy = ty(tg.z);
      if (tg.category === 'door') {
        parts.push(
          `<circle cx="${gx}" cy="${gy}" r="1.95" fill="#ffffff" stroke="${ink}" stroke-width="0.22" />`
        );
      } else if (tg.category === 'window') {
        parts.push(
          `<polygon points="${gx},${gy - 2.1} ${gx + 2.3},${gy} ${gx},${gy + 2.1} ${gx - 2.3},${gy}" fill="#ffffff" stroke="${accent}" stroke-width="0.22" />`
        );
      } else {
        parts.push(
          `<rect x="${gx - 2.1}" y="${gy - 1.5}" width="4.2" height="3.0" rx="0.5" fill="#ffffff" stroke="${muted}" stroke-width="0.2" />`
        );
      }
      parts.push(
        `<text x="${gx}" y="${gy + 0.65}" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="1.75" font-weight="600" fill="${ink}">${escapeXml(tg.tag)}</text>`
      );
    }
  }

  // 11. 3-Tier Exterior Dimension Chains with 45° Architectural Ticks
  if (settings.showExteriorChains && settings.layers.dimensions) {
    const chains = computeExteriorDimensionChains(story, unit, settings.dimensionBasis);
    for (const seg of chains) {
      const x1 = tx(seg.a.x);
      const y1 = ty(seg.a.z);
      const x2 = tx(seg.b.x);
      const y2 = ty(seg.b.z);
      const isHoriz = seg.side === 'top' || seg.side === 'bottom';
      const tick = 0.85;
      const strokeW = seg.tier === 3 ? 0.26 : 0.18;
      parts.push(
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${muted}" stroke-width="${strokeW}" />`
      );
      // 45-degree architectural slash ticks
      parts.push(
        `<line x1="${x1 - tick}" y1="${y1 + tick}" x2="${x1 + tick}" y2="${y1 - tick}" stroke="${ink}" stroke-width="0.24" />`
      );
      parts.push(
        `<line x1="${x2 - tick}" y1="${y2 + tick}" x2="${x2 + tick}" y2="${y2 - tick}" stroke="${ink}" stroke-width="0.24" />`
      );
      const mx = (x1 + x2) * 0.5;
      const my = (y1 + y2) * 0.5;
      const spanMm = Math.hypot(x2 - x1, y2 - y1);
      if (spanMm >= 5.5) {
        if (isHoriz) {
          parts.push(
            `<text x="${mx}" y="${my - 0.9}" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="${seg.tier === 3 ? 2.15 : 1.85}" font-weight="${seg.tier === 3 ? 600 : 500}" fill="${ink}">${escapeXml(seg.label)}</text>`
          );
        } else {
          parts.push(
            `<text x="${mx - 0.9}" y="${my}" text-anchor="middle" transform="rotate(-90 ${mx - 0.9} ${my})" font-family="'IBM Plex Mono',monospace" font-size="${seg.tier === 3 ? 2.15 : 1.85}" font-weight="${seg.tier === 3 ? 600 : 500}" fill="${ink}">${escapeXml(seg.label)}</text>`
          );
        }
      }
    }
  }

  // 12. User Blueprint Annotations, Leader Callouts & Custom Linear Dimensions
  if (settings.layers.annotations) {
    for (const an of story.annotations ?? []) {
      const x1 = tx(an.x1);
      const y1 = ty(an.z1);
      if (an.kind === 'dimension' && an.x2 !== undefined && an.z2 !== undefined) {
        const x2 = tx(an.x2);
        const y2 = ty(an.z2);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenMm = Math.hypot(dx, dy);
        if (lenMm < 0.5) continue;
        const offMm = ts(an.offset ?? 0.5);
        const nx = -dy / lenMm;
        const ny = dx / lenMm;
        const dx1 = x1 + nx * offMm;
        const dy1 = y1 + ny * offMm;
        const dx2 = x2 + nx * offMm;
        const dy2 = y2 + ny * offMm;
        parts.push(
          `<line x1="${x1}" y1="${y1}" x2="${dx1}" y2="${dy1}" stroke="${faint}" stroke-width="0.16" />`
        );
        parts.push(
          `<line x1="${x2}" y1="${y2}" x2="${dx2}" y2="${dy2}" stroke="${faint}" stroke-width="0.16" />`
        );
        parts.push(
          `<line x1="${dx1}" y1="${dy1}" x2="${dx2}" y2="${dy2}" stroke="${accent}" stroke-width="0.24" />`
        );
        const distM = Math.hypot(an.x2 - an.x1, an.z2 - an.z1);
        const label = an.text || formatLength(distM, unit);
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        const textAng = ang > 90 || ang < -90 ? ang + 180 : ang;
        const mx = (dx1 + dx2) * 0.5;
        const my = (dy1 + dy2) * 0.5;
        parts.push(
          `<text x="${mx}" y="${my - 0.9}" text-anchor="middle" transform="rotate(${textAng.toFixed(1)} ${mx} ${my})" font-family="'IBM Plex Mono',monospace" font-size="2.0" font-weight="600" fill="${accent}">${escapeXml(label)}</text>`
        );
      } else if (an.kind === 'callout' && an.x2 !== undefined && an.z2 !== undefined) {
        const x2 = tx(an.x2);
        const y2 = ty(an.z2);
        parts.push(`<circle cx="${x1}" cy="${y1}" r="0.6" fill="${accent}" />`);
        parts.push(
          `<polyline points="${x1},${y1} ${x2},${y2} ${x2 + 6},${y2}" fill="none" stroke="${accent}" stroke-width="0.22" />`
        );
        parts.push(
          `<text x="${x2 + 7}" y="${y2 + 0.7}" font-size="2.2" font-weight="600" fill="${ink}">${escapeXml(an.text)}</text>`
        );
      } else {
        parts.push(
          `<text x="${x1}" y="${y1}" font-size="2.3" font-weight="600" fill="${ink}">${escapeXml(an.text)}</text>`
        );
      }
    }
  }

  parts.push(`</g>`); // End clipped plan viewport

  // Right-Hand Door / Window / Column Schedule Column (when sheet width allows)
  if (rightScheduleW > 0) {
    const sx = W - margin - rightScheduleW;
    const sy = margin + 1.2;
    const sh = H - margin * 2 - titleBarH - 1.2;
    parts.push(
      `<line x1="${sx}" y1="${sy}" x2="${sx}" y2="${sy + sh}" stroke="${ink}" stroke-width="0.3" />`
    );
    parts.push(
      `<text x="${sx + 3}" y="${sy + 5.5}" font-size="2.7" font-weight="700" fill="${ink}">OPENING &amp; COLUMN SCHEDULE</text>`
    );
    parts.push(
      `<line x1="${sx}" y1="${sy + 7.5}" x2="${W - margin - 1.2}" y2="${sy + 7.5}" stroke="${ink}" stroke-width="0.2" />`
    );

    let rowY = sy + 11.5;
    parts.push(
      `<text x="${sx + 3}" y="${rowY}" font-size="2.0" font-weight="600" fill="${muted}">TAG</text>
       <text x="${sx + 12}" y="${rowY}" font-size="2.0" font-weight="600" fill="${muted}">TYPE &amp; SIZE</text>
       <text x="${W - margin - 4}" y="${rowY}" text-anchor="end" font-size="2.0" font-weight="600" fill="${muted}">QTY</text>`
    );
    rowY += 2.2;
    parts.push(
      `<line x1="${sx + 2}" y1="${rowY}" x2="${W - margin - 3}" y2="${rowY}" stroke="${faint}" stroke-width="0.16" />`
    );
    rowY += 3.8;

    const maxRows = Math.floor((sh - 26) / 6.2);
    for (const r of schedule.rows.slice(0, maxRows)) {
      parts.push(
        `<text x="${sx + 3}" y="${rowY}" font-family="'IBM Plex Mono',monospace" font-size="2.1" font-weight="700" fill="${ink}">${escapeXml(r.tag)}</text>
         <text x="${sx + 12}" y="${rowY}" font-size="2.0" font-weight="500" fill="${ink}">${escapeXml(r.description)}</text>
         <text x="${W - margin - 4}" y="${rowY}" text-anchor="end" font-family="'IBM Plex Mono',monospace" font-size="2.1" font-weight="600" fill="${ink}">${r.count}</text>
         <text x="${sx + 12}" y="${rowY + 2.5}" font-family="'IBM Plex Mono',monospace" font-size="1.8" fill="${muted}">${escapeXml(r.sizeLabel)}</text>`
      );
      rowY += 6.2;
    }

    // North Arrow & Graphic Scale Bar at bottom of schedule column
    const northCx = sx + 11;
    const northCy = sy + sh - 10;
    parts.push(`<g transform="translate(${northCx},${northCy})">
      <circle cx="0" cy="0" r="5.5" fill="none" stroke="${ink}" stroke-width="0.25" />
      <polygon points="0,-4.6 2.1,1.6 0,0.4 -2.1,1.6" fill="${ink}" />
      <text x="0" y="-6.5" text-anchor="middle" font-size="2.4" font-weight="700" fill="${ink}">N</text>
    </g>`);

    // Graphic Scale Bar (calibrated exactly to mmPerM)
    const barMeters = unit === 'imperial' ? 10 * METERS_PER_FOOT : 5;
    const barLabel = unit === 'imperial' ? "10'-0\"" : '5.0 m';
    const barMm = Math.min(34, barMeters * mmPerM);
    const barX = sx + 22;
    const barY = sy + sh - 10;
    parts.push(
      `<text x="${barX}" y="${barY - 2.5}" font-size="1.8" font-weight="600" fill="${muted}">GRAPHIC SCALE</text>`
    );
    parts.push(
      `<rect x="${barX}" y="${barY}" width="${barMm * 0.5}" height="1.8" fill="${ink}" stroke="${ink}" stroke-width="0.2" />`
    );
    parts.push(
      `<rect x="${barX + barMm * 0.5}" y="${barY}" width="${barMm * 0.5}" height="1.8" fill="#ffffff" stroke="${ink}" stroke-width="0.2" />`
    );
    parts.push(
      `<text x="${barX}" y="${barY + 4.3}" font-family="'IBM Plex Mono',monospace" font-size="1.8" fill="${ink}">0</text>`
    );
    parts.push(
      `<text x="${barX + barMm}" y="${barY + 4.3}" text-anchor="end" font-family="'IBM Plex Mono',monospace" font-size="1.8" fill="${ink}">${escapeXml(barLabel)}</text>`
    );
  } else {
    // Compact North Arrow inside top-right corner of drawing frame
    const nCx = drawX + drawW - 9;
    const nCy = drawY + 11;
    parts.push(`<g transform="translate(${nCx},${nCy})">
      <circle cx="0" cy="0" r="5" fill="#ffffff" stroke="${ink}" stroke-width="0.25" />
      <polygon points="0,-4.2 1.9,1.5 0,0.4 -1.9,1.5" fill="${ink}" />
      <text x="0" y="-5.8" text-anchor="middle" font-size="2.2" font-weight="700" fill="${ink}">N</text>
    </g>`);
  }

  // Architectural Title Block (Full-width structured band along bottom)
  const tbY = H - margin - titleBarH;
  const tbW = W - margin * 2;
  const tbX = margin;
  const land = formatBanglaLandSummary(physics.takeoff.footprintAreaM2);
  const gross = formatBanglaLandSummary(physics.takeoff.totalGrossAreaM2);
  const actualSetbacks = computeActualPlotSetbacks(project);
  void actualSetbacks;
  const dateStr = new Date().toISOString().slice(0, 10);

  parts.push(`<rect x="${tbX}" y="${tbY}" width="${tbW}" height="${titleBarH}" fill="#ffffff" stroke="${ink}" stroke-width="0.45" />`);

  // Columns inside title block
  const col1W = tbW * 0.34;
  const col2W = tbW * 0.26;
  const col3W = tbW * 0.22;

  parts.push(
    `<line x1="${tbX + col1W}" y1="${tbY}" x2="${tbX + col1W}" y2="${tbY + titleBarH}" stroke="${ink}" stroke-width="0.28" />`
  );
  parts.push(
    `<line x1="${tbX + col1W + col2W}" y1="${tbY}" x2="${tbX + col1W + col2W}" y2="${tbY + titleBarH}" stroke="${ink}" stroke-width="0.28" />`
  );
  parts.push(
    `<line x1="${tbX + col1W + col2W + col3W}" y1="${tbY}" x2="${tbX + col1W + col2W + col3W}" y2="${tbY + titleBarH}" stroke="${ink}" stroke-width="0.28" />`
  );

  // Col 1: Project Name & Story Title
  parts.push(
    `<text x="${tbX + 3.5}" y="${tbY + 5.2}" font-size="2.0" font-weight="600" fill="${muted}">PROJECT</text>`
  );
  parts.push(
    `<text x="${tbX + 3.5}" y="${tbY + 10.6}" font-size="4.0" font-weight="700" fill="${ink}">${escapeXml(project.name)}</text>`
  );
  parts.push(
    `<text x="${tbX + 3.5}" y="${tbY + 15.8}" font-size="2.6" font-weight="600" fill="${accent}">${escapeXml(story.name)} — Floor Plan</text>`
  );
  parts.push(
    `<text x="${tbX + 3.5}" y="${tbY + 22.8}" font-size="1.75" fill="${muted}">Conceptual plan only. Final RCC detailing &amp; foundation design require a licensed civil engineer (BNBC 2020).</text>`
  );

  // Col 2: Land & Area Summary (Bangla + Sqft)
  const c2x = tbX + col1W + 3;
  parts.push(
    `<text x="${c2x}" y="${tbY + 5.2}" font-size="2.0" font-weight="600" fill="${muted}">AREA &amp; RAJUK COMPLIANCE</text>`
  );
  parts.push(
    `<text x="${c2x}" y="${tbY + 10.2}" font-family="'IBM Plex Mono',monospace" font-size="2.2" fill="${ink}">Footprint: ${escapeXml(land.sqft)} (${escapeXml(land.katha)} / ${escapeXml(land.shotok)})</text>`
  );
  parts.push(
    `<text x="${c2x}" y="${tbY + 14.8}" font-family="'IBM Plex Mono',monospace" font-size="2.2" fill="${ink}">Gross Built: ${escapeXml(gross.sqft)} (${project.stories.length} ${project.stories.length === 1 ? 'floor' : 'floors'})</text>`
  );
  parts.push(
    `<text x="${c2x}" y="${tbY + 19.4}" font-family="'IBM Plex Mono',monospace" font-size="2.1" fill="${muted}">MGC ${physics.rajuk.actualMgcPct.toFixed(1)}% / ${physics.rajuk.maxMgcPct}% · FAR ${physics.rajuk.actualFar.toFixed(2)} / ${physics.rajuk.maxFar}</text>`
  );

  // Col 3: Dimension Standard & Structural Spec
  const c3x = tbX + col1W + col2W + 3;
  parts.push(
    `<text x="${c3x}" y="${tbY + 5.2}" font-size="2.0" font-weight="600" fill="${muted}">SPECIFICATION</text>`
  );
  parts.push(
    `<text x="${c3x}" y="${tbY + 10.2}" font-size="2.15" fill="${ink}">Dims: ${settings.dimensionBasis === 'interior' ? 'Clear Interior Face' : 'Wall Centerline'}</text>`
  );
  parts.push(
    `<text x="${c3x}" y="${tbY + 14.8}" font-family="'IBM Plex Mono',monospace" font-size="2.1" fill="${ink}">Zone ${physics.seismicWind.zone} · Soil ${physics.seismicWind.soilClass} · ${project.bnbc?.concretePsi ?? 3500} psi</text>`
  );
  parts.push(
    `<text x="${c3x}" y="${tbY + 19.4}" font-family="'IBM Plex Mono',monospace" font-size="2.1" fill="${muted}">Floor Ht: ${escapeXml(formatLength(story.height, unit))} · Slab: ${escapeXml(formatLength(story.slabThickness, unit))}</text>`
  );

  // Col 4: Scale, Sheet No, Date
  const c4x = tbX + col1W + col2W + col3W + 3;
  parts.push(
    `<text x="${c4x}" y="${tbY + 5.2}" font-size="2.0" font-weight="600" fill="${muted}">SCALE &amp; SHEET</text>`
  );
  parts.push(
    `<text x="${c4x}" y="${tbY + 10.6}" font-family="'IBM Plex Mono',monospace" font-size="2.8" font-weight="700" fill="${ink}">${escapeXml(scaleInfo.label)}</text>`
  );
  parts.push(
    `<text x="${c4x}" y="${tbY + 15.6}" font-family="'IBM Plex Mono',monospace" font-size="2.2" fill="${ink}">Sheet A-${String(story.index + 1).padStart(2, '0')} / ${String(project.stories.length).padStart(2, '0')} · ${paper.label}</text>`
  );
  parts.push(
    `<text x="${c4x}" y="${tbY + 20.6}" font-family="'IBM Plex Mono',monospace" font-size="2.0" fill="${muted}">Date: ${dateStr} · BhumiMap</text>`
  );

  parts.push(`</svg>`);

  return { svg: parts.join('\n'), paper, scaleLabel: scaleInfo.label };
}

/** Download crisp Vector SVG blueprint */
export function downloadBlueprintSvg(
  project: BuildingProject,
  story: Story,
  physics: PhysicsReport,
  overrideSettings?: Partial<BlueprintSettings>
): void {
  const { svg } = generateBlueprintSvg(project, story, physics, overrideSettings);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bhumimap';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-floor-${story.index}-blueprint.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Render the full framed vector sheet at high DPI (300-DPI class) and download as PNG */
export function exportBlueprintSheetPng(
  project: BuildingProject,
  story: Story,
  physics: PhysicsReport,
  overrideSettings?: Partial<BlueprintSettings>
): Promise<void> {
  return new Promise((resolve) => {
    const { svg, paper } = generateBlueprintSvg(project, story, physics, overrideSettings);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      // High-res target (~3000px wide for A3/A4)
      const pxPerMm = paper.widthMm >= 350 ? 8 : 10;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(paper.widthMm * pxPerMm);
      canvas.height = Math.round(paper.heightMm * pxPerMm);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bhumimap';
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${slug}-floor-${story.index}-sheet-300dpi.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.src = url;
  });
}

/**
 * Print-Ready Scaled Multi-Sheet PDF using an isolated hidden iframe
 * (never calls window.open so it works reliably inside embedded iframes).
 */
export function printBlueprintSheets(
  project: BuildingProject,
  stories: Story[],
  physics: PhysicsReport,
  overrideSettings?: Partial<BlueprintSettings>
): void {
  const settings = { ...getBlueprintSettings(project), ...(overrideSettings ?? {}) };
  const paper = getPaperDimensionsMm(settings.paperSize, settings.paperOrientation);
  const pages = stories.map((st) =>
    generateBlueprintSvg(project, st, physics, { ...settings, sheetMode: 'print' })
  );

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(project.name)} — Blueprint Sheets</title>
  <style>
    @page { size: ${paper.widthMm}mm ${paper.heightMm}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { width: ${paper.widthMm}mm; height: ${paper.heightMm}mm; page-break-after: always; break-after: page; overflow: hidden; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    svg { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  ${pages.map((p) => `<div class="sheet">${p.svg}</div>`).join('\n')}
</body>
</html>`);
  doc.close();

  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }
  }, 180);
}

// ============================================================================
// AUTOCAD LAYERED DXF (ASCII R12) EXPORTER
// ============================================================================

/**
 * Generates an industry-standard layered ASCII DXF file in real-world project units
 * (Feet for Imperial, Meters for Metric) ready for AutoCAD, QCAD, LibreCAD, or ETABS.
 */
export function generateBlueprintDxf(project: BuildingProject, story: Story): string {
  const unit = project.unitSystem;
  const toUnit = (m: number) => Number((unit === 'imperial' ? m / METERS_PER_FOOT : m).toFixed(4));
  // AutoCAD Y points UP (+Y North), while 2D canvas Z points DOWN (+Z South)
  const ux = (xM: number) => toUnit(xM);
  const uy = (zM: number) => toUnit(-zM);

  const lines: string[] = [];
  const push = (...pairs: Array<[number, string | number]>) => {
    for (const [code, val] of pairs) {
      lines.push(String(code), String(val));
    }
  };

  // HEADER
  push(
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$ACADVER'],
    [1, 'AC1009'],
    [9, '$INSUNITS'],
    [70, unit === 'imperial' ? 2 : 6], // 2 = Feet, 6 = Meters
    [0, 'ENDSEC']
  );

  // TABLES (Standard AIA CAD Layers)
  const layerDefs: Array<[string, number]> = [
    ['A-WALL', 7], // White/Black
    ['A-DOOR', 30], // Orange
    ['A-GLAZ', 4], // Cyan
    ['S-COLS', 1], // Red
    ['S-BEAM', 2], // Yellow
    ['A-SLAB', 8], // Gray
    ['A-FURN', 9], // Light Gray
    ['A-AREA', 3], // Green
    ['A-ANNO-DIMS', 5], // Blue
    ['A-ANNO-TEXT', 7],
    ['S-GRID', 8],
    ['C-PROP', 6], // Magenta
  ];

  push(
    [0, 'SECTION'],
    [2, 'TABLES'],
    [0, 'TABLE'],
    [2, 'LAYER'],
    [70, layerDefs.length]
  );
  for (const [name, color] of layerDefs) {
    push(
      [0, 'LAYER'],
      [2, name],
      [70, 0],
      [62, color],
      [6, 'CONTINUOUS']
    );
  }
  push([0, 'ENDTAB'], [0, 'ENDSEC']);

  // ENTITIES
  push([0, 'SECTION'], [2, 'ENTITIES']);

  const emitLine = (layer: string, x1: number, z1: number, x2: number, z2: number) => {
    push(
      [0, 'LINE'],
      [8, layer],
      [10, ux(x1)],
      [20, uy(z1)],
      [30, 0],
      [11, ux(x2)],
      [21, uy(z2)],
      [31, 0]
    );
  };

  const emitRect = (layer: string, x: number, z: number, w: number, d: number) => {
    emitLine(layer, x, z, x + w, z);
    emitLine(layer, x + w, z, x + w, z + d);
    emitLine(layer, x + w, z + d, x, z + d);
    emitLine(layer, x, z + d, x, z);
  };

  const emitText = (layer: string, x: number, z: number, heightM: number, text: string) => {
    push(
      [0, 'TEXT'],
      [8, layer],
      [10, ux(x)],
      [20, uy(z)],
      [30, 0],
      [40, Math.max(0.15, toUnit(heightM))],
      [1, text.replace(/[\r\n]+/g, ' ')]
    );
  };

  // 1. Plot property boundary
  if (project.plot) {
    emitRect('C-PROP', project.plot.originX, project.plot.originZ, project.plot.width, project.plot.depth);
  }

  // 2. Slabs & cutouts
  for (const sl of story.slabs) {
    emitRect('A-SLAB', sl.x, sl.z, sl.width, sl.depth);
    for (const c of sl.cutouts ?? []) {
      emitRect('A-SLAB', c.x, c.z, c.width, c.depth);
      emitLine('A-SLAB', c.x, c.z, c.x + c.width, c.z + c.depth);
    }
  }

  // 3. Mitered Wall outlines
  const wallPolys = computeWallPolygons(story);
  for (const wall of story.walls) {
    const poly = wallPolys.get(wall.id);
    if (!poly) continue;
    for (const [a, b] of poly.outlineEdges) {
      emitLine('A-WALL', a.x, a.z, b.x, b.z);
    }
    // Openings
    for (const op of wall.openings) {
      const p0 = pointAtWallOffset(wall, op.offset);
      const p1 = pointAtWallOffset(wall, op.offset + op.width);
      const isWin = op.kind.startsWith('window');
      const layer = isWin ? 'A-GLAZ' : 'A-DOOR';
      emitLine(layer, p0.x, p0.z, p1.x, p1.z);
      if (op.kind === 'door-single') {
        const lx = p0.x + p0.nx * op.swing * op.width;
        const lz = p0.z + p0.nz * op.swing * op.width;
        emitLine(layer, p0.x, p0.z, lx, lz);
        // Swing arc in DXF CCW angles (inverted Y)
        const ang1 = (Math.atan2(-p0.nz * op.swing, p0.nx * op.swing) * 180) / Math.PI;
        const ang2 = (Math.atan2(-(p1.z - p0.z), p1.x - p0.x) * 180) / Math.PI;
        const startA = op.swing > 0 ? ang1 : ang2;
        const endA = op.swing > 0 ? ang2 : ang1;
        push(
          [0, 'ARC'],
          [8, layer],
          [10, ux(p0.x)],
          [20, uy(p0.z)],
          [30, 0],
          [40, toUnit(op.width)],
          [50, Number(((startA + 360) % 360).toFixed(2))],
          [51, Number(((endA + 360) % 360).toFixed(2))]
        );
      }
    }
  }

  // 4. Columns & Beams
  for (const p of story.pillars) {
    if (p.shape === 'circular') {
      push(
        [0, 'CIRCLE'],
        [8, 'S-COLS'],
        [10, ux(p.x)],
        [20, uy(p.z)],
        [30, 0],
        [40, toUnit(p.width * 0.5)]
      );
    } else {
      const c = Math.cos(p.rotation);
      const s = Math.sin(p.rotation);
      const hw = p.width * 0.5;
      const hd = p.depth * 0.5;
      const corners = [
        { x: p.x - c * hw + s * hd, z: p.z - s * hw - c * hd },
        { x: p.x + c * hw + s * hd, z: p.z + s * hw - c * hd },
        { x: p.x + c * hw - s * hd, z: p.z + s * hw + c * hd },
        { x: p.x - c * hw - s * hd, z: p.z - s * hw + c * hd },
      ];
      for (let i = 0; i < 4; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        emitLine('S-COLS', a.x, a.z, b.x, b.z);
      }
    }
    emitText('S-COLS', p.x + p.width * 0.6, p.z, 0.22, p.label);
  }

  for (const bm of story.beams) {
    emitLine('S-BEAM', bm.x1, bm.z1, bm.x2, bm.z2);
  }

  // 5. Furniture footprints
  for (const a of story.assets) {
    const c = Math.cos(a.rotation);
    const s = Math.sin(a.rotation);
    const hw = a.width * 0.5;
    const hd = a.depth * 0.5;
    const corners = [
      { x: a.x - c * hw + s * hd, z: a.z - s * hw - c * hd },
      { x: a.x + c * hw + s * hd, z: a.z + s * hw - c * hd },
      { x: a.x + c * hw - s * hd, z: a.z + s * hw + c * hd },
      { x: a.x - c * hw - s * hd, z: a.z - s * hw + c * hd },
    ];
    for (let i = 0; i < 4; i++) {
      emitLine('A-FURN', corners[i].x, corners[i].z, corners[(i + 1) % 4].x, corners[(i + 1) % 4].z);
    }
  }

  // 6. Room labels
  for (const rm of story.rooms) {
    const dims = computeRoomClearDimensions(rm, story);
    const cx = rm.x + rm.width * 0.5;
    const cz = rm.z + rm.depth * 0.5;
    emitText('A-AREA', cx, cz - 0.18, 0.26, rm.name);
    emitText(
      'A-AREA',
      cx,
      cz + 0.22,
      0.2,
      `${formatLength(dims.clearW, unit)} x ${formatLength(dims.clearD, unit)}`
    );
  }

  // 7. Exterior Dimension Chains & Custom Annotations
  const settings = getBlueprintSettings(project);
  const chains = computeExteriorDimensionChains(story, unit, settings.dimensionBasis);
  for (const seg of chains) {
    emitLine('A-ANNO-DIMS', seg.a.x, seg.a.z, seg.b.x, seg.b.z);
    emitText('A-ANNO-DIMS', (seg.a.x + seg.b.x) * 0.5, (seg.a.z + seg.b.z) * 0.5 - 0.15, 0.18, seg.label);
  }

  for (const an of story.annotations ?? []) {
    if (an.x2 !== undefined && an.z2 !== undefined) {
      emitLine('A-ANNO-TEXT', an.x1, an.z1, an.x2, an.z2);
    }
    emitText('A-ANNO-TEXT', an.x2 ?? an.x1, an.z2 ?? an.z1, 0.22, an.text);
  }

  // 8. Structural Gridlines
  const grid = computeStructuralGrid(story);
  const b = computeStoryWorldBounds(project, story);
  for (const gx of grid.xLines) {
    emitLine('S-GRID', gx.coord, b.minZ + 1, gx.coord, b.maxZ - 1);
    emitText('S-GRID', gx.coord, b.minZ + 0.6, 0.3, gx.label);
  }
  for (const gz of grid.zLines) {
    emitLine('S-GRID', b.minX + 1, gz.coord, b.maxX - 1, gz.coord);
    emitText('S-GRID', b.minX + 0.6, gz.coord, 0.3, gz.label);
  }

  push([0, 'ENDSEC'], [0, 'EOF']);
  return lines.join('\n');
}

export function downloadBlueprintDxf(project: BuildingProject, story: Story): void {
  const dxf = generateBlueprintDxf(project, story);
  const blob = new Blob([dxf], { type: 'application/dxf;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bhumimap';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-floor-${story.index}.dxf`;
  a.click();
  URL.revokeObjectURL(url);
}
