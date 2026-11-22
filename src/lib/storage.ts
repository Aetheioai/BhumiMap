import { DiagonalType, ShapeMode } from './geometry';
import { LengthUnit } from './units';

export interface SavedPlotRecord {
  id: string;
  name: string;
  mouza: string;
  dagNo: string;
  khatianNo: string;
  unit: LengthUnit;
  // Always stored in feet for canonical accuracy
  abFt: number;
  bcFt: number;
  cdFt: number;
  daFt: number;
  diagonalFt: number;
  diagonalType: DiagonalType;
  shapeMode: ShapeMode;
  northRotationDeg: number;
  areaSqFt: number;
  updatedAt: string;
}

export interface PlotPreset {
  id: string;
  labelEn: string;
  labelBn: string;
  mouza: string;
  dagNo: string;
  abFt: number;
  bcFt: number;
  cdFt: number;
  daFt: number;
  diagonalFt: number;
  diagonalType: DiagonalType;
}

export const SAMPLE_PRESETS: PlotPreset[] = [
  {
    id: 'residential-5k',
    labelEn: 'Urban Plot (~5 Katha)',
    labelBn: 'আবাসিক প্লট (~৫ কাঠা)',
    mouza: 'Uttara',
    dagNo: '1428',
    abFt: 62.5,
    bcFt: 58.0,
    cdFt: 60.0,
    daFt: 61.5,
    diagonalFt: 85.4,
    diagonalType: 'AC',
  },
  {
    id: 'village-irregular',
    labelEn: 'Irregular Village Plot (~16 Shotok)',
    labelBn: 'অনিয়মিত গ্রামীণ জমি (~১৬ শতক)',
    mouza: 'Savar',
    dagNo: '709',
    abFt: 98.0,
    bcFt: 74.5,
    cdFt: 112.0,
    daFt: 62.0,
    diagonalFt: 121.0,
    diagonalType: 'AC',
  },
  {
    id: 'agricultural-bigha',
    labelEn: 'Agricultural Parcel (~1.1 Bigha)',
    labelBn: 'কৃষি জমি (~১.১ বিঘা)',
    mouza: 'Bogura Sadar',
    dagNo: '2041',
    abFt: 145.0,
    bcFt: 118.0,
    cdFt: 132.0,
    daFt: 109.0,
    diagonalFt: 176.5,
    diagonalType: 'BD',
  },
];

const STORAGE_KEY = 'bhumimap_saved_plots_v1';

export function loadSavedPlots(): SavedPlotRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedPlotRecord =>
        item &&
        typeof item.id === 'string' &&
        typeof item.abFt === 'number' &&
        typeof item.bcFt === 'number' &&
        typeof item.cdFt === 'number' &&
        typeof item.daFt === 'number' &&
        typeof item.diagonalFt === 'number'
    );
  } catch {
    return [];
  }
}

export function savePlotsToStorage(plots: SavedPlotRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plots));
  } catch {
    // Storage quota exceeded or unavailable; ignore gracefully
  }
}
