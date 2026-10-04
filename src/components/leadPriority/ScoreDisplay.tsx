import React from 'react';
import { getTier } from '../../types/leadPriority';
import { TierBadge } from './TierBadge';

interface ScoreDisplayProps {
  score: number;
}

export const ScoreDisplay: React.FC<ScoreDisplayProps> = ({ score }) => {
  const tier    = getTier(score);
  const maxPos  = 50;   // max possible positive score
  // Clamp to 0-100 for visual bar (negative = 0, positive scales to 100)
  const pct     = Math.max(0, Math.min(100, (score / maxPos) * 100));

  const barColor =
    tier === 'High Tier'   ? 'bg-emerald-500' :
    tier === 'Medium Tier' ? 'bg-amber-400'   : 'bg-slate-400';

  const scoreColor =
    tier === 'High Tier'   ? 'text-emerald-600' :
    tier === 'Medium Tier' ? 'text-amber-600'   : 'text-slate-600';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Total Score</p>
          <p className={`text-4xl font-bold ${scoreColor}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {score > 0 ? `+${score}` : score}
          </p>
        </div>
        <TierBadge tier={tier} size="lg" />
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>0</span>
          <span className="text-amber-500 font-medium">20 — Medium</span>
          <span className="text-emerald-600 font-medium">35 — High</span>
          <span>50+</span>
        </div>
      </div>
    </div>
  );
};
