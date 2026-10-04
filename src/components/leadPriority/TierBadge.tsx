import React from 'react';
import type { Tier } from '../../types/leadPriority';

const TIER_STYLES: Record<Tier, { bg: string; text: string; dot: string; border: string }> = {
  'Low Tier':    { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400',   border: 'border-slate-200' },
  'Medium Tier': { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-400',   border: 'border-amber-200' },
  'High Tier':   { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
};

interface TierBadgeProps {
  tier: Tier;
  size?: 'sm' | 'md' | 'lg';
}

export const TierBadge: React.FC<TierBadgeProps> = ({ tier, size = 'md' }) => {
  const s = TIER_STYLES[tier];
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : size === 'lg' ? 'text-sm px-4 py-1.5 font-semibold' : 'text-xs px-2.5 py-1 font-medium';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${s.bg} ${s.text} ${s.border} ${sizeClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {tier}
    </span>
  );
};
