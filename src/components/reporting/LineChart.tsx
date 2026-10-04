import React, { useState, useRef, useEffect } from 'react';
import { formatDisplayDate } from '../../types/reporting';

export type MarkerType = 'holiday' | 'leave' | 'halfday' | 'note';

export const MARKER_COLORS: Record<MarkerType, string> = {
  holiday: '#ef4444',
  leave:   '#f97316',
  halfday: '#a855f7',
  note:    '#f59e0b',
};

export const MARKER_LABELS: Record<MarkerType, string> = {
  holiday: 'Holiday',
  leave:   'Leave',
  halfday: 'Half Day',
  note:    'Note',
};

export interface DayMarker {
  date: string;
  type: MarkerType;
  note?: string;
}

interface DayPoint {
  date: string;
  counts: Record<string, number>;
  total: number;
}

interface LineChartProps {
  data: DayPoint[];
  seriesKeys: string[];
  seriesColors: Record<string, string>;
  height?: number;
  markers: Record<string, DayMarker>;
  onDayClick: (date: string) => void;
}

interface TooltipState {
  date: string;
  counts: Record<string, number>;
  sdrCounts: Record<string, number>;
  total: number;
  x: number;
  y: number;
}

export const LineChart: React.FC<LineChartProps> = ({
  data, seriesKeys, seriesColors, height = 320, markers, onDayClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgWidth, setSvgWidth]   = useState(900);
  const [tooltip, setTooltip]     = useState<TooltipState | null>(null);
  const [hoverIdx, setHoverIdx]   = useState<number | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver(e => setSvgWidth(e[0]?.contentRect.width ?? 900));
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const PAD = { l: 44, r: 16, t: 20, b: 56 };
  const W   = svgWidth - PAD.l - PAD.r;
  const H   = height - PAD.t - PAD.b;
  const n   = data.length;

  if (n === 0) return (
    <div className="flex items-center justify-center h-40 text-sm text-slate-400">No data for this range</div>
  );

  const maxVal = Math.max(1, ...data.map(d => Math.max(...seriesKeys.map(k => d.counts[k] ?? 0))));
  const yTick  = Math.ceil(maxVal / 5 / 2) * 2 || 1;
  const yMax   = yTick * Math.ceil(maxVal / yTick);
  const yTicks = Math.ceil(yMax / yTick);

  const xPos = (i: number) => PAD.l + (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const yPos = (v: number) => PAD.t + H - (v / yMax) * H;

  // Smooth bezier curve path
  const smoothPath = (pts: [number, number][]) => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1];
      const [cx, cy] = pts[i];
      const cpx = (px + cx) / 2;
      d += ` C ${cpx} ${py} ${cpx} ${cy} ${cx} ${cy}`;
    }
    return d;
  };

  const labelEvery = n <= 14 ? 1 : n <= 30 ? 2 : n <= 60 ? 3 : Math.ceil(n / 20);

  return (
    <div ref={containerRef} className="relative w-full">
      <svg width={svgWidth} height={height} onMouseLeave={() => { setTooltip(null); setHoverIdx(null); }}>

        {/* Y grid + labels */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = i * yTick;
          const y = yPos(v);
          return (
            <g key={i}>
              <line x1={PAD.l} y1={y} x2={svgWidth - PAD.r} y2={y}
                stroke={i === 0 ? '#e2e8f0' : '#f1f5f9'} strokeWidth={i === 0 ? 1.5 : 1} />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#94a3b8" fontFamily="Inter,sans-serif">{v}</text>
            </g>
          );
        })}

        {/* Series lines */}
        {seriesKeys.map(key => {
          const pts: [number, number][] = data.map((d, i) => [xPos(i), yPos(d.counts[key] ?? 0)]);
          return (
            <g key={key}>
              <path d={smoothPath(pts)} fill="none" stroke={seriesColors[key]} strokeWidth={2.5}
                strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
              {data.map((d, i) => {
                const v = d.counts[key] ?? 0;
                if (v === 0 && i !== hoverIdx) return null;
                return (
                  <circle key={i} cx={xPos(i)} cy={yPos(v)} r={hoverIdx === i ? 5 : 3.5}
                    fill="white" stroke={seriesColors[key]} strokeWidth={2}
                    style={{ transition: 'r 0.1s' }} />
                );
              })}
            </g>
          );
        })}

        {/* Hover line */}
        {hoverIdx !== null && (
          <line x1={xPos(hoverIdx)} y1={PAD.t} x2={xPos(hoverIdx)} y2={PAD.t + H}
            stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" />
        )}

        {/* Marker dots on x-axis */}
        {data.map((d, i) => {
          const marker = markers[d.date];
          if (!marker) return null;
          return (
            <circle key={i} cx={xPos(i)} cy={PAD.t + H + 18} r={5}
              fill={MARKER_COLORS[marker.type]}
              style={{ cursor: 'pointer' }}
              onClick={() => onDayClick(d.date)} />
          );
        })}

        {/* X axis labels + invisible hit areas */}
        {data.map((d, i) => (
          <g key={i}>
            <rect x={xPos(i) - 14} y={PAD.t} width={28} height={H + 20}
              fill="transparent" style={{ cursor: 'pointer' }}
              onMouseEnter={() => {
                setHoverIdx(i);
                setTooltip({ date: d.date, counts: d.counts, sdrCounts: (d as any).sdrCounts ?? {}, total: d.total, x: xPos(i), y: PAD.t });
              }}
              onClick={() => onDayClick(d.date)}
            />
            {i % labelEvery === 0 && (
              <text x={xPos(i)} y={height - 6} textAnchor="middle"
                fontSize={9} fill="#94a3b8" fontFamily="Inter,sans-serif">
                {formatDisplayDate(d.date).slice(0, 5)}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="absolute z-50 bg-white border border-slate-200 rounded-xl shadow-xl pointer-events-none"
          style={{
            left: tooltip.x > svgWidth * 0.65 ? tooltip.x - 180 : tooltip.x + 12,
            top: Math.max(8, tooltip.y),
            minWidth: 170,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}>
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700">{formatDisplayDate(tooltip.date)}</p>
            <p className="text-xs text-slate-400">{tooltip.total} submitted (cumulative)</p>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {seriesKeys.map(key => {
              const count = tooltip.counts[key] ?? 0;
              return (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seriesColors[key] }} />
                    <span className="text-xs text-slate-600">{key}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-800 tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
          {/* SDR breakdown */}
          {Object.keys(tooltip.sdrCounts).length > 0 && (
            <div className="border-t border-slate-100 px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-slate-500 mb-1">By SDR</p>
              {Object.entries(tooltip.sdrCounts)
                .sort(([,a],[,b]) => b - a)
                .map(([sdr, count]) => (
                  <div key={sdr} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-600 truncate">{sdr}</span>
                    <span className="text-xs font-bold text-slate-800 flex-shrink-0">{count}</span>
                  </div>
                ))}
            </div>
          )}
          {markers[tooltip.date] && (
            <div className="px-3 py-1.5 border-t border-slate-50">
              <p className="text-xs font-medium" style={{ color: MARKER_COLORS[markers[tooltip.date].type] }}>
                {MARKER_LABELS[markers[tooltip.date].type]}
                {markers[tooltip.date].note && `: ${markers[tooltip.date].note}`}
              </p>
            </div>
          )}
          <div className="px-3 py-1.5 border-t border-slate-50">
            <p className="text-xs text-slate-400">Click to add/edit note</p>
          </div>
        </div>
      )}
    </div>
  );
};
