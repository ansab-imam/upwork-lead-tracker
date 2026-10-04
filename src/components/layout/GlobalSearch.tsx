import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, FileText, BarChart2, Star, TrendingUp, StickyNote } from 'lucide-react';
import { useProposals } from '../../context/ProposalContext';
import { getFunnelStatusStyle } from '../../types/proposals';
import type { PageId } from '../../App';

interface GlobalSearchProps {
  onNavigate: (page: PageId, highlight?: string) => void;
}

interface SearchResult {
  module: PageId;
  displayId: string;
  matchedField: string;
  matchedValue: string;
  statusLabel: string;
  extra?: string;
}

// ── Module registry ──────────────────────────────────────────────────────────
// To add a new module to search: just add an entry here.
const MODULE_REGISTRY: {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  color: string;
  order: number;
}[] = [
  { id: 'proposals',           label: 'Proposal Details',    icon: <FileText size={13} />,   color: 'text-blue-600',    order: 0 },
  { id: 'lead-analysis',       label: 'Lead Analysis',       icon: <TrendingUp size={13} />, color: 'text-violet-600',  order: 1 },
  { id: 'lead-prioritization', label: 'Lead Prioritization', icon: <Star size={13} />,       color: 'text-amber-600',   order: 2 },
  { id: 'reporting',           label: 'Reporting',           icon: <BarChart2 size={13} />,  color: 'text-emerald-600', order: 3 },
  { id: 'notes',               label: 'Notes & To-Do',       icon: <StickyNote size={13} />, color: 'text-pink-600',    order: 4 },
  // Add future modules here — no other code changes needed
];

const MODULE_META = Object.fromEntries(MODULE_REGISTRY.map(m => [m.id, m]));
const LA_STAGES   = ['contacted', 'interviewed', 'hired'];

function Highlight({ text, q }: { text: string; q: string }) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <span className="truncate">{text}</span>;
  return (
    <span className="truncate">
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </span>
  );
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ onNavigate }) => {
  const { columns, rows, priorityRecords, laColumns, laMergedRows } = useProposals();

  const [query,   setQuery]   = useState('');
  const [open,    setOpen]    = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef     = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resolve dropdown IDs to labels
  const optionMap = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const col of columns) {
      if (col.type === 'dropdown' && col.options) {
        map[col.id] = {};
        for (const opt of col.options as {id:string;label:string}[]) {
          map[col.id][opt.id]                  = opt.label;
          map[col.id][opt.label.toLowerCase()] = opt.label;
        }
      }
    }
    return map;
  }, [columns]);

  const statusCol = useMemo(() =>
    columns.find(c => c.type === 'dropdown' && c.name.toLowerCase().includes('status')),
    [columns]
  );

  const priorityMap = useMemo(() => {
    const m: Record<string, { score: number; tier: string }> = {};
    for (const r of priorityRecords) m[r.unique_id] = { score: r.score, tier: r.tier };
    return m;
  }, [priorityRecords]);

  // ── Core search: match rows against query, determine all modules they appear in ──
  const results = useMemo((): SearchResult[] => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 1) return [];

    const found: SearchResult[] = [];
    const seen = new Set<string>();

    const add = (module: PageId, displayId: string, matchedField: string, matchedValue: string, statusLabel: string, extra?: string) => {
      const key = `${displayId}-${module}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({ module, displayId, matchedField, matchedValue, statusLabel, extra });
    };

    // ── Search all proposal rows ─────────────────────────────────────────────
    for (const row of rows) {
      let matchedField = '';
      let matchedValue = '';

      // Match display_id first
      if (row.display_id?.toLowerCase().includes(q)) {
        matchedField = 'Unique ID';
        matchedValue = row.display_id ?? '';
      }

      // Search ALL columns - don't break early, find the best match
      if (!matchedField) {
        // Priority: text/link columns first (names, titles, links), then dropdowns
        const sorted = [...columns].sort((a, b) => {
          const aPri = (a.type === 'text' || a.type === 'link') ? 0 : 1;
          const bPri = (b.type === 'text' || b.type === 'link') ? 0 : 1;
          return aPri - bPri;
        });
        for (const col of sorted) {
          const raw   = row.data[col.id] ?? '';
          if (!raw) continue;
          const label = optionMap[col.id]?.[raw] ?? raw;
          // Match against both the raw value AND the resolved label
          if (label.toLowerCase().includes(q) || raw.toLowerCase().includes(q)) {
            matchedField = col.name;
            matchedValue = label || raw;
            break;
          }
        }
      }

      if (!matchedField) continue;

      const rawStatus   = statusCol ? (row.data[statusCol.id] ?? '') : '';
      const statusLabel = statusCol ? (optionMap[statusCol.id]?.[rawStatus] ?? rawStatus) : '';
      const isQualifying = LA_STAGES.includes(statusLabel.toLowerCase());
      const priority     = priorityMap[row.display_id ?? ''];

      // ── Add to every module this row is relevant to ──────────────────────
      // 1. Always in Proposal Details
      add('proposals', row.display_id ?? '', matchedField, matchedValue, statusLabel);

      // 2. Lead Analysis — only qualifying stages
      if (isQualifying) {
        add('lead-analysis', row.display_id ?? '', matchedField, matchedValue, statusLabel);
      }

      // 3. Lead Prioritization — only if scored
      if (isQualifying && priority) {
        const scoreStr = priority.score > 0 ? `+${priority.score}` : String(priority.score);
        add('lead-prioritization', row.display_id ?? '', matchedField, matchedValue, statusLabel,
          `${priority.tier} · ${scoreStr}`);
      }

      // 4. Future modules: add conditions here as new modules are built

      if (found.length >= 60) break;
    }

    // ── Search Lead Analysis local columns (client names, notes etc) ─────────
    for (const row of laMergedRows) {
      // Skip if already found this ID in proposals
      if (seen.has(`${row.uniqueId}-lead-analysis`)) continue;

      let matchedField = '';
      let matchedValue = '';

      // Match uniqueId
      if (row.uniqueId.toLowerCase().includes(q)) {
        matchedField = 'Unique ID';
        matchedValue = row.uniqueId;
      }

      // Search all LA columns
      if (!matchedField) {
        // Prioritise local text columns (client names, notes etc)
        const sorted = [...laColumns].sort((a, b) => {
          const aPri = (a.type === 'text' || a.type === 'link') ? 0 : 1;
          const bPri = (b.type === 'text' || b.type === 'link') ? 0 : 1;
          return aPri - bPri;
        });
        for (const col of sorted) {
          const val = row.data[col.id] ?? '';
          if (!val) continue;
          if (val.toLowerCase().includes(q)) {
            matchedField = col.name;
            matchedValue = val;
            break;
          }
        }
      }

      if (!matchedField) continue;

      const key = `${row.uniqueId}-lead-analysis`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({
          module: 'lead-analysis',
          displayId: row.uniqueId,
          matchedField,
          matchedValue,
          statusLabel: row.currentStatus,
          extra: undefined,
        });
      }
    }

    // ── Also search priority records directly by unique_id ──────────────────
    for (const rec of priorityRecords) {
      if (!rec.unique_id.toLowerCase().includes(q)) continue;
      const scoreStr = rec.score > 0 ? `+${rec.score}` : String(rec.score);
      add('lead-prioritization', rec.unique_id, 'Unique ID', rec.unique_id, '',
        `${rec.tier} · ${scoreStr}`);
    }

    // Sort by module registry order
    return found.sort((a, b) =>
      (MODULE_META[a.module]?.order ?? 99) - (MODULE_META[b.module]?.order ?? 99)
    );
  }, [query, rows, columns, optionMap, statusCol, priorityMap, priorityRecords]);

  // Group by module
  const grouped = useMemo(() => {
    const g: Record<string, SearchResult[]> = {};
    for (const r of results) {
      if (!g[r.module]) g[r.module] = [];
      g[r.module].push(r);
    }
    return g;
  }, [results]);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Ctrl/Cmd+K shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(e.target.value.trim().length >= 1);
  };

  const handleClick = (result: SearchResult) => {
    onNavigate(result.module, query.trim());
    setOpen(false);
    setQuery('');
  };

  const totalResults = results.length;
  const moduleCount  = Object.keys(grouped).length;

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className={`flex items-center gap-2 bg-slate-50 border rounded-xl px-3 py-2 w-72 transition-all ${focused ? 'border-blue-300 bg-white shadow-sm' : 'border-slate-200'}`}>
        <Search size={15} className="text-slate-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => { setFocused(true); if (query.length >= 2) setOpen(true); }}
          onBlur={() => setFocused(false)}
          placeholder="Search anything..."
          className="bg-transparent text-sm text-slate-600 placeholder-slate-400 outline-none w-full"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false); }}>
            <X size={14} className="text-slate-400 hover:text-slate-600" />
          </button>
        )}
        <kbd className="hidden lg:block text-xs text-slate-300 border border-slate-200 rounded px-1.5 py-0.5 font-mono flex-shrink-0">⌘K</kbd>
      </div>

      {/* Results */}
      {open && query.length >= 2 && (
        <div className="absolute top-full mt-2 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999] overflow-hidden"
          style={{ width: 480, maxHeight: 560, boxShadow: '0 16px 48px rgba(0,0,0,0.16)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500">
              {totalResults === 0
                ? 'No results'
                : `${totalResults} result${totalResults !== 1 ? 's' : ''} across ${moduleCount} module${moduleCount !== 1 ? 's' : ''}`}
            </p>
            <p className="text-xs text-slate-400">Esc to close</p>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 490 }}>
            {totalResults === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Search size={28} className="text-slate-200" />
                <p className="text-sm text-slate-400">No results for "<strong>{query}</strong>"</p>
                <p className="text-xs text-slate-300">Try ID, name, title, link, or status</p>
              </div>
            ) : (
              // Render modules in registry order — only modules with results appear
              MODULE_REGISTRY.filter(m => grouped[m.id]?.length > 0).map(meta => {
                const modResults = grouped[meta.id] ?? [];
                return (
                  <div key={meta.id}>
                    {/* Module header */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-t border-slate-100 sticky top-0 z-10">
                      <span className={meta.color}>{meta.icon}</span>
                      <span className={`text-xs font-bold uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
                      <span className="ml-auto text-xs text-slate-400">{modResults.length} match{modResults.length !== 1 ? 'es' : ''}</span>
                    </div>

                    {modResults.slice(0, 8).map((result, i) => {
                      const statusStyle = result.statusLabel ? getFunnelStatusStyle(result.statusLabel) : null;
                      return (
                        <button key={i}
                          onClick={() => handleClick(result)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0 text-left group">
                          <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                            <span className={meta.color}>{meta.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <span className="text-xs font-mono font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{result.displayId}</span>
                              {statusStyle && result.statusLabel && (
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${statusStyle.full}`}>{result.statusLabel}</span>
                              )}
                              {result.extra && (
                                <span className="text-xs text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded">{result.extra}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs min-w-0">
                              <span className="text-slate-400 flex-shrink-0">{result.matchedField}:</span>
                              <span className="text-slate-700 min-w-0 truncate">
                                <Highlight text={result.matchedValue} q={query} />
                              </span>
                            </div>
                          </div>
                          <span className="text-xs text-blue-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity font-medium">Open →</span>
                        </button>
                      );
                    })}

                    {modResults.length > 8 && (
                      <button onClick={() => { onNavigate(meta.id, query.trim()); setOpen(false); setQuery(''); }}
                        className="w-full px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 text-center font-medium">
                        View all {modResults.length} in {meta.label} →
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center">Click a result to jump to that module</p>
          </div>
        </div>
      )}
    </div>
  );
};
