import React from 'react';
import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  change?: number; // percentage change
  changeLabel?: string;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
}

const colorMap = {
  blue: {
    icon: 'bg-blue-50 text-blue-600',
    badge: 'bg-blue-50 text-blue-600',
  },
  green: {
    icon: 'bg-emerald-50 text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-600',
  },
  purple: {
    icon: 'bg-violet-50 text-violet-600',
    badge: 'bg-violet-50 text-violet-600',
  },
  orange: {
    icon: 'bg-orange-50 text-orange-600',
    badge: 'bg-orange-50 text-orange-600',
  },
  red: {
    icon: 'bg-red-50 text-red-600',
    badge: 'bg-red-50 text-red-600',
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  change,
  changeLabel = 'vs last month',
  color = 'blue',
}) => {
  const colors = colorMap[color];
  const isPositive = change !== undefined && change >= 0;

  return (
    <div
      className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-4"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${colors.icon}`}>
          <Icon size={20} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${
            isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
          }`}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{isPositive ? '+' : ''}{change}%</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 leading-none mb-1.5"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {value}
        </p>
        <p className="text-sm text-slate-500">{label}</p>
        {change !== undefined && (
          <p className="text-xs text-slate-400 mt-1">{changeLabel}</p>
        )}
      </div>
    </div>
  );
};
