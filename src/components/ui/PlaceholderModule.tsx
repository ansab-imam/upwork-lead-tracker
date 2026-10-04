import React from 'react';
import { Construction, type LucideIcon } from 'lucide-react';

interface PlaceholderModuleProps {
  moduleName: string;
  description: string;
  icon?: LucideIcon;
}

export const PlaceholderModule: React.FC<PlaceholderModuleProps> = ({
  moduleName,
  description,
  icon: Icon = Construction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 py-16">
      <div
        className="bg-white rounded-2xl border border-slate-100 p-10 max-w-md w-full text-center"
        style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}
      >
        {/* Icon */}
        <div className="mx-auto mb-5 w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
          <Icon size={26} className="text-blue-600" />
        </div>

        {/* Content */}
        <h2
          className="text-lg font-bold text-slate-800 mb-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {moduleName}
        </h2>
        <p className="text-sm text-slate-500 mb-4 leading-relaxed">{description}</p>

        {/* Status pill */}
        <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-100 text-amber-600 text-xs font-medium px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          This module will be configured later
        </div>
      </div>
    </div>
  );
};
