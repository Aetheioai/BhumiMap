export type LengthUnit = 'ft' | 'ft-in' | 'm' | 'link' | 'haat';

export const FEET_PER_METER = 3.280839895013123;
export const METERS_PER_FOOT = 0.3048;
export const FEET_PER_LINK = 0.66; // Gunter's chain: 1 chain = 66 ft = 100 links
export const FEET_PER_HAAT = 1.5; // Traditional cubit: 18 inches = 1.5 ft

// Official statutory Bangladeshi land area constants (in square feet)
export const SQFT_PER_SHOTOK = 435.6; // 1 Decimal / Shotok = 435.6 sq ft (1/100 Acre)
export const SQFT_PER_KATHA = 720; // 1 Katha = 720 sq ft
export const SQFT_PER_BIGHA = 14400; // 1 Bigha = 20 Katha = 14,400 sq ft
export const SQFT_PER_ACRE = 43560; // 1 Acre = 100 Shotok = 43,560 sq ft
export const SQFT_PER_CHOTAK = 45; // 1 Chotak = 1/16 Katha = 45 sq ft
export const SQFT_PER_OJUTANGSHO = 4.356; // 1 Ojutangsho = 1/100 Shotok = 4.356 sq ft
export const SQM_PER_SQFT = 0.09290304; // Exact international foot^2 to m^2

export interface AreaConversion {
  sqFt: number;
  shotok: number;
  katha: number;
  bigha: number;
  acre: number;
  sqMeter: number;
  chotak: number;
  ojutangsho: number;
  compoundBighaKathaChotak: {
    bigha: number;
    katha: number;
    chotak: number;
  };
}

export function convertAreaFromSqFt(sqFt: number): AreaConversion {
  const safeSqFt = Number.isFinite(sqFt) && sqFt > 0 ? sqFt : 0;
  const totalKatha = safeSqFt / SQFT_PER_KATHA;
  const bighaWhole = Math.floor(totalKatha / 20);
  const remKathaTotal = totalKatha - bighaWhole * 20;
  const kathaWhole = Math.floor(remKathaTotal);
  const chotakRem = (remKathaTotal - kathaWhole) * 16;

  return {
    sqFt: safeSqFt,
    shotok: safeSqFt / SQFT_PER_SHOTOK,
    katha: totalKatha,
    bigha: safeSqFt / SQFT_PER_BIGHA,
    acre: safeSqFt / SQFT_PER_ACRE,
    sqMeter: safeSqFt * SQM_PER_SQFT,
    chotak: safeSqFt / SQFT_PER_CHOTAK,
    ojutangsho: safeSqFt / SQFT_PER_OJUTANGSHO,
    compoundBighaKathaChotak: {
      bigha: bighaWhole,
      katha: kathaWhole,
      chotak: chotakRem,
    },
  };
}

export function toFeet(value: number, unit: LengthUnit, inches = 0): number {
  const v = Number.isFinite(value) ? value : 0;
  const inc = Number.isFinite(inches) ? inches : 0;
  switch (unit) {
    case 'ft':
      return v;
    case 'ft-in':
      return v + inc / 12;
    case 'm':
      return v * FEET_PER_METER;
    case 'link':
      return v * FEET_PER_LINK;
    case 'haat':
      return v * FEET_PER_HAAT;
  }
}

export function fromFeet(feet: number, unit: LengthUnit): { main: number; inches: number } {
  const f = Number.isFinite(feet) ? feet : 0;
  switch (unit) {
    case 'ft':
      return { main: f, inches: 0 };
    case 'ft-in': {
      const wholeFt = Math.floor(f);
      const remIn = (f - wholeFt) * 12;
      if (Math.round(remIn * 100) / 100 >= 12) {
        return { main: wholeFt + 1, inches: 0 };
      }
      return { main: wholeFt, inches: Math.round(remIn * 100) / 100 };
    }
    case 'm':
      return { main: f * METERS_PER_FOOT, inches: 0 };
    case 'link':
      return { main: f / FEET_PER_LINK, inches: 0 };
    case 'haat':
      return { main: f / FEET_PER_HAAT, inches: 0 };
  }
}

export function formatLengthFromFeet(feet: number, unit: LengthUnit, compact = false): string {
  if (!Number.isFinite(feet) || feet <= 0) return '—';
  switch (unit) {
    case 'ft':
      return `${trimZeros(feet, 2)} ft`;
    case 'ft-in': {
      const { main, inches } = fromFeet(feet, 'ft-in');
      const inRounded = trimZeros(inches, 1);
      if (inRounded === '0') return compact ? `${main}'` : `${main} ft`;
      return compact ? `${main}' ${inRounded}"` : `${main} ft ${inRounded} in`;
    }
    case 'm':
      return `${trimZeros(feet * METERS_PER_FOOT, 2)} m`;
    case 'link':
      return `${trimZeros(feet / FEET_PER_LINK, 2)} lk`;
    case 'haat':
      return `${trimZeros(feet / FEET_PER_HAAT, 2)} haat`;
  }
}

export function trimZeros(num: number, maxDecimals = 2): string {
  if (!Number.isFinite(num)) return '0';
  return Number(num.toFixed(maxDecimals)).toString();
}

export function formatNumber(num: number, decimals = 2): string {
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function getUnitShortLabel(unit: LengthUnit): string {
  switch (unit) {
    case 'ft':
      return 'ft';
    case 'ft-in':
      return 'ft-in';
    case 'm':
      return 'm';
    case 'link':
      return 'links';
    case 'haat':
      return 'haat';
  }
}
