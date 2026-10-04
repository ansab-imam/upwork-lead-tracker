import { logActivity } from './useActivityLog';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { calcScore, getTier } from '../types/leadPriority';
import type { LeadPriorityRecord } from '../types/leadPriority';

const TABLE = 'lead_priority_records';
const uid   = () => `lp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const bg    = (p: PromiseLike<unknown>) => Promise.resolve(p).catch(e => console.error('LP error:', e));

// Map Supabase row → LeadPriorityRecord (handles both snake_case and camelCase)
function fromDb(r: any): LeadPriorityRecord {
  return {
    id:                r.id,
    unique_id:         r.unique_id,
    selected_criteria: Array.isArray(r.selected_criteria) ? r.selected_criteria : (JSON.parse(r.selected_criteria ?? '[]')),
    score:             r.score ?? 0,
    tier:              r.tier ?? 'Low Tier',
    created_at:        r.created_at,
    updated_at:        r.updated_at,
  };
}

export function useLeadPriority() {
  const [records, setRecords] = useState<LeadPriorityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load from Supabase ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select('*')
          .order('created_at', { ascending: false });
        // Silently ignore if table doesn't exist yet
        if (error && error.code === '42P01') {
          console.warn('lead_priority_records table not created yet');
          return;
        }
        if (error) throw error;
        setRecords((data ?? []).map(fromDb));
      } catch (e) {
        console.warn('Lead priority load failed (non-critical):', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Realtime ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`lp_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') {
            const r = fromDb(n);
            setRecords(prev => prev.find(x => x.id === r.id) ? prev : [r, ...prev]);
          }
          if (eventType === 'UPDATE') {
            const r = fromDb(n);
            setRecords(prev => prev.map(x => x.id === r.id ? r : x));
          }
          if (eventType === 'DELETE') {
            const r = o as { id: string };
            setRecords(prev => prev.filter(x => x.id !== r.id));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Save / update ─────────────────────────────────────────────────────────
  const saveRecord = useCallback(async (uniqueId: string, selectedCriteria: string[]) => {
    const score = calcScore(selectedCriteria);
    const tier  = getTier(score);
    const now   = new Date().toISOString();
    const existing = records.find(r => r.unique_id === uniqueId);

    if (existing) {
      const updated: LeadPriorityRecord = {
        ...existing,
        selected_criteria: selectedCriteria,
        score, tier,
        updated_at: now,
      };
      setRecords(prev => prev.map(r => r.id === existing.id ? updated : r));
      await supabase.from(TABLE)
        .update({ selected_criteria: selectedCriteria, score, tier, updated_at: now })
        .eq('id', existing.id);
      logActivity('updated', 'Lead Prioritization', uniqueId, `Updated lead score for ${uniqueId}: ${tier}, score ${score}`);
      return updated;
    } else {
      const record: LeadPriorityRecord = {
        id: uid(),
        unique_id:         uniqueId,
        selected_criteria: selectedCriteria,
        score, tier,
        created_at: now,
        updated_at: now,
      };
      setRecords(prev => [record, ...prev]);
      const { error } = await supabase.from(TABLE).insert({
        id:                record.id,
        unique_id:         record.unique_id,
        selected_criteria: record.selected_criteria,
        score:             record.score,
        tier:              record.tier,
        created_at:        record.created_at,
        updated_at:        record.updated_at,
      });
      if (error) {
        console.error('Failed to save priority record:', error);
        throw error;
      }
      logActivity('created', 'Lead Prioritization', uniqueId, `Scored lead ${uniqueId}: ${tier}, score ${score}`);
      return record;
    }
  }, [records]);

  const deleteRecord = useCallback(async (id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
    const _rec = records.find(r=>r.id===id);
    if(_rec) logActivity('deleted', 'Lead Prioritization', _rec.unique_id, `Deleted priority record for ${_rec.unique_id}`);
    bg(supabase.from(TABLE).delete().eq('id', id));
  }, []);

  const getByUniqueId = useCallback((uniqueId: string) =>
    records.find(r => r.unique_id === uniqueId) ?? null,
    [records]
  );

  return { records, loading, saveRecord, deleteRecord, getByUniqueId };
}
