import { logActivity } from './useActivityLog';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

export interface MergedRow { uniqueId: string; data: Record<string, string>; currentStatus: string; }
import { supabase } from '../utils/supabase';
import type { LAColumn, LARow } from '../types/leadAnalysis';
import { LA_QUALIFYING_STAGES } from '../types/leadAnalysis';
import type { Column, Row } from '../types/proposals';

const uid = (p = 'id') => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
function bg(p: PromiseLike<unknown>) { Promise.resolve(p).catch(() => {}); }

function detectStatusCol(cols: Column[]): Column | null {
  const byName = cols.find(c => c.type === 'dropdown' && c.name.toLowerCase().includes('status'));
  if (byName) return byName;
  return cols.find(c => {
    if (c.type !== 'dropdown' || !c.options) return false;
    const labels = c.options.map((o: any) => o.label.toLowerCase());
    return LA_QUALIFYING_STAGES.filter(s => labels.includes(s)).length >= 2;
  }) ?? null;
}

export function useLeadAnalysis(proposalColumns: Column[], proposalRows: Row[]) {
  // ── All useState first ───────────────────────────────────────────────────
  const [laColumns,  setLaColumns]  = useState<LAColumn[]>([]);
  const [laRows,     setLaRows]     = useState<LARow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [syncStatus, setSyncStatus] = useState('');
  const localRowInserts = useRef<Set<string>>(new Set());
  const localRowUpdates = useRef<Set<string>>(new Set());

  // ── All useMemo ─────────────────────────────────────────────────────────
  const statusCol = useMemo(() => detectStatusCol(proposalColumns), [proposalColumns]);

  const optionLabelMap = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const col of proposalColumns) {
      if (col.type === 'dropdown' && col.options) {
        map[col.id] = {};
        for (const opt of col.options as {id:string;label:string}[]) {
          map[col.id][opt.id] = opt.label;
        }
      }
    }
    return map;
  }, [proposalColumns]);

  const proposalRowByUniqueId = useMemo(() => {
    const map: Record<string, Row> = {};
    for (const row of proposalRows) { if (row.display_id) map[row.display_id] = row; }
    return map;
  }, [proposalRows]);

  const mergedRows = useMemo(() => {
    return laRows.map(laRow => {
      const proposalRow = proposalRowByUniqueId[laRow.uniqueId];
      const merged: Record<string, string> = {};
      for (const col of laColumns) {
        if (col.source === 'linked' && col.linkedColId && proposalRow) {
          const rawValue = proposalRow.data[col.linkedColId] ?? '';
          const labelMap = optionLabelMap[col.linkedColId];
          merged[col.id] = labelMap ? (labelMap[rawValue] ?? rawValue) : rawValue;
        } else if (col.source === 'local') {
          merged[col.id] = laRow.localData[col.id] ?? '';
        }
      }
      const currentStatus = proposalRow && statusCol
        ? ((statusCol.options as any[])?.find((o: any) => o.id === proposalRow.data[statusCol.id])?.label ?? '')
        : '';
      return { uniqueId: laRow.uniqueId, data: merged, currentStatus };
    });
  }, [laRows, laColumns, proposalRowByUniqueId, statusCol, optionLabelMap]);

  // ── All useCallback ─────────────────────────────────────────────────────
  const toDb = useCallback((col: LAColumn) => ({
    id: col.id, name: col.name, source: col.source,
    linked_col_id: col.linkedColId ?? null, type: col.type,
    options: col.options ?? null, width: col.width, order: col.order,
  }), []);

  const syncLeads = useCallback(async () => {
    if (proposalRows.length === 0 || !statusCol) return;
    setSyncStatus('Syncing...');
    try {
      const optionMap: Record<string, string> = {};
      for (const opt of (statusCol.options ?? []) as any[]) {
        optionMap[opt.id] = opt.label;
        optionMap[opt.label.toLowerCase()] = opt.label;
      }
      const qualifyingIds: string[] = [];
      for (const row of proposalRows) {
        const val = row.data[statusCol.id] ?? '';
        if (!val) continue;
        const label = optionMap[val] ?? optionMap[val.toLowerCase()] ?? val;
        if (LA_QUALIFYING_STAGES.includes(label.toLowerCase()) && row.display_id) {
          qualifyingIds.push(row.display_id);
        }
      }
      if (qualifyingIds.length === 0) { setSyncStatus(''); return; }

      const { data: existing } = await supabase.from('la_rows').select('unique_id, local_data, created_at');
      const existingMap: Record<string, any> = {};
      for (const r of existing ?? []) existingMap[r.unique_id] = r;

      const toAdd = qualifyingIds.filter(id => !existingMap[id])
        .map(id => ({ unique_id: id, local_data: {}, created_at: new Date().toISOString() }));

      const allLaRows: LARow[] = qualifyingIds.map(id =>
        existingMap[id]
          ? { uniqueId: id, localData: existingMap[id].local_data ?? {}, createdAt: existingMap[id].created_at }
          : { uniqueId: id, localData: {}, createdAt: new Date().toISOString() }
      ).sort((a, b) => parseInt(b.uniqueId.replace('UP',''),10) - parseInt(a.uniqueId.replace('UP',''),10));

      // Update state immediately (optimistic) then sync to Supabase in background
      setLaRows(allLaRows);
      if (toAdd.length > 0) { const p = supabase.from('la_rows').insert(toAdd); Promise.resolve(p).catch(() => {}); }
      setSyncStatus(`${qualifyingIds.length} leads`);
      setTimeout(() => setSyncStatus(''), 2000);
    } catch (e) { console.warn('syncLeads error:', e); setSyncStatus(''); }
  }, [proposalRows, statusCol]);

  const addLinkedColumn = useCallback((name: string, linkedColId: string, type: LAColumn['type']) => {
    const maxOrder = laColumns.length > 0 ? Math.max(...laColumns.map(c => c.order)) : -1;
    const newCol: LAColumn = { id: uid('lac'), name, source: 'linked', linkedColId, type, options: null, width: 180, order: maxOrder + 1 };
    setLaColumns(prev => [...prev, newCol].sort((a, b) => a.order - b.order));
    bg(supabase.from('la_columns').insert(toDb(newCol)));
  }, [laColumns, toDb]);

  const addLocalColumn = useCallback((name: string, type: LAColumn['type'], options: {label:string;color:string}[] = []) => {
    const maxOrder = laColumns.length > 0 ? Math.max(...laColumns.map(c => c.order)) : -1;
    const newCol: LAColumn = { id: uid('lac'), name, source: 'local', type, options: type === 'dropdown' ? options.map(o => ({ id: uid('opt'), ...o })) : null, width: 180, order: maxOrder + 1 };
    setLaColumns(prev => [...prev, newCol].sort((a, b) => a.order - b.order));
    bg(supabase.from('la_columns').insert(toDb(newCol)));
  }, [laColumns, toDb]);

  const deleteColumn = useCallback((colId: string) => {
    setLaColumns(prev => prev.filter(c => c.id !== colId));
    setLaRows(prev => prev.map(r => { const { [colId]: _, ...rest } = r.localData; return { ...r, localData: rest }; }));
    bg(supabase.from('la_columns').delete().eq('id', colId));
  }, []);

  const renameColumn = useCallback((colId: string, name: string) => {
    setLaColumns(prev => prev.map(c => c.id === colId ? { ...c, name } : c));
    bg(supabase.from('la_columns').update({ name }).eq('id', colId));
  }, []);

  const resizeColumn = useCallback((colId: string, width: number) => {
    setLaColumns(prev => prev.map(c => c.id === colId ? { ...c, width: Math.max(80, width) } : c));
    bg(supabase.from('la_columns').update({ width: Math.max(80, width) }).eq('id', colId));
  }, []);

  const updateColumnOptions = useCallback((colId: string, options: LAColumn['options']) => {
    setLaColumns(prev => prev.map(c => c.id === colId ? { ...c, options } : c));
    bg(supabase.from('la_columns').update({ options }).eq('id', colId));
  }, []);

  const reorderColumns = useCallback((sourceId: string, targetId: string, position: 'before' | 'after') => {
    setLaColumns(prev => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const without = sorted.filter(c => c.id !== sourceId);
      const targetIdx = without.findIndex(c => c.id === targetId);
      if (targetIdx === -1) return prev;
      const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
      without.splice(insertAt, 0, sorted.find(c => c.id === sourceId)!);
      const reordered = without.map((c, i) => ({ ...c, order: i }));
      reordered.forEach(c => {
        if (sorted.find(x => x.id === c.id)?.order !== c.order)
          bg(supabase.from('la_columns').update({ order: c.order }).eq('id', c.id));
      });
      return reordered;
    });
  }, []);

  const laLogDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const updateCell = useCallback((uniqueId: string, colId: string, value: string) => {
    const col = laColumns.find(x => x.id === colId);
    if (col && value) {
      const colName = col.name; // capture before timeout
      const k = `${uniqueId}_${colId}`;
      clearTimeout(laLogDebounce.current[k]);
      laLogDebounce.current[k] = setTimeout(() => {
        logActivity('updated', 'Lead Analysis', uniqueId, `Updated "${colName}" for lead ${uniqueId}`);
      }, 1500);
    }
    setLaRows(prev => prev.map(r => {
      if (r.uniqueId !== uniqueId) return r;
      const newLocalData = { ...r.localData, [colId]: value };
      bg(supabase.from('la_rows').update({ local_data: newLocalData }).eq('unique_id', uniqueId));
      return { ...r, localData: newLocalData };
    }));
  }, []);

  const importLocalData = useCallback((updates: { uniqueId: string; colId: string; value: string }[]) => {
    const byId: Record<string, Record<string, string>> = {};
    for (const u of updates) {
      if (!byId[u.uniqueId]) byId[u.uniqueId] = {};
      byId[u.uniqueId][u.colId] = u.value;
    }
    setLaRows(prev => prev.map(r => {
      const colUpdates = byId[r.uniqueId];
      if (!colUpdates) return r;
      const newLocalData = { ...r.localData, ...colUpdates };
      bg(supabase.from('la_rows').update({ local_data: newLocalData }).eq('unique_id', r.uniqueId));
      return { ...r, localData: newLocalData };
    }));
  }, []);

  // ── All useEffect last ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: colData, error: colErr } = await supabase.from('la_columns').select('*').order('order');
        if (colErr?.code === '42P01') { setLoading(false); return; }
        if (!colErr && colData) {
          setLaColumns(colData.map((r: any) => ({
            id: r.id, name: r.name, source: r.source,
            linkedColId: r.linked_col_id ?? undefined,
            type: r.type, options: r.options ?? null,
            width: r.width, order: r.order,
          })));
        }
        const { data: rowData, error: rowErr } = await supabase.from('la_rows').select('*').order('created_at');
        if (rowErr?.code === '42P01') { setLoading(false); return; }
        if (!rowErr && rowData) {
          setLaRows(rowData.map((r: any) => ({
            uniqueId: r.unique_id, localData: r.local_data ?? {}, createdAt: r.created_at,
          })));
        }
      } catch (e) { console.warn('LA load error:', e); }
      finally { setLoading(false); }
    })();

    // Realtime for la_rows
    const rowCh = supabase.channel(`la_rows_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'la_rows' },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') {
            const r = n as any;
            if (localRowInserts.current.has(r.unique_id)) { localRowInserts.current.delete(r.unique_id); return; }
            setLaRows(prev => prev.find(x => x.uniqueId === r.unique_id) ? prev : [...prev, { uniqueId: r.unique_id, localData: r.local_data ?? {}, createdAt: r.created_at }]);
          }
          if (eventType === 'UPDATE') {
            const r = n as any;
            if (localRowUpdates.current.has(r.unique_id)) { localRowUpdates.current.delete(r.unique_id); return; }
            setLaRows(prev => prev.map(x => x.uniqueId === r.unique_id ? { ...x, localData: r.local_data ?? {} } : x));
          }
          if (eventType === 'DELETE') {
            const r = o as any;
            setLaRows(prev => prev.filter(x => x.uniqueId !== r.unique_id));
          }
        })
      .subscribe();

    // Realtime for la_columns
    const colCh = supabase.channel(`la_cols_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'la_columns' },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') {
            const r = n as any;
            setLaColumns(prev => prev.find(x => x.id === r.id) ? prev : [...prev, { id: r.id, name: r.name, source: r.source, linkedColId: r.linked_col_id, type: r.type, options: r.options, width: r.width, order: r.order }]);
          }
          if (eventType === 'UPDATE') {
            const r = n as any;
            setLaColumns(prev => prev.map(x => x.id === r.id ? { id: r.id, name: r.name, source: r.source, linkedColId: r.linked_col_id, type: r.type, options: r.options, width: r.width, order: r.order } : x));
          }
          if (eventType === 'DELETE') {
            const r = o as any;
            setLaColumns(prev => prev.filter(x => x.id !== r.id));
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(rowCh); supabase.removeChannel(colCh); };
  }, []);

  // Sync whenever qualifying leads change (new rows OR status changes to/from qualifying)
  const qualifyingSnapshot = useMemo(() => {
    if (!statusCol) return '';
    const optMap: Record<string,string> = {};
    for (const opt of (statusCol.options ?? []) as any[]) {
      optMap[opt.id] = opt.label;
      optMap[opt.label.toLowerCase()] = opt.label;
    }
    return proposalRows
      .filter(r => {
        const val = r.data[statusCol.id] ?? '';
        const label = optMap[val] ?? optMap[val.toLowerCase()] ?? val;
        return LA_QUALIFYING_STAGES.includes(label.toLowerCase());
      })
      .map(r => r.display_id)
      .sort()
      .join(',');
  }, [proposalRows, statusCol]);

  useEffect(() => {
    if (proposalRows.length > 0 && statusCol) syncLeads();
  }, [qualifyingSnapshot]); // eslint-disable-line

  return {
    laColumns: [...laColumns].sort((a, b) => a.order - b.order),
    mergedRows, laRows, loading, syncStatus, statusCol,
    proposalColumns, forceResync: syncLeads,
    addLinkedColumn, addLocalColumn,
    deleteColumn, renameColumn, resizeColumn, reorderColumns,
    updateColumnOptions, updateCell, importLocalData,
  };
}
