import React, { useState } from 'react';
import { Columns, Download, Info, RefreshCw, Upload } from 'lucide-react';
import { ColumnFilters, applyFiltersLA } from '../components/ui/ColumnFilters';
import type { ActiveFilter } from '../components/ui/ColumnFilters';
import { PageHeader } from '../components/ui/PageHeader';
import { LATable } from '../components/leadAnalysis/LATable';
import { AddLAColumnModal } from '../components/leadAnalysis/AddLAColumnModal';
import { ImportLAModal } from '../components/leadAnalysis/ImportLAModal';
import { useProposals } from '../context/ProposalContext';
import { useLeadAnalysis } from '../hooks/useLeadAnalysis';
import { getFunnelStatusStyle } from '../types/proposals';

const ROWS_PER_PAGE = 100;
const FUNNEL_ORDER = ['Contacted', 'Interviewed', 'Hired'];

export const LeadAnalysisPage: React.FC<{ searchHighlight?: string }> = ({ searchHighlight = '' }) => {
  const { columns: proposalColumns, rows: proposalRows, loading: proposalLoading } = useProposals();
  const { priorityRecords } = useProposals();

  const {
    laColumns, mergedRows, statusCol, loading, syncStatus,
    addLinkedColumn, addLocalColumn, forceResync,
    deleteColumn, renameColumn, resizeColumn, reorderColumns,
    updateColumnOptions, updateCell, importLocalData,
  } = useLeadAnalysis(proposalColumns, proposalRows);

  const [showAddCol,  setShowAddCol]  = useState(false);
  const [showImport,  setShowImport]  = useState(false);
  const [resyncing,  setResyncing]  = useState(false);
  const [page,       setPage]       = useState(1);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const handleFiltersChange = (f: ActiveFilter[]) => { setActiveFilters(f); setPage(1); };

  // Jump to correct page when navigated from global search
  React.useEffect(() => {
    if (!searchHighlight) return;
    const q = searchHighlight.toLowerCase();
    const matchIdx = sortedFiltered.findIndex(row =>
      row.uniqueId.toLowerCase().includes(q) ||
      Object.values(row.data).some(v => String(v).toLowerCase().includes(q))
    );
    if (matchIdx >= 0) {
      setPage(Math.floor(matchIdx / ROWS_PER_PAGE) + 1);
      setTimeout(() => {
        const el = document.querySelector('[data-la-highlight="true"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }, [searchHighlight]);


  // All derived state as useMemo — no code between hooks
  // Collect actual unique values per column from merged data (for filter dropdowns)
  const rowValuesByColId = React.useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const row of mergedRows) {
      for (const [colId, val] of Object.entries(row.data)) {
        if (!val) continue;
        if (!map[colId]) map[colId] = [];
        if (!map[colId].includes(val)) map[colId].push(val);
      }
    }
    return map;
  }, [mergedRows]);

  const optionMap = React.useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const col of laColumns) {
      if (col.type === 'dropdown' && col.options) {
        map[col.id] = {};
        for (const opt of col.options as {id:string;label:string}[]) map[col.id][opt.id] = opt.label;
      }
    }
    return map;
  }, [laColumns]);

  const filtered = React.useMemo(() => applyFiltersLA(mergedRows, activeFilters), [mergedRows, activeFilters]);

  // Sort by date column descending (latest first), fallback to uniqueId desc
  const sortedFiltered = React.useMemo(() => {
    const dateCol = laColumns.find(c => c.type === 'date' || /date/i.test(c.name));
    if (!dateCol) return filtered;

    const MO: Record<string,string> = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const toIso = (v: string) => {
      if (!v) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const m = v.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})$/);
      if (m) { const mo = MO[m[2].toLowerCase()]; const yr = m[3].length===2?`20${m[3]}`:m[3]; if (mo) return `${yr}-${mo}-${m[1].padStart(2,'0')}`; }
      return v;
    };
    return [...filtered].sort((a, b) => {
      const da = toIso(a.data[dateCol.id] ?? '');
      const db = toIso(b.data[dateCol.id] ?? '');
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    });
  }, [filtered, laColumns]);

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / ROWS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = sortedFiltered.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);

  const stageCounts = React.useMemo(() => {
    const exact: Record<string, number> = {};
    for (const r of mergedRows) {
      const s = r.currentStatus || '';
      if (s) exact[s] = (exact[s] ?? 0) + 1;
    }
    const counts: Record<string, number> = {};
    FUNNEL_ORDER.forEach((stage, i) => {
      counts[stage] = FUNNEL_ORDER.slice(i).reduce((sum, s) => sum + (exact[s] ?? 0), 0);
    });
    return counts;
  }, [mergedRows]);

  const priorityByUniqueId = React.useMemo(() => {
    const map: Record<string, { score: number; tier: string }> = {};
    for (const r of priorityRecords) {
      map[r.unique_id] = { score: r.score, tier: r.tier };
    }
    return map;
  }, [priorityRecords]);

  const handleExport = () => {
    const headers = ['Unique ID', 'Current Status', ...laColumns.map(c => c.name)].map(h => `"${h}"`).join(',');
    const lines = mergedRows.map(row =>
      [row.uniqueId, row.currentStatus, ...laColumns.map(col => row.data[col.id] ?? '')].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers, ...lines].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'lead-analysis.csv';
    a.click();
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      <PageHeader
        title="Lead Analysis"
        subtitle="Detailed analysis of Contacted, Interviewed, and Hired leads."
        actions={
          <div className="flex items-center gap-2 flex-wrap">

            <button
              onClick={() => { setResyncing(true); forceResync().finally(() => setResyncing(false)); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <RefreshCw size={14} className={resyncing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Resync</span>
            </button>
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <Download size={14} /><span className="hidden sm:inline">Export</span>
            </button>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <Upload size={14} /><span className="hidden sm:inline">Import</span>
            </button>
            <button onClick={() => setShowAddCol(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
              <Columns size={14} />Add Column
            </button>
          </div>
        }
      />

      {/* Loading / sync status */}
      {(proposalLoading || loading || syncStatus) && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-xs text-blue-700 font-medium">
            {proposalLoading ? 'Loading data from Proposal Details...' : syncStatus || 'Syncing leads...'}
          </p>
        </div>
      )}

      {/* Info banner */}
      <div className={`flex items-start gap-2.5 border rounded-xl px-4 py-3 ${statusCol ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
        <Info size={15} className={`flex-shrink-0 mt-0.5 ${statusCol ? 'text-blue-500' : 'text-amber-500'}`} />
        <p className={`text-xs ${statusCol ? 'text-blue-700' : 'text-amber-700'}`}>
          {statusCol
            ? <>Linked to <strong>"{statusCol.name}"</strong> column. Leads marked as Contacted, Interviewed, or Hired appear here automatically. Click <strong>Resync</strong> if counts don't match.</>
            : 'No status column found. Make sure your Proposal Details table has a dropdown column with Contacted, Interviewed, Hired options.'
          }
        </p>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {FUNNEL_ORDER.map(stage => {
          const style = getFunnelStatusStyle(stage);
          const count = stageCounts[stage] ?? 0;
          const desc = stage === 'Contacted' ? 'Contacted or beyond' : stage === 'Interviewed' ? 'Interviewed or beyond' : 'Hired only';
          return (
            <div key={stage} className={`${style.bg} border ${style.border} rounded-2xl p-4`}
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className={`text-xs font-bold uppercase tracking-wide mb-0.5 ${style.text}`}>{stage}</p>
              <p className={`text-3xl font-bold leading-none ${style.text}`}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{count}</p>
              <p className="text-xs mt-1.5 text-slate-400">{desc}</p>
            </div>
          );
        })}
      </div>

      {/* Column Filters */}
      <ColumnFilters
        columns={laColumns as any}
        activeFilters={activeFilters}
        onFiltersChange={handleFiltersChange}
        optionMap={optionMap}
        rowValuesByColId={rowValuesByColId}
      />

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
        <span><strong className="text-slate-800 font-semibold">{sortedFiltered.length}</strong> leads</span>
        <span className="text-slate-300">|</span>
        <span><strong className="text-slate-800 font-semibold">{laColumns.length}</strong> columns</span>

        <span className="ml-auto text-xs text-slate-400 hidden md:block">
          Right-click column header for options · 🔗 = linked from Proposal Details (read-only)
        </span>
      </div>

      {/* Table */}
      <LATable
        columns={laColumns}
        rows={pageRows}
        priorityByUniqueId={priorityByUniqueId}
        searchHighlight={searchHighlight}
        onUpdateCell={updateCell}
        onDeleteColumn={deleteColumn}
        onRenameColumn={renameColumn}
        onResizeColumn={resizeColumn}
        onReorderColumns={reorderColumns}
        onUpdateColumnOptions={updateColumnOptions}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 disabled:opacity-40 transition-colors">
            ← Previous
          </button>
          <span className="text-sm text-slate-500">
            Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 disabled:opacity-40 transition-colors">
            Next →
          </button>
        </div>
      )}

      {showImport && (
        <ImportLAModal
          laColumns={laColumns}
          existingUniqueIds={mergedRows.map(r => r.uniqueId)}
          onImport={importLocalData}
          onClose={() => setShowImport(false)}
        />
      )}

      {showAddCol && (
        <AddLAColumnModal
          proposalColumns={proposalColumns}
          onAddLinked={addLinkedColumn}
          onAddLocal={addLocalColumn}
          onClose={() => setShowAddCol(false)}
        />
      )}
    </div>
  );
};
