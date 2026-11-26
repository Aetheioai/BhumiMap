import {
  BuildingProject,
  DEFAULT_BNBC_CONFIG,
  PhysicsReport,
  StructuralGrade,
  WallMaterial,
} from '../types/building';
import { formatBanglaLandSummary } from './units';

const AUTOSAVE_KEY = 'bhumimap_studio_autosave_v4';
const SAVED_PROJECTS_KEY = 'bhumimap_studio_projects_v4';

export interface SavedProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  storyCount: number;
  project: BuildingProject;
}

const VALID_WALL_MATS = new Set<WallMaterial>([
  'brick-1st',
  'exposed-brick',
  'fair-concrete',
  'hollow-block',
  'rcc',
  'jala-brick',
  'timber-louver',
  'gypsum-board',
]);

const VALID_GRADES = new Set<StructuralGrade>([
  'rcc-3000',
  'rcc-3500',
  'rcc-4000',
  'steel-a992',
]);

function normalizeWallMaterial(raw: string): WallMaterial {
  if (VALID_WALL_MATS.has(raw as WallMaterial)) return raw as WallMaterial;
  if (raw === 'drywall') return 'gypsum-board';
  if (raw === 'steel-frame') return 'hollow-block';
  return 'brick-1st';
}

function normalizeGrade(raw: string): StructuralGrade {
  if (VALID_GRADES.has(raw as StructuralGrade)) return raw as StructuralGrade;
  if (raw === 'rcc-m25') return 'rcc-3000';
  if (raw === 'rcc-m30') return 'rcc-3500';
  if (raw === 'rcc-m40') return 'rcc-4000';
  return 'rcc-3500';
}

/** Normalize loaded or imported projects so missing rooms, BNBC fields, cutouts, or legacy materials never crash */
export function sanitizeProject(raw: BuildingProject): BuildingProject | null {
  if (!raw || !Array.isArray(raw.stories) || raw.stories.length === 0) return null;
  return {
    ...raw,
    unitSystem: raw.unitSystem === 'metric' ? 'metric' : 'imperial',
    bnbc: {
      ...DEFAULT_BNBC_CONFIG,
      ...(raw.bnbc ?? {}),
      landContext: raw.bnbc?.landContext ?? raw.plot?.landContext ?? DEFAULT_BNBC_CONFIG.landContext,
      roadWidthM: raw.bnbc?.roadWidthM ?? raw.plot?.roadWidthM ?? DEFAULT_BNBC_CONFIG.roadWidthM,
    },
    lockedLayers: raw.lockedLayers ? { ...raw.lockedLayers } : {},
    stories: raw.stories.map((s, idx) => ({
      ...s,
      index: typeof s.index === 'number' ? s.index : idx,
      rooms: Array.isArray(s.rooms) ? s.rooms : [],
      slabs: Array.isArray(s.slabs)
        ? s.slabs.map((sl) => ({
            ...sl,
            cutouts: Array.isArray(sl.cutouts) ? sl.cutouts : [],
          }))
        : [],
      beams: Array.isArray(s.beams) ? s.beams : [],
      assets: Array.isArray(s.assets) ? s.assets : [],
      walls: Array.isArray(s.walls)
        ? s.walls.map((w) => ({
            ...w,
            curveOffset: typeof w.curveOffset === 'number' && Number.isFinite(w.curveOffset) ? w.curveOffset : 0,
            material: normalizeWallMaterial(String(w.material)),
            openings: Array.isArray(w.openings) ? w.openings : [],
          }))
        : [],
      pillars: Array.isArray(s.pillars)
        ? s.pillars.map((p) => ({
            ...p,
            grade: normalizeGrade(String(p.grade)),
          }))
        : [],
    })),
  };
}

export function loadAutosave(): BuildingProject | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuildingProject;
    return sanitizeProject(parsed);
  } catch {
    return null;
  }
}

export function saveAutosave(project: BuildingProject): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
  } catch {
    // Ignore storage quota issues silently
  }
}

export function listSavedProjects(): SavedProjectMeta[] {
  try {
    const raw = localStorage.getItem(SAVED_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedProjectMeta[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const clean = sanitizeProject(item.project);
        return clean ? { ...item, project: clean } : null;
      })
      .filter((x): x is SavedProjectMeta => x !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveProjectToLibrary(project: BuildingProject): SavedProjectMeta[] {
  const existing = listSavedProjects().filter((p) => p.id !== project.id);
  const entry: SavedProjectMeta = {
    id: project.id,
    name: project.name,
    updatedAt: Date.now(),
    storyCount: project.stories.length,
    project: { ...project, updatedAt: Date.now() },
  };
  const next = [entry, ...existing].slice(0, 20);
  try {
    localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota issues
  }
  return next;
}

export function deleteSavedProject(id: string): SavedProjectMeta[] {
  const next = listSavedProjects().filter((p) => p.id !== id);
  try {
    localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function exportProjectJson(project: BuildingProject): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bhumimap-project'}.bhumimap.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Composites a captured 2D or 3D viewport PNG with a crisp architectural footer bar
 * carrying project metadata, Bangladeshi land area units, and the required civil engineering disclaimer.
 */
export function exportBlueprintPngWithDisclaimer(
  sourceDataUrl: string,
  project: BuildingProject,
  physics: PhysicsReport,
  viewLabel: string
): void {
  const img = new Image();
  img.onload = () => {
    const footerH = 58;
    const out = document.createElement('canvas');
    out.width = img.width;
    out.height = img.height + footerH;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    // White sheet background + viewport image
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(img, 0, 0);

    // Crisp hairline divider
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, img.height + 0.5);
    ctx.lineTo(out.width, img.height + 0.5);
    ctx.stroke();

    const land = formatBanglaLandSummary(physics.takeoff.footprintAreaM2);
    const gross = formatBanglaLandSummary(physics.takeoff.totalGrossAreaM2);
    const padX = Math.max(18, Math.round(out.width * 0.018));

    // Line 1: Project Title & Land Summary
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const titleText = `BhumiMap  |  ${project.name} (${viewLabel})  |  Footprint: ${land.sqft} (${land.shotok} / ${land.katha})  |  Gross: ${gross.sqft}`;
    ctx.fillText(titleText, padX, img.height + 20);

    // Line 2: Clean 1-line Engineering Disclaimer
    ctx.fillStyle = '#475569';
    ctx.font = '500 11px "Plus Jakarta Sans", system-ui, sans-serif';
    const disclaimer =
      'Conceptual mockup only. Final RCC column, beam, slab sizing, reinforcement, and soil foundation design must be verified by a licensed civil engineer (BNBC 2020).';
    ctx.fillText(disclaimer, padX, img.height + 41);

    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bhumimap';
    a.download = `${slug}-${viewLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    a.click();
  };
  img.src = sourceDataUrl;
}
