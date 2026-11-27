import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { AssetCategory, AssetDefinition, UnitSystem } from '../types/building';
import { ASSET_CATALOG, ASSET_CATEGORIES } from '../engine/assets';
import { Asset3DPreviewGrid } from './Asset3DPreviewGrid';

interface LeftDockProps {
  unit: UnitSystem;
  canDragDrop2D: boolean;
  placingAssetId?: string | null;
  initialCategory?: AssetCategory | 'all';
  onStartPlaceAsset: (def: AssetDefinition) => void;
  onPlaceAssetQuick: (def: AssetDefinition) => void;
  onStartDragAsset: (assetId: string) => void;
  onEndDragAsset: () => void;
  onClose: () => void;
}

export const LeftDock: React.FC<LeftDockProps> = ({
  unit,
  canDragDrop2D,
  placingAssetId = null,
  initialCategory = 'all',
  onStartPlaceAsset,
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
        a.category.toLowerCase().includes(q) ||
        Boolean(a.keywords?.some((kw) => kw.toLowerCase().includes(q)))
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
        aria-label="Furniture and Fixtures Library"
        className="fixed inset-x-0 bottom-0 h-[72dvh] max-h-[80dvh] rounded-t-2xl border-t border-slate-200 bg-white shadow-xl z-40 flex flex-col overflow-hidden md:static md:inset-auto md:h-full md:max-h-none md:w-[316px] md:shrink-0 md:rounded-none md:border-t-0 md:border-r md:shadow-none md:z-20"
      >
        <div className="md:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Drawer Header */}
        <div className="px-3.5 py-2.5 border-b border-slate-200/80 flex items-center justify-between shrink-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-[13px] font-semibold text-slate-900 truncate">
              Furniture &amp; Fixtures
            </h2>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
              {filteredAssets.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close furniture and fixtures drawer"
            className="p-1 text-slate-400 hover:text-slate-800 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + Fully Visible Multi-Row Category Selector */}
        <div className="px-3 py-2.5 border-b border-slate-200/80 space-y-2 shrink-0 bg-white">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bed, sofa, khat, kitchen, car..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none transition-colors"
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

          <div
            role="tablist"
            aria-label="Item categories"
            className="flex flex-wrap items-center gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeCat === 'all'}
              onClick={() => setActiveCat('all')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                activeCat === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
              }`}
            >
              All <span className="tabular-nums opacity-75">{ASSET_CATALOG.length}</span>
            </button>
            {ASSET_CATEGORIES.map((c) => {
              const active = activeCat === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveCat(c.id)}
                  title={c.label}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                  }`}
                >
                  {c.shortLabel}{' '}
                  <span className="tabular-nums opacity-75">{categoryCounts[c.id] || 0}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Item Grid or Friendly Empty State */}
        {filteredAssets.length === 0 ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center space-y-2">
            <p className="text-xs font-semibold text-slate-800">No matching items found</p>
            <p className="text-[11px] text-slate-500">
              Try bed, sofa, almari, kitchen, toilet, pukur, or car.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setActiveCat('all');
              }}
              className="mt-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <Asset3DPreviewGrid
            assets={filteredAssets}
            unit={unit}
            activeAssetId={placingAssetId}
            canDragDrop2D={canDragDrop2D}
            onSelectToPlace={canDragDrop2D ? onStartPlaceAsset : onPlaceAssetQuick}
            onQuickPlace={onPlaceAssetQuick}
            onStartDragAsset={onStartDragAsset}
            onEndDragAsset={onEndDragAsset}
          />
        )}

        <div className="px-3.5 py-2 border-t border-slate-200/80 bg-slate-50/90 text-[11px] text-slate-500 shrink-0 leading-snug">
          {canDragDrop2D
            ? 'Click to place (R rotate, F flip) · Drag onto plan · Hold Alt for free move'
            : 'Click any item to add it to the active floor'}
        </div>
      </aside>
    </>
  );
};
