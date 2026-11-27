import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import {
  AssetDefinition,
  Beam,
  BlueprintAnnotation,
  BlueprintSettings,
  BnbcConfig,
  BuildingProject,
  DEFAULT_BLUEPRINT_SETTINGS,
  DEFAULT_BNBC_CONFIG,
  DEFAULT_LAYER_VISIBILITY,
  ExperienceMode,
  LightingPreset,
  PhysicsIssue,
  Pillar,
  PlacedAsset,
  RoomZone,
  SelectionTarget,
  Slab,
  SlabCutout,
  Story,
  SurveyUnderlay,
  ToolMode,
  UnitSystem,
  ViewMode,
  Wall,
  WallOpening,
} from './types/building';
import {
  analyzeBuildingPhysics,
  validatePillarPlacement,
  validateWallPlacement,
} from './engine/physics';
import {
  detectEnclosedRooms,
  getWallArcLength,
  isCurvedWall,
  splitWallsAtIntersection,
} from './engine/geometryKernel';
import {
  AlignMode,
  alignTargetsInStory,
  deleteTargetsInStory,
  distributeTargetsInStory,
  mirrorTargetsInStory,
  translateTargetsInStory,
} from './engine/cad2d';
import { getAssetDefinition } from './engine/assets';
import {
  computeCompanionSpawn,
  findUpperSlabNeedingCutout,
  solveAssetPlacement,
} from './engine/assetHarmony';
import {
  exportBlueprintPngWithDisclaimer,
  loadAutosave,
  saveAutosave,
} from './engine/projectStorage';
import { createInitialProject, TEMPLATE_PRESETS } from './engine/templates';
import { formatLength, ft, getDefaultSnap, inch } from './engine/units';
import { TopBar } from './components/TopBar';
import { LeftToolRail } from './components/LeftToolRail';
import { LeftDock } from './components/LeftDock';
import { RightInspector } from './components/RightInspector';
import { Canvas2D, Canvas2DHandle } from './components/Canvas2D';
import { CameraPreset, Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { BottomWorkspaceBar } from './components/BottomWorkspaceBar';
import { TakeoffExportModal } from './components/TakeoffExportModal';
import { LandSetupWizard } from './components/LandSetupWizard';
import { QuickHelpModal } from './components/QuickHelpModal';

interface ProjectHistory {
  past: BuildingProject[];
  present: BuildingProject;
  future: BuildingProject[];
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function getInitialProject(): BuildingProject {
  const saved = loadAutosave();
  if (saved) return saved;
  return createInitialProject();
}

const TOOL_HINTS: Partial<Record<ToolMode, string>> = {
  wall: 'Wall: Click or drag to draw · Type length + Enter (Tab for angle) · Right-click to finish',
  'curved-wall': 'Curved wall: Click or drag endpoints · Drag cyan center handle to bend',
  'split-wall': 'Split wall: Hover any wall and click to insert a clean joint',
  'offset-wall': 'Offset wall: Hover wall side and click to create parallel copy · Type distance + Enter',
  'trim-wall': 'Trim / Extend: Click protruding wall tail to trim, or near open end to extend to next wall',
  pillar: 'Column: Click plan to place RCC column · Auto-snaps to grid & endpoints',
  room: 'Room: Click or drag opposite corners to draw 4 walls + room label',
  door: 'Door: Click directly on any wall to insert a door',
  window: 'Window: Click directly on any wall to insert a window',
  beam: 'Beam: Click or drag between columns to add an RCC drop beam',
  slab: 'Slab: Click or drag opposite corners to add a floor or balcony slab',
  cutout: 'Cutout: Click or drag over a slab to cut a stair or duplex void',
  note: 'Callout / Note: Click to place a note, or drag from arrow tip to text box for a leader callout',
  'dim-line': 'Dim line: Click two points to add a persistent architectural dimension',
  ruler: 'Ruler: Click points to measure · Double-click or right-click to finish',
  area: 'Area: Click 3+ corners to measure sq ft & Shotok · Double-click to close',
  pan: 'Pan: Drag anywhere to move plan · Scroll to zoom',
};

export default function App() {
  const [history, setHistory] = useState<ProjectHistory>(() => ({
    past: [],
    present: getInitialProject(),
    future: [],
  }));
  const project = history.present;
  const projectRef = useRef<BuildingProject>(project);
  projectRef.current = project;

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'split' : '2d'
  );
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('simple');
  const [tool, setTool] = useState<ToolMode>('select');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number>(0);
  const [selection, setSelection] = useState<SelectionTarget | null>(null);
  const [multiSelection, setMultiSelection] = useState<SelectionTarget[]>([]);

  const [assetsOpen, setAssetsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const [heatmapMode, setHeatmapMode] = useState(false);
  const [xrayStructural, setXrayStructural] = useState(false);
  const [showSetbacks, setShowSetbacks] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showAllStories, setShowAllStories] = useState(true);
  const [showCeilingRoof, setShowCeilingRoof] = useState(true);
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>('daylight');
  const [showSiteContext, setShowSiteContext] = useState(true);
  const [cutawayRatio, setCutawayRatio] = useState(1.0);
  const [explodeGap, setExplodeGap] = useState(0);
  const [takeoffOpen, setTakeoffOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [boxSelectMode, setBoxSelectMode] = useState(false);

  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const [placingAssetId, setPlacingAssetId] = useState<string | null>(null);
  const [placingAssetRotation, setPlacingAssetRotation] = useState<number>(0);
  const [placingAssetFlipX, setPlacingAssetFlipX] = useState<boolean>(false);
  const [isDragging2D, setIsDragging2D] = useState(false);
  const [lockAlert, setLockAlert] = useState<{ reason: string; fixHint?: string } | null>(null);

  const canvas2DRef = useRef<Canvas2DHandle>(null);
  const viewport3DRef = useRef<Viewport3DHandle>(null);
  const dragSnapshotRef = useRef<BuildingProject | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => saveAutosave(project), 250);
    return () => clearTimeout(t);
  }, [project]);

  const physics = useMemo(() => analyzeBuildingPhysics(project), [project]);

  const activeStory = useMemo(
    () => project.stories.find((s) => s.index === activeStoryIndex) ?? project.stories[0],
    [project.stories, activeStoryIndex]
  );

  const lowerStory = useMemo(
    () =>
      activeStory.index > 0
        ? project.stories.find((s) => s.index === activeStory.index - 1)
        : undefined,
    [project.stories, activeStory.index]
  );

  const activeAreaM2 = useMemo(
    () => activeStory.slabs.reduce((sum, sl) => sum + sl.width * sl.depth, 0),
    [activeStory.slabs]
  );

  // Atomic, StrictMode-safe project update with zero nested setState calls
  const applyProjectChange = useCallback(
    (
      updater: (prev: BuildingProject) => BuildingProject,
      options?: { recordHistory?: boolean; skipStrictCheck?: boolean }
    ): boolean => {
      const recordHistory = options?.recordHistory ?? true;
      const current = projectRef.current;
      const candidate = updater(current);

      if (current.strictPhysicsLock && !options?.skipStrictCheck) {
        const prevPhys = analyzeBuildingPhysics(current);
        const nextPhys = analyzeBuildingPhysics(candidate);
        if (nextPhys.criticalCount > prevPhys.criticalCount) {
          const newCrit = nextPhys.issues.find(
            (i) => i.severity === 'critical' && !prevPhys.issues.some((p) => p.id === i.id)
          );
          setLockAlert({
            reason: newCrit?.simpleTitle || 'Blocked by Strict Physics Lock.',
            fixHint: newCrit?.simpleFix || newCrit?.fixHint,
          });
          if (dragSnapshotRef.current) {
            const snap = dragSnapshotRef.current;
            dragSnapshotRef.current = null;
            setHistory((h) => ({ ...h, present: snap }));
          }
          return false;
        }
      }

      const nextPresent = { ...candidate, updatedAt: Date.now() };
      const snapshotToPush = recordHistory ? dragSnapshotRef.current ?? current : null;
      if (recordHistory) {
        dragSnapshotRef.current = null;
      }

      setHistory((h) =>
        recordHistory && snapshotToPush
          ? {
              past: [...h.past.slice(-49), snapshotToPush],
              present: nextPresent,
              future: [],
            }
          : {
              ...h,
              present: nextPresent,
            }
      );
      setLockAlert(null);
      return true;
    },
    []
  );

  const handleBeginDragHistory = useCallback(() => {
    dragSnapshotRef.current = projectRef.current;
  }, []);

  const handleUndo = useCallback(() => {
    dragSnapshotRef.current = null;
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const prev = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: prev,
        future: [h.present, ...h.future.slice(0, 49)],
      };
    });
    setSelection(null);
    setMultiSelection([]);
  }, []);

  const handleRedo = useCallback(() => {
    dragSnapshotRef.current = null;
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      return {
        past: [...h.past.slice(-49), h.present],
        present: next,
        future: h.future.slice(1),
      };
    });
    setSelection(null);
    setMultiSelection([]);
  }, []);

  const updateStoryItems = useCallback(
    (
      storyIndex: number,
      mutator: (story: Story) => Story,
      opts?: { recordHistory?: boolean; skipStrictCheck?: boolean }
    ) => {
      return applyProjectChange(
        (prev) => ({
          ...prev,
          stories: prev.stories.map((s) => (s.index === storyIndex ? mutator(s) : s)),
        }),
        opts
      );
    },
    [applyProjectChange]
  );

  const setAssetsDrawerOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setAssetsOpen((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (resolved && typeof window !== 'undefined' && window.innerWidth < 1024) {
        setInspectorOpen(false);
      }
      return resolved;
    });
  }, []);

  const setInspectorDrawerOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setInspectorOpen((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (resolved && typeof window !== 'undefined' && window.innerWidth < 1024) {
        setAssetsOpen(false);
      }
      return resolved;
    });
  }, []);

  // Story-synced selection (never forces the Inspector drawer open unexpectedly!)
  const handleSelect = useCallback((target: SelectionTarget | null) => {
    setSelection(target);
    setMultiSelection(target ? [target] : []);
    if (target) {
      setActiveStoryIndex(target.storyIndex);
    }
  }, []);

  const handleMultiSelect = useCallback((targets: SelectionTarget[]) => {
    setMultiSelection(targets);
    setSelection(targets.length === 1 ? targets[0] : null);
    if (targets.length > 0) {
      setActiveStoryIndex(targets[0].storyIndex);
    }
  }, []);

  const handleSelectTool = useCallback((nextTool: ToolMode) => {
    setPlacingAssetId(null);
    if (nextTool !== 'select') setBoxSelectMode(false);
    setTool(nextTool);
  }, []);

  // Story mutations
  const handleUpdateStory = useCallback(
    (storyIndex: number, patch: Partial<Story>) => {
      updateStoryItems(storyIndex, (s) => ({ ...s, ...patch }));
    },
    [updateStoryItems]
  );

  const handleUpdateBnbc = useCallback(
    (patch: Partial<BnbcConfig>) => {
      applyProjectChange(
        (prev) => ({
          ...prev,
          bnbc: { ...DEFAULT_BNBC_CONFIG, ...(prev.bnbc ?? {}), ...patch },
        }),
        { skipStrictCheck: true }
      );
    },
    [applyProjectChange]
  );

  const handleToggleLayerLock = useCallback(
    (layer: 'pillars' | 'beams' | 'walls' | 'slabs') => {
      applyProjectChange(
        (prev) => ({
          ...prev,
          lockedLayers: {
            ...(prev.lockedLayers ?? {}),
            [layer]: !(prev.lockedLayers?.[layer] ?? false),
          },
        }),
        { recordHistory: false, skipStrictCheck: true }
      );
    },
    [applyProjectChange]
  );

  const handleUpdateBlueprintSettings = useCallback(
    (patch: Partial<BlueprintSettings>) => {
      applyProjectChange(
        (prev) => ({
          ...prev,
          blueprintSettings: {
            ...DEFAULT_BLUEPRINT_SETTINGS,
            ...(prev.blueprintSettings ?? {}),
            ...patch,
            layers: {
              ...DEFAULT_LAYER_VISIBILITY,
              ...(prev.blueprintSettings?.layers ?? {}),
              ...(patch.layers ?? {}),
            },
          },
        }),
        { recordHistory: false, skipStrictCheck: true }
      );
    },
    [applyProjectChange]
  );

  const handleChangeExperienceMode = useCallback(
    (mode: ExperienceMode) => {
      setExperienceMode(mode);
      const isPro = mode === 'engineer';
      applyProjectChange(
        (prev) => ({
          ...prev,
          blueprintSettings: {
            ...DEFAULT_BLUEPRINT_SETTINGS,
            ...(prev.blueprintSettings ?? {}),
            showScheduleTags: isPro,
            uiRev: 2,
            layers: {
              ...DEFAULT_LAYER_VISIBILITY,
              ...(prev.blueprintSettings?.layers ?? {}),
              grid: isPro,
            },
          },
        }),
        { recordHistory: false, skipStrictCheck: true }
      );
    },
    [applyProjectChange]
  );

  const handleUpdateUnderlay = useCallback(
    (underlay: SurveyUnderlay | undefined) => {
      applyProjectChange(
        (prev) => ({
          ...prev,
          underlay,
        }),
        { recordHistory: false, skipStrictCheck: true }
      );
    },
    [applyProjectChange]
  );

  const handleAddStoryAbove = useCallback(
    (copyStructure: boolean) => {
      const curr = projectRef.current;
      if (curr.stories.length >= 11) return;
      const sorted = [...curr.stories].sort((a, b) => a.index - b.index);
      const top = sorted[sorted.length - 1];
      const nextIdx = top.index + 1;

      const newStory: Story = {
        id: makeId('story'),
        index: nextIdx,
        name: `Floor ${nextIdx} (G+${nextIdx})`,
        height: top.height,
        slabThickness: top.slabThickness,
        occupancy: top.occupancy === 'commercial' ? 'residential' : top.occupancy,
        slabs: copyStructure
          ? top.slabs.map((s) => ({
              ...s,
              id: makeId('sl'),
              cutouts: (s.cutouts ?? []).map((c) => ({ ...c, id: makeId('cut') })),
            }))
          : [
              {
                id: makeId('sl'),
                label: `G+${nextIdx} Floor Slab`,
                x: top.slabs[0]?.x ?? 0,
                z: top.slabs[0]?.z ?? 0,
                width: top.slabs[0]?.width ?? ft(30),
                depth: top.slabs[0]?.depth ?? ft(40),
                thickness: top.slabThickness,
                type: 'floor',
                cutouts: [],
              },
            ],
        pillars: copyStructure ? top.pillars.map((p) => ({ ...p, id: makeId('col') })) : [],
        beams: copyStructure ? top.beams.map((b) => ({ ...b, id: makeId('bm') })) : [],
        walls: copyStructure
          ? top.walls.map((w) => ({
              ...w,
              id: makeId('w'),
              openings: w.openings
                .filter((o) => o.kind !== 'shutter-shop')
                .map((o) => ({ ...o, id: makeId('op') })),
            }))
          : [],
        rooms: copyStructure ? top.rooms.map((r) => ({ ...r, id: makeId('rm') })) : [],
        assets: copyStructure
          ? top.assets
              .filter(
                (a) =>
                  !a.assetId.startsWith('car-') &&
                  !a.assetId.startsWith('tree-') &&
                  a.assetId !== 'pukur-pond'
              )
              .map((a) => ({ ...a, id: makeId('ast') }))
          : [],
      };

      applyProjectChange(
        (prev) => ({ ...prev, stories: [...prev.stories, newStory] }),
        { skipStrictCheck: true }
      );
      setActiveStoryIndex(nextIdx);
      setSelection(null);
    },
    [applyProjectChange]
  );

  const handleDeleteStory = useCallback(
    (storyIndex: number) => {
      if (projectRef.current.stories.length <= 1) return;
      applyProjectChange(
        (prev) => ({
          ...prev,
          stories: prev.stories
            .filter((s) => s.index !== storyIndex)
            .map((s, idx) => ({ ...s, index: idx })),
        }),
        { skipStrictCheck: true }
      );
      setActiveStoryIndex(Math.max(0, storyIndex - 1));
      setSelection(null);
    },
    [applyProjectChange]
  );

  const handleAutoDetectRooms = useCallback(() => {
    updateStoryItems(activeStory.index, (s) => {
      const detected = detectEnclosedRooms(s);
      if (detected.length === 0) return s;
      return { ...s, rooms: detected };
    });
  }, [activeStory.index, updateStoryItems]);

  // Element mutations (all story-aware)
  const targetStoryIdx = selection?.storyIndex ?? activeStory.index;

  const handleAddRoom = useCallback(
    (rect: { x: number; z: number; width: number; depth: number }) => {
      const t = inch(5);
      const { x, z, width, depth } = rect;
      const roomWalls: Wall[] = [
        { id: makeId('w'), x1: x, z1: z, x2: x + width, z2: z, thickness: t, height: null, material: 'brick-1st', role: 'partition', openings: [] },
        { id: makeId('w'), x1: x + width, z1: z, x2: x + width, z2: z + depth, thickness: t, height: null, material: 'brick-1st', role: 'partition', openings: [] },
        { id: makeId('w'), x1: x + width, z1: z + depth, x2: x, z2: z + depth, thickness: t, height: null, material: 'brick-1st', role: 'partition', openings: [] },
        { id: makeId('w'), x1: x, z1: z + depth, x2: x, z2: z, thickness: t, height: null, material: 'brick-1st', role: 'partition', openings: [] },
      ];
      updateStoryItems(activeStory.index, (s) => {
        let nextWalls = [...s.walls];
        for (const rw of roomWalls) {
          nextWalls = splitWallsAtIntersection(nextWalls, rw);
        }
        const nextRoom: RoomZone = {
          id: makeId('rm'),
          name: `Room ${s.rooms.length + 1}`,
          x,
          z,
          width,
          depth,
        };
        return { ...s, walls: nextWalls, rooms: [...s.rooms, nextRoom] };
      });
    },
    [activeStory.index, updateStoryItems]
  );

  const handleUpdateRoom = useCallback(
    (roomId: string, patch: Partial<RoomZone>) => {
      updateStoryItems(targetStoryIdx, (s) => ({
        ...s,
        rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
      }));
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleDeleteRoom = useCallback(
    (roomId: string) => {
      updateStoryItems(targetStoryIdx, (s) => ({
        ...s,
        rooms: s.rooms.filter((r) => r.id !== roomId),
      }));
      setSelection(null);
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleAddWall = useCallback(
    (wall: Wall) => {
      if (projectRef.current.strictPhysicsLock) {
        const check = validateWallPlacement(activeStory, wall.x1, wall.z1, wall.x2, wall.z2, true);
        if (!check.allowed) {
          setLockAlert({ reason: check.reason || 'Invalid wall placement.', fixHint: check.fixHint });
          return;
        }
      }
      updateStoryItems(activeStory.index, (s) => ({
        ...s,
        walls: splitWallsAtIntersection(s.walls, wall),
      }));
      setSelection({ type: 'wall', id: wall.id, storyIndex: activeStory.index });
    },
    [activeStory, updateStoryItems]
  );

  const handleUpdateWall = useCallback(
    (wallId: string, patch: Partial<Wall>, commit = true) => {
      updateStoryItems(
        targetStoryIdx,
        (s) => ({
          ...s,
          walls: s.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)),
        }),
        { recordHistory: commit }
      );
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleDeleteWall = useCallback(
    (wallId: string) => {
      updateStoryItems(targetStoryIdx, (s) => ({
        ...s,
        walls: s.walls.filter((w) => w.id !== wallId),
      }));
      setSelection(null);
      setMultiSelection([]);
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleReplaceWalls = useCallback(
    (walls: Wall[], commit = true, reDetectRooms = false) => {
      updateStoryItems(
        activeStory.index,
        (s) => {
          const nextStory: Story = { ...s, walls };
          if (reDetectRooms) {
            const detected = detectEnclosedRooms(nextStory);
            if (detected.length > 0) {
              return { ...nextStory, rooms: detected };
            }
          }
          return nextStory;
        },
        { recordHistory: commit }
      );
    },
    [activeStory.index, updateStoryItems]
  );

  const handleAddOpening = useCallback(
    (wallId: string, opening: WallOpening) => {
      updateStoryItems(activeStory.index, (s) => ({
        ...s,
        walls: s.walls.map((w) =>
          w.id === wallId ? { ...w, openings: [...w.openings, opening] } : w
        ),
      }));
      setSelection({
        type: 'opening',
        id: opening.id,
        parentWallId: wallId,
        storyIndex: activeStory.index,
      });
    },
    [activeStory.index, updateStoryItems]
  );

  const handleUpdateOpening = useCallback(
    (wallId: string, openingId: string, patch: Partial<WallOpening>, commit = true) => {
      updateStoryItems(
        targetStoryIdx,
        (s) => ({
          ...s,
          walls: s.walls.map((w) =>
            w.id === wallId
              ? {
                  ...w,
                  openings: w.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)),
                }
              : w
          ),
        }),
        { recordHistory: commit }
      );
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleToggleOpening3D = useCallback(
    (storyIndex: number, wallId: string, openingId: string) => {
      updateStoryItems(
        storyIndex,
        (s) => ({
          ...s,
          walls: s.walls.map((w) =>
            w.id === wallId
              ? {
                  ...w,
                  openings: w.openings.map((o) =>
                    o.id === openingId
                      ? { ...o, openRatio: (o.openRatio ?? 0.35) > 0.45 ? 0 : 0.85 }
                      : o
                  ),
                }
              : w
          ),
        }),
        { recordHistory: false, skipStrictCheck: true }
      );
    },
    [updateStoryItems]
  );

  const handleDeleteOpening = useCallback(
    (wallId: string, openingId: string) => {
      updateStoryItems(targetStoryIdx, (s) => ({
        ...s,
        walls: s.walls.map((w) =>
          w.id === wallId
            ? { ...w, openings: w.openings.filter((o) => o.id !== openingId) }
            : w
        ),
      }));
      setSelection(null);
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleAddPillar = useCallback(
    (pillar: Pillar) => {
      if (projectRef.current.strictPhysicsLock) {
        const check = validatePillarPlacement(activeStory, pillar.x, pillar.z, true);
        if (!check.allowed) {
          setLockAlert({ reason: check.reason || 'Invalid pillar placement.', fixHint: check.fixHint });
          return;
        }
      }
      updateStoryItems(activeStory.index, (s) => ({ ...s, pillars: [...s.pillars, pillar] }));
      setSelection({ type: 'pillar', id: pillar.id, storyIndex: activeStory.index });
    },
    [activeStory, updateStoryItems]
  );

  const handleUpdatePillar = useCallback(
    (pillarId: string, patch: Partial<Pillar>, commit = true) => {
      updateStoryItems(
        targetStoryIdx,
        (s) => ({
          ...s,
          pillars: s.pillars.map((p) => (p.id === pillarId ? { ...p, ...patch } : p)),
        }),
        { recordHistory: commit }
      );
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleMovePillar3D = useCallback(
    (storyIndex: number, pillarId: string, x: number, z: number) => {
      updateStoryItems(storyIndex, (s) => ({
        ...s,
        pillars: s.pillars.map((p) => (p.id === pillarId ? { ...p, x, z } : p)),
      }));
    },
    [updateStoryItems]
  );

  const handleDeletePillar = useCallback(
    (pillarId: string) => {
      updateStoryItems(targetStoryIdx, (s) => ({
        ...s,
        pillars: s.pillars.filter((p) => p.id !== pillarId),
      }));
      setSelection(null);
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleAddBeam = useCallback(
    (beam: Beam) => {
      updateStoryItems(activeStory.index, (s) => ({ ...s, beams: [...s.beams, beam] }));
      setSelection({ type: 'beam', id: beam.id, storyIndex: activeStory.index });
    },
    [activeStory.index, updateStoryItems]
  );

  const handleUpdateBeam = useCallback(
    (beamId: string, patch: Partial<Beam>, commit = true) => {
      updateStoryItems(
        targetStoryIdx,
        (s) => ({
          ...s,
          beams: s.beams.map((b) => (b.id === beamId ? { ...b, ...patch } : b)),
        }),
        { recordHistory: commit }
      );
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleDeleteBeam = useCallback(
    (beamId: string) => {
      updateStoryItems(targetStoryIdx, (s) => ({
        ...s,
        beams: s.beams.filter((b) => b.id !== beamId),
      }));
      setSelection(null);
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleAddSlab = useCallback(
    (slab: Slab) => {
      updateStoryItems(activeStory.index, (s) => ({ ...s, slabs: [...s.slabs, slab] }));
      setSelection({ type: 'slab', id: slab.id, storyIndex: activeStory.index });
    },
    [activeStory.index, updateStoryItems]
  );

  const handleUpdateSlab = useCallback(
    (slabId: string, patch: Partial<Slab>, commit = true) => {
      updateStoryItems(
        targetStoryIdx,
        (s) => ({
          ...s,
          slabs: s.slabs.map((sl) => (sl.id === slabId ? { ...sl, ...patch } : sl)),
        }),
        { recordHistory: commit }
      );
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleDeleteSlab = useCallback(
    (slabId: string) => {
      updateStoryItems(targetStoryIdx, (s) => ({
        ...s,
        slabs: s.slabs.filter((sl) => sl.id !== slabId),
      }));
      setSelection(null);
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleAddCutout = useCallback(
    (slabId: string, cutout: SlabCutout) => {
      updateStoryItems(activeStory.index, (s) => ({
        ...s,
        slabs: s.slabs.map((sl) =>
          sl.id === slabId ? { ...sl, cutouts: [...(sl.cutouts ?? []), cutout] } : sl
        ),
      }));
      setSelection({
        type: 'cutout',
        id: cutout.id,
        parentSlabId: slabId,
        storyIndex: activeStory.index,
      });
    },
    [activeStory.index, updateStoryItems]
  );

  const handleUpdateCutout = useCallback(
    (slabId: string, cutoutId: string, patch: Partial<SlabCutout>, commit = true) => {
      updateStoryItems(
        targetStoryIdx,
        (s) => ({
          ...s,
          slabs: s.slabs.map((sl) =>
            sl.id === slabId
              ? {
                  ...sl,
                  cutouts: (sl.cutouts ?? []).map((c) => (c.id === cutoutId ? { ...c, ...patch } : c)),
                }
              : sl
          ),
        }),
        { recordHistory: commit }
      );
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleDeleteCutout = useCallback(
    (slabId: string, cutoutId: string) => {
      updateStoryItems(targetStoryIdx, (s) => ({
        ...s,
        slabs: s.slabs.map((sl) =>
          sl.id === slabId
            ? { ...sl, cutouts: (sl.cutouts ?? []).filter((c) => c.id !== cutoutId) }
            : sl
        ),
      }));
      setSelection(null);
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleAddAsset = useCallback(
    (asset: PlacedAsset) => {
      updateStoryItems(activeStory.index, (s) => ({ ...s, assets: [...s.assets, asset] }));
      setSelection({ type: 'asset', id: asset.id, storyIndex: activeStory.index });
    },
    [activeStory.index, updateStoryItems]
  );

  const handleStartPlaceAsset = useCallback((def: AssetDefinition) => {
    setTool('select');
    setPlacingAssetId((prev) => (prev === def.id ? null : def.id));
    setPlacingAssetRotation(0);
    setPlacingAssetFlipX(false);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setAssetsOpen(false);
    }
  }, []);

  const handlePlaceAssetAt = useCallback(
    (assetId: string, x: number, z: number, rotation: number, flipX = false) => {
      const def = getAssetDefinition(assetId);
      if (!def) return;
      handleAddAsset({
        id: makeId('ast'),
        assetId: def.id,
        label: def.name,
        x,
        z,
        width: def.defaultWidth,
        depth: def.defaultDepth,
        height: def.defaultHeight,
        rotation,
        flipX: flipX || undefined,
        elevationY: def.defaultElevationY,
      });
    },
    [handleAddAsset]
  );

  const handlePlaceAssetQuick = useCallback(
    (def: AssetDefinition) => {
      const mainSlab = activeStory.slabs[0];
      let cx = mainSlab ? mainSlab.x + mainSlab.width * 0.5 : ft(12);
      let cz = mainSlab ? mainSlab.z + mainSlab.depth * 0.5 : ft(12);

      // Anti-stack spiral nudge so quick-placed assets never pile invisibly on top of each other
      let attempt = 0;
      while (
        attempt < 12 &&
        activeStory.assets.some((a) => Math.hypot(a.x - cx, a.z - cz) < 0.45)
      ) {
        attempt += 1;
        const ang = attempt * 1.1;
        const dist = 0.55 + attempt * 0.25;
        cx = (mainSlab ? mainSlab.x + mainSlab.width * 0.5 : ft(12)) + Math.cos(ang) * dist;
        cz = (mainSlab ? mainSlab.z + mainSlab.depth * 0.5 : ft(12)) + Math.sin(ang) * dist;
      }

      const solved = solveAssetPlacement(
        {
          assetId: def.id,
          x: cx,
          z: cz,
          width: def.defaultWidth,
          depth: def.defaultDepth,
          height: def.defaultHeight,
          rotation: 0,
          elevationY: def.defaultElevationY,
        },
        activeStory,
        {
          snapEnabled: true,
          gridStepM: projectRef.current.gridSnap || 0.1524,
          wallSnapRadiusM: 2.5,
          companionSnapRadiusM: 1.5,
        }
      );

      handleAddAsset({
        id: makeId('ast'),
        assetId: def.id,
        label: def.name,
        x: solved.x,
        z: solved.z,
        width: def.defaultWidth,
        depth: def.defaultDepth,
        height: def.defaultHeight,
        rotation: solved.rotation,
        elevationY: def.defaultElevationY,
      });
    },
    [activeStory, handleAddAsset]
  );

  const handleAddCompanionAsset = useCallback(
    (hostAsset: PlacedAsset) => {
      const spawned = computeCompanionSpawn(hostAsset, activeStory);
      if (!spawned) return;
      handleAddAsset({
        ...spawned,
        id: makeId('ast'),
      });
    },
    [activeStory, handleAddAsset]
  );

  const handleCutUpperSlabForStair = useCallback(
    (asset: PlacedAsset) => {
      const info = findUpperSlabNeedingCutout(asset, projectRef.current, activeStory.index);
      if (!info) return;
      const newCutout: SlabCutout = {
        id: makeId('cut'),
        label: `${asset.label} Void`,
        x: info.rect.x,
        z: info.rect.z,
        width: info.rect.width,
        depth: info.rect.depth,
      };
      updateStoryItems(info.upperStoryIndex, (s) => ({
        ...s,
        slabs: s.slabs.map((sl) =>
          sl.id === info.slabId
            ? { ...sl, cutouts: [...(sl.cutouts ?? []), newCutout] }
            : sl
        ),
      }));
    },
    [activeStory.index, updateStoryItems]
  );

  const handleUpdateAsset = useCallback(
    (assetId: string, patch: Partial<PlacedAsset>, commit = true) => {
      updateStoryItems(
        targetStoryIdx,
        (s) => ({
          ...s,
          assets: s.assets.map((a) => (a.id === assetId ? { ...a, ...patch } : a)),
        }),
        { recordHistory: commit }
      );
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleMoveAsset3D = useCallback(
    (storyIndex: number, assetId: string, x: number, z: number, rotation?: number) => {
      updateStoryItems(storyIndex, (s) => ({
        ...s,
        assets: s.assets.map((a) =>
          a.id === assetId
            ? { ...a, x, z, rotation: rotation !== undefined ? rotation : a.rotation }
            : a
        ),
      }));
    },
    [updateStoryItems]
  );

  const handleDeleteAsset = useCallback(
    (assetId: string) => {
      updateStoryItems(targetStoryIdx, (s) => ({
        ...s,
        assets: s.assets.filter((a) => a.id !== assetId),
      }));
      setSelection(null);
      setMultiSelection([]);
    },
    [targetStoryIdx, updateStoryItems]
  );

  // Blueprint Annotations (Notes, Leader Callouts, Persistent Dimension Lines)
  const handleAddAnnotation = useCallback(
    (ann: BlueprintAnnotation) => {
      updateStoryItems(activeStory.index, (s) => ({
        ...s,
        annotations: [...(s.annotations ?? []), ann],
      }));
      const target: SelectionTarget = {
        type: 'annotation',
        id: ann.id,
        storyIndex: activeStory.index,
      };
      setSelection(target);
      setMultiSelection([target]);
    },
    [activeStory.index, updateStoryItems]
  );

  const handleUpdateAnnotation = useCallback(
    (annId: string, patch: Partial<BlueprintAnnotation>, commit = true) => {
      updateStoryItems(
        targetStoryIdx,
        (s) => ({
          ...s,
          annotations: (s.annotations ?? []).map((an) =>
            an.id === annId ? { ...an, ...patch } : an
          ),
        }),
        { recordHistory: commit, skipStrictCheck: true }
      );
    },
    [targetStoryIdx, updateStoryItems]
  );

  const handleDeleteAnnotation = useCallback(
    (annId: string) => {
      updateStoryItems(
        targetStoryIdx,
        (s) => ({
          ...s,
          annotations: (s.annotations ?? []).filter((an) => an.id !== annId),
        }),
        { skipStrictCheck: true }
      );
      setSelection(null);
      setMultiSelection([]);
    },
    [targetStoryIdx, updateStoryItems]
  );

  // Multi-Selection Group Transforms (Move, Align, Distribute, Mirror, Delete)
  const handleMoveMultiSelection = useCallback(
    (dx: number, dz: number, commit = true) => {
      if (multiSelection.length === 0) return;
      updateStoryItems(
        activeStory.index,
        (s) => translateTargetsInStory(s, multiSelection, dx, dz),
        { recordHistory: commit }
      );
    },
    [activeStory.index, multiSelection, updateStoryItems]
  );

  const handleAlignMultiSelection = useCallback(
    (mode: AlignMode) => {
      if (multiSelection.length < 2) return;
      updateStoryItems(activeStory.index, (s) => alignTargetsInStory(s, multiSelection, mode));
    },
    [activeStory.index, multiSelection, updateStoryItems]
  );

  const handleDistributeMultiSelection = useCallback(
    (axis: 'x' | 'z') => {
      if (multiSelection.length < 3) return;
      updateStoryItems(activeStory.index, (s) =>
        distributeTargetsInStory(s, multiSelection, axis)
      );
    },
    [activeStory.index, multiSelection, updateStoryItems]
  );

  const handleMirrorMultiSelection = useCallback(
    (axis: 'horizontal' | 'vertical', clone = false) => {
      if (multiSelection.length === 0) return;
      let nextTargets: SelectionTarget[] = multiSelection;
      const ok = updateStoryItems(activeStory.index, (s) => {
        const res = mirrorTargetsInStory(s, multiSelection, axis, clone);
        nextTargets = res.nextTargets;
        return res.story;
      });
      if (ok) {
        setMultiSelection(nextTargets);
        setSelection(nextTargets.length === 1 ? nextTargets[0] : null);
      }
    },
    [activeStory.index, multiSelection, updateStoryItems]
  );

  const handleDeleteMultiSelection = useCallback(() => {
    if (multiSelection.length === 0) return;
    updateStoryItems(activeStory.index, (s) => deleteTargetsInStory(s, multiSelection));
    setMultiSelection([]);
    setSelection(null);
  }, [activeStory.index, multiSelection, updateStoryItems]);

  // Duplicate Selected (Ctrl+D)
  const handleDuplicateSelected = useCallback(() => {
    if (!selection) return;
    const story = projectRef.current.stories.find((s) => s.index === selection.storyIndex);
    if (!story) return;
    const offset = projectRef.current.unitSystem === 'imperial' ? ft(1) : 0.3;

    if (selection.type === 'asset') {
      const a = story.assets.find((item) => item.id === selection.id);
      if (!a) return;
      const clone: PlacedAsset = {
        ...a,
        id: makeId('ast'),
        x: Number((a.x + offset).toFixed(3)),
        z: Number((a.z + offset).toFixed(3)),
        locked: false,
      };
      updateStoryItems(story.index, (s) => ({ ...s, assets: [...s.assets, clone] }));
      setSelection({ type: 'asset', id: clone.id, storyIndex: story.index });
    } else if (selection.type === 'pillar') {
      const p = story.pillars.find((item) => item.id === selection.id);
      if (!p) return;
      const clone: Pillar = {
        ...p,
        id: makeId('col'),
        label: `C${story.pillars.length + 1}`,
        x: Number((p.x + offset * 2).toFixed(3)),
        z: p.z,
        locked: false,
      };
      updateStoryItems(story.index, (s) => ({ ...s, pillars: [...s.pillars, clone] }));
      setSelection({ type: 'pillar', id: clone.id, storyIndex: story.index });
    } else if (selection.type === 'wall') {
      const w = story.walls.find((item) => item.id === selection.id);
      if (!w) return;
      const clone: Wall = {
        ...w,
        id: makeId('w'),
        x1: Number((w.x1 + offset).toFixed(3)),
        z1: Number((w.z1 + offset).toFixed(3)),
        x2: Number((w.x2 + offset).toFixed(3)),
        z2: Number((w.z2 + offset).toFixed(3)),
        openings: w.openings.map((o) => ({ ...o, id: makeId('op') })),
        locked: false,
      };
      updateStoryItems(story.index, (s) => ({ ...s, walls: [...s.walls, clone] }));
      setSelection({ type: 'wall', id: clone.id, storyIndex: story.index });
    } else if (selection.type === 'slab') {
      const sl = story.slabs.find((item) => item.id === selection.id);
      if (!sl) return;
      const clone: Slab = {
        ...sl,
        id: makeId('sl'),
        label: `${sl.label} Copy`,
        x: Number((sl.x + offset * 2).toFixed(3)),
        z: Number((sl.z + offset * 2).toFixed(3)),
        cutouts: [],
        locked: false,
      };
      updateStoryItems(story.index, (s) => ({ ...s, slabs: [...s.slabs, clone] }));
      setSelection({ type: 'slab', id: clone.id, storyIndex: story.index });
    }
  }, [selection, updateStoryItems]);

  // Selection-level Lock / Delete helpers
  const toggleLockOnSelected = useCallback(() => {
    if (!selection) return;
    const story = projectRef.current.stories.find((s) => s.index === selection.storyIndex);
    if (!story) return;
    if (selection.type === 'wall') {
      const w = story.walls.find((x) => x.id === selection.id);
      if (w) handleUpdateWall(w.id, { locked: !w.locked }, true);
    } else if (selection.type === 'pillar') {
      const p = story.pillars.find((x) => x.id === selection.id);
      if (p) handleUpdatePillar(p.id, { locked: !p.locked }, true);
    } else if (selection.type === 'beam') {
      const b = story.beams.find((x) => x.id === selection.id);
      if (b) handleUpdateBeam(b.id, { locked: !b.locked }, true);
    } else if (selection.type === 'slab') {
      const sl = story.slabs.find((x) => x.id === selection.id);
      if (sl) handleUpdateSlab(sl.id, { locked: !sl.locked }, true);
    } else if (selection.type === 'asset') {
      const a = story.assets.find((x) => x.id === selection.id);
      if (a) handleUpdateAsset(a.id, { locked: !a.locked }, true);
    } else if (selection.type === 'annotation') {
      const an = (story.annotations ?? []).find((x) => x.id === selection.id);
      if (an) handleUpdateAnnotation(an.id, { locked: !an.locked }, true);
    }
  }, [
    handleUpdateAnnotation,
    handleUpdateAsset,
    handleUpdateBeam,
    handleUpdatePillar,
    handleUpdateSlab,
    handleUpdateWall,
    selection,
  ]);

  const deleteSelected = useCallback(() => {
    if (multiSelection.length > 1) {
      handleDeleteMultiSelection();
      return;
    }
    if (!selection) return;
    if (selection.type === 'wall') handleDeleteWall(selection.id);
    else if (selection.type === 'pillar') handleDeletePillar(selection.id);
    else if (selection.type === 'beam') handleDeleteBeam(selection.id);
    else if (selection.type === 'slab') handleDeleteSlab(selection.id);
    else if (selection.type === 'room') handleDeleteRoom(selection.id);
    else if (selection.type === 'asset') handleDeleteAsset(selection.id);
    else if (selection.type === 'annotation') handleDeleteAnnotation(selection.id);
    else if (selection.type === 'opening' && selection.parentWallId) {
      handleDeleteOpening(selection.parentWallId, selection.id);
    } else if (selection.type === 'cutout' && selection.parentSlabId) {
      handleDeleteCutout(selection.parentSlabId, selection.id);
    }
  }, [
    handleDeleteAnnotation,
    handleDeleteAsset,
    handleDeleteBeam,
    handleDeleteCutout,
    handleDeleteMultiSelection,
    handleDeleteOpening,
    handleDeletePillar,
    handleDeleteRoom,
    handleDeleteSlab,
    handleDeleteWall,
    multiSelection.length,
    selection,
  ]);

  // Global Studio Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && k === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }
      if (mod) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      if (k === 'escape') {
        if (helpOpen) {
          setHelpOpen(false);
        } else if (placingAssetId) {
          setPlacingAssetId(null);
        } else if (boxSelectMode) {
          setBoxSelectMode(false);
        } else if (tool !== 'select') {
          setTool('select');
        } else {
          setSelection(null);
          setMultiSelection([]);
        }
        return;
      }

      if (k === '1') {
        setViewMode('2d');
        return;
      }
      if (k === '2') {
        setViewMode('split');
        return;
      }
      if (k === '3') {
        setViewMode('2.5d');
        return;
      }
      if (k === '4') {
        setViewMode('3d');
        return;
      }

      if (k === 'v') handleSelectTool('select');
      else if (k === 'w') handleSelectTool('wall');
      else if (k === 'u') handleSelectTool('curved-wall');
      else if (k === 'p') handleSelectTool('split-wall');
      else if (k === 'j') handleSelectTool('offset-wall');
      else if (k === 't') handleSelectTool('trim-wall');
      else if (k === 'c') handleSelectTool('pillar');
      else if (k === 'g') handleSelectTool('room');
      else if (k === 'd') handleSelectTool('door');
      else if (k === 'n') handleSelectTool('window');
      else if (k === 'b') handleSelectTool('beam');
      else if (k === 's') handleSelectTool('slab');
      else if (k === 'k') handleSelectTool('cutout');
      else if (k === 'e') handleSelectTool('note');
      else if (k === 'q') handleSelectTool('dim-line');
      else if (k === 'm') handleSelectTool('ruler');
      else if (k === 'a') handleSelectTool('area');
      else if (k === 'o') setAssetsDrawerOpen((v) => !v);
      else if (k === 'i') setInspectorDrawerOpen((v) => !v);
      else if (k === 'x') setXrayStructural((v) => !v);
      else if (k === 'h') setHeatmapMode((v) => !v);
      else if (k === 'f') {
        if (placingAssetId) {
          setPlacingAssetFlipX((v) => !v);
        } else {
          canvas2DRef.current?.resetView();
          viewport3DRef.current?.applyCameraPreset('exterior');
        }
      } else if (k === 'l' && selection) {
        toggleLockOnSelected();
      } else if (k === 'r') {
        if (placingAssetId) {
          setPlacingAssetRotation((prev) => (prev + Math.PI / 2) % (Math.PI * 2));
        } else if (selection?.type === 'asset') {
          const a = activeStory.assets.find((item) => item.id === selection.id);
          if (a && !a.locked) {
            handleUpdateAsset(a.id, { rotation: (a.rotation + Math.PI / 2) % (Math.PI * 2) }, true);
          }
        } else if (selection?.type === 'pillar') {
          const p = activeStory.pillars.find((item) => item.id === selection.id);
          if (p && !p.locked) {
            handleUpdatePillar(p.id, { rotation: (p.rotation + Math.PI / 2) % (Math.PI * 2) }, true);
          }
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && (selection || multiSelection.length > 0)) {
        e.preventDefault();
        deleteSelected();
      } else if (
        (selection || multiSelection.length > 1) &&
        (e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        const step = e.shiftKey ? inch(6) : inch(1);
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dz = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        if (multiSelection.length > 1) {
          handleMoveMultiSelection(dx, dz, true);
          return;
        }
        if (!selection) return;
        const layers = project.lockedLayers ?? {};

        if (selection.type === 'asset') {
          const a = activeStory.assets.find((item) => item.id === selection.id);
          if (a && !a.locked) handleUpdateAsset(a.id, { x: a.x + dx, z: a.z + dz }, true);
        } else if (selection.type === 'pillar') {
          const p = activeStory.pillars.find((item) => item.id === selection.id);
          if (p && !p.locked && !layers.pillars) {
            handleUpdatePillar(p.id, { x: p.x + dx, z: p.z + dz }, true);
          }
        } else if (selection.type === 'wall') {
          const w = activeStory.walls.find((item) => item.id === selection.id);
          if (w && !w.locked && !layers.walls) {
            handleUpdateWall(
              w.id,
              { x1: w.x1 + dx, z1: w.z1 + dz, x2: w.x2 + dx, z2: w.z2 + dz },
              true
            );
          }
        } else if (selection.type === 'beam') {
          const b = activeStory.beams.find((item) => item.id === selection.id);
          if (b && !b.locked && !layers.beams) {
            handleUpdateBeam(
              b.id,
              { x1: b.x1 + dx, z1: b.z1 + dz, x2: b.x2 + dx, z2: b.z2 + dz },
              true
            );
          }
        } else if (selection.type === 'slab') {
          const sl = activeStory.slabs.find((item) => item.id === selection.id);
          if (sl && !sl.locked && !layers.slabs) {
            handleUpdateSlab(sl.id, { x: sl.x + dx, z: sl.z + dz }, true);
          }
        } else if (selection.type === 'annotation') {
          const an = (activeStory.annotations ?? []).find((item) => item.id === selection.id);
          if (an && !an.locked) {
            handleUpdateAnnotation(
              an.id,
              {
                x1: an.x1 + dx,
                z1: an.z1 + dz,
                x2: an.x2 !== undefined ? an.x2 + dx : undefined,
                z2: an.z2 !== undefined ? an.z2 + dz : undefined,
              },
              true
            );
          }
        } else if (selection.type === 'cutout' && selection.parentSlabId) {
          const sl = activeStory.slabs.find((item) => item.id === selection.parentSlabId);
          const cut = sl?.cutouts?.find((c) => c.id === selection.id);
          if (sl && cut && !sl.locked && !layers.slabs) {
            handleUpdateCutout(sl.id, cut.id, { x: cut.x + dx, z: cut.z + dz }, true);
          }
        } else if (selection.type === 'opening' && selection.parentWallId) {
          const w = activeStory.walls.find((item) => item.id === selection.parentWallId);
          const op = w?.openings.find((o) => o.id === selection.id);
          if (w && op && !w.locked && !layers.walls) {
            const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? step : -step;
            const wLen = getWallArcLength(w);
            const nextOff = Math.max(0.06, Math.min(Math.max(0.06, wLen - op.width - 0.06), op.offset + delta));
            handleUpdateOpening(w.id, op.id, { offset: Number(nextOff.toFixed(3)) }, true);
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeStory,
    deleteSelected,
    handleDuplicateSelected,
    handleMoveMultiSelection,
    handleRedo,
    handleSelectTool,
    handleUndo,
    handleUpdateAnnotation,
    handleUpdateAsset,
    handleUpdateBeam,
    handleUpdateCutout,
    handleUpdateOpening,
    handleUpdatePillar,
    handleUpdateSlab,
    handleUpdateWall,
    boxSelectMode,
    helpOpen,
    multiSelection.length,
    placingAssetId,
    project.lockedLayers,
    selection,
    setAssetsDrawerOpen,
    setInspectorDrawerOpen,
    toggleLockOnSelected,
    tool,
  ]);

  const handleLoadTemplate = (templateId: string) => {
    const found = TEMPLATE_PRESETS.find((t) => t.id === templateId);
    if (!found) return;
    const next = found.build();
    next.unitSystem = project.unitSystem;
    applyProjectChange(() => next, { skipStrictCheck: true });
    setActiveStoryIndex(0);
    setSelection(null);
    setMultiSelection([]);
    setPlacingAssetId(null);
  };

  const handleSelectIssue = (issue: PhysicsIssue) => {
    setActiveStoryIndex(issue.storyIndex);
    if (issue.elementId && issue.elementId !== 'plot' && issue.elementId !== 'building') {
      setSelection({
        type: issue.elementType,
        id: issue.elementId,
        storyIndex: issue.storyIndex,
      });
    }
  };

  const handleExportViewportPng = () => {
    const dataUrl =
      viewMode === '2d'
        ? canvas2DRef.current?.exportPng()
        : viewport3DRef.current?.exportSnapshotPng() ?? canvas2DRef.current?.exportPng();
    if (!dataUrl) return;
    exportBlueprintPngWithDisclaimer(
      dataUrl,
      project,
      physics,
      viewMode === '2d' ? '2D Floor Plan' : '3D Architectural View'
    );
  };

  // Resolve selected element details for the Floating Contextual Bar
  const selectedWall =
    selection?.type === 'wall' ? activeStory.walls.find((w) => w.id === selection.id) : null;
  const selectedPillar =
    selection?.type === 'pillar' ? activeStory.pillars.find((p) => p.id === selection.id) : null;
  const selectedBeam =
    selection?.type === 'beam' ? activeStory.beams.find((b) => b.id === selection.id) : null;
  const selectedSlab =
    selection?.type === 'slab' ? activeStory.slabs.find((s) => s.id === selection.id) : null;
  const selectedRoom =
    selection?.type === 'room' ? activeStory.rooms.find((r) => r.id === selection.id) : null;
  const selectedAsset =
    selection?.type === 'asset' ? activeStory.assets.find((a) => a.id === selection.id) : null;
  const selectedAnnotation =
    selection?.type === 'annotation'
      ? (activeStory.annotations ?? []).find((an) => an.id === selection.id)
      : null;
  const selectedOpeningWall =
    selection?.type === 'opening' && selection.parentWallId
      ? activeStory.walls.find((w) => w.id === selection.parentWallId)
      : null;
  const selectedOpening = selectedOpeningWall?.openings.find((o) => o.id === selection?.id) ?? null;

  const selectedLabel = useMemo(() => {
    if (!selection) return '';
    if (selectedWall) {
      return `Wall · ${formatLength(getWallArcLength(selectedWall), project.unitSystem)}`;
    }
    if (selectedPillar) return `Column ${selectedPillar.label}`;
    if (selectedBeam) {
      return `Beam · ${formatLength(Math.hypot(selectedBeam.x2 - selectedBeam.x1, selectedBeam.z2 - selectedBeam.z1), project.unitSystem)}`;
    }
    if (selectedSlab) return selectedSlab.label;
    if (selectedRoom) return selectedRoom.name;
    if (selectedAsset) return selectedAsset.label;
    if (selectedAnnotation) {
      return selectedAnnotation.kind === 'dimension'
        ? `Dim · ${formatLength(
            Math.hypot(
              (selectedAnnotation.x2 ?? selectedAnnotation.x1) - selectedAnnotation.x1,
              (selectedAnnotation.z2 ?? selectedAnnotation.z1) - selectedAnnotation.z1
            ),
            project.unitSystem
          )}`
        : selectedAnnotation.text || 'Note';
    }
    if (selectedOpening) {
      return selectedOpening.kind.startsWith('window')
        ? `Window · ${formatLength(selectedOpening.width, project.unitSystem)}`
        : `Door · ${formatLength(selectedOpening.width, project.unitSystem)}`;
    }
    return selection.type;
  }, [
    project.unitSystem,
    selectedAnnotation,
    selectedAsset,
    selectedBeam,
    selectedOpening,
    selectedPillar,
    selectedRoom,
    selectedSlab,
    selectedWall,
    selection,
  ]);

  const selectedIsLocked = Boolean(
    selectedWall?.locked ||
      selectedPillar?.locked ||
      selectedBeam?.locked ||
      selectedSlab?.locked ||
      selectedAsset?.locked ||
      selectedAnnotation?.locked
  );

  const canDuplicateSelection = Boolean(
    selection &&
      (selection.type === 'wall' ||
        selection.type === 'pillar' ||
        selection.type === 'slab' ||
        selection.type === 'asset')
  );

  const canLockSelection = Boolean(
    selection &&
      (selection.type === 'wall' ||
        selection.type === 'pillar' ||
        selection.type === 'beam' ||
        selection.type === 'slab' ||
        selection.type === 'asset' ||
        selection.type === 'annotation')
  );

  const placingAssetDef = placingAssetId ? getAssetDefinition(placingAssetId) : undefined;
  const activeHintText = placingAssetDef
    ? `Placing ${placingAssetDef.name}: Click to place · R rotates · F flips · Hold Alt for free placement · Esc to stop`
    : tool !== 'select'
    ? TOOL_HINTS[tool] ?? null
    : null;

  const show2D = viewMode === '2d' || viewMode === 'split';
  const show3D = viewMode === 'split' || viewMode === '2.5d' || viewMode === '3d';

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        project={project}
        physics={physics}
        viewMode={viewMode}
        experienceMode={experienceMode}
        inspectorOpen={inspectorOpen}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onChangeViewMode={setViewMode}
        onRenameProject={(name) =>
          applyProjectChange((prev) => ({ ...prev, name }), {
            recordHistory: false,
            skipStrictCheck: true,
          })
        }
        onLoadTemplate={handleLoadTemplate}
        onChangeExperienceMode={handleChangeExperienceMode}
        onChangeUnit={(unit: UnitSystem) =>
          applyProjectChange(
            (prev) => ({ ...prev, unitSystem: unit, gridSnap: getDefaultSnap(unit) }),
            { recordHistory: false, skipStrictCheck: true }
          )
        }
        onChangeGridSnap={(snapMeters: number) =>
          applyProjectChange((prev) => ({ ...prev, gridSnap: snapMeters }), {
            recordHistory: false,
            skipStrictCheck: true,
          })
        }
        onToggleStrictLock={() =>
          applyProjectChange(
            (prev) => ({ ...prev, strictPhysicsLock: !prev.strictPhysicsLock }),
            { recordHistory: false, skipStrictCheck: true }
          )
        }
        onToggleLayerLock={handleToggleLayerLock}
        onToggleInspector={() => setInspectorDrawerOpen((v) => !v)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenNewWizard={(st = 1) => {
          setWizardStep(st);
          setWizardOpen(true);
        }}
        onOpenTakeoff={() => setTakeoffOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
      />

      {/* Docked Studio Main Shell: LeftToolRail | Optional LeftDock | Edge-to-Edge Viewport | Optional RightInspector */}
      <main className="relative flex-1 min-h-0 flex overflow-hidden pb-12 md:pb-0">
        <LeftToolRail
          tool={tool}
          viewMode={viewMode}
          experienceMode={experienceMode}
          assetsOpen={assetsOpen}
          boxSelectMode={boxSelectMode}
          onSelectTool={handleSelectTool}
          onToggleAssets={() => setAssetsDrawerOpen((v) => !v)}
          onToggleBoxSelect={() => {
            setTool('select');
            setBoxSelectMode((v) => !v);
          }}
          onChangeExperienceMode={handleChangeExperienceMode}
        />

        {/* Docked Left Furniture & Fixtures Drawer */}
        {assetsOpen && (
          <LeftDock
            unit={project.unitSystem}
            canDragDrop2D={show2D}
            placingAssetId={placingAssetId}
            onStartPlaceAsset={handleStartPlaceAsset}
            onPlaceAssetQuick={handlePlaceAssetQuick}
            onStartDragAsset={(id) => {
              setPlacingAssetId(null);
              setDraggingAssetId(id);
            }}
            onEndDragAsset={() => setDraggingAssetId(null)}
            onClose={() => setAssetsOpen(false)}
          />
        )}

        {/* Edge-to-Edge 2D & 3D Architectural Viewport Stage */}
        <div className="relative flex-1 min-w-0 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {show2D && (
            <div
              className={`relative min-w-0 min-h-0 ${
                show3D
                  ? 'w-full h-1/2 md:h-full md:w-1/2 border-b md:border-b-0 md:border-r border-slate-200'
                  : 'w-full h-full'
              }`}
            >
              <Canvas2D
                ref={canvas2DRef}
                project={project}
                activeStory={activeStory}
                lowerStory={lowerStory}
                physics={physics}
                experienceMode={experienceMode}
                tool={tool}
                snapEnabled={snapEnabled}
                boxSelectMode={boxSelectMode}
                heatmapMode={heatmapMode}
                showDimensions={showDimensions}
                showSetbacks={showSetbacks}
                selection={selection}
                multiSelection={multiSelection}
                placingAssetId={placingAssetId}
                placingAssetRotation={placingAssetRotation}
                placingAssetFlipX={placingAssetFlipX}
                onCancelPlaceAsset={() => setPlacingAssetId(null)}
                onPlaceAssetAt={handlePlaceAssetAt}
                onSelect={handleSelect}
                onMultiSelect={handleMultiSelect}
                onMoveMultiSelection={handleMoveMultiSelection}
                onExitTool={() => setTool('select')}
                onDragStateChange={setIsDragging2D}
                onUpdateUnderlay={handleUpdateUnderlay}
                onAddRoom={handleAddRoom}
                onAddWall={handleAddWall}
                onUpdateWall={handleUpdateWall}
                onReplaceWalls={handleReplaceWalls}
                onAddPillar={handleAddPillar}
                onUpdatePillar={handleUpdatePillar}
                onAddBeam={handleAddBeam}
                onUpdateBeam={handleUpdateBeam}
                onAddSlab={handleAddSlab}
                onUpdateSlab={handleUpdateSlab}
                onAddCutout={handleAddCutout}
                onUpdateCutout={handleUpdateCutout}
                onAddOpening={handleAddOpening}
                onUpdateOpening={handleUpdateOpening}
                onAddAsset={handleAddAsset}
                onUpdateAsset={handleUpdateAsset}
                onDeleteAsset={handleDeleteAsset}
                onDuplicateAsset={handleDuplicateSelected}
                onAddCompanionAsset={handleAddCompanionAsset}
                onCutUpperSlabForStair={handleCutUpperSlabForStair}
                onAddAnnotation={handleAddAnnotation}
                onUpdateAnnotation={handleUpdateAnnotation}
                onBeginDragHistory={handleBeginDragHistory}
                draggingAssetId={draggingAssetId}
                onEndAssetDrop={() => setDraggingAssetId(null)}
              />
            </div>
          )}

          {show3D && (
            <div
              className={`relative min-w-0 min-h-0 ${
                show2D ? 'w-full h-1/2 md:h-full md:w-1/2' : 'w-full h-full'
              }`}
            >
              <Viewport3D
                ref={viewport3DRef}
                project={project}
                physics={physics}
                viewMode={viewMode === '2.5d' ? '2.5d' : '3d'}
                lightingPreset={lightingPreset}
                showSiteContext={showSiteContext}
                activeStoryIndex={activeStory.index}
                showAllStories={showAllStories}
                showCeilingRoof={showCeilingRoof}
                cutawayRatio={cutawayRatio}
                explodeGap={explodeGap}
                heatmapMode={heatmapMode}
                xrayStructural={xrayStructural}
                showSetbacks={showSetbacks}
                snapEnabled={snapEnabled}
                isDragging2D={isDragging2D}
                selection={selection}
                compact={show2D}
                onSelect={handleSelect}
                onToggleOpening={handleToggleOpening3D}
                onMoveAsset={handleMoveAsset3D}
                onMovePillar={handleMovePillar3D}
              />
            </div>
          )}

          {/* Strict Physics Lock Alert Banner */}
          {lockAlert && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md bg-red-50 border border-red-200 text-red-900 rounded-lg shadow-md px-3.5 py-2.5 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <div className="text-xs flex-1">
                <div className="font-semibold">{lockAlert.reason}</div>
                {lockAlert.fixHint && (
                  <div className="text-[11px] text-red-700 mt-0.5">{lockAlert.fixHint}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLockAlert(null)}
                aria-label="Dismiss notice"
                className="text-red-500 hover:text-red-800 ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Docked Right Properties & Safety Check Drawer */}
        {inspectorOpen && (
          <RightInspector
            project={project}
            activeStory={activeStory}
            physics={physics}
            experienceMode={experienceMode}
            selection={selection}
            onChangeExperienceMode={handleChangeExperienceMode}
            onClose={() => setInspectorOpen(false)}
            onSelect={handleSelect}
            onDuplicateSelected={handleDuplicateSelected}
            onUpdateStory={handleUpdateStory}
            onUpdateBnbc={handleUpdateBnbc}
            onAddStoryAbove={handleAddStoryAbove}
            onDeleteStory={handleDeleteStory}
            onAutoDetectRooms={handleAutoDetectRooms}
            onUpdateWall={(id, patch) => handleUpdateWall(id, patch, true)}
            onDeleteWall={handleDeleteWall}
            onUpdateOpening={(wId, oId, patch) => handleUpdateOpening(wId, oId, patch, true)}
            onDeleteOpening={handleDeleteOpening}
            onUpdatePillar={(id, patch) => handleUpdatePillar(id, patch, true)}
            onDeletePillar={handleDeletePillar}
            onUpdateBeam={(id, patch) => handleUpdateBeam(id, patch, true)}
            onDeleteBeam={handleDeleteBeam}
            onUpdateSlab={(id, patch) => handleUpdateSlab(id, patch, true)}
            onDeleteSlab={handleDeleteSlab}
            onUpdateCutout={(sId, cId, patch) => handleUpdateCutout(sId, cId, patch, true)}
            onDeleteCutout={handleDeleteCutout}
            onUpdateRoom={handleUpdateRoom}
            onDeleteRoom={handleDeleteRoom}
            onUpdateAsset={(id, patch) => handleUpdateAsset(id, patch, true)}
            onDeleteAsset={handleDeleteAsset}
            onUpdateAnnotation={(id, patch) => handleUpdateAnnotation(id, patch, true)}
            onDeleteAnnotation={handleDeleteAnnotation}
            onSelectIssue={handleSelectIssue}
          />
        )}
      </main>

      {/* Single Calm Docked Bottom Workspace Bar */}
      <BottomWorkspaceBar
        project={project}
        viewMode={viewMode}
        experienceMode={experienceMode}
        stories={project.stories}
        activeStoryIndex={activeStory.index}
        activeAreaM2={activeAreaM2}
        snapEnabled={snapEnabled}
        showAllStories={showAllStories}
        showCeilingRoof={showCeilingRoof}
        showDimensions={showDimensions}
        heatmapMode={heatmapMode}
        xrayStructural={xrayStructural}
        showSetbacks={showSetbacks}
        lightingPreset={lightingPreset}
        showSiteContext={showSiteContext}
        cutawayRatio={cutawayRatio}
        explodeGap={explodeGap}
        inspectorOpen={inspectorOpen}
        selection={selection}
        multiSelection={multiSelection}
        selectedLabel={selectedLabel}
        selectedIsLocked={selectedIsLocked}
        canDuplicateSelection={canDuplicateSelection}
        canLockSelection={canLockSelection}
        selectedIsAsset={Boolean(selectedAsset)}
        selectedIsWall={Boolean(selectedWall)}
        selectedWallIsCurved={Boolean(selectedWall && isCurvedWall(selectedWall))}
        selectedIsDoor={Boolean(
          selectedOpening && selectedOpeningWall && selectedOpening.kind.startsWith('door')
        )}
        activeHintText={activeHintText}
        onSelectStory={(idx) => {
          setActiveStoryIndex(idx);
          setSelection(null);
          setMultiSelection([]);
        }}
        onAddStory={() => handleAddStoryAbove(true)}
        onOpenFloorSetup={() => {
          setSelection(null);
          setMultiSelection([]);
          setInspectorDrawerOpen(true);
        }}
        onToggleSnap={() => setSnapEnabled((v) => !v)}
        onToggleInspector={() => setInspectorDrawerOpen((v) => !v)}
        onDoneTool={() => {
          setPlacingAssetId(null);
          setBoxSelectMode(false);
          setTool('select');
        }}
        onRotateSelected={() => {
          if (selectedAsset) {
            handleUpdateAsset(selectedAsset.id, {
              rotation: (selectedAsset.rotation + Math.PI / 2) % (Math.PI * 2),
            });
          }
        }}
        onFlipSelected={() => {
          if (selectedAsset) {
            handleUpdateAsset(selectedAsset.id, { flipX: !selectedAsset.flipX });
          }
        }}
        onToggleCurveSelectedWall={() => {
          if (selectedWall) {
            handleUpdateWall(selectedWall.id, {
              curveOffset: isCurvedWall(selectedWall) ? 0 : ft(1, 6),
            });
          }
        }}
        onFlipDoorSwing={() => {
          if (selectedOpening && selectedOpeningWall) {
            handleUpdateOpening(selectedOpeningWall.id, selectedOpening.id, {
              swing: selectedOpening.swing === 1 ? -1 : 1,
            });
          }
        }}
        onToggleDoor3D={() => {
          if (selection && selectedOpening && selectedOpeningWall) {
            handleToggleOpening3D(
              selection.storyIndex,
              selectedOpeningWall.id,
              selectedOpening.id
            );
          }
        }}
        onDuplicateSelected={handleDuplicateSelected}
        onToggleLockSelected={toggleLockOnSelected}
        onDeleteSelected={deleteSelected}
        onAlignMulti={handleAlignMultiSelection}
        onDistributeMulti={handleDistributeMultiSelection}
        onMirrorMulti={handleMirrorMultiSelection}
        onDeleteMulti={handleDeleteMultiSelection}
        onClearSelection={() => {
          setMultiSelection([]);
          setSelection(null);
        }}
        onUpdateBlueprintSettings={handleUpdateBlueprintSettings}
        onUpdateUnderlay={handleUpdateUnderlay}
        onStartCalibrateUnderlay={() => canvas2DRef.current?.startUnderlayCalibration()}
        onToggleDimensions={() => setShowDimensions((v) => !v)}
        onToggleSetbacks={() => setShowSetbacks((v) => !v)}
        onToggleHeatmap={() => setHeatmapMode((v) => !v)}
        onToggleXray={() => setXrayStructural((v) => !v)}
        onToggleAllStories={() => setShowAllStories((v) => !v)}
        onToggleCeilingRoof={() => setShowCeilingRoof((v) => !v)}
        onToggleSiteContext={() => setShowSiteContext((v) => !v)}
        onChangeLightingPreset={setLightingPreset}
        onChangeCutaway={setCutawayRatio}
        onChangeExplode={setExplodeGap}
        onCameraPreset={(p: CameraPreset) => viewport3DRef.current?.applyCameraPreset(p)}
        onReset2DView={() => canvas2DRef.current?.resetView()}
      />

      {/* Modals */}
      {helpOpen && (
        <QuickHelpModal
          onClose={() => setHelpOpen(false)}
          onSelectTool={handleSelectTool}
          onOpenWizard={(step) => {
            setWizardStep(step);
            setWizardOpen(true);
          }}
          onOpenCatalog={() => setAssetsDrawerOpen(true)}
          onOpenExport={() => setTakeoffOpen(true)}
        />
      )}

      {wizardOpen && (
        <LandSetupWizard
          initialUnit={project.unitSystem}
          initialPlot={project.plot}
          initialStep={wizardStep}
          onCreateProject={(newProj, openMode) => {
            applyProjectChange(() => newProj, { skipStrictCheck: true });
            setActiveStoryIndex(0);
            setSelection(null);
            setMultiSelection([]);
            setPlacingAssetId(null);
            setViewMode(openMode);
            setWizardOpen(false);
          }}
          onClose={() => setWizardOpen(false)}
        />
      )}

      {takeoffOpen && (
        <TakeoffExportModal
          project={project}
          activeStory={activeStory}
          physics={physics}
          experienceMode={experienceMode}
          onClose={() => setTakeoffOpen(false)}
          onLoadProject={(loaded) => {
            applyProjectChange(() => loaded, { skipStrictCheck: true });
            setActiveStoryIndex(0);
            setSelection(null);
            setMultiSelection([]);
            setPlacingAssetId(null);
          }}
          onExportViewportPng={handleExportViewportPng}
          onUpdateBlueprintSettings={handleUpdateBlueprintSettings}
        />
      )}
    </div>
  );
}
