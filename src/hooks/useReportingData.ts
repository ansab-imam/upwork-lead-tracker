import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import type { Column, Row } from '../types/proposals';

const LS_COLS = 'leadtracker_proposal_columns_v2';
const LS_ROWS = 'leadtracker_proposal_rows_v2';

export function useReportingData() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string>('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // ── Step 1: Load from localStorage immediately so chart shows fast ──
      try {
        const lsCols = localStorage.getItem(LS_COLS);
        const lsRows = localStorage.getItem(LS_ROWS);
        if (lsCols) setColumns(JSON.parse(lsCols));
        if (lsRows) setRows(JSON.parse(lsRows));
      } catch {}

      // ── Step 2: Fetch columns from Supabase ──
      const { data: colData, error: colErr } = await supabase
        .from('proposal_columns').select('*').order('order');
      if (!colErr && colData && colData.length > 0) {
        setColumns(colData as Column[]);
      }

      // ── Step 3: Fetch ALL rows from Supabase with pagination ──
      let allRows: Row[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('proposal_rows')
          .select('id, display_id, data, created_at')
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        allRows = [...allRows, ...data as Row[]];
        if (data.length < PAGE) break;
        from += PAGE;
      }

      if (allRows.length > 0) {
        setRows(allRows);
        setLastSync(new Date().toLocaleTimeString());
      }
    } catch (e) {
      console.warn('Reporting Supabase fetch failed, using localStorage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime refresh when rows change
  useEffect(() => {
    const ch = supabase.channel('reporting_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_rows' },
        () => setTimeout(() => fetchAll(), 2000)
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  return { columns, rows, loading, lastSync, refetch: fetchAll };
}
