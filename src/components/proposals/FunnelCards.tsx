import React, { useMemo } from 'react';
import type { Column, Row } from '../../types/proposals';

// ── Funnel stages in order ────────────────────────────────────────────────────
const FUNNEL_STAGES = [
  { label: 'Submitted',   bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-600',    labelColor: 'text-blue-500',    activeBg: 'bg-blue-100',    activeRing: 'ring-blue-400'    },
  { label: 'Viewed',      bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-600',   labelColor: 'text-amber-500',   activeBg: 'bg-amber-100',   activeRing: 'ring-amber-400'   },
  { label: 'Contacted',   bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-600',  labelColor: 'text-violet-500',  activeBg: 'bg-violet-100',  activeRing: 'ring-violet-400'  },
  { label: 'Interviewed', bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-600',    labelColor: 'text-cyan-500',    activeBg: 'bg-cyan-100',    activeRing: 'ring-cyan-400'    },
  { label: 'Hired',       bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', labelColor: 'text-emerald-500', activeBg: 'bg-emerald-100', activeRing: 'ring-emerald-400' },
];

interface FunnelCardsProps {
  columns: Column[];
  rows: Row[];
  onFilterByStatus?: (optionId: string | null) => void;
  activeFilter?: string | null;
}

export const FunnelCards: React.FC<FunnelCardsProps> = ({
  columns, rows, onFilterByStatus, activeFilter,
}) => {
  // Find the status column — match by name or by having funnel stage labels
  const statusCol = useMemo(() => {
    const byName = columns.find(c =>
      c.type === 'dropdown' && (
        c.name.toLowerCase().includes('proposal status') ||
        c.name.toLowerCase() === 'status'
      )
    );
    if (byName) return byName;
    return columns.find(c => {
      if (c.type !== 'dropdown' || !c.options) return false;
      const labels = c.options.map(o => o.label.toLowerCase());
      return FUNNEL_STAGES.filter(s => labels.includes(s.label.toLowerCase())).length >= 2;
    }) ?? null;
  }, [columns]);

  // option label (lowercase) -> option id
  const optionsByLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const opt of statusCol?.options ?? []) {
      map[opt.label.toLowerCase()] = opt.id;
    }
    return map;
  }, [statusCol]);

  // option id -> funnel stage index (0=Submitted … 4=Hired)
  const stageIndex = useMemo(() => {
    const idx: Record<string, number> = {};
    FUNNEL_STAGES.forEach((s, i) => {
      const id = optionsByLabel[s.label.toLowerCase()];
      if (id) idx[id] = i;
    });
    return idx;
  }, [optionsByLabel]);

  // Counts per stage:
  // Stage 0 (Submitted)   = ALL rows
  // Stage N               = rows whose status stage index >= N
  const counts = useMemo(() => {
    if (!statusCol) return FUNNEL_STAGES.map(() => 0);
    const rowStages = rows.map(row => stageIndex[row.data[statusCol.id] ?? ''] ?? -1);
    return FUNNEL_STAGES.map((_, i) =>
      i === 0 ? rows.length : rowStages.filter(s => s >= i).length
    );
  }, [rows, statusCol, stageIndex]);

  if (!statusCol) return null;

  const submittedCount = counts[0] || 1;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {FUNNEL_STAGES.map((stage, i) => {
          const count    = counts[i];
          const optId    = optionsByLabel[stage.label.toLowerCase()];
          const isActive = activeFilter === optId || (i === 0 && activeFilter === null && false);
          const pct      = Math.round((count / submittedCount) * 100);

          return (
            <button
              key={stage.label}
              onClick={() => onFilterByStatus?.(isActive ? null : optId ?? null)}
              className={`
                rounded-2xl border p-4 text-left transition-all duration-150 w-full
                ${isActive
                  ? `${stage.activeBg} ${stage.border} ring-2 ${stage.activeRing} ring-offset-1 shadow-md`
                  : `${stage.bg} ${stage.border} hover:shadow-md hover:-translate-y-0.5`
                }
              `}
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
            >
              {/* Label */}
              <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${stage.labelColor}`}>
                {stage.label}
              </p>

              {/* Count */}
              <p className={`text-3xl font-bold leading-none ${stage.text}`}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {count.toLocaleString()}
              </p>

              {/* Percentage of submitted */}
              {i > 0 && (
                <p className="text-xs text-slate-400 mt-1.5 font-medium">
                  {pct}% of submitted
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Active filter pill */}
      {activeFilter && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Filtering:</span>
          <span className="font-semibold text-slate-700">
            {FUNNEL_STAGES.find(s => optionsByLabel[s.label.toLowerCase()] === activeFilter)?.label}
          </span>
          <span className="text-slate-400">and beyond</span>
          <button onClick={() => onFilterByStatus?.(null)}
            className="text-blue-600 hover:text-blue-700 font-medium underline ml-1">
            Clear
          </button>
        </div>
      )}
    </div>
  );
};
