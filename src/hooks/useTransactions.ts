import { logActivity } from './useActivityLog';
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import type { Column, Row, ColumnType } from '../types/proposals';

const uid = (p = 'id') => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const bg  = (p: PromiseLike<unknown>) => Promise.resolve(p).catch(() => {});

export function useTransactions() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const rowsRef = useRef<Row[]>([]);
  const localInserts = useRef<Set<string>>(new Set());
  const localDeletes = useRef<Set<string>>(new Set());

  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // ── Load from Supabase ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: colData } = await supabase
          .from('tx_columns').select('*').order('order');
        if (colData) setColumns(colData as Column[]);

        let allRows: Row[] = [];
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('tx_rows').select('*').order('created_at', { ascending: false }).range(from, from + 999);
          if (error || !data || data.length === 0) break;
          allRows = [...allRows, ...data as Row[]];
          if (data.length < 1000) break;
          from += 1000;
        }
        // Sort newest first
        allRows.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
        setRows(allRows);
        rowsRef.current = allRows;
      } catch (e) { console.warn('Transactions load error:', e); }
      finally { setLoading(false); }
    })();
  }, []);

  // ── Realtime ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(`tx_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tx_rows' },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') {
            const r = n as Row;
            if (localInserts.current.has(r.id)) { localInserts.current.delete(r.id); return; }
            setRows(prev => prev.find(x => x.id === r.id) ? prev : [r, ...prev]);
          }
          if (eventType === 'UPDATE') {
            setRows(prev => prev.map(x => x.id === (n as Row).id ? n as Row : x));
          }
          if (eventType === 'DELETE') {
            const r = o as Row;
            if (localDeletes.current.has(r.id)) { localDeletes.current.delete(r.id); return; }
            setRows(prev => prev.filter(x => x.id !== r.id));
          }
        }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Row operations ────────────────────────────────────────────────────────
  const addRow = useCallback(() => {
    const row: Row = { id: uid('tx'), display_id: '', data: {}, created_at: new Date().toISOString() };
    rowsRef.current = [row, ...rowsRef.current];
    setRows(prev => [row, ...prev]);
    localInserts.current.add(row.id);
    bg(supabase.from('tx_rows').insert(row));
    logActivity('created', 'Transactions', row.id, `Added transaction row`);
  }, []);

  const duplicateRow = useCallback((rowId: string) => {
    const src = rowsRef.current.find(r => r.id === rowId);
    if (!src) return;
    const copy: Row = { id: uid('tx'), display_id: '', data: { ...src.data }, created_at: new Date().toISOString() };
    rowsRef.current = [...rowsRef.current, copy];
    setRows(prev => { const idx = prev.findIndex(r => r.id === rowId); const next = [...prev]; next.splice(idx + 1, 0, copy); return next; });
    bg(supabase.from('tx_rows').insert(copy));
  }, []);

  const deleteRow = useCallback((rowId: string) => {
    rowsRef.current = rowsRef.current.filter(r => r.id !== rowId);
    setRows(prev => prev.filter(r => r.id !== rowId));
    localDeletes.current.add(rowId);
    bg(supabase.from('tx_rows').delete().eq('id', rowId));
    logActivity('deleted', 'Transactions', rowId, `Deleted transaction row`);
  }, []);

  const txLogDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const updateCell = useCallback((rowId: string, colId: string, value: string) => {
    const col = columns.find(x => x.id === colId);
    if (col) {
      const colName = col.name; // capture before timeout
      const k = `${rowId}_${colId}`;
      clearTimeout(txLogDebounce.current[k]);
      txLogDebounce.current[k] = setTimeout(() => {
        logActivity('updated', 'Transactions', rowId, `Updated "${colName}" in transaction row`);
      }, 1500);
    }
    const row = rowsRef.current.find(r => r.id === rowId);
    if (!row) return;
    const newData = { ...row.data, [colId]: value };
    rowsRef.current = rowsRef.current.map(r => r.id === rowId ? { ...r, data: newData } : r);
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, data: newData } : r));
    bg(supabase.from('tx_rows').update({ data: newData }).eq('id', rowId));
  }, []);

  const importRows = useCallback(async (
    newRows: Omit<Row, 'id' | 'created_at'>[],
    mode: 'skip' | 'overwrite' = 'skip'
  ) => {
    const toAdd: Row[] = newRows.map(r => ({ ...r, id: uid('tx'), display_id: '', created_at: new Date().toISOString() }));
    if (mode === 'overwrite') {
      let safe = 0;
      while (safe < 20) {
        const { data } = await supabase.from('tx_rows').select('id').limit(500);
        if (!data || data.length === 0) break;
        await supabase.from('tx_rows').delete().in('id', (data as {id:string}[]).map(r => r.id));
        safe++;
      }
      setRows(toAdd); rowsRef.current = toAdd;
    } else {
      setRows(prev => [...toAdd, ...prev]); rowsRef.current = [...toAdd, ...rowsRef.current];
    }
    const CHUNK = 200;
    for (let i = 0; i < toAdd.length; i += CHUNK) {
      await supabase.from('tx_rows').insert(toAdd.slice(i, i + CHUNK));
    }
  }, []);

  // ── Column operations ─────────────────────────────────────────────────────
  const addColumn = useCallback((name: string, type: ColumnType, options: {label:string;color:string}[] = []) => {
    const maxOrder = columns.length > 0 ? Math.max(...columns.map(c => c.order)) : -1;
    const col: Column = {
      id: uid('txc'), name, type, width: 160, order: maxOrder + 1,
      options: type === 'dropdown' ? options.map(o => ({ id: uid('opt'), ...o })) : null,
    };
    setColumns(prev => [...prev, col].sort((a, b) => a.order - b.order));
    bg(supabase.from('tx_columns').insert(col));
  }, [columns]);

  const deleteColumn = useCallback((colId: string) => {
    setColumns(prev => prev.filter(c => c.id !== colId));
    setRows(prev => prev.map(r => { const { [colId]: _, ...rest } = r.data; return { ...r, data: rest }; }));
    bg(supabase.from('tx_columns').delete().eq('id', colId));
  }, []);

  const renameColumn = useCallback((colId: string, name: string) => {
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, name } : c));
    bg(supabase.from('tx_columns').update({ name }).eq('id', colId));
  }, []);

  const changeColumnType = useCallback((colId: string, type: ColumnType) => {
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, type, options: type === 'dropdown' ? (c.options ?? []) : null } : c));
    const col = columns.find(c => c.id === colId);
    bg(supabase.from('tx_columns').update({ type, options: type === 'dropdown' ? (col?.options ?? []) : null }).eq('id', colId));
  }, [columns]);

  const resizeColumn = useCallback((colId: string, width: number) => {
    const w = Math.max(80, width);
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, width: w } : c));
    bg(supabase.from('tx_columns').update({ width: w }).eq('id', colId));
  }, []);

  const reorderColumns = useCallback((sourceId: string, targetId: string, position: 'before' | 'after') => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setColumns(prev => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const without = sorted.filter(c => c.id !== sourceId);
      const idx = without.findIndex(c => c.id === targetId);
      if (idx === -1) return prev;
      without.splice(position === 'before' ? idx : idx + 1, 0, sorted.find(c => c.id === sourceId)!);
      const reordered = without.map((c, i) => ({ ...c, order: i }));
      reordered.forEach(c => {
        if (sorted.find(x => x.id === c.id)?.order !== c.order)
          bg(supabase.from('tx_columns').update({ order: c.order }).eq('id', c.id));
      });
      return reordered;
    });
  }, []);

  const updateColumnOptions = useCallback((colId: string, options: Column['options']) => {
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, options } : c));
    bg(supabase.from('tx_columns').update({ options }).eq('id', colId));
  }, []);

  return {
    columns: [...columns].sort((a, b) => a.order - b.order),
    rows, loading,
    addRow, duplicateRow, deleteRow, updateCell, importRows,
    addColumn, deleteColumn, renameColumn, changeColumnType,
    resizeColumn, reorderColumns, updateColumnOptions,
  };
}
