import React from 'react';

interface BarChartPlaceholderProps {
  title: string;
  subtitle?: string;
  labels: string[];
  data: number[];
  color?: string;
  height?: number;
}

export const BarChartPlaceholder: React.FC<BarChartPlaceholderProps> = ({
  title,
  subtitle,
  labels,
  data,
  color = '#2563EB',
  height = 140,
}) => {
  const max = Math.max(...data);

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((val, i) => {
          const barHeight = (val / max) * (height - 20);
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <div
                className="w-full rounded-t-md transition-all duration-500 hover:opacity-80"
                style={{
                  height: barHeight,
                  backgroundColor: color,
                  opacity: 0.7 + (val / max) * 0.3,
                }}
                title={`${labels[i]}: ${val}`}
              />
              <span className="text-xs text-slate-400 truncate w-full text-center">
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Horizontal stacked bar for proposal status
interface ProposalStatusBarProps {
  data: { label: string; value: number; color: string }[];
}

export const ProposalStatusBar: React.FC<ProposalStatusBarProps> = ({ data }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex rounded-full overflow-hidden h-2.5">
        {data.map((item, i) => (
          <div
            key={i}
            style={{ width: `${(item.value / total) * 100}%`, backgroundColor: item.color }}
            title={`${item.label}: ${item.value}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-slate-500">{item.label}</span>
            <span className="text-xs font-semibold text-slate-700 ml-auto">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
