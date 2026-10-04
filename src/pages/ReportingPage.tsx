import React, { useState, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { LineChart } from '../components/reporting/LineChart';
import { DayModal } from '../components/reporting/DayModal';
import { useProposals } from '../context/ProposalContext';
import { useDayMarkers } from '../hooks/useDayMarkers';
import { getFunnelStatusStyle } from '../types/proposals';
import {
  FUNNEL_STAGES, STAGE_COLORS,
  getPresetRange, getDatesInRange, formatDisplayDate,
  detectDateCol, detectStatusCol,
} from '../types/reporting';
import type { RangePreset, DateRange } from '../types/reporting';
import { MARKER_COLORS, MARKER_LABELS } from '../components/reporting/LineChart';
import type { MarkerType } from '../components/reporting/LineChart';

const PRESET_LABELS: { value: RangePreset; label: string }[] = [
  { value: 'last7',     label: 'Last 7 days'  },
  { value: 'last30',    label: 'Last 30 days'  },
  { value: 'last90',    label: 'Last 90 days'  },
  { value: 'thisMonth', label: 'This month'    },
  { value: 'lastMonth', label: 'Last month'    },
  { value: 'thisYear',  label: 'This year'     },
  { value: 'lastYear',  label: 'Last year'     },
  { value: 'custom',    label: 'Custom range'  },
];

const AUTO_COLORS = [
  '#3b82f6','#f59e0b','#8b5cf6','#06b6d4','#10b981',
  '#f43f5e','#84cc16','#f97316','#6366f1','#14b8a6',
];

export const ReportingPage: React.FC = () => {
  const { columns, rows, loading } = useProposals();

  const refetch = () => window.location.reload();
  const { markers, setMarker, deleteMarker } = useDayMarkers();

  // ── Controls ─────────────────────────────────────────────────────────────────
  const [preset,       setPreset]       = useState<RangePreset>('last30');
  const [custom,       setCustom]       = useState<DateRange>({ from: '', to: '' });
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [sdrFilter,    setSdrFilter]    = useState('');
  const [profileFilter,setProfileFilter]= useState('');
  const [modalDate,    setModalDate]    = useState<string | null>(null);

  const range = preset === 'custom' ? custom : getPresetRange(preset);
  const dates = useMemo(() =>
    range.from && range.to ? getDatesInRange(range.from, range.to, skipWeekends) : [],
    [range.from, range.to, skipWeekends]
  );

  // ── Column detection ──────────────────────────────────────────────────────────
  const dateCol   = useMemo(() => detectDateCol(columns),   [columns]);
  const statusCol = useMemo(() => detectStatusCol(columns), [columns]);

  // Find SDR and Profile columns
  const sdrCol = useMemo(() =>
    columns.find(c => c.name.toLowerCase().includes('sdr')),
    [columns]
  );
  const profileCol = useMemo(() =>
    columns.find(c => c.name.toLowerCase().includes('profile')),
    [columns]
  );

  // Build option label resolver
  const resolveLabel = useMemo(() => {
    const maps: Record<string, Record<string, string>> = {};
    for (const col of columns) {
      if (col.type === 'dropdown' && col.options) {
        maps[col.id] = {};
        for (const opt of col.options as {id:string;label:string}[]) {
          maps[col.id][opt.id] = opt.label;
          maps[col.id][opt.label.toLowerCase()] = opt.label;
        }
      }
    }
    return (colId: string, val: string): string => {
      const m = maps[colId];
      if (!m) return val;
      return m[val] ?? m[val.toLowerCase()] ?? val;
    };
  }, [columns]);

  // SDR & Profile unique values
  const sdrOptions = useMemo(() => {
    if (!sdrCol) return [];
    const vals = new Set<string>();
    for (const row of rows) {
      const v = resolveLabel(sdrCol.id, row.data[sdrCol.id] ?? '');
      if (v) vals.add(v);
    }
    return Array.from(vals).sort();
  }, [rows, sdrCol, resolveLabel]);

  const profileOptions = useMemo(() => {
    if (!profileCol) return [];
    const vals = new Set<string>();
    for (const row of rows) {
      const v = resolveLabel(profileCol.id, row.data[profileCol.id] ?? '');
      if (v) vals.add(v);
    }
    return Array.from(vals).sort();
  }, [rows, profileCol, resolveLabel]);

  // Normalize any date format -> YYYY-MM-DD
  const normalizeDate = (val: string): string => {
    if (!val) return '';
    const v = val.trim();
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    // DD-Mon-YYYY or DD-Mon-YY (e.g. 22-Jun-2026, 22-Jun-26)
    const MO: Record<string,string> = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const dmon = v.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})$/);
    if (dmon) {
      const mo = MO[dmon[2].toLowerCase()];
      const yr = dmon[3].length === 2 ? `20${dmon[3]}` : dmon[3];
      if (mo) return `${yr}-${mo}-${dmon[1].padStart(2,'0')}`;
    }
    // MM/DD/YYYY
    const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
    // DD/MM/YYYY
    const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (dmy) { const yr = dmy[3].length===2?`20${dmy[3]}`:dmy[3]; return `${yr}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`; }
    return '';
  };

  // ── Filter rows ───────────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (sdrFilter && sdrCol) {
        const v = resolveLabel(sdrCol.id, row.data[sdrCol.id] ?? '');
        if (v !== sdrFilter) return false;
      }
      if (profileFilter && profileCol) {
        const v = resolveLabel(profileCol.id, row.data[profileCol.id] ?? '');
        if (v !== profileFilter) return false;
      }
      return true;
    });
  }, [rows, sdrFilter, profileFilter, sdrCol, profileCol, resolveLabel]);

  // ── Status series from funnel ─────────────────────────────────────────────────
  const series = useMemo(() => {
    if (!statusCol?.options) return [];
    return FUNNEL_STAGES
      .map(label => (statusCol.options as {id:string;label:string}[]).find(o => o.label === label))
      .filter(Boolean)
      .map(o => ({ id: o!.id, label: o!.label }));
  }, [statusCol]);

  const seriesColors = useMemo(() => {
    const m: Record<string, string> = {};
    series.forEach((s, i) => { m[s.label] = STAGE_COLORS[s.label] ?? AUTO_COLORS[i]; });
    return m;
  }, [series]);

  // ── Chart data ────────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!dateCol || series.length === 0 || dates.length === 0) return [];

    const lookup: Record<string, Record<string, number>> = {};
    const sdrLookup: Record<string, Record<string, number>> = {};
    for (const row of filteredRows) {
      const dateVal = normalizeDate(row.data[dateCol.id] ?? '');
      if (!dateVal || !dates.includes(dateVal)) continue;
      const rawStatus = row.data[statusCol!.id] ?? '';
      const statusLabel = resolveLabel(statusCol!.id, rawStatus);
      if (!statusLabel) continue;
      if (!lookup[dateVal]) lookup[dateVal] = {};
      lookup[dateVal][statusLabel] = (lookup[dateVal][statusLabel] ?? 0) + 1;
      // SDR breakdown per day
      if (sdrCol) {
        const sdrName = resolveLabel(sdrCol.id, row.data[sdrCol.id] ?? '') || 'Unknown';
        if (!sdrLookup[dateVal]) sdrLookup[dateVal] = {};
        sdrLookup[dateVal][sdrName] = (sdrLookup[dateVal][sdrName] ?? 0) + 1;
      }
    }

    return dates.map(date => {
      const dayData = lookup[date] ?? {};
      const counts: Record<string, number> = {};
      // Cumulative funnel: each stage includes all rows at that stage OR beyond
      // e.g. Submitted = Submitted + Viewed + Contacted + Interviewed + Hired
      for (let i = 0; i < series.length; i++) {
        const stagesAtOrBeyond = series.slice(i).map(s => s.label);
        counts[series[i].label] = stagesAtOrBeyond.reduce((sum, lbl) => sum + (dayData[lbl] ?? 0), 0);
      }
      const total = counts[series[0]?.label ?? ''] ?? 0; // total = Submitted (widest stage)
      return { date, counts, total, sdrCounts: sdrLookup[date] ?? {} };
    });
  }, [filteredRows, dates, dateCol, statusCol, sdrCol, series, resolveLabel]);

  // ── Summary counts — only rows within the selected date range ───────────────
  const exactCounts = useMemo(() => {
    const c: Record<string, number> = {};
    if (!dateCol || dates.length === 0) return c;
    const dateSet = new Set(dates);
    for (const row of filteredRows) {
      const dateVal = normalizeDate(row.data[dateCol.id] ?? '');
      if (!dateSet.has(dateVal)) continue; // only count rows in range
      const raw = row.data[statusCol?.id ?? ''] ?? '';
      const label = resolveLabel(statusCol?.id ?? '', raw);
      if (label) c[label] = (c[label] ?? 0) + 1;
    }
    return c;
  }, [filteredRows, statusCol, dateCol, dates, resolveLabel]);

  const cumulativeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    FUNNEL_STAGES.forEach((stage, i) => {
      c[stage] = FUNNEL_STAGES.slice(i).reduce((sum, s) => sum + (exactCounts[s] ?? 0), 0);
    });
    return c;
  }, [exactCounts]);

  const hireRate = cumulativeCounts['Submitted'] > 0
    ? Math.round((cumulativeCounts['Hired'] / cumulativeCounts['Submitted']) * 100)
    : 0;

  const grandTotal = cumulativeCounts['Submitted'] ?? 0;

  return (
    <div className="space-y-5 w-full">
      <PageHeader
        title="Reporting"
        subtitle={loading ? 'Loading from Proposal Details...' : rows.length === 0 ? 'No data — import data in Proposal Details first' : `${rows.length.toLocaleString()} rows from Proposal Details`}
        actions={
          <button onClick={refetch} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        }
      />

      {/* ── Filters row ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-wrap items-center gap-3"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>

        {/* Date filter */}
        <div>
          <p className="text-xs text-slate-400 font-medium mb-1">Date filter</p>
          <select value={preset} onChange={e => setPreset(e.target.value as RangePreset)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 bg-white cursor-pointer font-medium min-w-36">
            {PRESET_LABELS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {/* Custom date inputs */}
        {preset === 'custom' && (
          <div className="flex items-end gap-2">
            <div>
              <p className="text-xs text-slate-400 font-medium mb-1">From</p>
              <input type="date" value={custom.from} onChange={e => setCustom(p => ({ ...p, from: e.target.value }))}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium mb-1">To</p>
              <input type="date" value={custom.to} onChange={e => setCustom(p => ({ ...p, to: e.target.value }))}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
          </div>
        )}

        {/* SDR filter */}
        {sdrCol && (
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1">{sdrCol.name}</p>
            <select value={sdrFilter} onChange={e => setSdrFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 bg-white cursor-pointer min-w-36">
              <option value="">All {sdrCol.name}s</option>
              {sdrOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}

        {/* Profile filter */}
        {profileCol && (
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1">{profileCol.name}</p>
            <select value={profileFilter} onChange={e => setProfileFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 bg-white cursor-pointer min-w-36">
              <option value="">All profiles</option>
              {profileOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}

        {/* Skip weekends toggle */}
        <div className="ml-auto">
          <p className="text-xs text-slate-400 font-medium mb-1">Weekends</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <div onClick={() => setSkipWeekends(s => !s)}
              className={`w-9 h-5 rounded-full transition-colors relative ${skipWeekends ? 'bg-blue-600' : 'bg-slate-200'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${skipWeekends ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-slate-600 font-medium">{skipWeekends ? 'Hidden' : 'Shown'}</span>
          </label>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {FUNNEL_STAGES.map(stage => {
          const style = getFunnelStatusStyle(stage);
          const count = cumulativeCounts[stage] ?? 0;
          return (
            <div key={stage} className={`${style.bg} border ${style.border} rounded-2xl p-4`}
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: seriesColors[stage] ?? '#94a3b8' }} />
                <p className={`text-xs font-bold uppercase tracking-wide ${style.text}`}>{stage}</p>
              </div>
              <p className={`text-2xl font-bold leading-none ${style.text}`}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {count.toLocaleString()}
              </p>
            </div>
          );
        })}
        {/* Hire rate card */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 mb-2">Hire Rate</p>
          <p className="text-2xl font-bold text-emerald-600 leading-none"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{hireRate}%</p>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Daily Submissions
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {range.from && range.to ? `${formatDisplayDate(range.from)} — ${formatDisplayDate(range.to)}` : ''}
              {' · '}{grandTotal.toLocaleString()} total{' · '}{dates.length} days
            </p>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-2">
            {series.map(s => (
              <div key={s.label} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="w-6 h-0.5 inline-block rounded" style={{ backgroundColor: seriesColors[s.label] }} />
                {s.label}
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 gap-3">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-400">Loading data from Proposal Details...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-sm font-semibold text-slate-500">No data available</p>
            <p className="text-xs text-slate-400">Import data in Proposal Details first to see reports here</p>
          </div>
        ) : !dateCol || !statusCol ? (
          <div className="flex items-center justify-center h-48 text-sm text-slate-400">
            No date or status column detected in Proposal Details
          </div>
        ) : chartData.every(d => d.total === 0) ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-sm text-slate-400">No data for this date range</p>
            <p className="text-xs text-slate-300">Try "This year" or a custom range to find your data</p>
          </div>
        ) : (
          <LineChart
            data={chartData}
            seriesKeys={series.map(s => s.label)}
            seriesColors={seriesColors}
            height={340}
            markers={markers}
            onDayClick={setModalDate}
          />
        )}

        {/* Marked dates legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-50">
          <span className="text-xs text-slate-400 font-medium">Marked dates:</span>
          {(['holiday','leave','halfday'] as MarkerType[]).map(t => (
            <div key={t} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: MARKER_COLORS[t] }} />
              {MARKER_LABELS[t]}
            </div>
          ))}
          <span className="ml-auto text-xs text-slate-400">Click a date on the chart to add a note or mark it.</span>
        </div>
      </div>

      {/* Day modal */}
      {modalDate && (
        <DayModal
          date={modalDate}
          existingNote={''}
          existingMarker={markers[modalDate] ?? null}
          onSaveNote={() => {}}
          onDeleteNote={() => {}}
          onSaveMarker={(type: MarkerType, note: string) => setMarker(modalDate, type, note)}
          onDeleteMarker={() => deleteMarker(modalDate)}
          onClose={() => setModalDate(null)}
        />
      )}
    </div>
  );
};
