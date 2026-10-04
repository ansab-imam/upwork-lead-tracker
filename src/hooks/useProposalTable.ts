import { logActivity } from './useActivityLog';
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import type { Column, Row, ColumnType } from '../types/proposals';

const uid = (p = 'id') => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function nextDisplayId(existingRows: Row[]): string {
  let max = 0;
  for (const r of existingRows) {
    const n = parseInt((r.display_id ?? '').replace('UP', ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `UP${String(max + 1).padStart(3, '0')}`;
}

function bg(p: PromiseLike<unknown>) { Promise.resolve(p).catch(() => {}); }

export function useProposalTable() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const rowsRef      = useRef<Row[]>([]);
  const localInserts = useRef<Set<string>>(new Set());
  const logDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const localDeletes = useRef<Set<string>>(new Set());

  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // ── Load everything from Supabase ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: colData, error: colErr } = await supabase
          .from('proposal_columns').select('*').order('order');
        if (colErr) throw new Error(colErr.message);

        setColumns((colData ?? []) as Column[]);

        let allRows: Row[] = [];
        const PAGE = 1000;
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('proposal_rows')
            .select('*')
            .order('created_at', { ascending: false })
            .range(from, from + PAGE - 1);
          if (error) throw new Error(error.message);
          if (!data || data.length === 0) break;
          allRows = [...allRows, ...data as Row[]];
          if (data.length < PAGE) break;
          from += PAGE;
        }
        // Sort by display_id number descending (UP1852 before UP001)
        allRows.sort((a, b) => {
          const na = parseInt((a.display_id ?? '').replace(/\D/g, '') || '0', 10);
          const nb = parseInt((b.display_id ?? '').replace(/\D/g, '') || '0', 10);
          return nb - na;
        });
        setRows(allRows);
        rowsRef.current = allRows;
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load from Supabase');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const rowCh = supabase.channel(`rows_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_rows' },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') {
            const r = n as Row;
            if (localInserts.current.has(r.id)) { localInserts.current.delete(r.id); return; }
            setRows(prev => prev.find(x => x.id === r.id) ? prev : [...prev, r]);
          }
          if (eventType === 'UPDATE') {
            const r = n as Row;
            setRows(prev => prev.map(x => x.id === r.id ? r : x));
          }
          if (eventType === 'DELETE') {
            const r = o as Row;
            if (localDeletes.current.has(r.id)) { localDeletes.current.delete(r.id); return; }
            setRows(prev => prev.filter(x => x.id !== r.id));
          }
        }).subscribe();

    const colCh = supabase.channel(`cols_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_columns' },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') {
            const c = n as Column;
            if (localInserts.current.has(c.id)) { localInserts.current.delete(c.id); return; }
            setColumns(prev => prev.find(x => x.id === c.id) ? prev : [...prev, c].sort((a, b) => a.order - b.order));
          }
          if (eventType === 'UPDATE') {
            const c = n as Column;
            setColumns(prev => prev.map(x => x.id === c.id ? c : x).sort((a, b) => a.order - b.order));
          }
          if (eventType === 'DELETE') {
            const c = o as Column;
            setColumns(prev => prev.filter(x => x.id !== c.id));
          }
        }).subscribe();

    return () => { supabase.removeChannel(rowCh); supabase.removeChannel(colCh); };
  }, []);

  // ── Row operations ────────────────────────────────────────────────────────
  const addRow = useCallback(() => {
    const row: Row = { id: uid('row'), display_id: nextDisplayId(rowsRef.current), data: {}, created_at: new Date().toISOString() };
    localInserts.current.add(row.id);
    rowsRef.current = [row, ...rowsRef.current];
    setRows(prev => [row, ...prev]);
    bg(supabase.from('proposal_rows').insert(row));
    logActivity('created', 'Proposals', row.display_id ?? row.id, `Added proposal row ${row.display_id ?? ''}`);
  }, []);

  const duplicateRow = useCallback((rowId: string) => {
    const src = rowsRef.current.find(r => r.id === rowId);
    if (!src) return;
    const copy: Row = { id: uid('row'), display_id: nextDisplayId(rowsRef.current), data: { ...src.data }, created_at: new Date().toISOString() };
    localInserts.current.add(copy.id);
    rowsRef.current = [...rowsRef.current, copy];
    setRows(prev => { const idx = prev.findIndex(r => r.id === rowId); const next = [...prev]; next.splice(idx + 1, 0, copy); return next; });
    bg(supabase.from('proposal_rows').insert(copy));
  }, []);

  const deleteRow = useCallback((rowId: string) => {
    const _dr = rowsRef.current.find(r => r.id === rowId);
    localDeletes.current.add(rowId);
    rowsRef.current = rowsRef.current.filter(r => r.id !== rowId);
    setRows(prev => prev.filter(r => r.id !== rowId));
    bg(supabase.from('proposal_rows').delete().eq('id', rowId));
    logActivity('deleted', 'Proposals', _dr?.display_id ?? rowId, `Deleted proposal row ${_dr?.display_id ?? ''}`);
  }, []);

  const updateCell = useCallback((rowId: string, colId: string, value: string) => {
    // Log status changes and important field updates
    // Log all cell changes with debounce
    const _col = columns.find(x => x.id === colId);
    const _row = rowsRef.current.find(r => r.id === rowId);
    if (_col && _row && (_row.data[colId] ?? '') !== value) {
      const displayId = _row.display_id ?? rowId;
      const getLabel = (v: string) => {
        if (_col.type === 'dropdown' && _col.options) {
          const opt = (_col.options as {id:string;label:string}[]).find(o => o.id === v);
          return opt?.label ?? v;
        }
        return v;
      };
      // Capture values now before async timeout
      const colName = _col.name;
      const colType = _col.type;
      const labelValue = getLabel(value);
      const logKey = `${rowId}_${colId}`;
      clearTimeout(logDebounce.current[logKey]);
      logDebounce.current[logKey] = setTimeout(() => {
        if (colType === 'dropdown') {
          logActivity('status_changed', 'Proposals', displayId,
            `Changed "${colName}" → "${labelValue}" on row ${displayId}`);
        } else if (value.length > 0) {
          logActivity('updated', 'Proposals', displayId,
            `Updated "${colName}" on row ${displayId}`);
        }
      }, 1500);
    }
    const row = rowsRef.current.find(r => r.id === rowId);
    if (!row) return;
    const newData = { ...row.data, [colId]: value };
    rowsRef.current = rowsRef.current.map(r => r.id === rowId ? { ...r, data: newData } : r);
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, data: newData } : r));
    bg(supabase.from('proposal_rows').update({ data: newData }).eq('id', rowId));
  }, []);

  const importRows = useCallback(async (
    newRows: Omit<Row, 'id' | 'created_at'>[],
    mode: 'skip' | 'overwrite' = 'skip'
  ) => {
    const toAdd: Row[] = newRows.map(r => ({ ...r, id: uid('row'), created_at: new Date().toISOString() }));

    if (mode === 'overwrite') {
      // Delete ALL existing rows from Supabase in batches
      let safe = 0;
      while (safe < 50) {
        const { data } = await supabase.from('proposal_rows').select('id').limit(500);
        if (!data || data.length === 0) break;
        const ids = (data as {id:string}[]).map(r => r.id);
        const { error } = await supabase.from('proposal_rows').delete().in('id', ids);
        if (error) { console.error('Delete error:', error); break; }
        safe++;
      }
      rowsRef.current = toAdd;
      setRows(toAdd);
    } else {
      rowsRef.current = [...rowsRef.current, ...toAdd];
      setRows(prev => [...prev, ...toAdd]);
    }

    // Insert ALL new rows in chunks of 200 (smaller = more reliable)
    const CHUNK = 200;
    let inserted = 0;
    for (let i = 0; i < toAdd.length; i += CHUNK) {
      const chunk = toAdd.slice(i, i + CHUNK);
      const { error } = await supabase.from('proposal_rows').insert(chunk);
      if (error) {
        console.error(`Insert error at chunk ${i}:`, error.message);
        throw new Error(`Failed to save rows to Supabase: ${error.message}`);
      }
      inserted += chunk.length;
    }
    console.log(`✓ Successfully imported ${inserted} rows to Supabase`);
  }, []);

  const clearAllRows = useCallback(async () => {
    rowsRef.current = [];
    setRows([]);
    let safe = 0;
    while (safe < 20) {
      const { data } = await supabase.from('proposal_rows').select('id').limit(500);
      if (!data || data.length === 0) break;
      await supabase.from('proposal_rows').delete().in('id', (data as {id:string}[]).map(r => r.id));
      safe++;
    }
  }, []);

  // ── Column operations ─────────────────────────────────────────────────────
  const addColumn = useCallback((name: string, type: ColumnType, options: { label: string; color: string }[] = []) => {
    const maxOrder = columns.length > 0 ? Math.max(...columns.map(c => c.order)) : -1;
    const opts = type === 'dropdown' ? options.map(o => ({ id: uid('opt'), ...o })) : null;
    const col: Column = { id: uid('col'), name, type, width: 160, order: maxOrder + 1, options: opts };
    localInserts.current.add(col.id);
    setColumns(prev => [...prev, col].sort((a, b) => a.order - b.order));
    bg(supabase.from('proposal_columns').insert(col));
  }, [columns]);

  const deleteColumn = useCallback((colId: string) => {
    setColumns(prev => prev.filter(c => c.id !== colId));
    setRows(prev => prev.map(r => { const { [colId]: _, ...rest } = r.data; return { ...r, data: rest }; }));
    bg(supabase.from('proposal_columns').delete().eq('id', colId));
  }, []);

  const renameColumn = useCallback((colId: string, name: string) => {
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, name } : c));
    bg(supabase.from('proposal_columns').update({ name }).eq('id', colId));
  }, []);

  const changeColumnType = useCallback((colId: string, type: ColumnType) => {
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, type, options: type === 'dropdown' ? (c.options ?? []) : null } : c));
    const col = columns.find(c => c.id === colId);
    bg(supabase.from('proposal_columns').update({ type, options: type === 'dropdown' ? (col?.options ?? []) : null }).eq('id', colId));
  }, [columns]);

  const resizeColumn = useCallback((colId: string, width: number) => {
    const w = Math.max(80, width);
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, width: w } : c));
    bg(supabase.from('proposal_columns').update({ width: w }).eq('id', colId));
  }, []);

  const reorderColumns = useCallback((sourceId: string, targetId: string, position: 'before' | 'after') => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setColumns(prev => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const without = sorted.filter(c => c.id !== sourceId);
      const targetIdx = without.findIndex(c => c.id === targetId);
      if (targetIdx === -1) return prev;
      const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
      without.splice(insertAt, 0, sorted.find(c => c.id === sourceId)!);
      const reordered = without.map((c, i) => ({ ...c, order: i }));
      reordered.forEach(c => {
        if (sorted.find(x => x.id === c.id)?.order !== c.order)
          bg(supabase.from('proposal_columns').update({ order: c.order }).eq('id', c.id));
      });
      return reordered;
    });
  }, []);

  const updateColumnOptions = useCallback((colId: string, options: Column['options']) => {
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, options } : c));
    bg(supabase.from('proposal_columns').update({ options }).eq('id', colId));
  }, []);

  return {
    columns: [...columns].sort((a, b) => a.order - b.order),
    rows, loading, error,
    addRow, duplicateRow, deleteRow, updateCell, importRows, clearAllRows,
    addColumn, deleteColumn, renameColumn, changeColumnType,
    resizeColumn, reorderColumns, updateColumnOptions,
  };
}
