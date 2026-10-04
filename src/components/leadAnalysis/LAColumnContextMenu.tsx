import React, { useEffect, useRef, useState } from 'react';
import { Trash2, ChevronLeft, ChevronRight, Check, X, Plus, Pencil, GripVertical, Link2, ArrowLeftRight } from 'lucide-react';
import type { LAColumn } from '../../types/leadAnalysis';
import { COLOR_OPTIONS, OPTION_COLOR_STYLES } from '../../types/proposals';

interface LAColumnContextMenuProps {
  column: LAColumn;
  x: number; y: number;
  isFirst: boolean; isLast: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onSetWidth: (w: number) => void;
  onUpdateOptions: (opts: LAColumn['options']) => void;
}

type Panel = 'main' | 'options' | 'width';

const ColorDot: React.FC<{ selected: string; onChange: (c: string) => void }> = ({ selected, onChange }) => {
  const [show, setShow] = useState(false);
  const sel = OPTION_COLOR_STYLES[selected] ?? OPTION_COLOR_STYLES['slate'];
  return (
    <div className="relative flex-shrink-0">
      <button onClick={e => { e.stopPropagation(); setShow(s => !s); }}
        className={`w-5 h-5 rounded-full ${sel.bg}`}
        style={{ boxShadow: '0 0 0 1.5px rgba(0,0,0,0.15)' }} />
      {show && (
        <div className="absolute bottom-full mb-1.5 left-0 bg-white border border-slate-200 rounded-xl p-2 shadow-xl z-[9999] flex flex-wrap gap-1.5"
          style={{ width: 108 }}
          onClick={e => e.stopPropagation()}>
          {COLOR_OPTIONS.map(c => (
            <button key={c.value}
              onClick={() => { onChange(c.value); setShow(false); }}
              className={`w-5 h-5 rounded-full ${OPTION_COLOR_STYLES[c.value].bg} border-2 hover:scale-110 transition-all ${selected === c.value ? 'border-slate-700' : 'border-transparent'}`}
              style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }} />
          ))}
        </div>
      )}
    </div>
  );
};

export const LAColumnContextMenu: React.FC<LAColumnContextMenuProps> = ({
  column, x, y, isFirst, isLast,
  onClose, onRename: _onRename, onDelete, onMoveLeft, onMoveRight, onSetWidth, onUpdateOptions,
}) => {
  const [panel, setPanel]         = useState<Panel>('main');
  const [newOptLabel, setNewOptLabel] = useState('');
  const [newOptColor, setNewOptColor] = useState('blue');
  const [editId, setEditId]       = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('blue');
  const [widthVal, setWidthVal]   = useState(String(column.width));
  const [delConfirm, setDelConf]  = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const el = menuRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ x: x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : x,
             y: y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : y });
  }, [x, y, panel]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [onClose]);

  const uid = () => `opt_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

  const addOption = () => {
    if (!newOptLabel.trim()) return;
    onUpdateOptions([...(column.options ?? []), { id: uid(), label: newOptLabel.trim(), color: newOptColor }]);
    setNewOptLabel('');
  };

  const saveEditOpt = (optId: string) => {
    if (!editLabel.trim()) return;
    onUpdateOptions((column.options ?? []).map(o => o.id === optId ? { ...o, label: editLabel.trim(), color: editColor } : o));
    setEditId(null);
  };

  return (
    <div ref={menuRef} className="fixed bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999] py-1.5"
      style={{ left: pos.x, top: pos.y, width: 240, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}
      onContextMenu={e => e.preventDefault()}>

      {panel === 'main' && <>
        <div className="px-3 py-2 border-b border-slate-100 mb-1">
          <div className="flex items-center gap-1.5">
            {column.source === 'linked' ? <Link2 size={12} className="text-blue-400" /> : null}
            <p className="text-xs font-semibold text-slate-500 truncate">{column.name}</p>
          </div>
          <p className="text-xs text-slate-400">{column.source === 'linked' ? 'Linked from Proposal Details' : 'Lead Analysis only'}</p>
        </div>

        {column.source === 'linked' && (
          <div className="px-3 py-2 flex items-center gap-2 bg-blue-50 mx-2 mb-1 rounded-lg">
            <Link2 size={11} className="text-blue-400" />
            <p className="text-xs text-blue-600">Read-only — edit in Proposal Details</p>
          </div>
        )}

        <MenuItem icon={<Pencil size={13} />} label="Rename" onClick={() => {}} />
        {column.source === 'local' && column.type === 'dropdown' && (
          <MenuItem icon={<GripVertical size={13} />} label="Manage options" onClick={() => setPanel('options')} badge="→" />
        )}
        <div className="border-t border-slate-100 my-1" />
        <MenuItem icon={<ChevronLeft size={13} />}  label="Move left"  onClick={() => { onMoveLeft(); onClose(); }}  disabled={isFirst} />
        <MenuItem icon={<ChevronRight size={13} />} label="Move right" onClick={() => { onMoveRight(); onClose(); }} disabled={isLast} />
        <MenuItem icon={<ArrowLeftRight size={13} />} label="Set width"  onClick={() => setPanel('width')} badge="→" />
        <div className="border-t border-slate-100 my-1" />
        <button onClick={() => { if (delConfirm) { onDelete(); onClose(); } else { setDelConf(true); setTimeout(() => setDelConf(false), 3000); } }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg font-medium transition-all ${delConfirm ? 'bg-red-500 text-white' : 'text-red-500 hover:bg-red-50'}`}>
          <Trash2 size={13} className={delConfirm ? 'text-white' : 'text-red-400'} />
          {delConfirm ? 'Click again to confirm' : 'Delete column'}
        </button>
      </>}

      {panel === 'options' && <>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
          <button onClick={() => setPanel('main')} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><ChevronLeft size={14} /></button>
          <span className="text-xs font-semibold text-slate-600">Dropdown Options</span>
        </div>
        <div className="max-h-48 overflow-y-auto px-2 py-1.5 space-y-1">
          {(column.options ?? []).map(opt => (
            editId === opt.id ? (
              <div key={opt.id} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-2 py-1.5">
                <ColorDot selected={editColor} onChange={setEditColor} />
                <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEditOpt(opt.id); if (e.key === 'Escape') setEditId(null); }}
                  className="flex-1 bg-transparent text-xs outline-none text-slate-700 font-medium min-w-0" />
                <button onClick={() => saveEditOpt(opt.id)} className="p-1 text-emerald-600 hover:bg-emerald-100 rounded"><Check size={12} /></button>
                <button onClick={() => setEditId(null)} className="p-1 text-slate-400 hover:bg-slate-200 rounded"><X size={12} /></button>
              </div>
            ) : (
              <div key={opt.id} className="flex items-center gap-2 px-1.5 py-1 rounded-xl group/opt hover:bg-slate-50">
                <span className={`flex-1 text-xs px-2 py-1 rounded-lg font-medium truncate ${OPTION_COLOR_STYLES[opt.color]?.full ?? ''}`}>{opt.label}</span>
                <button onClick={() => { setEditId(opt.id); setEditLabel(opt.label); setEditColor(opt.color); }}
                  className="opacity-0 group-hover/opt:opacity-100 p-1.5 text-slate-400 hover:text-slate-700 rounded transition-all"><Pencil size={11} /></button>
                <button onClick={() => onUpdateOptions((column.options ?? []).filter(o => o.id !== opt.id))}
                  className="opacity-0 group-hover/opt:opacity-100 p-1.5 text-slate-400 hover:text-red-500 rounded transition-all"><Trash2 size={11} /></button>
              </div>
            )
          ))}
        </div>
        <div className="border-t border-slate-100 px-2 py-2">
          <div className="flex items-center gap-1.5">
            <ColorDot selected={newOptColor} onChange={setNewOptColor} />
            <input value={newOptLabel} onChange={e => setNewOptLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addOption(); }}
              placeholder="Add option..." className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-400 min-w-0" />
            <button onClick={addOption} disabled={!newOptLabel.trim()}
              className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"><Plus size={13} /></button>
          </div>
        </div>
      </>}

      {panel === 'width' && <>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 mb-2">
          <button onClick={() => setPanel('main')} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><ChevronLeft size={14} /></button>
          <span className="text-xs font-semibold text-slate-600">Column Width</span>
        </div>
        <div className="px-3 pb-3 space-y-3">
          <div className="flex items-center gap-2">
            <input type="number" min={80} max={800} value={widthVal} onChange={e => setWidthVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { onSetWidth(parseInt(widthVal)); setPanel('main'); } }}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 tabular-nums" />
            <button onClick={() => { onSetWidth(parseInt(widthVal)); setPanel('main'); }}
              className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-xl hover:bg-blue-700">Set</button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[120, 160, 200, 240, 280, 320, 400, 500].map(w => (
              <button key={w} onClick={() => { onSetWidth(w); setPanel('main'); }}
                className={`py-1.5 text-xs rounded-lg border transition-colors ${column.width === w ? 'border-blue-400 bg-blue-50 text-blue-600 font-semibold' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {w}
              </button>
            ))}
          </div>
        </div>
      </>}
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; badge?: string }> = ({ icon, label, onClick, disabled, badge }) => (
  <button onClick={onClick} disabled={disabled}
    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
    <span className="text-slate-400">{icon}</span>
    <span className="flex-1 text-left">{label}</span>
    {badge && <span className="text-xs text-slate-400">{badge}</span>}
  </button>
);
