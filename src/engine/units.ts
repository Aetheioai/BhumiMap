import { UnitSystem } from '../types/building';

export const METERS_PER_FOOT = 0.3048;
export const METERS_PER_INCH = 0.0254;
export const SQFT_PER_SQM = 10.7639104167;
export const CUFT_PER_CUM = 35.3146667215;
export const SQFT_PER_SHOTOK = 435.6; // 1 Shotok (Decimal) = 435.6 sq ft
export const SQFT_PER_KATHA = 720.0; // 1 Standard Bangladesh Katha = 720 sq ft
export const KN_TO_TONS_FORCE = 0.10197162;
export const KN_TO_KIPS = 0.22480894;

/** Exact Imperial helpers so templates and presets never produce 11.8" or 32'10" drift */
export function ft(feet: number, extraInches = 0): number {
  return Number((feet * METERS_PER_FOOT + extraInches * METERS_PER_INCH).toFixed(6));
}

export function inch(inches: number): number {
  return Number((inches * METERS_PER_INCH).toFixed(6));
}

export function feetToMeters(f: number): number {
  return f * METERS_PER_FOOT;
}

export function inchesToMeters(inches: number): number {
  return inches * METERS_PER_INCH;
}

export function metersToFeet(m: number): number {
  return m / METERS_PER_FOOT;
}

export function metersToInches(m: number): number {
  return m / METERS_PER_INCH;
}

export function sqmToSqft(sqm: number): number {
  return sqm * SQFT_PER_SQM;
}

export function sqmToShotok(sqm: number): number {
  return sqmToSqft(sqm) / SQFT_PER_SHOTOK;
}

export function sqmToKatha(sqm: number): number {
  return sqmToSqft(sqm) / SQFT_PER_KATHA;
}

/** Format a primary length cleanly (walls, spans, heights, rulers) */
export function formatLength(meters: number, unit: UnitSystem): string {
  if (!Number.isFinite(meters)) return '—';
  const sign = meters < 0 ? '-' : '';
  const abs = Math.abs(meters);

  if (unit === 'imperial') {
    // Round to nearest whole inch so 12'0" never prints 11'12" or 11.99'
    const totalInches = Math.round(abs / METERS_PER_INCH);
    const f = Math.floor(totalInches / 12);
    const i = totalInches % 12;
    if (f === 0) return `${sign}${i}"`;
    if (i === 0) return `${sign}${f}'`;
    return `${sign}${f}' ${i}"`;
  }

  if (abs < 1) {
    return `${sign}${Math.round(abs * 1000)} mm`;
  }
  return `${sign}${abs.toFixed(2)} m`;
}

/** Format a compact cross-section dimension (wall thickness, column width, slab depth) */
export function formatSection(meters: number, unit: UnitSystem): string {
  if (!Number.isFinite(meters)) return '—';
  if (unit === 'imperial') {
    const inches = meters / METERS_PER_INCH;
    const nearestHalf = Math.round(inches * 2) / 2;
    return `${Number.isInteger(nearestHalf) ? nearestHalf : nearestHalf.toFixed(1)}"`;
  }
  return `${Math.round(meters * 1000)} mm`;
}

/** Format area */
export function formatArea(sqm: number, unit: UnitSystem): string {
  if (!Number.isFinite(sqm)) return '—';
  if (unit === 'imperial') {
    return `${Math.round(sqm * SQFT_PER_SQM).toLocaleString()} sq ft`;
  }
  return `${sqm.toFixed(1)} m²`;
}

/** Format Bangladeshi land units alongside sq ft (Shotok & Katha) */
export function formatBanglaLandSummary(sqm: number): {
  sqft: string;
  shotok: string;
  katha: string;
} {
  const sf = sqmToSqft(Math.max(0, sqm));
  return {
    sqft: `${Math.round(sf).toLocaleString()} sq ft`,
    shotok: `${(sf / SQFT_PER_SHOTOK).toFixed(2)} Shotok`,
    katha: `${(sf / SQFT_PER_KATHA).toFixed(2)} Katha`,
  };
}

/** Format volume */
export function formatVolume(cum: number, unit: UnitSystem): string {
  if (!Number.isFinite(cum)) return '—';
  if (unit === 'imperial') {
    return `${Math.round(cum * CUFT_PER_CUM).toLocaleString()} ft³`;
  }
  return `${cum.toFixed(1)} m³`;
}

/** Format structural force */
export function formatForce(kn: number, unit: UnitSystem): string {
  if (!Number.isFinite(kn)) return '—';
  if (unit === 'imperial') {
    return `${(kn * KN_TO_KIPS).toFixed(1)} kip`;
  }
  return `${kn.toFixed(1)} kN`;
}

/** Convert meters to clean editable numeric value in current unit (whole/clean feet or inches in imperial) */
export function metersToInput(meters: number, unit: UnitSystem, kind: 'length' | 'section'): number {
  if (unit === 'imperial') {
    if (kind === 'section') {
      const inches = meters / METERS_PER_INCH;
      const rounded = Math.round(inches * 2) / 2;
      return rounded;
    }
    // Snap very close to 0.25 ft increments for crisp display
    const f = meters / METERS_PER_FOOT;
    const nearInt = Math.round(f);
    if (Math.abs(f - nearInt) < 0.015) return nearInt;
    return Number(f.toFixed(2));
  }
  if (kind === 'section') {
    return Math.round(meters * 1000);
  }
  return Number(meters.toFixed(2));
}

/** Convert user numeric input back to canonical meters */
export function inputToMeters(val: number, unit: UnitSystem, kind: 'length' | 'section'): number {
  if (!Number.isFinite(val)) return 0;
  if (unit === 'imperial') {
    return kind === 'section' ? val * METERS_PER_INCH : val * METERS_PER_FOOT;
  }
  return kind === 'section' ? val / 1000 : val;
}

export function getUnitSuffix(unit: UnitSystem, kind: 'length' | 'section'): string {
  if (unit === 'imperial') {
    return kind === 'section' ? 'in' : 'ft';
  }
  return kind === 'section' ? 'mm' : 'm';
}

/** Recommended snap grid step in meters (exact 6" in Imperial, 250mm in Metric) */
export function getDefaultSnap(unit: UnitSystem): number {
  return unit === 'imperial' ? inch(6) : 0.25;
}

/** Major & minor grid spacing for 2D drafting rulers */
export function getGridSpec(unit: UnitSystem): { minor: number; major: number; labelStep: number } {
  if (unit === 'imperial') {
    return {
      minor: ft(1), // 1 ft
      major: ft(4), // 4 ft (clean divisor of 12, 16, 20, 24, 32, 36, 40 ft Bangladeshi spans!)
      labelStep: ft(4),
    };
  }
  return {
    minor: 0.5,
    major: 2.0,
    labelStep: 2.0,
  };
}
