import React, { useState, useRef, useEffect } from 'react';
import { StickyNote, X, Check } from 'lucide-react';
import type { DayPoint } from '../../types/reporting';
import { formatDisplayDate } from '../../types/reporting';
import type { DayNote } from '../../hooks/useDayNotes';

interface BarChartProps {
  data: DayPoint[];
  seriesKeys: string[];        // labels to show as bars
  seriesColors: Record<string, string>;
  height?: number;
  skipWeekends?: boolean;
  notes: Record<string, DayNote>;
  onNoteClick: (date: string) => void;
}

interface TooltipData {
  date:   string;
  counts: Record<string, number>;
  total:  number;
  x:      number;
  y:      number;
}

export const BarChart: React.FC<BarChartProps> = ({
  data, seriesKeys, seriesColors, height = 320, notes, onNoteClick,
}) => {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const maxVal = Math.max(1, ...data.map(d => d.total));
  const padL = 48, padR = 16, padT = 16, padB = 48;

  // Responsive width
  const [svgWidth, setSvgWidth] = useState(800);
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      setSvgWidth(entries[0]?.contentRect.width ?? 800);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const chartW = svgWidth - padL - padR;
  const chartH = height - padT - padB;

  const n = data.length;
  if (n === 0) return (
    <div className="flex items-center justify-center h-40 text-sm text-slate-400">
      No data for this range
    </div>
  );

  // Bar dimensions
  const groupW  = chartW / n;
  const barW    = Math.max(2, Math.min(groupW * 0.7, 32));
  const barGap  = (groupW - barW * seriesKeys.length) / (seriesKeys.length + 1);

  // Y axis ticks
  const yTicks = 5;
  const tickStep = Math.ceil(maxVal / yTicks / 5) * 5 || 1;
  const yMax = tickStep * yTicks;

  const xPos = (i: number) => padL + i * groupW + groupW / 2;
  const yPos = (v: number) => padT + chartH - (v / yMax) * chartH;

  // Label density — show every Nth label
  const labelEvery = n <= 14 ? 1 : n <= 30 ? 2 : n <= 60 ? 3 : Math.ceil(n / 20);

  const handleMouseMove = (_e: React.MouseEvent<SVGGElement>, d: DayPoint, i: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      date:   d.date,
      counts: d.counts,
      total:  d.total,
      x:      xPos(i),
      y:      yPos(d.total),
    });
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        ref={svgRef}
        width={svgWidth}
        height={height}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = i * tickStep;
          const y = yPos(v);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={svgWidth - padR} y2={y}
                stroke="#f1f5f9" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end"
                fontSize={10} fill="#94a3b8" fontFamily="Inter, sans-serif">
                {v}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const cx = xPos(i);
          const hasNote = !!notes[d.date];
          return (
            <g key={d.date}
              onMouseMove={(e: React.MouseEvent<SVGGElement>) => handleMouseMove(e, d, i)}
              onClick={() => onNoteClick(d.date)}
              style={{ cursor: 'pointer' }}
            >
              {/* Hover background */}
              <rect
                x={cx - groupW / 2} y={padT}
                width={groupW} height={chartH}
                fill="transparent"
              />

              {/* Stacked bars per series */}
              {seriesKeys.map((key, ki) => {
                const count = d.counts[key] ?? 0;
                if (count === 0) return null;
                const bH    = Math.max(1, (count / yMax) * chartH);
                const bX    = cx - (seriesKeys.length * barW) / 2 + ki * barW + (ki > 0 ? barGap * ki : 0);
                const bY    = yPos(count);
                return (
                  <rect key={key}
                    x={bX} y={bY}
                    width={barW} height={bH}
                    fill={seriesColors[key] ?? '#94a3b8'}
                    rx={Math.min(3, barW / 2)}
                    opacity={0.85}
                  />
                );
              })}

              {/* Note indicator */}
              {hasNote && (
                <circle cx={cx} cy={padT - 4} r={4} fill="#f59e0b" />
              )}

              {/* X axis label */}
              {i % labelEvery === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle"
                  fontSize={9} fill="#94a3b8" fontFamily="Inter, sans-serif">
                  {formatDisplayDate(d.date).slice(0, 5)}{/* dd/mm */}
                </text>
              )}
            </g>
          );
        })}

        {/* X axis line */}
        <line x1={padL} y1={padT + chartH} x2={svgWidth - padR} y2={padT + chartH}
          stroke="#e2e8f0" strokeWidth={1} />
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 bg-white border border-slate-200 rounded-xl shadow-xl pointer-events-none"
          style={{
            left: Math.min(tooltip.x + padL, svgWidth - 200),
            top: Math.max(8, tooltip.y - 10),
            minWidth: 180,
            transform: tooltip.x > svgWidth / 2 ? 'translateX(-110%)' : 'translateX(8px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700">{formatDisplayDate(tooltip.date)}</p>
            <p className="text-xs text-slate-400">{tooltip.total} total</p>
          </div>
          <div className="px-3 py-2 space-y-1">
            {seriesKeys.map(key => {
              const count = tooltip.counts[key] ?? 0;
              if (count === 0) return null;
              return (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: seriesColors[key] }} />
                    <span className="text-xs text-slate-600">{key}</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-800 tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-1.5 border-t border-slate-50">
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <StickyNote size={10} /> Click to add note
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Day note modal ─────────────────────────────────────────────────────────────
interface DayNoteModalProps {
  date: string;
  existing: string;
  onSave: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export const DayNoteModal: React.FC<DayNoteModalProps> = ({
  date, existing, onSave, onDelete, onClose,
}) => {
  const [text, setText] = useState(existing);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Note for {formatDisplayDate(date)}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Add context about this day</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="e.g. Team was at conference, lower submissions expected..."
          rows={4}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none transition-all"
        />
        <div className="flex gap-2 mt-4">
          {existing && (
            <button onClick={() => { onDelete(); onClose(); }}
              className="px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors">
              Delete
            </button>
          )}
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onSave(text); onClose(); }}
            disabled={!text.trim() && !existing}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <Check size={14} /> Save Note
          </button>
        </div>
      </div>
    </div>
  );
};
