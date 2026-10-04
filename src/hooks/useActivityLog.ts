import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';

export type ActivityAction =
  | 'created' | 'updated' | 'deleted'
  | 'status_changed' | 'assigned' | 'commented'
  | 'imported' | 'exported' | 'signed_in' | 'signed_out';

export type ActivityModule =
  | 'Proposals' | 'Lead Analysis' | 'Lead Prioritization'
  | 'Transactions' | 'Tasks' | 'Notes' | 'Todos' | 'Users' | 'System';

export interface ActivityEntry {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  action: ActivityAction;
  module: ActivityModule;
  target: string;
  detail: string;
  created_at: string;
}

// ── Singleton user context ─────────────────────────────────────────────────
const _user = { id: '', name: '', email: '' };

export function setActivityUser(id: string, name: string, email: string) {
  _user.id = id;
  _user.name = name;
  _user.email = email;
}

// ── Core log function ──────────────────────────────────────────────────────
export function logActivity(
  action: ActivityAction,
  module: ActivityModule,
  target: string,
  detail: string,
) {
  // If user not set, try to get from Supabase session synchronously via cache
  if (!_user.id) return; // don't log if not authenticated

  const entry: ActivityEntry = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id:    _user.id,
    user_name:  _user.name,
    user_email: _user.email,
    action,
    module,
    target,
    detail,
    created_at: new Date().toISOString(),
  };

  // Insert — fire and don't block UI
  supabase.from('activity_log').insert(entry).then(({ error }) => {
    if (error) {
      console.error('[Activity] Failed to log:', error.message, { action, module, detail, user: _user.name });
    }
  });
}

// ── Hook for Activity Log page ─────────────────────────────────────────────
const PER_PAGE = 50;

export function useActivityLog() {
  const [entries,      setEntries]      = useState<ActivityEntry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [moduleFilter, setModuleFilter] = useState<ActivityModule | 'all'>('all');
  const [userFilter,   setUserFilter]   = useState('all');
  const [actionFilter, setActionFilter] = useState<ActivityAction | 'all'>('all');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [allUsers,     setAllUsers]     = useState<{ id: string; name: string }[]>([]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('activity_log').select('*', { count: 'exact' });
      if (moduleFilter !== 'all') q = q.eq('module', moduleFilter);
      if (userFilter   !== 'all') q = q.eq('user_id', userFilter);
      if (actionFilter !== 'all') q = q.eq('action', actionFilter);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59');
      const { data, count, error } = await q
        .order('created_at', { ascending: false })
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
      if (error) console.error('Activity fetch error:', error.message);
      if (data)  setEntries(data as ActivityEntry[]);
      if (count !== null) setTotal(count);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [moduleFilter, userFilter, actionFilter, dateFrom, dateTo, page]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Load all users for filter dropdown
  useEffect(() => {
    supabase.from('user_profiles').select('id, full_name').then(({ data }) => {
      if (data) setAllUsers(data.map((u: any) => ({ id: u.id, name: u.full_name })));
    });
  }, []);

  // Realtime — pick up inserts from ALL users instantly
  useEffect(() => {
    const ch = supabase
      .channel(`activity_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' },
        ({ new: n }) => {
          const r = n as ActivityEntry;
          const matchesModule = moduleFilter === 'all' || r.module === moduleFilter;
          const matchesUser   = userFilter   === 'all' || r.user_id === userFilter;
          const matchesAction = actionFilter === 'all' || r.action === actionFilter;
          if (page === 1 && matchesModule && matchesUser && matchesAction) {
            setEntries(p => p.find(x => x.id === r.id) ? p : [r, ...p].slice(0, PER_PAGE));
            setTotal(t => t + 1);
          }
        })
      .subscribe();

    // Polling fallback every 10s for entries that miss realtime
    const poll = setInterval(fetchEntries, 30000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [page, moduleFilter, userFilter, actionFilter, fetchEntries]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return {
    entries, loading, total, page, setPage, totalPages,
    moduleFilter, setModuleFilter,
    userFilter, setUserFilter,
    actionFilter, setActionFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    allUsers,
    refetch: fetchEntries,
  };
}
