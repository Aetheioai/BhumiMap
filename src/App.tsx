import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlipHorizontal2,
  Lock,
  LockOpen,
  RotateCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  AssetDefinition,
  Beam,
  BnbcConfig,
  BuildingProject,
  DEFAULT_BNBC_CONFIG,
  ExperienceMode,
  GuidedStep,
  LightingPreset,
  PhysicsIssue,
  Pillar,
  PlacedAsset,
  SelectionTarget,
  Slab,
  SlabCutout,
  Story,
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
  snapAssetToNearestWall,
  splitWallsAtIntersection,
} from './engine/geometryKernel';
import {
  exportBlueprintPngWithDisclaimer,
  loadAutosave,
  saveAutosave,
} from './engine/projectStorage';
import { createInitialProject, TEMPLATE_PRESETS } from './engine/templates';
import { ft, getDefaultSnap, inch } from './engine/units';
import { TopBar } from './components/TopBar';
import { LeftDock } from './components/LeftDock';
import { RightInspector } from './components/RightInspector';
import { Canvas2D, Canvas2DHandle } from './components/Canvas2D';
import { CameraPreset, Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { BottomViewportBar } from './components/BottomViewportBar';
import { TakeoffExportModal } from './components/TakeoffExportModal';
import { LandSetupWizard } from './components/LandSetupWizard';

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function getInitialProject(): BuildingProject {
  const saved = loadAutosave();
  if (saved) return saved;
  return createInitialProject();
}

export default function App() {
  const [project, setProject] = useState<BuildingProject>(getInitialProject);
  const [past, setPast] = useState<BuildingProject[]>([]);
  const [future, setFuture] = useState<BuildingProject[]>([]);

  // Open straight into Split 2D + 3D architectural studio on desktop (2D on compact mobile)
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'split' : '2d'
  );
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('simple');
  const [guidedStep, setGuidedStep] = useState<GuidedStep>('structure');
  const [tool, setTool] = useState<ToolMode>('select');
  const [activeStoryIndex, setActiveStoryIndex] = useState<number>(0);
  const [selection, setSelection] = useState<SelectionTarget | null>(null);

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

  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
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

  const applyProjectChange = useCallback(
    (
      updater: (prev: BuildingProject) => BuildingProject,
      options?: { recordHistory?: boolean; skipStrictCheck?: boolean }
    ): boolean => {
      const recordHistory = options?.recordHistory ?? true;
      let accepted = true;

      setProject((prev) => {
        const candidate = updater(prev);
        if (prev.strictPhysicsLock && !options?.skipStrictCheck) {
          const prevPhys = analyzeBuildingPhysics(prev);
          const nextPhys = analyzeBuildingPhysics(candidate);
          if (nextPhys.criticalCount > prevPhys.criticalCount) {
            const newCrit = nextPhys.issues.find(
              (i) => i.severity === 'critical' && !prevPhys.issues.some((p) => p.id === i.id)
            );
            accepted = false;
            setLockAlert({
              reason: newCrit?.simpleTitle || 'Blocked by Strict Physics Lock.',
              fixHint: newCrit?.simpleFix || newCrit?.fixHint,
            });
            if (dragSnapshotRef.current) {
              const snap = dragSnapshotRef.current;
              dragSnapshotRef.current = null;
              return snap;
            }
            return prev;
          }
        }

        if (recordHistory) {
          const snapshotToPush = dragSnapshotRef.current ?? prev;
          dragSnapshotRef.current = null;
          setPast((h) => [...h.slice(-39), snapshotToPush]);
          setFuture([]);
        }
        setLockAlert(null);
        return { ...candidate, updatedAt: Date.now() };
      });

      return accepted;
    },
    []
  );

  const handleBeginDragHistory = useCallback(() => {
    dragSnapshotRef.current = project;
  }, [project]);

  const handleUndo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const last = prevPast[prevPast.length - 1];
      setFuture((f) => [project, ...f.slice(0, 39)]);
      setProject(last);
      setSelection(null);
      return prevPast.slice(0, -1);
    });
  }, [project]);

  const handleRedo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      setPast((p) => [...p.slice(-39), project]);
      setProject(next);
      setSelection(null);
      return prevFuture.slice(1);
    });
  }, [project]);

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

  // Guided 6-step workflow click handler
  const handleSelectGuidedStep = useCallback((step: GuidedStep) => {
    setGuidedStep(step);
    if (step === 'land') {
      setWizardStep(1);
      setWizardOpen(true);
    } else if (step === 'structure') {
      setAssetsOpen(false);
      setTool('pillar');
      setShowSetbacks(true);
    } else if (step === 'walls') {
      setAssetsOpen(false);
      setTool('wall');
    } else if (step === 'openings') {
      setAssetsOpen(false);
      setTool('door');
    } else if (step === 'essentials') {
      setTool('select');
      setAssetsOpen(true);
    } else if (step === 'physics') {
      setSelection(null);
      setInspectorOpen(true);
    }
  }, []);

  // Story mutations
  const handleUpdateStory = (storyIndex: number, patch: Partial<Story>) => {
    updateStoryItems(storyIndex, (s) => ({ ...s, ...patch }));
  };

  const handleUpdateBnbc = (patch: Partial<BnbcConfig>) => {
    applyProjectChange(
      (prev) => ({
        ...prev,
        bnbc: { ...DEFAULT_BNBC_CONFIG, ...(prev.bnbc ?? {}), ...patch },
      }),
      { skipStrictCheck: true }
    );
  };

  const handleToggleLayerLock = (layer: 'pillars' | 'beams' | 'walls' | 'slabs') => {
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
  };

  const handleAddStoryAbove = (copyStructure: boolean) => {
    if (project.stories.length >= 11) return;
    const sorted = [...project.stories].sort((a, b) => a.index - b.index);
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
            .filter((a) => !a.assetId.startsWith('car-') && !a.assetId.startsWith('tree-') && a.assetId !== 'pukur-pond')
            .map((a) => ({ ...a, id: makeId('ast') }))
        : [],
    };

    applyProjectChange(
      (prev) => ({ ...prev, stories: [...prev.stories, newStory] }),
      { skipStrictCheck: true }
    );
    setActiveStoryIndex(nextIdx);
    setSelection(null);
  };

  const handleDeleteStory = (storyIndex: number) => {
    if (project.stories.length <= 1) return;
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
  };

  const handleAutoDetectRooms = () => {
    updateStoryItems(activeStory.index, (s) => {
      const detected = detectEnclosedRooms(s);
      if (detected.length === 0) return s;
      return { ...s, rooms: detected };
    });
  };

  // Element mutations
  const handleAddRoom = (rect: { x: number; z: number; width: number; depth: number }) => {
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
      const nextRoom = {
        id: makeId('rm'),
        name: `Room ${s.rooms.length + 1}`,
        x,
        z,
        width,
        depth,
      };
      return { ...s, walls: nextWalls, rooms: [...s.rooms, nextRoom] };
    });
  };

  const handleAddWall = (wall: Wall) => {
    if (project.strictPhysicsLock) {
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
  };

  const handleUpdateWall = (wallId: string, patch: Partial<Wall>, commit = true) => {
    updateStoryItems(
      activeStory.index,
      (s) => ({
        ...s,
        walls: s.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)),
      }),
      { recordHistory: commit }
    );
  };

  const handleDeleteWall = (wallId: string) => {
    updateStoryItems(activeStory.index, (s) => ({
      ...s,
      walls: s.walls.filter((w) => w.id !== wallId),
    }));
    setSelection(null);
  };

  const handleAddOpening = (wallId: string, opening: WallOpening) => {
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
  };

  const handleUpdateOpening = (
    wallId: string,
    openingId: string,
    patch: Partial<WallOpening>
  ) => {
    updateStoryItems(activeStory.index, (s) => ({
      ...s,
      walls: s.walls.map((w) =>
        w.id === wallId
          ? {
              ...w,
              openings: w.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)),
            }
          : w
      ),
    }));
  };

  const handleToggleOpening3D = (storyIndex: number, wallId: string, openingId: string) => {
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
  };

  const handleDeleteOpening = (wallId: string, openingId: string) => {
    updateStoryItems(activeStory.index, (s) => ({
      ...s,
      walls: s.walls.map((w) =>
        w.id === wallId
          ? { ...w, openings: w.openings.filter((o) => o.id !== openingId) }
          : w
      ),
    }));
    setSelection(null);
  };

  const handleAddPillar = (pillar: Pillar) => {
    if (project.strictPhysicsLock) {
      const check = validatePillarPlacement(activeStory, pillar.x, pillar.z, true);
      if (!check.allowed) {
        setLockAlert({ reason: check.reason || 'Invalid pillar placement.', fixHint: check.fixHint });
        return;
      }
    }
    updateStoryItems(activeStory.index, (s) => ({ ...s, pillars: [...s.pillars, pillar] }));
    setSelection({ type: 'pillar', id: pillar.id, storyIndex: activeStory.index });
  };

  const handleUpdatePillar = (pillarId: string, patch: Partial<Pillar>, commit = true) => {
    updateStoryItems(
      activeStory.index,
      (s) => ({
        ...s,
        pillars: s.pillars.map((p) => (p.id === pillarId ? { ...p, ...patch } : p)),
      }),
      { recordHistory: commit }
    );
  };

  const handleMovePillar3D = (storyIndex: number, pillarId: string, x: number, z: number) => {
    updateStoryItems(storyIndex, (s) => ({
      ...s,
      pillars: s.pillars.map((p) => (p.id === pillarId ? { ...p, x, z } : p)),
    }));
  };

  const handleDeletePillar = (pillarId: string) => {
    updateStoryItems(activeStory.index, (s) => ({
      ...s,
      pillars: s.pillars.filter((p) => p.id !== pillarId),
    }));
    setSelection(null);
  };

  const handleAddBeam = (beam: Beam) => {
    updateStoryItems(activeStory.index, (s) => ({ ...s, beams: [...s.beams, beam] }));
    setSelection({ type: 'beam', id: beam.id, storyIndex: activeStory.index });
  };

  const handleUpdateBeam = (beamId: string, patch: Partial<Beam>) => {
    updateStoryItems(activeStory.index, (s) => ({
      ...s,
      beams: s.beams.map((b) => (b.id === beamId ? { ...b, ...patch } : b)),
    }));
  };

  const handleDeleteBeam = (beamId: string) => {
    updateStoryItems(activeStory.index, (s) => ({
      ...s,
      beams: s.beams.filter((b) => b.id !== beamId),
    }));
    setSelection(null);
  };

  const handleAddSlab = (slab: Slab) => {
    updateStoryItems(activeStory.index, (s) => ({ ...s, slabs: [...s.slabs, slab] }));
    setSelection({ type: 'slab', id: slab.id, storyIndex: activeStory.index });
  };

  const handleUpdateSlab = (slabId: string, patch: Partial<Slab>, commit = true) => {
    updateStoryItems(
      activeStory.index,
      (s) => ({
        ...s,
        slabs: s.slabs.map((sl) => (sl.id === slabId ? { ...sl, ...patch } : sl)),
      }),
      { recordHistory: commit }
    );
  };

  const handleDeleteSlab = (slabId: string) => {
    updateStoryItems(activeStory.index, (s) => ({
      ...s,
      slabs: s.slabs.filter((sl) => sl.id !== slabId),
    }));
    setSelection(null);
  };

  const handleAddCutout = (slabId: string, cutout: SlabCutout) => {
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
  };

  const handleUpdateCutout = (slabId: string, cutoutId: string, patch: Partial<SlabCutout>) => {
    updateStoryItems(activeStory.index, (s) => ({
      ...s,
      slabs: s.slabs.map((sl) =>
        sl.id === slabId
          ? {
              ...sl,
              cutouts: (sl.cutouts ?? []).map((c) => (c.id === cutoutId ? { ...c, ...patch } : c)),
            }
          : sl
      ),
    }));
  };

  const handleDeleteCutout = (slabId: string, cutoutId: string) => {
    updateStoryItems(activeStory.index, (s) => ({
      ...s,
      slabs: s.slabs.map((sl) =>
        sl.id === slabId
          ? { ...sl, cutouts: (sl.cutouts ?? []).filter((c) => c.id !== cutoutId) }
          : sl
      ),
    }));
    setSelection(null);
  };

  const handleAddAsset = (asset: PlacedAsset) => {
    updateStoryItems(activeStory.index, (s) => ({ ...s, assets: [...s.assets, asset] }));
    setSelection({ type: 'asset', id: asset.id, storyIndex: activeStory.index });
  };

  const handlePlaceAssetQuick = (def: AssetDefinition) => {
    const mainSlab = activeStory.slabs[0];
    const cx = mainSlab ? mainSlab.x + mainSlab.width * 0.5 : ft(12);
    const cz = mainSlab ? mainSlab.z + mainSlab.depth * 0.5 : ft(12);
    let placed: PlacedAsset = {
      id: makeId('ast'),
      assetId: def.id,
      label: def.name,
      x: cx,
      z: cz,
      width: def.defaultWidth,
      depth: def.defaultDepth,
      height: def.defaultHeight,
      rotation: 0,
      elevationY: def.defaultElevationY,
    };
    if (def.wallSnappable) {
      const snapped = snapAssetToNearestWall(
        placed.x,
        placed.z,
        placed.width,
        placed.depth,
        placed.rotation,
        activeStory,
        2.5
      );
      if (snapped.snappedWallId) {
        placed = { ...placed, x: snapped.x, z: snapped.z, rotation: snapped.rotation };
      }
    }
    handleAddAsset(placed);
  };

  const handleUpdateAsset = (assetId: string, patch: Partial<PlacedAsset>, commit = true) => {
    updateStoryItems(
      activeStory.index,
      (s) => ({
        ...s,
        assets: s.assets.map((a) => (a.id === assetId ? { ...a, ...patch } : a)),
      }),
      { recordHistory: commit }
    );
  };

  const handleMoveAsset3D = (storyIndex: number, assetId: string, x: number, z: number) => {
    updateStoryItems(storyIndex, (s) => ({
      ...s,
      assets: s.assets.map((a) => (a.id === assetId ? { ...a, x, z } : a)),
    }));
  };

  const handleDeleteAsset = (assetId: string) => {
    updateStoryItems(activeStory.index, (s) => ({
      ...s,
      assets: s.assets.filter((a) => a.id !== assetId),
    }));
    setSelection(null);
  };

  // Selection-level Lock / Delete / Nudge helpers
  const toggleLockOnSelected = useCallback(() => {
    if (!selection) return;
    if (selection.type === 'wall') {
      const w = activeStory.walls.find((x) => x.id === selection.id);
      if (w) handleUpdateWall(w.id, { locked: !w.locked }, true);
    } else if (selection.type === 'pillar') {
      const p = activeStory.pillars.find((x) => x.id === selection.id);
      if (p) handleUpdatePillar(p.id, { locked: !p.locked }, true);
    } else if (selection.type === 'slab') {
      const sl = activeStory.slabs.find((x) => x.id === selection.id);
      if (sl) handleUpdateSlab(sl.id, { locked: !sl.locked }, true);
    } else if (selection.type === 'asset') {
      const a = activeStory.assets.find((x) => x.id === selection.id);
      if (a) handleUpdateAsset(a.id, { locked: !a.locked }, true);
    }
  }, [activeStory, selection]);

  const deleteSelected = useCallback(() => {
    if (!selection) return;
    if (selection.type === 'wall') handleDeleteWall(selection.id);
    else if (selection.type === 'pillar') handleDeletePillar(selection.id);
    else if (selection.type === 'beam') handleDeleteBeam(selection.id);
    else if (selection.type === 'slab') handleDeleteSlab(selection.id);
    else if (selection.type === 'asset') handleDeleteAsset(selection.id);
    else if (selection.type === 'opening' && selection.parentWallId) {
      handleDeleteOpening(selection.parentWallId, selection.id);
    } else if (selection.type === 'cutout' && selection.parentSlabId) {
      handleDeleteCutout(selection.parentSlabId, selection.id);
    }
  }, [selection]);

  // Global Frontier Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      const k = e.key.toLowerCase();
      if (k === 'escape') {
        setSelection(null);
        setTool('select');
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
      if (k === 'v') setTool('select');
      else if (k === 'w') setTool('wall');
      else if (k === 'u') setTool('curved-wall');
      else if (k === 'c') setTool('pillar');
      else if (k === 'g') setTool('room');
      else if (k === 'd') setTool('door');
      else if (k === 'n') setTool('window');
      else if (k === 'b') setTool('beam');
      else if (k === 's') setTool('slab');
      else if (k === 'k') setTool('cutout');
      else if (k === 'm') setTool('ruler');
      else if (k === 'a') setTool('area');
      else if (k === 'x') setXrayStructural((v) => !v);
      else if (k === 'h') setHeatmapMode((v) => !v);
      else if (k === 'f') {
        canvas2DRef.current?.resetView();
        viewport3DRef.current?.applyCameraPreset('exterior');
      } else if (k === 'l' && selection) {
        toggleLockOnSelected();
      } else if (k === 'r' && selection?.type === 'asset') {
        const a = activeStory.assets.find((item) => item.id === selection.id);
        if (a && !a.locked) {
          handleUpdateAsset(a.id, { rotation: (a.rotation + Math.PI / 2) % (Math.PI * 2) }, true);
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault();
        deleteSelected();
      } else if (
        selection &&
        (e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight')
      ) {
        // Precision Arrow Nudge: 1 inch (0.0254m), or 6 inches (0.1524m) with Shift!
        e.preventDefault();
        const step = e.shiftKey ? inch(6) : inch(1);
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dz = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        if (selection.type === 'asset') {
          const a = activeStory.assets.find((item) => item.id === selection.id);
          if (a && !a.locked) handleUpdateAsset(a.id, { x: a.x + dx, z: a.z + dz }, true);
        } else if (selection.type === 'pillar') {
          const p = activeStory.pillars.find((item) => item.id === selection.id);
          if (p && !p.locked && !project.lockedLayers?.pillars) {
            handleUpdatePillar(p.id, { x: p.x + dx, z: p.z + dz }, true);
          }
        } else if (selection.type === 'wall') {
          const w = activeStory.walls.find((item) => item.id === selection.id);
          if (w && !w.locked && !project.lockedLayers?.walls) {
            handleUpdateWall(
              w.id,
              { x1: w.x1 + dx, z1: w.z1 + dz, x2: w.x2 + dx, z2: w.z2 + dz },
              true
            );
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStory, deleteSelected, handleRedo, handleUndo, project.lockedLayers, selection, toggleLockOnSelected]);

  const handleLoadTemplate = (templateId: string) => {
    const found = TEMPLATE_PRESETS.find((t) => t.id === templateId);
    if (!found) return;
    const next = found.build();
    next.unitSystem = project.unitSystem;
    applyProjectChange(() => next, { skipStrictCheck: true });
    setActiveStoryIndex(0);
    setSelection(null);
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

  const selectedAsset =
    selection?.type === 'asset' ? activeStory.assets.find((a) => a.id === selection.id) : null;
  const selectedIsLocked = useMemo(() => {
    if (!selection) return false;
    if (selection.type === 'wall') return Boolean(activeStory.walls.find((w) => w.id === selection.id)?.locked);
    if (selection.type === 'pillar') return Boolean(activeStory.pillars.find((p) => p.id === selection.id)?.locked);
    if (selection.type === 'slab') return Boolean(activeStory.slabs.find((s) => s.id === selection.id)?.locked);
    if (selection.type === 'asset') return Boolean(selectedAsset?.locked);
    return false;
  }, [activeStory, selectedAsset, selection]);

  const show2D = viewMode === '2d' || viewMode === 'split';
  const show3D = viewMode === 'split' || viewMode === '2.5d' || viewMode === '3d';

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        project={project}
        physics={physics}
        viewMode={viewMode}
        experienceMode={experienceMode}
        guidedStep={guidedStep}
        inspectorOpen={inspectorOpen}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onChangeViewMode={setViewMode}
        onSelectGuidedStep={handleSelectGuidedStep}
        onRenameProject={(name) =>
          applyProjectChange((prev) => ({ ...prev, name }), {
            recordHistory: false,
            skipStrictCheck: true,
          })
        }
        onLoadTemplate={handleLoadTemplate}
        onChangeExperienceMode={setExperienceMode}
        onChangeUnit={(unit: UnitSystem) =>
          applyProjectChange(
            (prev) => ({ ...prev, unitSystem: unit, gridSnap: getDefaultSnap(unit) }),
            { recordHistory: false, skipStrictCheck: true }
          )
        }
        onToggleStrictLock={() =>
          applyProjectChange(
            (prev) => ({ ...prev, strictPhysicsLock: !prev.strictPhysicsLock }),
            { recordHistory: false, skipStrictCheck: true }
          )
        }
        onToggleLayerLock={handleToggleLayerLock}
        onToggleInspector={() => setInspectorOpen((v) => !v)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenNewWizard={(st = 1) => {
          setWizardStep(st);
          setWizardOpen(true);
        }}
        onOpenTakeoff={() => setTakeoffOpen(true)}
      />

      {/* Main Workspace Viewport */}
      <main className="relative flex-1 min-h-0 flex overflow-hidden">
        {show2D && (
          <div
            className={`relative h-full min-w-0 ${
              show3D ? 'w-1/2 border-r border-slate-200' : 'w-full'
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
              heatmapMode={heatmapMode}
              showDimensions={showDimensions}
              showSetbacks={showSetbacks}
              selection={selection}
              compact={show3D}
              onSelect={(t) => {
                setSelection(t);
                if (t) setInspectorOpen(true);
              }}
              onAddRoom={handleAddRoom}
              onAddWall={handleAddWall}
              onUpdateWall={handleUpdateWall}
              onAddPillar={handleAddPillar}
              onUpdatePillar={handleUpdatePillar}
              onAddBeam={handleAddBeam}
              onAddSlab={handleAddSlab}
              onUpdateSlab={handleUpdateSlab}
              onAddCutout={handleAddCutout}
              onAddOpening={handleAddOpening}
              onAddAsset={handleAddAsset}
              onUpdateAsset={handleUpdateAsset}
              onBeginDragHistory={handleBeginDragHistory}
              draggingAssetId={draggingAssetId}
              onEndAssetDrop={() => setDraggingAssetId(null)}
            />
          </div>
        )}

        {show3D && (
          <div className={`relative h-full min-w-0 ${show2D ? 'w-1/2' : 'w-full'}`}>
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
              selection={selection}
              compact={show2D}
              onSelect={(t) => {
                setSelection(t);
                if (t) setInspectorOpen(true);
              }}
              onToggleOpening={handleToggleOpening3D}
              onMoveAsset={handleMoveAsset3D}
              onMovePillar={handleMovePillar3D}
            />
          </div>
        )}

        {/* Strict Physics Lock Alert Banner */}
        {lockAlert && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-md bg-red-50 border border-red-200 text-red-900 rounded-lg shadow-md px-3.5 py-2.5 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold">{lockAlert.reason}</div>
              {lockAlert.fixHint && <div className="text-[11px] text-red-700 mt-0.5">{lockAlert.fixHint}</div>}
            </div>
            <button
              type="button"
              onClick={() => setLockAlert(null)}
              className="text-red-500 hover:text-red-800 ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick Floating Action Bar for Selected Element (positioned cleanly above Bottom Dock) */}
        {selection && (
          <div className="absolute bottom-18 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white border border-slate-200 shadow-md rounded-lg px-2 py-1 text-xs">
            <span className="font-semibold text-slate-700 px-1.5 capitalize">
              {selection.type}
            </span>
            <div className="h-4 w-px bg-slate-200" />
            {selectedAsset && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateAsset(selectedAsset.id, {
                      rotation: (selectedAsset.rotation + Math.PI / 2) % (Math.PI * 2),
                    })
                  }
                  title="Rotate 90 degrees (R)"
                  className="p-1.5 text-slate-700 hover:bg-slate-100 rounded"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateAsset(selectedAsset.id, { flipX: !selectedAsset.flipX })
                  }
                  title="Mirror"
                  className="p-1.5 text-slate-700 hover:bg-slate-100 rounded"
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {(selection.type === 'wall' ||
              selection.type === 'pillar' ||
              selection.type === 'slab' ||
              selection.type === 'asset') && (
              <button
                type="button"
                onClick={toggleLockOnSelected}
                title="Lock or unlock element (L)"
                className={`p-1.5 rounded ${
                  selectedIsLocked
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {selectedIsLocked ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <LockOpen className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={deleteSelected}
              title="Delete (Del)"
              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* On-Demand Left Catalog Drawer */}
        {assetsOpen && (
          <LeftDock
            unit={project.unitSystem}
            canDragDrop2D={show2D}
            onPlaceAssetQuick={handlePlaceAssetQuick}
            onStartDragAsset={(id) => setDraggingAssetId(id)}
            onEndDragAsset={() => setDraggingAssetId(null)}
            onClose={() => setAssetsOpen(false)}
          />
        )}

        {/* On-Demand Right Inspector */}
        {inspectorOpen && (
          <RightInspector
            project={project}
            activeStory={activeStory}
            physics={physics}
            experienceMode={experienceMode}
            selection={selection}
            onClose={() => setInspectorOpen(false)}
            onUpdateStory={handleUpdateStory}
            onUpdateBnbc={handleUpdateBnbc}
            onAddStoryAbove={handleAddStoryAbove}
            onDeleteStory={handleDeleteStory}
            onAutoDetectRooms={handleAutoDetectRooms}
            onUpdateWall={(id, patch) => handleUpdateWall(id, patch, true)}
            onDeleteWall={handleDeleteWall}
            onUpdateOpening={handleUpdateOpening}
            onDeleteOpening={handleDeleteOpening}
            onUpdatePillar={(id, patch) => handleUpdatePillar(id, patch, true)}
            onDeletePillar={handleDeletePillar}
            onUpdateBeam={handleUpdateBeam}
            onDeleteBeam={handleDeleteBeam}
            onUpdateSlab={(id, patch) => handleUpdateSlab(id, patch, true)}
            onDeleteSlab={handleDeleteSlab}
            onUpdateCutout={handleUpdateCutout}
            onDeleteCutout={handleDeleteCutout}
            onUpdateAsset={(id, patch) => handleUpdateAsset(id, patch, true)}
            onDeleteAsset={handleDeleteAsset}
            onSelectIssue={handleSelectIssue}
          />
        )}

        {/* Bottom Studio Control Bar */}
        <BottomViewportBar
          viewMode={viewMode}
          tool={tool}
          assetsOpen={assetsOpen}
          stories={project.stories}
          activeStoryIndex={activeStory.index}
          activeAreaM2={activeAreaM2}
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
          onSelectTool={setTool}
          onToggleAssets={() => setAssetsOpen((v) => !v)}
          onOpenFloorSetup={() => {
            setSelection(null);
            setInspectorOpen(true);
          }}
          onSelectStory={(idx) => {
            setActiveStoryIndex(idx);
            setSelection(null);
          }}
          onAddStory={() => handleAddStoryAbove(true)}
          onToggleAllStories={() => setShowAllStories((v) => !v)}
          onToggleCeilingRoof={() => setShowCeilingRoof((v) => !v)}
          onToggleDimensions={() => setShowDimensions((v) => !v)}
          onToggleHeatmap={() => setHeatmapMode((v) => !v)}
          onToggleXray={() => setXrayStructural((v) => !v)}
          onToggleSetbacks={() => setShowSetbacks((v) => !v)}
          onChangeLightingPreset={setLightingPreset}
          onToggleSiteContext={() => setShowSiteContext((v) => !v)}
          onChangeCutaway={setCutawayRatio}
          onChangeExplode={setExplodeGap}
          onCameraPreset={(p: CameraPreset) => viewport3DRef.current?.applyCameraPreset(p)}
          onReset2DView={() => canvas2DRef.current?.resetView()}
        />
      </main>

      {/* Modals */}
      {wizardOpen && (
        <LandSetupWizard
          initialUnit={project.unitSystem}
          initialPlot={project.plot}
          initialStep={wizardStep}
          onCreateProject={(newProj, openMode) => {
            applyProjectChange(() => newProj, { skipStrictCheck: true });
            setActiveStoryIndex(0);
            setSelection(null);
            setViewMode(openMode);
            setWizardOpen(false);
          }}
          onClose={() => setWizardOpen(false)}
        />
      )}

      {takeoffOpen && (
        <TakeoffExportModal
          project={project}
          physics={physics}
          experienceMode={experienceMode}
          onClose={() => setTakeoffOpen(false)}
          onLoadProject={(loaded) => {
            applyProjectChange(() => loaded, { skipStrictCheck: true });
            setActiveStoryIndex(0);
            setSelection(null);
          }}
          onExportViewportPng={handleExportViewportPng}
        />
      )}
    </div>
  );
}
