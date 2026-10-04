import React, { useMemo } from 'react';
import { FileText, Star, CheckSquare, TrendingUp, TrendingDown, Target, Activity, AlertCircle } from 'lucide-react';
import { useProposals } from '../context/ProposalContext';
import { useTransactions } from '../hooks/useTransactions';
import { useTodos } from '../hooks/useTodos';
import { getFunnelStatusStyle } from '../types/proposals';

const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Mini SVG bar chart

export const DashboardPage: React.FC = () => {
  const { columns, rows, priorityRecords, laColumns, laMergedRows } = useProposals();
  const { columns: txCols, rows: txRows } = useTransactions();
  const { stats: todoStats, todos } = useTodos();

  // ── Proposal data ──────────────────────────────────────────────────────────
  const optMap = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const col of columns) {
      if (col.type === 'dropdown' && col.options) {
        map[col.id] = {};
        for (const opt of col.options as {id:string;label:string}[]) map[col.id][opt.id] = opt.label;
      }
    }
    return map;
  }, [columns]);
  const resolve = (colId: string, val: string) => optMap[colId]?.[val] ?? val;

  const statusCol  = useMemo(() => columns.find(c => c.name.toLowerCase().includes('status') && c.type === 'dropdown'), [columns]);
  const dateCol    = useMemo(() => columns.find(c => c.type === 'date' || c.name.toLowerCase().includes('date')), [columns]);
  const sdrCol     = useMemo(() => columns.find(c => c.name.toLowerCase().includes('sdr')), [columns]);
  const profileCol = useMemo(() => columns.find(c => c.name.toLowerCase().includes('profile')), [columns]);

  const normalizeDate = (v: string) => {
    if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const MO: Record<string,string> = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const m = v.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})$/);
    if (m) { const mo = MO[m[2].toLowerCase()]; const yr = m[3].length===2?`20${m[3]}`:m[3]; if (mo) return `${yr}-${mo}-${m[1].padStart(2,'0')}`; }
    return '';
  };

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const lastMonth = (() => { const d = new Date(now); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();

  // Status breakdown
  const statusBreakdown = useMemo(() => {
    const b: Record<string, number> = {};
    if (!statusCol) return b;
    for (const row of rows) {
      const label = resolve(statusCol.id, row.data[statusCol.id] ?? '') || 'Unknown';
      b[label] = (b[label] ?? 0) + 1;
    }
    return b;
  }, [rows, statusCol, optMap]);

  const FUNNEL = ['Submitted','Viewed','Contacted','Interviewed','Hired'];

  // This month vs last month
  const thisMonthCount = useMemo(() => {
    if (!dateCol) return 0;
    return rows.filter(r => normalizeDate(r.data[dateCol.id]??'').startsWith(thisMonth)).length;
  }, [rows, dateCol, thisMonth]);

  const lastMonthCount = useMemo(() => {
    if (!dateCol) return 0;
    return rows.filter(r => normalizeDate(r.data[dateCol.id]??'').startsWith(lastMonth)).length;
  }, [rows, dateCol, lastMonth]);

  const monthlyTrend = lastMonthCount > 0 ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100) : 0;

  // Monthly submissions for mini chart (last 6 months)
  const monthlyData = useMemo(() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now); d.setMonth(d.getMonth() - i);
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    return months.map(mo => rows.filter(r => dateCol && normalizeDate(r.data[dateCol.id]??'').startsWith(mo)).length);
  }, [rows, dateCol]);

  // Top SDRs
  const topSDRs = useMemo(() => {
    if (!sdrCol) return [];
    const b: Record<string, number> = {};
    for (const row of rows) {
      const name = resolve(sdrCol.id, row.data[sdrCol.id] ?? '') || 'Unknown';
      b[name] = (b[name] ?? 0) + 1;
    }
    return Object.entries(b).sort(([,a],[,b]) => b-a).slice(0, 5);
  }, [rows, sdrCol, optMap]);

  // Top profiles
  const topProfiles = useMemo(() => {
    if (!profileCol) return [];
    const b: Record<string, { total: number; hired: number }> = {};
    for (const row of rows) {
      const name = resolve(profileCol.id, row.data[profileCol.id] ?? '') || 'Unknown';
      if (!b[name]) b[name] = { total: 0, hired: 0 };
      b[name].total++;
      if (statusCol) {
        const status = resolve(statusCol.id, row.data[statusCol.id] ?? '').toLowerCase();
        if (status === 'hired') b[name].hired++;
      }
    }
    return Object.entries(b).sort(([,a],[,b]) => b.total-a.total).slice(0, 5);
  }, [rows, profileCol, statusCol, optMap]);

  // Lead priority tiers
  const tierBreakdown = useMemo(() => {
    const b = { high: 0, medium: 0, low: 0 };
    for (const r of priorityRecords) {
      if (r.tier === 'High Tier') b.high++;
      else if (r.tier === 'Medium Tier') b.medium++;
      else b.low++;
    }
    return b;
  }, [priorityRecords]);

  // Transactions stats
  const txStats = useMemo(() => {
    const amountCol = txCols.find(c => /amount/i.test(c.name) && !/connect/i.test(c.name));
    const typeCol   = txCols.find(c => /transaction\s*type|^type$/i.test(c.name));
    const txOptMap: Record<string, Record<string,string>> = {};
    for (const col of txCols) {
      if (col.type === 'dropdown' && col.options) {
        txOptMap[col.id] = {};
        for (const opt of col.options as {id:string;label:string}[]) txOptMap[col.id][opt.id] = opt.label;
      }
    }
    let income = 0, expense = 0;
    for (const row of txRows) {
      if (!amountCol) continue;
      const amt = Math.abs(parseFloat((row.data[amountCol.id]??'').replace(/[^0-9.-]/g,''))||0);
      if (typeCol) {
        const label = (txOptMap[typeCol.id]?.[row.data[typeCol.id]??''] ?? row.data[typeCol.id] ?? '').toLowerCase();
        if (/income|earn|credit/.test(label)) income += amt; else expense += amt;
      } else { income += amt; }
    }
    return { income, expense, balance: income - expense, total: txRows.length };
  }, [txRows, txCols]);

  // Recent 5 proposals
  const recentRows = useMemo(() => rows.slice(0, 5), [rows]);

  const hiredCount = statusBreakdown['Hired'] ?? 0;

  // ── Win Revenue from Lead Analysis ──────────────────────────────────────
  // ── Active leads from Lead Analysis ──────────────────────────────────────
  const leadStatusCol = useMemo(() =>
    laColumns.find(c => c.name.toLowerCase().includes('lead status') || c.name.toLowerCase() === 'lead status'),
    [laColumns]
  );

  const laOptMap = useMemo(() => {
    const map: Record<string, Record<string,string>> = {};
    for (const col of laColumns) {
      if (col.type === 'dropdown' && col.options) {
        map[col.id] = {};
        for (const opt of col.options as {id:string;label:string}[]) map[col.id][opt.id] = opt.label;
      }
    }
    return map;
  }, [laColumns]);

  const activeLeads = useMemo(() => {
    if (!leadStatusCol) return [];
    return laMergedRows.filter(row => {
      const val = row.data[leadStatusCol.id] ?? '';
      const label = laOptMap[leadStatusCol.id]?.[val] ?? val;
      return label.toLowerCase() === 'active';
    });
  }, [laMergedRows, leadStatusCol, laOptMap]);

  const leadStatusBreakdown = useMemo(() => {
    if (!leadStatusCol) return {};
    const b: Record<string, number> = {};
    for (const row of laMergedRows) {
      const val = row.data[leadStatusCol.id] ?? '';
      const label = (laOptMap[leadStatusCol.id]?.[val] ?? val) || 'Unknown';
      if (label && label !== 'Unknown') b[label] = (b[label] ?? 0) + 1;
    }
    return b;
  }, [laMergedRows, leadStatusCol, laOptMap]);

  // Get a display name column from LA (first text column that's not a date)
  const laNameCol = useMemo(() =>
    laColumns.find(c => c.type === 'text' && !/date/i.test(c.name)),
    [laColumns]
  );

  return (
    <div className="space-y-5 w-full">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl p-6"
        style={{ background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 60%, #3b82f6 100%)', boxShadow: '0 4px 20px rgba(37,99,235,0.3)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white opacity-5" />
        <div className="absolute -bottom-8 right-16 w-32 h-32 rounded-full bg-white opacity-5" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-blue-200 text-sm font-medium mb-1">Dashboard — Live Overview</p>
            <h2 className="text-white text-2xl font-bold mb-1" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Lead Tracker</h2>
            <p className="text-blue-100 text-sm">Real-time data across all modules.</p>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-center">
              <p className="text-white text-2xl font-bold" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>{rows.length.toLocaleString()}</p>
              <p className="text-blue-200 text-xs">Total Proposals</p>
            </div>
            <div className="w-px h-10 bg-blue-400 opacity-30" />
            <div className="text-center">
              <p className="text-white text-2xl font-bold" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>{hiredCount}</p>
              <p className="text-blue-200 text-xs">Hired</p>
            </div>
            <div className="w-px h-10 bg-blue-400 opacity-30" />
            <div className="text-center">
              <p className="text-white text-2xl font-bold" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>{todoStats.active}</p>
              <p className="text-blue-200 text-xs">Open Tasks</p>
            </div>
            <div className="w-px h-10 bg-blue-400 opacity-30" />
            <div className="text-center">
              <p className="text-white text-2xl font-bold" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>{priorityRecords.length}</p>
              <p className="text-blue-200 text-xs">Scored Leads</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {[
          { label: 'Total Proposals', value: rows.length.toLocaleString(), icon: <FileText size={16}/>, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
          { label: 'This Month', value: thisMonthCount.toLocaleString(), sub: monthlyTrend !== 0 ? `${monthlyTrend > 0 ? '+' : ''}${monthlyTrend}% vs last month` : 'vs last month', icon: <Activity size={16}/>, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
          { label: 'Hired', value: hiredCount.toLocaleString(), sub: rows.length > 0 ? `${Math.round((hiredCount/rows.length)*100)}% hire rate` : '', icon: <Target size={16}/>, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
          { label: 'Scored Leads', value: priorityRecords.length.toLocaleString(), sub: `${tierBreakdown.high} high tier`, icon: <Star size={16}/>, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
          { label: 'Open Tasks', value: todoStats.active.toLocaleString(), sub: `${todoStats.high} high priority`, icon: <CheckSquare size={16}/>, color: todoStats.high > 0 ? 'text-red-500' : 'text-slate-600', bg: todoStats.high > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100' },
        ].map(({ label, value, sub, icon, color, bg }) => (
          <div key={label} className={`${bg} border rounded-2xl p-4`} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className={`flex items-center gap-1.5 mb-2 ${color}`}>{icon}<span className="text-xs font-bold uppercase tracking-wide">{label}</span></div>
            <p className="text-2xl font-bold text-slate-800 leading-none" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left: Funnel + chart ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Funnel breakdown */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Proposal Funnel</h3>
              <span className="text-xs text-slate-400">{rows.length} total</span>
            </div>
            <div className="space-y-2.5">
              {FUNNEL.map((stage, stageIdx) => {
                // Cumulative: count everyone at this stage OR beyond (funnel logic)
                const count = FUNNEL.slice(stageIdx).reduce((sum, s) => sum + (statusBreakdown[s] ?? 0), 0);
                const pct   = rows.length > 0 ? Math.round((count / rows.length) * 100) : 0;
                const style = getFunnelStatusStyle(stage);
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${style.full}`}>{stage}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-bold text-slate-800">{count}</span>
                        <span className="text-slate-300">·</span>
                        <span>{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${pct}%`, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monthly submissions chart */}
          {monthlyData.some(v => v > 0) && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Monthly Submissions</h3>
                <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${monthlyTrend >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'}`}>
                  {monthlyTrend >= 0 ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
                  {monthlyTrend > 0 ? '+' : ''}{monthlyTrend}% this month
                </div>
              </div>
              <div className="flex items-end gap-1.5 h-20">
                {monthlyData.map((v, i) => {
                  const max = Math.max(...monthlyData, 1);
                  const pct = (v / max) * 100;
                  const mo  = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
                  const label = mo.toLocaleDateString('en', { month: 'short' });
                  const isThis = i === 5;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end justify-center" style={{ height: 60 }}>
                        <div className={`w-full rounded-t-md transition-all ${isThis ? 'bg-blue-500' : 'bg-slate-200'}`}
                          style={{ height: `${Math.max(4, pct)}%` }} title={`${v} submissions`} />
                      </div>
                      <span className="text-xs text-slate-400">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transactions summary */}
          {txStats.total > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <h3 className="text-sm font-bold text-slate-800 mb-4" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Transactions Summary</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Income', val: txStats.income, color: 'text-emerald-600' },
                  { label: 'Total Expense', val: txStats.expense, color: 'text-red-500' },
                  { label: 'Net Balance', val: txStats.balance, color: txStats.balance >= 0 ? 'text-blue-600' : 'text-red-500' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center p-3 bg-slate-50 rounded-xl">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className={`text-sm font-bold ${color}`} style={{ fontFamily:"'Space Grotesk',sans-serif" }}>{fmt(val)}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3 text-center">{txStats.total.toLocaleString()} total transactions</p>
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          {/* Lead priority tiers */}
          {priorityRecords.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <h3 className="text-sm font-bold text-slate-800 mb-3" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Lead Priority Tiers</h3>
              <div className="space-y-2">
                {[
                  { label: 'High Tier', count: tierBreakdown.high, color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
                  { label: 'Medium Tier', count: tierBreakdown.medium, color: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50' },
                  { label: 'Low Tier', count: tierBreakdown.low, color: 'bg-slate-300', text: 'text-slate-600', bg: 'bg-slate-50' },
                ].map(({ label, count, color, text, bg }) => (
                  <div key={label} className={`flex items-center justify-between px-3 py-2 ${bg} rounded-xl`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${color}`} />
                      <span className="text-xs font-medium text-slate-700">{label}</span>
                    </div>
                    <span className={`text-sm font-bold ${text}`}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Top SDRs */}
          {topSDRs.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <h3 className="text-sm font-bold text-slate-800 mb-3" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Top SDRs</h3>
              <div className="space-y-2.5">
                {topSDRs.map(([name, count], i) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                    <span className="flex-1 text-xs text-slate-700 truncate">{name}</span>
                    <span className="text-xs font-bold text-slate-800">{count}</span>
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round((count/topSDRs[0][1])*100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top profiles */}
          {topProfiles.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <h3 className="text-sm font-bold text-slate-800 mb-3" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Top Profiles</h3>
              <div className="space-y-2.5">
                {topProfiles.map(([name, data], i) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                    <span className="flex-1 text-xs text-slate-700 truncate">{name}</span>
                    <span className="text-xs text-slate-400">{data.total}</span>
                    {data.hired > 0 && <span className="text-xs font-bold text-emerald-600">{data.hired}✓</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open todos */}
          {todoStats.active > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <h3 className="text-sm font-bold text-slate-800 mb-3" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Open Tasks</h3>
              <div className="space-y-2">
                {todos.filter(t => !t.completed).slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-start gap-2">
                    <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${t.priority==='high'?'bg-red-400':t.priority==='medium'?'bg-amber-400':'bg-slate-300'}`} />
                    <span className="text-xs text-slate-700 line-clamp-1">{t.text}</span>
                  </div>
                ))}
                {todoStats.active > 5 && <p className="text-xs text-slate-400 pt-1">+{todoStats.active - 5} more tasks</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Active Leads ── */}
      {activeLeads.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Active Leads</h3>
              <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">{activeLeads.length}</span>
            </div>
            <div className="flex items-center gap-3">
              {Object.entries(leadStatusBreakdown).map(([label, count]) => {
                const color = label.toLowerCase() === 'active' ? 'bg-emerald-100 text-emerald-700'
                  : label.toLowerCase() === 'lost' ? 'bg-red-100 text-red-600'
                  : label.toLowerCase() === 'won' ? 'bg-blue-100 text-blue-700'
                  : label.toLowerCase() === 'doubtful' ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-600';
                return (
                  <span key={label} className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
                    {label}: {count}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {activeLeads.slice(0, 10).map(row => {
              const name = laNameCol ? (row.data[laNameCol.id] ?? '') : '';
              const priority = priorityRecords.find(r => r.unique_id === row.uniqueId);
              const tierColor = priority?.tier === 'High Tier' ? 'bg-emerald-100 text-emerald-700'
                : priority?.tier === 'Medium Tier' ? 'bg-amber-100 text-amber-700'
                : priority ? 'bg-slate-100 text-slate-500' : '';
              return (
                <div key={row.uniqueId} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                  <span className="text-xs font-mono font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded flex-shrink-0">{row.uniqueId}</span>
                  {name && <span className="flex-1 text-xs text-slate-700 truncate font-medium">{name}</span>}
                  <span className="text-xs text-slate-400 hidden sm:block">{row.currentStatus}</span>
                  {priority && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded flex-shrink-0 ${tierColor}`}>
                      {priority.tier.replace(' Tier','')} · {priority.score > 0 ? `+${priority.score}` : priority.score}
                    </span>
                  )}
                  <span className="w-2 h-2 bg-emerald-400 rounded-full flex-shrink-0" />
                </div>
              );
            })}
          </div>
          {activeLeads.length > 10 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400">+{activeLeads.length - 10} more active leads — view in Lead Analysis</p>
            </div>
          )}
        </div>
      )}

      {/* Recent proposals */}
      {recentRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Recent Proposals</h3>
            <span className="text-xs text-slate-400">{rows.length} total</span>
          </div>
          <div className="divide-y divide-slate-50">
            {recentRows.map(row => {
              const status = statusCol ? resolve(statusCol.id, row.data[statusCol.id]??'') : '';
              const sdr    = sdrCol    ? resolve(sdrCol.id,    row.data[sdrCol.id]??'')    : '';
              const date   = dateCol   ? row.data[dateCol.id] ?? ''                        : '';
              const style  = status ? getFunnelStatusStyle(status) : null;
              // Get first text column as title
              const titleCol = columns.find(c => c.type === 'text' && c.id !== dateCol?.id);
              const title = titleCol ? row.data[titleCol.id] ?? '' : '';
              return (
                <div key={row.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                  <span className="text-xs font-mono font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded flex-shrink-0">{row.display_id || '—'}</span>
                  <span className="flex-1 text-xs text-slate-700 truncate">{title || '—'}</span>
                  {sdr    && <span className="text-xs text-slate-400 truncate max-w-20 hidden sm:block">{sdr}</span>}
                  {date   && <span className="text-xs text-slate-400 flex-shrink-0 hidden md:block">{date}</span>}
                  {style && status && <span className={`text-xs font-medium px-2 py-0.5 rounded-md flex-shrink-0 ${style.full}`}>{status}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && txStats.total === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 gap-3">
          <AlertCircle size={36} className="text-slate-200" />
          <p className="text-sm font-semibold text-slate-500">No data yet</p>
          <p className="text-xs text-slate-400">Start by adding rows in Proposal Details or Transactions</p>
        </div>
      )}
    </div>
  );
};
