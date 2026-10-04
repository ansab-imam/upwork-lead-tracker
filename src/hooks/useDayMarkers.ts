import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import type { DayMarker, MarkerType } from '../components/reporting/LineChart';

// Markers used to live only in each browser's localStorage. They are now
// shared via the day_markers table; any old local markers are copied up once.
const LS_KEY = 'leadtracker_day_markers_v1';

function loadLocal(): Record<string, DayMarker> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); } catch { return {}; }
}

export function useDayMarkers() {
  const [markers, setMarkers] = useState<Record<string, DayMarker>>({});

  const fetchMarkers = useCallback(async () => {
    const { data, error } = await supabase.from('day_markers').select('date, type, note');
    if (error || !data) return;
    const next: Record<string, DayMarker> = {};
    for (const r of data) next[r.date] = { date: r.date, type: r.type as MarkerType, note: r.note ?? '' };
    setMarkers(next);
  }, []);

  useEffect(() => {
    (async () => {
      // One-time move of this browser's old markers into the database.
      // Existing database entries win, so nothing already shared is overwritten.
      const local = Object.values(loadLocal());
      if (local.length) {
        const { error } = await supabase.from('day_markers').upsert(
          local.map(m => ({ date: m.date, type: m.type, note: m.note ?? '' })),
          { onConflict: 'date', ignoreDuplicates: true },
        );
        if (!error) { try { localStorage.removeItem(LS_KEY); } catch {} }
      }
      await fetchMarkers();
    })();

    const channel = supabase
      .channel('day_markers_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_markers' }, () => { fetchMarkers(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMarkers]);

  const setMarker = useCallback(async (date: string, type: MarkerType, note: string) => {
    setMarkers(prev => ({ ...prev, [date]: { date, type, note } }));
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('day_markers').upsert(
      { date, type, note, updated_at: new Date().toISOString(), updated_by: user?.id ?? null },
      { onConflict: 'date' },
    );
    if (error) fetchMarkers();
  }, [fetchMarkers]);

  const deleteMarker = useCallback(async (date: string) => {
    setMarkers(prev => { const n = { ...prev }; delete n[date]; return n; });
    const { error } = await supabase.from('day_markers').delete().eq('date', date);
    if (error) fetchMarkers();
  }, [fetchMarkers]);

  return { markers, setMarker, deleteMarker };
}
