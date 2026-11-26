import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { AssetCategory, AssetDefinition, UnitSystem } from '../types/building';
import { ASSET_CATALOG, ASSET_CATEGORIES } from '../engine/assets';
import { Asset3DPreviewGrid } from './Asset3DPreviewGrid';

interface LeftDockProps {
  unit: UnitSystem;
  canDragDrop2D: boolean;
  initialCategory?: AssetCategory | 'all';
  onPlaceAssetQuick: (def: AssetDefinition) => void;
  onStartDragAsset: (assetId: string) => void;
  onEndDragAsset: () => void;
  onClose: () => void;
}

export const LeftDock: React.FC<LeftDockProps> = ({
  unit,
  canDragDrop2D,
  initialCategory = 'all',
  onPlaceAssetQuick,
  onStartDragAsset,
  onEndDragAsset,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<AssetCategory | 'all'>(initialCategory);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of ASSET_CATALOG) {
      counts[a.category] = (counts[a.category] || 0) + 1;
    }
    return counts;
  }, []);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ASSET_CATALOG.filter((a) => {
      if (activeCat !== 'all' && a.category !== activeCat) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
      );
    });
  }, [search, activeCat]);

  return (
    <>
      <div
        onClick={onClose}
        className="md:hidden fixed inset-0 bg-slate-900/15 z-30"
        aria-hidden="true"
      />

      <aside
        aria-label="Bangladeshi Functional 3D Catalog"
        className="fixed inset-x-0 bottom-0 h-[66dvh] rounded-t-2xl border-t border-slate-200 bg-white shadow-xl z-40 flex flex-col overflow-hidden md:absolute md:inset-x-auto md:top-3 md:left-3 md:bottom-20 md:h-auto md:w-[344px] md:rounded-xl md:border md:shadow-lg md:z-30"
      >
        <div className="md:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-slate-200" />
        </div>

        <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-900">Functional 3D Library</span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {filteredAssets.length} items
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close catalog drawer"
            className="p-1 text-slate-400 hover:text-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3.5 py-2.5 border-b border-slate-100 space-y-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stair, lift, kitchen, sofa, nolkup, pukur..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-600"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            aria-label="Filter category"
            value={activeCat}
            onChange={(e) => setActiveCat(e.target.value as AssetCategory | 'all')}
            className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-md px-2.5 py-1.5"
          >
            <option value="all">All categories ({ASSET_CATALOG.length})</option>
            {ASSET_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({categoryCounts[c.id] || 0})
              </option>
            ))}
          </select>
        </div>

        <Asset3DPreviewGrid
          assets={filteredAssets}
          canDragDrop2D={canDragDrop2D}
          onPlace={onPlaceAssetQuick}
          onStartDragAsset={onStartDragAsset}
          onEndDragAsset={onEndDragAsset}
        />

        <div className="px-3.5 py-1.5 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 shrink-0">
          Click to place or drag onto 2D plan · Furniture snaps cleanly to walls
        </div>
      </aside>
    </>
  );
};
