export type ColumnType = 'text' | 'number' | 'date' | 'link' | 'dropdown';

export interface DropdownOption {
  id: string;
  label: string;
  color: string;
}

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  width: number;
  order: number;
  options: DropdownOption[] | null;
}

export type RowData = Record<string, string>;

export interface Row {
  id: string;
  display_id: string;
  data: RowData;
  created_at?: string;
}

export const OPTION_COLOR_STYLES: Record<string, { bg: string; text: string; full: string }> = {
  blue:   { bg: 'bg-blue-100',    text: 'text-blue-700',    full: 'bg-blue-100 text-blue-700'    },
  green:  { bg: 'bg-emerald-100', text: 'text-emerald-700', full: 'bg-emerald-100 text-emerald-700' },
  yellow: { bg: 'bg-amber-100',   text: 'text-amber-700',   full: 'bg-amber-100 text-amber-700'  },
  red:    { bg: 'bg-red-100',     text: 'text-red-600',     full: 'bg-red-100 text-red-600'      },
  purple: { bg: 'bg-violet-100',  text: 'text-violet-700',  full: 'bg-violet-100 text-violet-700' },
  orange: { bg: 'bg-orange-100',  text: 'text-orange-700',  full: 'bg-orange-100 text-orange-700' },
  slate:  { bg: 'bg-slate-100',   text: 'text-slate-600',   full: 'bg-slate-100 text-slate-600'  },
};

export const COLOR_OPTIONS = [
  { value: 'blue',   label: 'Blue'   },
  { value: 'green',  label: 'Green'  },
  { value: 'yellow', label: 'Yellow' },
  { value: 'red',    label: 'Red'    },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' },
  { value: 'slate',  label: 'Slate'  },
];

// ── Consistent funnel status colors ──────────────────────────────────────────
export const FUNNEL_STATUS_STYLES: Record<string, { full: string; bg: string; text: string; border: string; bar: string }> = {
  'submitted':   { full: 'bg-blue-100 text-blue-700',    bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',   bar: 'bg-blue-400'    },
  'viewed':      { full: 'bg-amber-100 text-amber-700',  bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',  bar: 'bg-amber-400'   },
  'contacted':   { full: 'bg-violet-100 text-violet-700',bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200', bar: 'bg-violet-400'  },
  'interviewed': { full: 'bg-cyan-100 text-cyan-700',    bg: 'bg-cyan-100',    text: 'text-cyan-700',    border: 'border-cyan-200',   bar: 'bg-cyan-400'    },
  'hired':       { full: 'bg-emerald-100 text-emerald-700', bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500' },
};

export function getFunnelStatusStyle(label: string) {
  return FUNNEL_STATUS_STYLES[label.toLowerCase()] ?? { full: 'bg-slate-100 text-slate-600', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', bar: 'bg-slate-300' };
}
