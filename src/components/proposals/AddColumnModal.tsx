import React, { useState } from 'react';
import { X, Plus, Trash2, Type, Hash, Calendar, Link2, List } from 'lucide-react';
import type { ColumnType } from '../../types/proposals';
import { COLOR_OPTIONS, OPTION_COLOR_STYLES } from '../../types/proposals';

interface NewOption { label: string; color: string; }

interface AddColumnModalProps {
  onAdd: (name: string, type: ColumnType, options: NewOption[]) => void;
  onClose: () => void;
}

const TYPES: { type: ColumnType; icon: React.ReactNode; label: string; desc: string }[] = [
  { type: 'text',     icon: <Type size={15} />,     label: 'Free Text',  desc: 'Any text value'   },
  { type: 'number',   icon: <Hash size={15} />,     label: 'Number',     desc: 'Numeric values'   },
  { type: 'date',     icon: <Calendar size={15} />, label: 'Date',       desc: 'Date picker'      },
  { type: 'link',     icon: <Link2 size={15} />,    label: 'Link / URL', desc: 'Clickable URL'    },
  { type: 'dropdown', icon: <List size={15} />,     label: 'Dropdown',   desc: 'Select from list' },
];

const ColorDot: React.FC<{ selected: string; onChange: (c: string) => void }> = ({ selected, onChange }) => {
  const [show, setShow] = useState(false);
  const sel = OPTION_COLOR_STYLES[selected] ?? OPTION_COLOR_STYLES['slate'];
  return (
    <div className="relative flex-shrink-0">
      <button type="button" onClick={() => setShow(s => !s)}
        className={`w-6 h-6 rounded-full ${sel.bg} border-2 border-white transition-transform hover:scale-110`}
        style={{ boxShadow: '0 0 0 1.5px rgba(0,0,0,0.15)' }}
      />
      {show && (
        <div className="absolute bottom-full mb-2 left-0 bg-white border border-slate-200 rounded-xl p-2 shadow-xl z-50 flex flex-wrap gap-1.5" style={{ width: 116 }}>
          {COLOR_OPTIONS.map(c => (
            <button key={c.value} type="button"
              onClick={() => { onChange(c.value); setShow(false); }}
              className={`w-6 h-6 rounded-full ${OPTION_COLOR_STYLES[c.value].bg} border-2 hover:scale-110 transition-all ${selected === c.value ? 'border-slate-700' : 'border-transparent'}`}
              style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const AddColumnModal: React.FC<AddColumnModalProps> = ({ onAdd, onClose }) => {
  const [name, setName]       = useState('');
  const [type, setType]       = useState<ColumnType>('text');
  const [options, setOptions] = useState<NewOption[]>([]);
  const [optLabel, setOptLabel] = useState('');
  const [optColor, setOptColor] = useState('blue');

  const addOption = () => {
    if (!optLabel.trim()) return;
    setOptions(prev => [...prev, { label: optLabel.trim(), color: optColor }]);
    setOptLabel('');
  };

  const removeOption = (i: number) => setOptions(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), type, type === 'dropdown' ? options : []);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Add Column
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Column Name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Contact Person"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Column Type</label>
            <div className="grid grid-cols-1 gap-1.5">
              {TYPES.map(t => (
                <button key={t.type} type="button" onClick={() => setType(t.type)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    type === t.type
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'
                  }`}>
                  <span className={type === t.type ? 'text-blue-600' : 'text-slate-400'}>{t.icon}</span>
                  <div>
                    <p className="text-sm font-medium leading-none">{t.label}</p>
                    <p className="text-xs mt-0.5 opacity-60">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Dropdown options — only shown when type is dropdown */}
          {type === 'dropdown' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Dropdown Options {options.length > 0 && <span className="text-blue-500 ml-1">({options.length})</span>}
              </label>

              {/* Existing options */}
              {options.length > 0 && (
                <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto">
                  {options.map((opt, i) => {
                    const s = OPTION_COLOR_STYLES[opt.color] ?? OPTION_COLOR_STYLES['slate'];
                    return (
                      <div key={i} className="flex items-center gap-2 group">
                        <span className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg font-medium ${s.full}`}>{opt.label}</span>
                        <button type="button" onClick={() => removeOption(i)}
                          className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add option input */}
              <div className="flex items-center gap-2">
                <ColorDot selected={optColor} onChange={setOptColor} />
                <input
                  value={optLabel}
                  onChange={e => setOptLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                  placeholder="Type option and press Enter..."
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
                <button type="button" onClick={addOption} disabled={!optLabel.trim()}
                  className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0">
                  <Plus size={14} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">You can add more options after creating the column too.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!name.trim()}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Add Column
          </button>
        </div>
      </div>
    </div>
  );
};
