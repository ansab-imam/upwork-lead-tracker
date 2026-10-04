// ── Column source types ────────────────────────────────────────────────────────

export type LAColumnSource = 'linked' | 'local';

export interface LAColumn {
  id: string;
  name: string;
  source: LAColumnSource;
  // If source === 'linked': the column id from Proposal Details to mirror
  linkedColId?: string;
  // Column display type (for local columns)
  type: 'text' | 'number' | 'date' | 'link' | 'dropdown';
  options?: { id: string; label: string; color: string }[] | null;
  width: number;
  order: number;
}

// ── Row data ────────────────────────────────────────────────────────────────────
// Only local (LA-only) column data is stored here.
// Linked column data is always read live from Proposal Details rows.

export interface LARow {
  uniqueId: string;        // UP001 etc. — matches proposal row display_id
  localData: Record<string, string>; // keyed by LAColumn.id (local cols only)
  createdAt: string;
}

// ── Storage keys ────────────────────────────────────────────────────────────────
export const LA_COLUMNS_KEY = 'leadtracker_la_columns_v1';
export const LA_ROWS_KEY    = 'leadtracker_la_rows_v1';

// ── Funnel stages that qualify for Lead Analysis ─────────────────────────────────
export const LA_QUALIFYING_STAGES = ['contacted', 'interviewed', 'hired'];
