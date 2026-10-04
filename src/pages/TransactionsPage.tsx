import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Download, Upload, TrendingUp, TrendingDown, DollarSign, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { ProposalTable } from '../components/proposals/ProposalTable';
import { AddColumnModal } from '../components/proposals/AddColumnModal';
import { ExportModal } from '../components/transactions/ExportModal';
import { ImportModal } from '../components/proposals/ImportModal';
import { ColumnFilters, applyFilters } from '../components/ui/ColumnFilters';
import type { ActiveFilter } from '../components/ui/ColumnFilters';
import { useTransactions } from '../hooks/useTransactions';
import type { ColumnType, Row } from '../types/proposals';

const ROWS_PER_PAGE = 100;

const MiniBarChart: React.FC<{ data: {label:string;income:number;expense:number}[]; granularity: 'daily'|'monthly' }> = ({ data, granularity }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(700);
  const [tooltip, setTooltip] = React.useState<{x:number;y:number;d:{label:string;income:number;expense:number}}|null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(e => setWidth(e[0]?.contentRect.width ?? 700));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!data.length) return null;

  const max = Math.max(...data.map(d => Math.max(d.income, d.expense)), 1);
  const PB = granularity === 'daily' ? 60 : 40;
  const H=granularity==='daily'?240:220, PL=52, PT=16, PR=12;
  const W = width;
  const cw = (W-PL-PR)/data.length;
  const bw = Math.max(4, Math.min(24, cw/2-2));
  const y  = (v:number) => PT+(H-PT-PB)*(1-v/max);
  const h  = (v:number) => Math.max(0, (H-PT-PB)*(v/max));
  const fmt  = (n:number) => n>=1000?`${(n/1000).toFixed(1)}k`:`${n.toFixed(0)}`;
  const fmt2 = (n:number) => n.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});

  // Show labels only when bars are wide enough — prevent any collision
  const availableWidth = W - PL - PR;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.floor(availableWidth / 44)));

  return (
    <div ref={containerRef} className="relative w-full">
      <svg width={W} height={H} onMouseLeave={() => setTooltip(null)}>
        {/* Y grid lines */}
        {[0,0.25,0.5,0.75,1].map((t,i) => {
          const yy = PT+(H-PT-PB)*t;
          return (
            <g key={i}>
              <line x1={PL} y1={yy} x2={W-PR} y2={yy} stroke={i===4?'#e2e8f0':'#f1f5f9'} strokeWidth={i===4?1.5:1}/>
              <text x={PL-6} y={yy+4} textAnchor="end" fontSize={10} fill="#94a3b8" fontFamily="Inter,sans-serif">{fmt(max*(1-t))}</text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d,i) => {
          const cx = PL + i*cw + cw/2;
          return (
            <g key={i}
              onMouseEnter={_e => {
                setTooltip({ x: cx, y: Math.min(y(Math.max(d.income,d.expense)), H-PT-PB-10), d });
              }}>
              {/* Hover background */}
              <rect x={PL+i*cw} y={PT} width={cw} height={H-PT-PB} fill="transparent" className="cursor-pointer"/>
              {d.income>0  && <rect x={cx-bw-1} y={y(d.income)}  width={bw} height={h(d.income)}  fill="#10b981" rx={2} opacity={tooltip?.d.label===d.label?1:0.8}/>}
              {d.expense>0 && <rect x={cx+1}    y={y(d.expense)} width={bw} height={h(d.expense)} fill="#f43f5e" rx={2} opacity={tooltip?.d.label===d.label?1:0.8}/>}
              {/* X label — rotated for daily, horizontal for monthly */}
              {i % labelEvery === 0 && (
                granularity === 'daily' ? (
                  <text
                    x={cx} y={H-PB+14}
                    textAnchor="end"
                    fontSize={9}
                    fill="#94a3b8"
                    fontFamily="Inter,sans-serif"
                    transform={`rotate(-45, ${cx}, ${H-PB+14})`}>
                    {d.label}
                  </text>
                ) : (
                  <text x={cx} y={H-6} textAnchor="middle" fontSize={10} fill="#94a3b8" fontFamily="Inter,sans-serif">{d.label}</text>
                )
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="absolute z-50 bg-white border border-slate-200 rounded-xl shadow-xl pointer-events-none"
          style={{
            left: tooltip.x > W*0.7 ? tooltip.x - 160 : tooltip.x + 12,
            top: 20,
            minWidth: 150,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}>
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-700">{tooltip.d.label}</p>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {tooltip.d.income>0 && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"/><span className="text-xs text-slate-600">Income</span></div>
                <span className="text-xs font-bold text-emerald-600">{fmt2(tooltip.d.income)}</span>
              </div>
            )}
            {tooltip.d.expense>0 && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400"/><span className="text-xs text-slate-600">Expense</span></div>
                <span className="text-xs font-bold text-red-500">{fmt2(tooltip.d.expense)}</span>
              </div>
            )}
            <div className="border-t border-slate-100 pt-1.5 flex items-center justify-between">
              <span className="text-xs text-slate-500">Net</span>
              <span className={`text-xs font-bold ${tooltip.d.income-tooltip.d.expense>=0?'text-blue-600':'text-red-500'}`}>
                {fmt2(tooltip.d.income-tooltip.d.expense)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const TransactionsPage: React.FC = () => {
  const {
    columns, rows, loading,
    addRow, duplicateRow, deleteRow, updateCell, importRows,
    addColumn, deleteColumn, renameColumn, changeColumnType,
    resizeColumn, reorderColumns, updateColumnOptions,
  } = useTransactions();

  const [showAddCol,    setShowAddCol]    = useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [showExport,    setShowExport]    = useState(false);
  const [importing,     setImporting]     = useState(false);
  const [importMsg,     setImportMsg]     = useState('');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [page,          setPage]          = useState(1);
  const [dateRange,     setDateRange]     = useState<'1M'|'3M'|'1Y'|'All'|'custom'>('All');

  const handleFiltersChange = (f: ActiveFilter[]) => { setActiveFilters(f); setPage(1); };

  const optionMap = useMemo(() => {
    const map: Record<string,Record<string,string>> = {};
    for (const col of columns) {
      if (col.type === 'dropdown' && col.options) {
        map[col.id] = {};
        for (const opt of col.options as {id:string;label:string}[]) map[col.id][opt.id] = opt.label;
      }
    }
    return map;
  }, [columns]);

  const resolveLabel = useCallback((colId:string, val:string) => optionMap[colId]?.[val] ?? val, [optionMap]);

  const MONTHS: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'
  };

  const normalizeDate = (val: string): string => {
    if (!val) return '';
    const v = val.trim();
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    // DD-Mon-YYYY or DD-Mon-YY or DD-Mon (e.g. "26-Jun-2025", "26-Jun-25", "26-Jun")
    // Check this FIRST before any numeric-only patterns
    const dmon = v.match(/^(\d{1,2})[- /]([A-Za-z]{3,9})[- /]?(\d{2,4})?$/);
    if (dmon) {
      const mo = MONTHS[dmon[2].slice(0,3).toLowerCase()];
      if (mo) {
        const yr = dmon[3]
          ? (dmon[3].length <= 2 ? `20${dmon[3]}` : dmon[3])
          : new Date().getFullYear().toString();
        return `${yr}-${mo}-${dmon[1].padStart(2,'0')}`;
      }
    }
    // Mon-DD-YYYY or Mon DD YYYY
    const mdy2 = v.match(/^([A-Za-z]{3,9})[\-/ ](\d{1,2})[,\- /]+(\d{4})$/);
    if (mdy2) {
      const mo = MONTHS[mdy2[1].slice(0,3).toLowerCase()];
      if (mo) return `${mdy2[3]}-${mo}-${mdy2[2].padStart(2,'0')}`;
    }
    // MM/DD/YYYY (4-digit year = unambiguous US format)
    const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
    // DD/MM/YY
    const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (dmy) return `20${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
    // YYYY/MM/DD
    const ymd = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (ymd) return `${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}`;
    return ''; // return empty so invalid dates are skipped in chart
  };
  const parseAmt = (v:string) => parseFloat(v.replace(/[^0-9.-]/g,'')) || 0;


  // Column detection — matches your actual column names
  const amountCol   = useMemo(() => columns.find(c => /amount/i.test(c.name) && !/connect/i.test(c.name)), [columns]);
  const typeCol     = useMemo(() => columns.find(c => /transaction\s*type|^type$/i.test(c.name)), [columns]);
  const dateCol     = useMemo(() => columns.find(c => c.type==='date' || /date/i.test(c.name)), [columns]);
  const profileCol  = useMemo(() => columns.find(c => /profile|account/i.test(c.name)), [columns]);

  // Date range filter: preset OR custom range
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  const dateFilteredRows = useMemo(() => {
    if (!dateCol) return rows;
    if (dateRange === 'custom') {
      if (!customFrom && !customTo) return rows;
      return rows.filter(r => {
        const d = normalizeDate(r.data[dateCol.id]??'');
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return true; // keep rows with unparseable dates
        if (customFrom && d < customFrom) return false;
        if (customTo   && d > customTo)   return false;
        return true;
      });
    }
    if (dateRange==='All') return rows;
    const cutoff = new Date();
    if (dateRange==='1M') cutoff.setMonth(cutoff.getMonth()-1);
    if (dateRange==='3M') cutoff.setMonth(cutoff.getMonth()-3);
    if (dateRange==='1Y') cutoff.setFullYear(cutoff.getFullYear()-1);
    const cutStr = cutoff.toISOString().slice(0,10);
    return rows.filter(r => normalizeDate(r.data[dateCol.id]??'')>=cutStr);
  }, [rows, dateCol, dateRange, customFrom, customTo]);

  // Profile filter
  const [profileFilter, setProfileFilter] = useState('');
  const profileOptions = useMemo(() => {
    if (!profileCol) return [];
    const vals = new Set<string>();
    for (const row of rows) {
      const v = resolveLabel(profileCol.id, row.data[profileCol.id]??'');
      if (v) vals.add(v);
    }
    return Array.from(vals).sort();
  }, [rows, profileCol, resolveLabel]);

  const profileFilteredRows = useMemo(() => {
    if (!profileFilter || !profileCol) return dateFilteredRows;
    return dateFilteredRows.filter(r => {
      const v = resolveLabel(profileCol.id, r.data[profileCol.id]??'');
      return v === profileFilter;
    });
  }, [dateFilteredRows, profileFilter, profileCol, resolveLabel]);

  const filteredRows = useMemo(() => applyFilters(profileFilteredRows, activeFilters), [profileFilteredRows, activeFilters]);

  // Sort newest first by transaction date column, fallback to created_at
  const sortedRows = useMemo(() => {
    if (!dateCol) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const da = normalizeDate(a.data[dateCol.id] ?? '') || (a.created_at ?? '');
      const db = normalizeDate(b.data[dateCol.id] ?? '') || (b.created_at ?? '');
      return (db ?? '').localeCompare(da ?? '');
    });
  }, [filteredRows, dateCol]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length/ROWS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = sortedRows.slice((safePage-1)*ROWS_PER_PAGE, safePage*ROWS_PER_PAGE);

  const isIncome = useCallback((row: Row) => {
    if (!typeCol) return true;
    const label = resolveLabel(typeCol.id, row.data[typeCol.id]??'').toLowerCase();
    return /income|earn|revenue|credit|receipt|earning/.test(label);
  }, [typeCol, resolveLabel]);

  const stats = useMemo(() => {
    let income=0, expense=0, incomeCount=0, expenseCount=0;
    for (const row of filteredRows) {
      if (!amountCol) continue;
      const amt = Math.abs(parseAmt(row.data[amountCol.id]??''));
      if (isIncome(row)) { income+=amt; incomeCount++; }
      else               { expense+=amt; expenseCount++; }
    }
    const avgIncome  = incomeCount  > 0 ? income  / incomeCount  : 0;
    const avgExpense = expenseCount > 0 ? expense / expenseCount : 0;
    return { income, expense, balance: income-expense, incomeCount, expenseCount, avgIncome, avgExpense, total: filteredRows.length };
  }, [filteredRows, amountCol, isIncome]);

  const chartData = useMemo(() => {
    if (!dateCol || !amountCol) return [];

    // Daily grouping for 1M/3M, monthly for 1Y/All
    const useDailyGrouping = dateRange === '1M' || dateRange === '3M';
    const by: Record<string,{income:number;expense:number}> = {};

    for (const row of profileFilteredRows) {
      const d = normalizeDate(row.data[dateCol.id]??'');
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const key = useDailyGrouping ? d : d.slice(0,7); // YYYY-MM-DD or YYYY-MM
      if (!by[key]) by[key]={income:0,expense:0};
      const amt = Math.abs(parseAmt(row.data[amountCol.id]??''));
      if (isIncome(row)) by[key].income+=amt; else by[key].expense+=amt;
    }

    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    return Object.entries(by)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([key, v]) => {
        let label = key;
        if (useDailyGrouping) {
          // Format as DD/MM/YYYY
          const parts = key.split('-');
          label = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          // Format as MM/YYYY
          const parts = key.split('-');
          const mn = parseInt(parts[1]??'0',10)-1;
          label = mn>=0&&mn<12 ? `${MONTH_NAMES[mn]}/${parts[0]}` : key;
        }
        return { label, ...v };
      });
  }, [profileFilteredRows, dateCol, amountCol, isIncome, dateRange]);

  // Profile breakdown
  const profileData = useMemo(() => {
    if (!profileCol || !amountCol) return [];
    const by: Record<string,{income:number;expense:number}> = {};
    for (const row of filteredRows) {
      const p = resolveLabel(profileCol.id, row.data[profileCol.id]??'')||'Unknown';
      if (!by[p]) by[p]={income:0,expense:0};
      const amt = Math.abs(parseAmt(row.data[amountCol.id]??''));
      if (isIncome(row)) by[p].income+=amt; else by[p].expense+=amt;
    }
    return Object.entries(by).sort(([,a],[,b])=>(b.income+b.expense)-(a.income+a.expense)).slice(0,8);
  }, [filteredRows, profileCol, amountCol, isIncome, resolveLabel]);


  const fmt = (n:number) => n.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});


  const moveLeft  = (id:string) => { const i=columns.findIndex(c=>c.id===id); if(i>0) reorderColumns(id,columns[i-1].id,'before'); };
  const moveRight = (id:string) => { const i=columns.findIndex(c=>c.id===id); if(i<columns.length-1) reorderColumns(id,columns[i+1].id,'after'); };
  const dupColumn = (id:string) => { const src=columns.find(c=>c.id===id); if(!src) return; addColumn(`${src.name} (copy)`,src.type as ColumnType,src.options?.map(o=>({label:o.label,color:o.color}))??[]); };

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
      <span className="text-sm text-slate-500">Loading transactions...</span>
    </div>
  );

  return (
    <div className="space-y-5 w-full">
      <PageHeader title="Transactions" subtitle={`${rows.length.toLocaleString()} rows · ${columns.length} columns`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={()=>setShowImport(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <Upload size={14}/> Import
            </button>
            <button onClick={() => setShowExport(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <Download size={14}/> Export
            </button>
            <button onClick={()=>setShowAddCol(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <BarChart2 size={14}/> Add Column
            </button>
            <button onClick={addRow} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
              <Plus size={14}/> Add Row
            </button>
          </div>
        }
      />

      {importing && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${importMsg.startsWith('✓')?'bg-emerald-50 border-emerald-200 text-emerald-700':importMsg.startsWith('✗')?'bg-red-50 border-red-200 text-red-700':'bg-blue-50 border-blue-200 text-blue-700'}`}>
          {!importMsg.startsWith('✓')&&!importMsg.startsWith('✗')&&<div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0"/>}
          {importMsg}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-wrap items-end gap-3" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        {/* Date preset */}
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1">Date range</p>
          <div className="flex gap-1">
            {(['1M','3M','1Y','All','custom'] as const).map(r=>(
              <button key={r} onClick={()=>setDateRange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${dateRange===r?'bg-blue-600 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {r==='custom'?'Custom':r}
              </button>
            ))}
          </div>
        </div>
        {/* Custom date inputs */}
        {dateRange==='custom' && (
          <div className="flex items-end gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1">From</p>
              <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-blue-400"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1">To</p>
              <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-blue-400"/>
            </div>
          </div>
        )}
        {/* Profile filter */}
        {profileCol && profileOptions.length>0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">{profileCol.name}</p>
            <select value={profileFilter} onChange={e=>setProfileFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-blue-400 bg-white cursor-pointer min-w-36">
              <option value="">All profiles</option>
              {profileOptions.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        {/* Column filters */}
        {columns.length>0 && (
          <div className="ml-auto">
            <p className="text-xs font-semibold text-slate-400 mb-1">More filters</p>
            <ColumnFilters columns={columns} activeFilters={activeFilters} onFiltersChange={handleFiltersChange} optionMap={optionMap}/>
          </div>
        )}
      </div>

      {/* ── Stats cards ── */}
      {amountCol && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div className="flex items-center gap-1.5 mb-1 text-emerald-600"><TrendingUp size={14}/><span className="text-xs font-bold uppercase tracking-wide">Total Income</span></div>
            <p className="text-2xl font-bold text-emerald-700 leading-none" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{fmt(stats.income)}</p>
            <p className="text-xs text-emerald-500 mt-1">{stats.incomeCount} transactions · avg {fmt(stats.avgIncome)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div className="flex items-center gap-1.5 mb-1 text-red-500"><TrendingDown size={14}/><span className="text-xs font-bold uppercase tracking-wide">Total Expense</span></div>
            <p className="text-2xl font-bold text-red-600 leading-none" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{fmt(stats.expense)}</p>
            <p className="text-xs text-red-400 mt-1">{stats.expenseCount} transactions · avg {fmt(stats.avgExpense)}</p>
          </div>
          <div className={`border rounded-2xl p-4 ${stats.balance>=0?'bg-blue-50 border-blue-200':'bg-red-50 border-red-200'}`} style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div className={`flex items-center gap-1.5 mb-1 ${stats.balance>=0?'text-blue-600':'text-red-500'}`}><DollarSign size={14}/><span className="text-xs font-bold uppercase tracking-wide">Net Balance</span></div>
            <p className={`text-2xl font-bold leading-none ${stats.balance>=0?'text-blue-700':'text-red-600'}`} style={{fontFamily:"'Space Grotesk',sans-serif"}}>{stats.balance>=0?'':'-'}{fmt(Math.abs(stats.balance))}</p>
            <p className="text-xs text-slate-400 mt-1">{stats.total} total rows shown</p>
          </div>
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div className="flex items-center gap-1.5 mb-1 text-violet-600"><BarChart2 size={14}/><span className="text-xs font-bold uppercase tracking-wide">Savings Rate</span></div>
            <p className="text-2xl font-bold text-violet-700 leading-none" style={{fontFamily:"'Space Grotesk',sans-serif"}}>
              {stats.income>0?Math.round(((stats.income-stats.expense)/stats.income)*100):0}%
            </p>
            <p className="text-xs text-violet-400 mt-1">of income retained</p>
          </div>
        </div>
      )}

      {/* ── Chart ── */}
      {chartData.length>0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800" style={{fontFamily:"'Space Grotesk',sans-serif"}}>Monthly Overview</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-xs text-slate-500"><span className="w-3 h-2 bg-emerald-500 rounded-sm inline-block"/>Income</span>
                <span className="flex items-center gap-1 text-xs text-slate-500"><span className="w-3 h-2 bg-red-400 rounded-sm inline-block"/>Expense</span>
              </div>
            </div>
          </div>
          <MiniBarChart data={chartData} granularity={dateRange==='1M'||dateRange==='3M'?'daily':'monthly'}/>
        </div>
      )}

      {/* ── Profile breakdown ── */}
      {profileData.length>0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
          <h3 className="text-sm font-bold text-slate-800 mb-4" style={{fontFamily:"'Space Grotesk',sans-serif"}}>By Profile / Account</h3>
          <div className="space-y-3">
            {profileData.map(([profile, vals])=>(
              <div key={profile}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-600 truncate">{profile}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-600 font-medium">+{fmt(vals.income)}</span>
                    <span className="text-red-500 font-medium">-{fmt(vals.expense)}</span>
                    <span className={`font-bold ${vals.income-vals.expense>=0?'text-blue-600':'text-red-600'}`}>={fmt(vals.income-vals.expense)}</span>
                  </div>
                </div>
                <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-slate-100">
                  {vals.income>0 && <div className="bg-emerald-400 rounded-full" style={{width:`${Math.round(vals.income/(vals.income+vals.expense)*100)}%`}}/>}
                  {vals.expense>0 && <div className="bg-red-400 rounded-full flex-1"/>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row color legend */}
      {typeCol && (
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300 inline-block"/>Income rows</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300 inline-block"/>Expense rows</span>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span><strong className="text-slate-800">{sortedRows.length.toLocaleString()}</strong> rows{activeFilters.length>0?` of ${rows.length.toLocaleString()} total`:''}</span>
        {columns.length>0 && <><span className="text-slate-300">|</span><span><strong className="text-slate-800">{columns.length}</strong> columns</span></>}
        <span className="ml-auto text-xs text-slate-400 hidden md:block">Right-click column header for options · Drag to reorder</span>
      </div>

      {/* Table */}
      {columns.length===0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200 gap-3">
          <BarChart2 size={36} className="text-slate-200"/>
          <p className="text-sm font-semibold text-slate-500">No columns yet</p>
          <p className="text-xs text-slate-400">Click <strong>Add Column</strong> to build your transaction table</p>
          <button onClick={()=>setShowAddCol(true)} className="mt-2 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
            <Plus size={14}/> Add Column
          </button>
        </div>
      ) : (
        <ProposalTable
          columns={columns}
          rows={pageRows}
          hideId={true}
          hideActions={false}
          searchHighlight=""
          onUpdateCell={updateCell}
          onDuplicateRow={duplicateRow}
          onDeleteRow={deleteRow}
          onRenameColumn={renameColumn}
          onChangeColumnType={changeColumnType}
          onDeleteColumn={deleteColumn}
          onDuplicateColumn={dupColumn}
          onReorderColumns={reorderColumns}
          onResizeColumn={resizeColumn}
          onMoveLeft={moveLeft}
          onMoveRight={moveRight}
          onUpdateColumnOptions={updateColumnOptions}
          getRowClass={(row) => {
            if (!typeCol) return '';
            return isIncome(row) ? 'bg-emerald-50/60' : 'bg-red-50/60';
          }}
        />
      )}

      {/* Pagination */}
      {totalPages>1 && (
        <div className="flex items-center justify-between">
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={safePage===1} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 disabled:opacity-40">
            <ChevronLeft size={15}/> Previous
          </button>
          <span className="text-sm text-slate-500">Page <strong>{safePage}</strong> of <strong>{totalPages}</strong></span>
          <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={safePage===totalPages} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 disabled:opacity-40">
            Next <ChevronRight size={15}/>
          </button>
        </div>
      )}

      {showAddCol && (
        <AddColumnModal
          onAdd={(name,type,options)=>{addColumn(name,type as ColumnType,options);setShowAddCol(false);}}
          onClose={()=>setShowAddCol(false)}
        />
      )}

      {showExport && (
        <ExportModal columns={columns} rows={rows} onClose={() => setShowExport(false)} />
      )}

      {showImport && (
        <ImportModal columns={columns} existingRows={rows} hideId={true}
          onImport={async(newRows,mode)=>{
            setShowImport(false); setImporting(true);
            setImportMsg(`Saving ${newRows.length} rows...`);
            try {
              await importRows(newRows as Omit<Row,'id'|'created_at'>[], mode);
              setImportMsg(`✓ ${newRows.length} rows saved`);
              setTimeout(()=>{setImporting(false);setImportMsg('');},3000);
            } catch(e:any) {
              setImportMsg(`✗ ${e?.message??'Import failed'}`);
              setTimeout(()=>{setImporting(false);setImportMsg('');},5000);
            }
          }}
          onClose={()=>setShowImport(false)}
        />
      )}
    </div>
  );
};
