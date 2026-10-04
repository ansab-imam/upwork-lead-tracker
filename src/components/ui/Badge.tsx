import React from 'react';

type BadgeVariant = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'slate' | 'orange';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantMap: Record<BadgeVariant, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  yellow: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100',
  purple: 'bg-violet-50 text-violet-700 border-violet-100',
  slate: 'bg-slate-50 text-slate-600 border-slate-100',
  orange: 'bg-orange-50 text-orange-700 border-orange-100',
};

const dotColorMap: Record<BadgeVariant, string> = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  purple: 'bg-violet-500',
  slate: 'bg-slate-400',
  orange: 'bg-orange-500',
};

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'slate', dot = false }) => {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${variantMap[variant]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColorMap[variant]}`} />}
      {children}
    </span>
  );
};
