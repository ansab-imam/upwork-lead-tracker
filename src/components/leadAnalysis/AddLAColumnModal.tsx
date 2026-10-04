import React, { useState } from 'react';
import { X, Link2, PlusCircle, Type, Hash, Calendar, List, Plus, Trash2 } from 'lucide-react';
import type { Column } from '../../types/proposals';
import type { LAColumn } from '../../types/leadAnalysis';
import { COLOR_OPTIONS, OPTION_COLOR_STYLES } from '../../types/proposals';

interface AddLAColumnModalProps {
  proposalColumns: Column[];   // available columns from Proposal Details
  onAddLinked: (name: string, linkedColId: string, type: LAColumn['type']) => void;
  onAddLocal:  (name: string, type: LAColumn['type'], options: { label: string; color: string }[]) => void;
  onClose: () => void;
}

type SourceType = 'linked' | 'local';
type ColType = LAColumn['type'];

const TYPE_OPTIONS: { type: ColType; icon: React.ReactNode; label: string }[] = [
  { type: 'text',     icon: <Type size={14} />,     label: 'Free Text'  },
  { type: 'number',   icon: <Hash size={14} />,     label: 'Number'     },
  { type: 'date',     icon: <Calendar size={14} />, label: 'Date'       },
  { type: 'link',     icon: <Link2 size={14} />,    label: 'Link / URL' },
  { type: 'dropdown', icon: <List size={14} />,     label: 'Dropdown'   },
];

const ColorDot: React.FC<{ selected: string; onChange: (c: string) => void }> = ({ selected, onChange }) => {
  const [show, setShow] = useState(false);
  const sel = OPTION_COLOR_STYLES[selected] ?? OPTION_COLOR_STYLES['slate'];
  return (
    <div className="relative flex-shrink-0">
      <button type="button" onClick={() => setShow(s => !s)}
        className={`w-5 h-5 rounded-full ${sel.bg} border border-white`}
        style={{ boxShadow: '0 0 0 1.5px rgba(0,0,0,0.15)' }} />
      {show && (
        <div className="absolute bottom-full mb-2 left-0 bg-white border border-slate-200 rounded-xl p-2 shadow-xl z-50 flex flex-wrap gap-1.5"
          style={{ width: 116 }}>
          {COLOR_OPTIONS.map(c => (
            <button key={c.value} type="button"
              onClick={() => { onChange(c.value); setShow(false); }}
              className={`w-5 h-5 rounded-full ${OPTION_COLOR_STYLES[c.value].bg} border-2 hover:scale-110 transition-all ${selected === c.value ? 'border-slate-700' : 'border-transparent'}`}
              style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }} />
          ))}
        </div>
      )}
    </div>
  );
};

export const AddLAColumnModal: React.FC<AddLAColumnModalProps> = ({
  proposalColumns, onAddLinked, onAddLocal, onClose,
}) => {
  const [source,    setSource]    = useState<SourceType>('linked');
  const [name,      setName]      = useState('');
  const [linkedId,  setLinkedId]  = useState('');
  const [localType, setLocalType] = useState<ColType>('text');
  const [options,   setOptions]   = useState<{ label: string; color: string }[]>([]);
  const [optLabel,  setOptLabel]  = useState('');
  const [optColor,  setOptColor]  = useState('blue');

  // When a linked column is chosen, auto-fill the name
  const handleLinkedChange = (colId: string) => {
    setLinkedId(colId);
    if (!name) {
      const col = proposalColumns.find(c => c.id === colId);
      if (col) setName(col.name);
    }
  };

  const addOption = () => {
    if (!optLabel.trim()) return;
    setOptions(prev => [...prev, { label: optLabel.trim(), color: optColor }]);
    setOptLabel('');
  };

  const canSubmit = source === 'linked'
    ? name.trim() && linkedId
    : name.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (source === 'linked') {
      const col = proposalColumns.find(c => c.id === linkedId);
      onAddLinked(name.trim(), linkedId, (col?.type as ColType) ?? 'text');
    } else {
      onAddLocal(name.trim(), localType, localType === 'dropdown' ? options : []);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Add Column
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Source selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Column Source</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSource('linked')}
                className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-left transition-all ${
                  source === 'linked' ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}>
                <Link2 size={16} className={`flex-shrink-0 mt-0.5 ${source === 'linked' ? 'text-blue-600' : 'text-slate-400'}`} />
                <div>
                  <p className={`text-sm font-semibold ${source === 'linked' ? 'text-blue-700' : 'text-slate-700'}`}>
                    From Proposal Details
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Pull data from existing column</p>
                </div>
              </button>
              <button type="button" onClick={() => setSource('local')}
                className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-left transition-all ${
                  source === 'local' ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}>
                <PlusCircle size={16} className={`flex-shrink-0 mt-0.5 ${source === 'local' ? 'text-blue-600' : 'text-slate-400'}`} />
                <div>
                  <p className={`text-sm font-semibold ${source === 'local' ? 'text-blue-700' : 'text-slate-700'}`}>
                    Lead Analysis Only
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">New column just for this module</p>
                </div>
              </button>
            </div>
          </div>

          {/* Linked: pick source column */}
          {source === 'linked' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Proposal Details Column
              </label>
              <select value={linkedId} onChange={e => handleLinkedChange(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 bg-white cursor-pointer">
                <option value="">— Select a column</option>
                {proposalColumns.map(col => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
              {linkedId && (
                <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                  <Link2 size={11} /> Data will always sync from Proposal Details (read-only)
                </p>
              )}
            </div>
          )}

          {/* Local: pick type */}
          {source === 'local' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Column Type</label>
              <div className="grid grid-cols-1 gap-1.5">
                {TYPE_OPTIONS.map(t => (
                  <button key={t.type} type="button" onClick={() => setLocalType(t.type)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      localType === t.type ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}>
                    <span className={localType === t.type ? 'text-blue-600' : 'text-slate-400'}>{t.icon}</span>
                    <span className={`text-sm font-medium ${localType === t.type ? 'text-blue-700' : 'text-slate-700'}`}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Column name */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Column Name</label>
            <input autoFocus={source === 'local'} value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Decision Maker"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
            />
          </div>

          {/* Dropdown options for local dropdown columns */}
          {source === 'local' && localType === 'dropdown' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Options {options.length > 0 && <span className="text-blue-500">({options.length})</span>}
              </label>
              {options.length > 0 && (
                <div className="space-y-1.5 mb-3 max-h-32 overflow-y-auto">
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 group">
                      <span className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg font-medium ${OPTION_COLOR_STYLES[opt.color]?.full ?? ''}`}>
                        {opt.label}
                      </span>
                      <button type="button" onClick={() => setOptions(prev => prev.filter((_, idx) => idx !== i))}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:bg-red-50 rounded transition-all">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <ColorDot selected={optColor} onChange={setOptColor} />
                <input value={optLabel} onChange={e => setOptLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                  placeholder="Add option..."
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
                <button type="button" onClick={addOption} disabled={!optLabel.trim()}
                  className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Add Column
          </button>
        </div>
      </div>
    </div>
  );
};
