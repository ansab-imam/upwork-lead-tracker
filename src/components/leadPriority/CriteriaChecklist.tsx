import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { CRITERIA } from '../../types/leadPriority';
import type { Criterion } from '../../types/leadPriority';

interface CriteriaChecklistProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

const BUDGET_IDS = ['budget_high', 'budget_medium', 'budget_low'];

const CriterionRow: React.FC<{
  criterion: Criterion;
  checked: boolean;
  onToggle: () => void;
}> = ({ criterion, checked, onToggle }) => {
  const isPos = criterion.type === 'positive';
  return (
    <label className={`
      flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all
      ${checked
        ? isPos
          ? 'bg-emerald-50 border border-emerald-200'
          : 'bg-red-50 border border-red-200'
        : 'bg-white border border-slate-100 hover:border-slate-200 hover:bg-slate-50'
      }
    `}>
      <div className="flex-shrink-0 mt-0.5">
        <div className={`
          w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
          ${checked
            ? isPos ? 'bg-emerald-500 border-emerald-500' : 'bg-red-500 border-red-500'
            : 'border-slate-300 bg-white'
          }
        `}>
          {checked && <span className="text-white text-xs font-bold">✓</span>}
        </div>
        <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      </div>

      <span className={`flex-1 text-sm leading-snug ${checked ? 'font-medium' : 'text-slate-600'} ${checked && isPos ? 'text-emerald-800' : ''} ${checked && !isPos ? 'text-red-800' : ''}`}>
        {criterion.label}
      </span>

      <span className={`
        flex-shrink-0 flex items-center gap-0.5 text-sm font-bold tabular-nums
        ${isPos ? 'text-emerald-600' : 'text-red-500'}
      `}>
        {isPos ? <Plus size={13} /> : <Minus size={13} />}
        {Math.abs(criterion.points)}
      </span>
    </label>
  );
};

export const CriteriaChecklist: React.FC<CriteriaChecklistProps> = ({ selected, onChange }) => {
  const positiveCriteria = CRITERIA.filter(c => c.type === 'positive');
  const negativeCriteria = CRITERIA.filter(c => c.type === 'negative');

  const toggle = (criterion: Criterion) => {
    const isSelected = selected.includes(criterion.id);

    if (criterion.group === 'budget') {
      // Budget is mutually exclusive — deselect all other budget options
      const otherBudgets = BUDGET_IDS.filter(b => b !== criterion.id);
      let next = selected.filter(id => !otherBudgets.includes(id));
      if (isSelected) {
        next = next.filter(id => id !== criterion.id);
      } else {
        next = [...next, criterion.id];
      }
      onChange(next);
    } else {
      if (isSelected) {
        onChange(selected.filter(id => id !== criterion.id));
      } else {
        onChange([...selected, criterion.id]);
      }
    }
  };

  const selectedPos = selected.filter(id => CRITERIA.find(c => c.id === id && c.type === 'positive'));
  const selectedNeg = selected.filter(id => CRITERIA.find(c => c.id === id && c.type === 'negative'));

  return (
    <div className="space-y-6">
      {/* Positive criteria */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-slate-700">Positive Criteria</h3>
          <span className="text-xs text-slate-400 ml-auto">{selectedPos.length} selected</span>
        </div>
        <div className="space-y-2">
          {positiveCriteria.map(c => (
            <CriterionRow
              key={c.id}
              criterion={c}
              checked={selected.includes(c.id)}
              onToggle={() => toggle(c)}
            />
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2 pl-1">
          * Only one budget option can be selected at a time.
        </p>
      </div>

      {/* Negative criteria */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-slate-700">Negative Criteria</h3>
          <span className="text-xs text-slate-400 ml-auto">{selectedNeg.length} selected</span>
        </div>
        <div className="space-y-2">
          {negativeCriteria.map(c => (
            <CriterionRow
              key={c.id}
              criterion={c}
              checked={selected.includes(c.id)}
              onToggle={() => toggle(c)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
