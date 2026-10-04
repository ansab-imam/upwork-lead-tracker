import React, { useState, useRef, useEffect } from 'react';
import { Filter, X, ChevronDown, Check } from 'lucide-react';
import type { Column } from '../../types/proposals';

export interface ActiveFilter {
  colId: string;
  values: string[]; // selected option IDs or text values
}

interface ColumnFiltersProps {
  columns: Column[];
  activeFilters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  optionMap?: Record<string, Record<string, string>>;
  rowValuesByColId?: Record<string, string[]>; // actual unique values per column
}

// ── Filter a set of rows against active filters ───────────────────────────────
export function applyFilters<T extends { data: Record<string, string> }>(
  rows: T[],
  activeFilters: ActiveFilter[]
): T[] {
  if (activeFilters.length === 0) return rows;
  return rows.filter(row =>
    activeFilters.every(filter => {
      if (filter.values.length === 0) return true;
      const val = row.data[filter.colId] ?? '';
      return filter.values.includes(val);
    })
  );
}

// Same but for LA rows which have a different shape
export function applyFiltersLA<T extends { data: Record<string, string>; currentStatus: string }>(
  rows: T[],
  activeFilters: ActiveFilter[],
  _statusColId?: string
): T[] {
  if (activeFilters.length === 0) return rows;
  return rows.filter(row =>
    activeFilters.every(filter => {
      if (filter.values.length === 0) return true;
      const val = row.data[filter.colId] ?? '';
      return filter.values.includes(val);
    })
  );
}

// ── Single column filter dropdown ────────────────────────────────────────────
interface ColFilterDropdownProps {
  column: Column;
  active: ActiveFilter | undefined;
  optionMap?: Record<string, Record<string, string>>;
  allValues: string[]; // all unique values for this column across all rows
  onChange: (colId: string, values: string[]) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

const ColFilterDropdown: React.FC<ColFilterDropdownProps> = ({
  column, active, optionMap, allValues, onChange, onClose, anchorRect,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const selected = new Set(active?.values ?? []);

  // Build options list: prefer column.options for dropdowns, fallback to unique values from rows
  const options = (() => {
    if (column.type === 'dropdown' && column.options && (column.options as any[]).length > 0) {
      return (column.options as {id:string;label:string;color?:string}[])
        .filter(o => !search || o.label.toLowerCase().includes(search.toLowerCase()));
    }
    // For linked/text columns, use actual unique values from row data
    const unique = Array.from(new Set(allValues.filter(Boolean)));
    return unique
      .filter(v => !search || v.toLowerCase().includes(search.toLowerCase()))
      .map(v => ({ id: v, label: optionMap?.[column.id]?.[v] ?? v }));
  })();

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(column.id, Array.from(next));
  };

  const selectAll = () => onChange(column.id, options.map(o => o.id));
  const clearAll  = () => onChange(column.id, []);

  // Position the dropdown near the anchor
  const style: React.CSSProperties = {
    position: 'fixed',
    top:  anchorRect.bottom + 4,
    left: Math.min(anchorRect.left, window.innerWidth - 240),
    width: 240,
    zIndex: 9999,
    boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
  };

  return (
    <div ref={ref} className="bg-white border border-slate-200 rounded-2xl overflow-hidden" style={style}>
      <div className="px-3 py-2.5 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-600 mb-1.5">Filter: {column.name}</p>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search values..."
          className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400" />
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-50">
        <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">All</button>
        <span className="text-slate-300">·</span>
        <button onClick={clearAll} className="text-xs text-slate-500 hover:underline">None</button>
        {selected.size > 0 && <span className="ml-auto text-xs text-blue-500 font-medium">{selected.size} selected</span>}
      </div>

      <div className="max-h-52 overflow-y-auto py-1">
        {options.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No values found</p>
        ) : options.map(opt => (
          <button key={opt.id} onClick={() => toggle(opt.id)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors">
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
              selected.has(opt.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
            }`}>
              {selected.has(opt.id) && <Check size={10} className="text-white" />}
            </div>
            <span className="text-xs text-slate-700 truncate">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Main filter bar ───────────────────────────────────────────────────────────
export const ColumnFilters: React.FC<ColumnFiltersProps> = ({
  columns, activeFilters, onFiltersChange, optionMap,
  rowValuesByColId,
}) => {
  const [openCol, setOpenCol]       = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPicker) return;
    const h = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showPicker]);

  const filterableColumns = columns.filter(c =>
    c.type === 'dropdown' || c.type === 'text' || c.type === 'number'
  );

  const activeCount = activeFilters.filter(f => f.values.length > 0).length;

  const handleFilterChange = (colId: string, values: string[]) => {
    const next = activeFilters.filter(f => f.colId !== colId);
    if (values.length > 0) next.push({ colId, values });
    onFiltersChange(next);
  };

  const removeFilter = (colId: string) => {
    onFiltersChange(activeFilters.filter(f => f.colId !== colId));
  };

  const clearAll = () => { onFiltersChange([]); setOpenCol(null); };

  const openFilter = (colId: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAnchorRect(rect);
    setOpenCol(colId === openCol ? null : colId);
  };

  const openColObj = openCol ? columns.find(c => c.id === openCol) : null;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filter button */}
        <div ref={pickerRef} className="relative">
          <button onClick={() => setShowPicker(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-medium transition-colors ${
              activeCount > 0
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <Filter size={12} />
            Filter
            {activeCount > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">{activeCount}</span>
            )}
            <ChevronDown size={11} className={`transition-transform ${showPicker ? 'rotate-180' : ''}`} />
          </button>

          {/* Column picker */}
          {showPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-1"
              style={{ width: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
              <p className="text-xs font-semibold text-slate-400 px-3 py-1.5 border-b border-slate-50">Filter by column</p>
              {filterableColumns.map(col => {
                const isActive = activeFilters.some(f => f.colId === col.id && f.values.length > 0);
                return (
                  <button key={col.id}
                    onClick={e => { openFilter(col.id, e); setShowPicker(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 text-left transition-colors ${isActive ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>
                    {col.name}
                    {isActive && <span className="text-blue-500 text-xs">●</span>}
                  </button>
                );
              })}
              {filterableColumns.length === 0 && (
                <p className="text-xs text-slate-400 px-3 py-3 text-center">No filterable columns</p>
              )}
            </div>
          )}
        </div>

        {/* Active filter chips */}
        {activeFilters.filter(f => f.values.length > 0).map(filter => {
          const col = columns.find(c => c.id === filter.colId);
          if (!col) return null;
          const labels = filter.values.map(v => {
            const opt = (col.options as any[])?.find((o: any) => o.id === v);
            return opt?.label ?? optionMap?.[col.id]?.[v] ?? v;
          });
          return (
            <button key={filter.colId}
              onClick={e => openFilter(filter.colId, e)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-xl text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors group">
              <span className="text-blue-500">{col.name}:</span>
              <span className="max-w-32 truncate">{labels.slice(0, 2).join(', ')}{labels.length > 2 ? ` +${labels.length - 2}` : ''}</span>
              <span onClick={ev => { ev.stopPropagation(); removeFilter(filter.colId); }}
                className="text-blue-400 hover:text-blue-700 transition-colors">
                <X size={11} />
              </span>
            </button>
          );
        })}

        {/* Clear all */}
        {activeCount > 0 && (
          <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-1">
            Clear all
          </button>
        )}
      </div>

      {/* Active filter dropdown */}
      {openCol && openColObj && anchorRect && (
        <ColFilterDropdown
          column={openColObj}
          active={activeFilters.find(f => f.colId === openCol)}
          optionMap={optionMap}
          allValues={rowValuesByColId?.[openCol ?? ''] ?? []}
          onChange={handleFilterChange}
          onClose={() => setOpenCol(null)}
          anchorRect={anchorRect}
        />
      )}
    </div>
  );
};
