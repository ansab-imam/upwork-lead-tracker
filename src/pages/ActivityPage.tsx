import React, { useMemo, useState } from 'react';
import { Activity, Filter, ChevronLeft, ChevronRight, X, TrendingUp, Users, Clock, Zap } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { useActivityLog } from '../hooks/useActivityLog';
import type { ActivityModule, ActivityAction } from '../hooks/useActivityLog';

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins  = Math.floor(diff/60000);
  const hours = Math.floor(diff/3600000);
  const days  = Math.floor(diff/86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
};

const fmtFull = (iso: string) => new Date(iso).toLocaleString('en-GB', {
  day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
});

const ACTION_CONFIG: Record<ActivityAction, { label: string; color: string; bg: string }> = {
  created:        { label: 'Created',        color: 'text-emerald-700', bg: 'bg-emerald-100' },
  updated:        { label: 'Updated',        color: 'text-blue-700',    bg: 'bg-blue-100'    },
  deleted:        { label: 'Deleted',        color: 'text-red-700',     bg: 'bg-red-100'     },
  status_changed: { label: 'Status Changed', color: 'text-violet-700',  bg: 'bg-violet-100'  },
  assigned:       { label: 'Assigned',       color: 'text-cyan-700',    bg: 'bg-cyan-100'    },
  commented:      { label: 'Commented',      color: 'text-slate-700',   bg: 'bg-slate-100'   },
  imported:       { label: 'Imported',       color: 'text-amber-700',   bg: 'bg-amber-100'   },
  exported:       { label: 'Exported',       color: 'text-amber-700',   bg: 'bg-amber-100'   },
  signed_in:      { label: 'Signed In',      color: 'text-teal-700',    bg: 'bg-teal-100'    },
  signed_out:     { label: 'Signed Out',     color: 'text-slate-600',   bg: 'bg-slate-100'   },
};

const MODULE_COLORS: Record<ActivityModule, string> = {
  'Proposals':          'text-blue-600',
  'Lead Analysis':      'text-violet-600',
  'Lead Prioritization':'text-amber-600',
  'Transactions':       'text-emerald-600',
  'Tasks':              'text-cyan-600',
  'Notes':              'text-pink-600',
  'Todos':              'text-orange-600',
  'Users':              'text-red-600',
  'System':             'text-slate-500',
};

const MODULES: ActivityModule[] = ['Proposals','Lead Analysis','Lead Prioritization','Transactions','Tasks','Notes','Todos','Users','System'];
const ACTIONS: ActivityAction[] = ['created','updated','deleted','status_changed','assigned','commented','imported','exported','signed_in','signed_out'];

export const ActivityPage: React.FC = () => {
  const {
    entries, loading, total, page, setPage, totalPages,
    moduleFilter, setModuleFilter, userFilter, setUserFilter,
    actionFilter, setActionFilter, dateFrom, setDateFrom, dateTo, setDateTo,
    allUsers, refetch,
  } = useActivityLog();

  // ── Analytics ─────────────────────────────────────────────────────────────
  const [analyticsUser, setAnalyticsUser] = useState('all');
  const [analyticsDays, setAnalyticsDays] = useState(7);

  const analyticsEntries = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - analyticsDays);
    return entries.filter(e => {
      const d = new Date(e.created_at);
      if (d < cutoff) return false;
      if (analyticsUser !== 'all' && e.user_id !== analyticsUser) return false;
      return true;
    });
  }, [entries, analyticsDays, analyticsUser]);

  // Actions per user
  const userStats = useMemo(() => {
    const map: Record<string,{name:string;count:number;lastSeen:string}> = {};
    analyticsEntries.forEach(e => {
      if (!map[e.user_id]) map[e.user_id] = { name: e.user_name, count: 0, lastSeen: e.created_at };
      map[e.user_id].count++;
      if (e.created_at > map[e.user_id].lastSeen) map[e.user_id].lastSeen = e.created_at;
    });
    return Object.values(map).sort((a,b)=>b.count-a.count);
  }, [analyticsEntries]);

  // Hourly activity heatmap (0-23)
  const hourlyStats = useMemo(() => {
    const hours = Array(24).fill(0);
    analyticsEntries.forEach(e => {
      const h = new Date(e.created_at).getHours();
      hours[h]++;
    });
    return hours;
  }, [analyticsEntries]);

  // Daily activity (last N days)
  const dailyStats = useMemo(() => {
    const days: Record<string,number> = {};
    for (let i = analyticsDays-1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      days[d.toISOString().slice(0,10)] = 0;
    }
    analyticsEntries.forEach(e => {
      const day = e.created_at.slice(0,10);
      if (day in days) days[day]++;
    });
    return Object.entries(days);
  }, [analyticsEntries, analyticsDays]);

  const maxHour  = Math.max(...hourlyStats, 1);
  const maxDay   = Math.max(...dailyStats.map(([,v])=>v), 1);
  const peakHour = hourlyStats.indexOf(Math.max(...hourlyStats));
  const totalActions = analyticsEntries.length;
  const activeHours  = hourlyStats.filter(h=>h>0).length;

  const hasFilters = moduleFilter !== 'all' || userFilter !== 'all' || actionFilter !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setModuleFilter('all'); setUserFilter('all'); setActionFilter('all');
    setDateFrom(''); setDateTo(''); setPage(1);
  };

  // Group entries by date
  const grouped = entries.reduce<Record<string, typeof entries>>((acc, e) => {
    const date = new Date(e.created_at).toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-5 w-full pb-10">
      <PageHeader
        title="Activity Log"
        subtitle={`${total.toLocaleString()} total activities across all modules`}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Activity size={14}/> Auto-refreshes every 5s
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"/>
            </div>
            <button onClick={refetch}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              ↻ Refresh Now
            </button>
          </div>
        }
      />

      {/* ── Analytics ── */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-blue-500"/>
            <h3 className="text-sm font-bold text-slate-800" style={{fontFamily:"'Space Grotesk',sans-serif"}}>Team Activity Overview</h3>
          </div>
          <div className="flex items-center gap-2">
            <select value={analyticsUser} onChange={e=>setAnalyticsUser(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none bg-white text-slate-600">
              <option value="all">All Users</option>
              {allUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {[7,14,30].map(d=>(
                <button key={d} onClick={()=>setAnalyticsDays(d)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${analyticsDays===d?'bg-white text-slate-800 shadow-sm':'text-slate-500'}`}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {label:'Total Actions', val:totalActions.toLocaleString(), icon:<Zap size={14}/>, color:'text-blue-600', bg:'bg-blue-50'},
              {label:'Active Hours', val:`${activeHours}/24`, icon:<Clock size={14}/>, color:'text-emerald-600', bg:'bg-emerald-50'},
              {label:'Peak Hour', val:totalActions>0?`${peakHour}:00–${peakHour+1}:00`:'—', icon:<TrendingUp size={14}/>, color:'text-amber-600', bg:'bg-amber-50'},
              {label:'Active Users', val:userStats.length.toString(), icon:<Users size={14}/>, color:'text-violet-600', bg:'bg-violet-50'},
            ].map(({label,val,icon,color,bg})=>(
              <div key={label} className={`${bg} rounded-xl p-3`}>
                <div className={`flex items-center gap-1.5 mb-1.5 ${color}`}>{icon}<span className="text-xs font-bold uppercase tracking-wide">{label}</span></div>
                <p className="text-xl font-bold text-slate-800" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{val}</p>
              </div>
            ))}
          </div>

          {/* Hourly heatmap */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Activity by Hour of Day</p>
            <div className="flex items-end gap-0.5 h-16">
              {hourlyStats.map((count,h)=>{
                const pct = maxHour > 0 ? (count/maxHour)*100 : 0;
                const isPeak = count === Math.max(...hourlyStats) && count > 0;
                const isActive = count > 0;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1" title={`${h}:00 — ${count} actions`}>
                    <div className="w-full flex items-end justify-center" style={{height:52}}>
                      <div
                        className={`w-full rounded-sm transition-all ${isPeak?'bg-blue-600':isActive?'bg-blue-300':'bg-slate-100'}`}
                        style={{height:`${Math.max(pct,isActive?8:4)}%`}}
                      />
                    </div>
                    <span className={`text-xs leading-none ${h%6===0?'text-slate-400':'text-transparent'}`} style={{fontSize:9}}>{h}h</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
            </div>
          </div>

          {/* Daily chart */}
          {dailyStats.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Daily Activity — Last {analyticsDays} Days</p>
              <div className="flex items-end gap-1 h-12">
                {dailyStats.map(([day, count])=>{
                  const pct = maxDay > 0 ? (count/maxDay)*100 : 0;
                  const label = new Date(day).toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-1" title={`${label}: ${count} actions`}>
                      <div className="w-full flex items-end" style={{height:40}}>
                        <div className={`w-full rounded-sm ${count>0?'bg-emerald-400':'bg-slate-100'}`}
                          style={{height:`${Math.max(pct,count>0?10:4)}%`}}/>
                      </div>
                      {analyticsDays <= 14 && <span className="text-slate-400" style={{fontSize:8}}>{label}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-user breakdown */}
          {userStats.length > 0 && analyticsUser === 'all' && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Actions per User</p>
              <div className="space-y-2">
                {userStats.map((u,i)=>(
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-blue-100 text-blue-600 text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                      {u.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-700 w-28 truncate">{u.name}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{width:`${Math.round((u.count/totalActions)*100)}%`}}/>
                    </div>
                    <span className="text-xs font-bold text-slate-600 w-16 text-right">{u.count} actions</span>
                    <span className="text-xs text-slate-400 w-20 text-right hidden sm:block" title={fmtFull(u.lastSeen)}>
                      {fmtTime(u.lastSeen)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4"   style={{ boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mr-1">
            <Filter size={12}/> Filter by
          </div>

          <select value={moduleFilter} onChange={e=>{ setModuleFilter(e.target.value as any); setPage(1); }}
            className={`border rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer bg-white ${moduleFilter!=='all'?'border-blue-300 text-blue-600':'border-slate-200 text-slate-600'}`}>
            <option value="all">All Modules</option>
            {MODULES.map(m=><option key={m} value={m}>{m}</option>)}
          </select>

          <select value={userFilter} onChange={e=>{ setUserFilter(e.target.value); setPage(1); }}
            className={`border rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer bg-white ${userFilter!=='all'?'border-blue-300 text-blue-600':'border-slate-200 text-slate-600'}`}>
            <option value="all">All Users</option>
            {allUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>

          <select value={actionFilter} onChange={e=>{ setActionFilter(e.target.value as any); setPage(1); }}
            className={`border rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer bg-white ${actionFilter!=='all'?'border-blue-300 text-blue-600':'border-slate-200 text-slate-600'}`}>
            <option value="all">All Actions</option>
            {ACTIONS.map(a=><option key={a} value={a}>{ACTION_CONFIG[a].label}</option>)}
          </select>

          <div className="flex items-center gap-1">
            <input type="date" value={dateFrom} onChange={e=>{ setDateFrom(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-blue-400"/>
            <span className="text-slate-400 text-xs">to</span>
            <input type="date" value={dateTo} onChange={e=>{ setDateTo(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-blue-400"/>
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 px-2 transition-colors">
              <X size={12}/> Clear
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">{total.toLocaleString()} entries</span>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center h-40 gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
          <span className="text-sm text-slate-400">Loading activity...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white rounded-2xl border border-slate-100">
          <Activity size={36} className="text-slate-200"/>
          <p className="text-sm font-semibold text-slate-400">No activity yet</p>
          <p className="text-xs text-slate-300">Actions across all modules will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dayEntries]) => (
            <div key={date}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">{date}</span>
                <div className="flex-1 h-px bg-slate-100"/>
                <span className="text-xs text-slate-400">{dayEntries.length} actions</span>
              </div>

              {/* Entries */}
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                {dayEntries.map((e, i) => {
                  const ac = ACTION_CONFIG[e.action];
                  const mc = MODULE_COLORS[e.module];
                  return (
                    <div key={e.id} className={`flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50 ${i>0?'border-t border-slate-50':''}`}>
                      {/* Avatar */}
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
                        {e.user_name[0]?.toUpperCase()}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-sm font-semibold text-slate-800">{e.user_name}</span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ac.bg} ${ac.color}`}>{ac.label}</span>
                              <span className={`text-xs font-medium ${mc}`}>{e.module}</span>
                            </div>
                            <p className="text-sm text-slate-600 leading-snug">{e.detail}</p>
                            {e.target && <p className="text-xs text-slate-400 mt-0.5 font-medium">{e.target}</p>}
                          </div>
                          <span className="text-xs text-slate-400 flex-shrink-0 mt-0.5" title={fmtFull(e.created_at)}>
                            {fmtTime(e.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
            className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronLeft size={14}/> Previous
          </button>
          <span className="text-sm text-slate-500">Page <strong>{page}</strong> of <strong>{totalPages}</strong></span>
          <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
            className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
            Next <ChevronRight size={14}/>
          </button>
        </div>
      )}
    </div>
  );
};
