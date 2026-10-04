import type { Column, Row } from './proposals';

// ── Funnel stages ──────────────────────────────────────────────────────────────
export const FUNNEL_STAGES = ['Submitted', 'Viewed', 'Contacted', 'Interviewed', 'Hired'];

export const STAGE_COLORS: Record<string, string> = {
  Submitted:   '#3b82f6',
  Viewed:      '#f59e0b',
  Contacted:   '#8b5cf6',
  Interviewed: '#06b6d4',
  Hired:       '#10b981',
};

// ── Date range presets ────────────────────────────────────────────────────────
export type RangePreset = 'last7' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'custom';

export interface DateRange {
  from: string; // yyyy-mm-dd
  to:   string;
}

export function getPresetRange(preset: RangePreset): DateRange {
  const now   = new Date();
  const today = toDateStr(now);

  const d = (n: number) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + n);
    return toDateStr(dt);
  };

  switch (preset) {
    case 'last7':     return { from: d(-6), to: today };
    case 'last30':    return { from: d(-29), to: today };
    case 'last90':    return { from: d(-89), to: today };
    case 'thisMonth': return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case 'lastMonth': {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lme = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toDateStr(lm), to: toDateStr(lme) };
    }
    case 'thisYear':  return { from: `${now.getFullYear()}-01-01`, to: today };
    case 'lastYear':  return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
    default:          return { from: d(-29), to: today };
  }
}

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatDisplayDate(yyyy_mm_dd: string): string {
  const parts = yyyy_mm_dd.split('-');
  if (parts.length !== 3) return yyyy_mm_dd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function isWeekend(yyyy_mm_dd: string): boolean {
  const d = new Date(yyyy_mm_dd + 'T00:00:00');
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function getDatesInRange(from: string, to: string, skipWeekends = false): string[] {
  const dates: string[] = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to   + 'T00:00:00');
  while (cur <= end) {
    const str = toDateStr(cur);
    if (!skipWeekends || !isWeekend(str)) dates.push(str);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ── Column detection helpers ───────────────────────────────────────────────────
export function detectDateCol(columns: Column[]): Column | null {
  return columns.find(c =>
    c.type === 'date' && (
      c.name.toLowerCase().includes('date') ||
      c.name.toLowerCase().includes('submission') ||
      c.name.toLowerCase().includes('sent')
    )
  ) ?? columns.find(c => c.type === 'date') ?? null;
}

export function detectStatusCol(columns: Column[]): Column | null {
  const byName = columns.find(c =>
    c.type === 'dropdown' && (
      c.name.toLowerCase().includes('status') ||
      c.name.toLowerCase().includes('proposal status')
    )
  );
  if (byName) return byName;
  return columns.find(c => {
    if (c.type !== 'dropdown' || !c.options) return false;
    const labels = (c.options as any[]).map(o => o.label.toLowerCase());
    return FUNNEL_STAGES.filter(s => labels.includes(s.toLowerCase())).length >= 2;
  }) ?? null;
}

export function detectDropdownCols(columns: Column[]): Column[] {
  return columns.filter(c => c.type === 'dropdown');
}

// ── Data processing ────────────────────────────────────────────────────────────
export interface DayPoint {
  date:   string;          // yyyy-mm-dd
  counts: Record<string, number>; // optionId/label -> count
  total:  number;
}

export function buildChartData(
  rows: Row[],
  dates: string[],
  dateColId: string,
  groupColId: string,         // column to group by (status, SDR, etc.)
  groupOptions: { id: string; label: string }[],  // the groups to show
  filterColId?: string,       // optional extra filter column
  filterValues?: string[],    // allowed values for filter column
): DayPoint[] {
  // Build a lookup: date -> groupValue -> count
  const lookup: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    const dateVal = row.data[dateColId] ?? '';
    if (!dateVal) continue;
    // Apply filter
    if (filterColId && filterValues && filterValues.length > 0) {
      const fv = row.data[filterColId] ?? '';
      if (!filterValues.includes(fv)) continue;
    }
    const groupVal = row.data[groupColId] ?? '__none__';
    if (!lookup[dateVal]) lookup[dateVal] = {};
    lookup[dateVal][groupVal] = (lookup[dateVal][groupVal] ?? 0) + 1;
  }

  return dates.map(date => {
    const dayData = lookup[date] ?? {};
    const counts: Record<string, number> = {};
    let total = 0;
    for (const opt of groupOptions) {
      // Group values could be option IDs or raw text values
      const count = dayData[opt.id] ?? 0;
      counts[opt.label] = count;
      total += count;
    }
    return { date, counts, total };
  });
}
