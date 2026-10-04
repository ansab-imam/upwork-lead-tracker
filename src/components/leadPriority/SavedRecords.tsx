import React, { useState } from 'react';
import { Pencil, Trash2, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react';
import type { LeadPriorityRecord } from '../../types/leadPriority';
import { CRITERIA } from '../../types/leadPriority';
import { TierBadge } from './TierBadge';

interface SavedRecordsProps {
  records: LeadPriorityRecord[];
  onEdit: (record: LeadPriorityRecord) => void;
  onDelete: (id: string) => void;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

const RecordRow: React.FC<{
  record: LeadPriorityRecord;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ record, onEdit, onDelete }) => {
  const [expanded, setExpanded]     = useState(false);
  const [deleteConfirm, setDelConf] = useState(false);

  const posCriteria = record.selected_criteria
    .map(id => CRITERIA.find(c => c.id === id))
    .filter(c => c?.type === 'positive');
  const negCriteria = record.selected_criteria
    .map(id => CRITERIA.find(c => c.id === id))
    .filter(c => c?.type === 'negative');

  const scoreColor =
    record.tier === 'High Tier'   ? 'text-emerald-600' :
    record.tier === 'Medium Tier' ? 'text-amber-600'   : 'text-slate-500';

  const handleDelete = () => {
    if (deleteConfirm) { onDelete(); }
    else { setDelConf(true); setTimeout(() => setDelConf(false), 3000); }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden transition-shadow hover:shadow-md"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* ID */}
        <span className="text-sm font-mono font-bold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-lg flex-shrink-0 w-20 text-center">
          {record.unique_id}
        </span>

        {/* Score */}
        <span className={`text-xl font-bold tabular-nums flex-shrink-0 w-16 ${scoreColor}`}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {record.score > 0 ? `+${record.score}` : record.score}
        </span>

        {/* Tier */}
        <div className="flex-shrink-0">
          <TierBadge tier={record.tier} />
        </div>

        {/* Criteria summary */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {posCriteria.length > 0 && (
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
              +{posCriteria.length} positive
            </span>
          )}
          {negCriteria.length > 0 && (
            <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
              -{negCriteria.length} negative
            </span>
          )}
          {record.selected_criteria.length === 0 && (
            <span className="text-xs text-slate-400">No criteria selected</span>
          )}
        </div>

        {/* Dates */}
        <div className="hidden md:block text-xs text-slate-400 flex-shrink-0 text-right">
          <p>Created {formatDate(record.created_at)}</p>
          {record.updated_at !== record.created_at && (
            <p>Updated {formatDate(record.updated_at)}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title={expanded ? 'Collapse' : 'View details'}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <button onClick={onEdit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={handleDelete}
            className={`p-1.5 rounded-lg transition-all ${deleteConfirm ? 'text-white bg-red-500' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
            title={deleteConfirm ? 'Click again to confirm' : 'Delete'}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-50 px-5 py-4 bg-slate-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Positive */}
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Plus size={11} /> Positive Criteria ({posCriteria.length})
              </p>
              {posCriteria.length === 0
                ? <p className="text-xs text-slate-400 italic">None selected</p>
                : <ul className="space-y-1">
                    {posCriteria.map(c => c && (
                      <li key={c.id} className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="text-emerald-500 font-semibold flex-shrink-0 w-7 tabular-nums">+{c.points}</span>
                        <span>{c.label}</span>
                      </li>
                    ))}
                  </ul>
              }
            </div>
            {/* Negative */}
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Minus size={11} /> Negative Criteria ({negCriteria.length})
              </p>
              {negCriteria.length === 0
                ? <p className="text-xs text-slate-400 italic">None selected</p>
                : <ul className="space-y-1">
                    {negCriteria.map(c => c && (
                      <li key={c.id} className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="text-red-500 font-semibold flex-shrink-0 w-7 tabular-nums">{c.points}</span>
                        <span>{c.label}</span>
                      </li>
                    ))}
                  </ul>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const SavedRecords: React.FC<SavedRecordsProps> = ({ records, onEdit, onDelete }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'score' | 'tier'>('date');

  const filtered = records
    .filter(r => r.unique_id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'tier') {
        const order = { 'High Tier': 0, 'Medium Tier': 1, 'Low Tier': 2 };
        return order[a.tier] - order[b.tier];
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  if (records.length === 0) return null;

  return (
    <div className="mt-8">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Saved Records
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{records.length} lead{records.length !== 1 ? 's' : ''} scored</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by ID..."
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-300 w-32 bg-white" />
          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-600 outline-none bg-white cursor-pointer focus:border-blue-300">
            <option value="date">Sort: Date</option>
            <option value="score">Sort: Score</option>
            <option value="tier">Sort: Tier</option>
          </select>
        </div>
      </div>

      {/* Records */}
      <div className="space-y-3">
        {filtered.length === 0
          ? <p className="text-sm text-slate-400 text-center py-6">No records match your search.</p>
          : filtered.map(record => (
              <RecordRow
                key={record.id}
                record={record}
                onEdit={() => onEdit(record)}
                onDelete={() => onDelete(record.id)}
              />
            ))
        }
      </div>
    </div>
  );
};
