import React, { useRef, useState, useCallback, useEffect, memo } from 'react';
import { GripVertical, Link2, Calendar } from 'lucide-react';
import { getFunnelStatusStyle } from '../../types/proposals';
import type { LAColumn } from '../../types/leadAnalysis';
import { OPTION_COLOR_STYLES } from '../../types/proposals';
import { LAColumnContextMenu } from './LAColumnContextMenu';

interface MergedRow {
  uniqueId: string;
  data: Record<string, string>;
  currentStatus: string;
}

interface LATableProps {
  columns: LAColumn[];
  rows: MergedRow[];
  searchHighlight?: string;
  priorityByUniqueId?: Record<string, { score: number; tier: string }>;
  onUpdateCell: (uniqueId: string, colId: string, value: string) => void;
  onDeleteColumn: (colId: string) => void;
  onRenameColumn: (colId: string, name: string) => void;
  onResizeColumn: (colId: string, width: number) => void;
  onReorderColumns: (sourceId: string, targetId: string, pos: 'before' | 'after') => void;
  onUpdateColumnOptions: (colId: string, opts: LAColumn['options']) => void;
}

const ROW_H  = 40;
const ID_W   = 88;
const ST_W   = 120; // status badge column

// ── Editable cell for local columns ──────────────────────────────────────────
const EditableCell = memo(({ col, value, onChange }: {
  col: LAColumn; value: string; onChange: (v: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const [dropOpen, setDropOpen] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);
  const dateRef  = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);

  useEffect(() => {
    if (!dropOpen) return;
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [dropOpen]);

  const commit = () => { setEditing(false); if (draft !== value) onChange(draft); };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  };

  if (col.type === 'dropdown') {
    const options = col.options ?? [];
    const selected = options.find(o => o.id === value);
    return (
      <div ref={dropRef} className="relative w-full h-full">
        <button tabIndex={0} onClick={() => setDropOpen(o => !o)}
          className="w-full h-full flex items-center px-2.5 hover:bg-slate-50 focus:outline-none focus:bg-blue-50 transition-colors">
          {selected
            ? <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${OPTION_COLOR_STYLES[selected.color]?.full ?? ''}`}>{selected.label}</span>
            : <span className="text-slate-300 text-xs">—</span>
          }
        </button>
        {dropOpen && (
          <div className="absolute top-full left-0 mt-0.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-40 py-1"
            style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
            <button onClick={() => { onChange(''); setDropOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50">— Clear</button>
            {options.map(opt => (
              <button key={opt.id} onClick={() => { onChange(opt.id); setDropOpen(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${OPTION_COLOR_STYLES[opt.color]?.full ?? ''}`}>{opt.label}</span>
                {value === opt.id && <span className="ml-auto text-blue-500 text-xs">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (col.type === 'date') {
    const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const toIso = (v: string) => {
      if (!v) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const m = v.match(/^(\d{1,2})[\-\/\s]([A-Za-z]{3})[\-\/\s](\d{2,4})$/);
      if (m) {
        const mo = MN.findIndex(x => x.toLowerCase()===m[2].toLowerCase())+1;
        const yr = m[3].length===2?`20${m[3]}`:m[3];
        if (mo>0) return `${yr}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      }
      return '';
    };
    const toTx = (v: string) => {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return `${m[3]}-${MN[parseInt(m[2],10)-1]}-${m[1]}`;
      return v;
    };
    const display = toTx(value) || value;
    return (
      <div className="w-full h-full flex items-center px-2.5 gap-1.5 hover:bg-slate-50 group/date">
        <span className="flex-1 text-xs text-slate-700 truncate pointer-events-none">
          {display || <span className="text-slate-300">DD-Mon-YYYY</span>}
        </span>
        <div className="relative flex-shrink-0 w-5 h-5 opacity-0 group-hover/date:opacity-100 transition-all">
          <Calendar size={13} className="text-blue-500 absolute inset-0 m-auto pointer-events-none" />
          <input
            ref={dateRef}
            type="date"
            value={toIso(value)}
            onChange={e => { if(e.target.value) onChange(toTx(e.target.value)); }}
            onClick={e => e.stopPropagation()}
            onFocus={e => e.stopPropagation()}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            style={{ zIndex: 2 }}
            title="Pick date"
          />
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <input ref={inputRef} tabIndex={0}
        type={col.type === 'number' ? 'number' : col.type === 'link' ? 'url' : 'text'}
        value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={handleKey}
        className="w-full h-full px-2.5 text-xs text-slate-700 bg-blue-50 outline-none ring-1 ring-inset ring-blue-300"
      />
    );
  }

  // Single click = view popup, double click = edit
  if (showPopup && value) return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={() => setShowPopup(false)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
          style={{boxShadow:'0 24px 64px rgba(0,0,0,0.2)'}}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{col.name}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowPopup(false); setEditing(true); }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                Double-click to edit
              </button>
              <button onClick={() => setShowPopup(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
          </div>
          <div className="px-5 py-4 max-h-96 overflow-y-auto">
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{value}</p>
          </div>
        </div>
      </div>
      <div className="w-full h-full flex items-center px-2.5">
        <span className="text-xs text-slate-700 truncate">{value}</span>
      </div>
    </>
  );

  return (
    <div tabIndex={0}
      onClick={() => { if (value) setShowPopup(true); }}
      onDoubleClick={() => { setShowPopup(false); setEditing(true); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'F2') setEditing(true); }}
      className="w-full h-full flex items-center px-2.5 hover:bg-slate-50 cursor-pointer focus:outline-none focus:bg-blue-50"
      title={value ? 'Click to read · Double-click to edit' : 'Double-click to edit'}>
      {value
        ? <span className="text-xs text-slate-700 truncate">{value}</span>
        : <span className="text-slate-300 text-xs">—</span>
      }
    </div>
  );
});

// ── Read-only cell for linked columns ─────────────────────────────────────────
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const toTxDisplay = (v: string): string => {
  // YYYY-MM-DD -> DD-Mon-YYYY
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${MN[parseInt(m[2],10)-1]}-${m[1]}`;
  return v;
};

const ReadOnlyCell = memo(({ col, value }: { col: LAColumn; value: string }) => {
  const display = col.type === 'date' ? (toTxDisplay(value) || '—') : (value || '—');
  return (
    <div className="w-full h-full flex items-center px-2.5 bg-slate-50/50 cursor-default">
      <span className="text-xs text-slate-600 truncate">{display}</span>
    </div>
  );
});

// ── Main table ────────────────────────────────────────────────────────────────
export const LATable: React.FC<LATableProps> = ({
  columns, rows, priorityByUniqueId = {},
  onUpdateCell, onDeleteColumn, onRenameColumn, onResizeColumn,
  onReorderColumns, onUpdateColumnOptions, searchHighlight = '',
}) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  // ── Column resize ─────────────────────────────────────────────────────────
  const resizeRef = useRef<{ id: string; startX: number; startW: number } | null>(null);
  const startResize = useCallback((e: React.MouseEvent, colId: string, w: number) => {
    e.preventDefault(); e.stopPropagation();
    resizeRef.current = { id: colId, startX: e.clientX, startW: w };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      onResizeColumn(resizeRef.current.id, resizeRef.current.startW + ev.clientX - resizeRef.current.startX);
    };
    const onUp = () => { resizeRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onResizeColumn]);

  // ── Drag reorder ──────────────────────────────────────────────────────────
  const [dragId, setDragId]       = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const onGripDrag   = (e: React.DragEvent, id: string) => { dragIdRef.current = id; setDragId(id); e.dataTransfer.effectAllowed = 'move'; };
  const onThDragOver = (e: React.DragEvent, id: string) => {
    if (!dragIdRef.current || dragIdRef.current === id) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropTarget({ id, pos: e.clientX < rect.left + rect.width / 2 ? 'before' : 'after' });
  };
  const onThDrop = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragIdRef.current && dragIdRef.current !== id && dropTarget)
      onReorderColumns(dragIdRef.current, id, dropTarget.pos);
    dragIdRef.current = null; setDragId(null); setDropTarget(null);
  };
  const onDragEnd = () => { dragIdRef.current = null; setDragId(null); setDropTarget(null); };

  // ── Right-click context menu ──────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ colId: string; x: number; y: number } | null>(null);

  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-slate-200">
        <Link2 size={28} className="text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-500">No columns yet</p>
        <p className="text-xs text-slate-400 mt-1">Click <strong>Add Column</strong> to start adding data</p>
      </div>
    );
  }

  const ctxCol = ctxMenu ? columns.find(c => c.id === ctxMenu.colId) : null;

  return (
    <>
      <div ref={tableRef} className="overflow-x-auto rounded-xl border border-slate-200 bg-white w-full"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <table className="border-collapse w-full"
          style={{ tableLayout: 'fixed', minWidth: columns.reduce((s, c) => s + c.width, ID_W + ST_W) }}>
          <colgroup>
            <col style={{ width: ID_W, minWidth: ID_W }} />
            <col style={{ width: ST_W, minWidth: ST_W }} />
            <col style={{ width: 140, minWidth: 140 }} />
            {columns.map(c => <col key={c.id} style={{ width: c.width, minWidth: c.width }} />)}
          </colgroup>

          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {/* ID */}
              <th className="border-r border-slate-100 px-3 text-left" style={{ height: 40 }}>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">ID</span>
              </th>
              {/* Status */}
              <th className="border-r border-slate-100 px-3 text-left" style={{ height: 40 }}>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</span>
              </th>
              {/* Lead Category */}
              <th className="border-r border-slate-100 px-3 text-left" style={{ height: 40, width: 140 }}>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Lead Category</span>
              </th>

              {columns.map((col, _idx) => (
                <th key={col.id}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ colId: col.id, x: e.clientX, y: e.clientY }); }}
                  onDragOver={e => onThDragOver(e, col.id)}
                  onDrop={e => onThDrop(e, col.id)}
                  onDragLeave={() => setDropTarget(null)}
                  className={`border-r border-slate-100 text-left relative group/th ${dragId === col.id ? 'opacity-40' : ''}`}
                  style={{ height: 40, width: col.width }}>
                  {/* Drop indicators */}
                  {dropTarget?.id === col.id && dropTarget.pos === 'before' && <div className="absolute left-0 top-0 w-0.5 h-full bg-blue-500 z-20" />}
                  {dropTarget?.id === col.id && dropTarget.pos === 'after'  && <div className="absolute right-0 top-0 w-0.5 h-full bg-blue-500 z-20" />}

                  <div className="flex items-center h-full px-1.5 gap-1 overflow-hidden">
                    {/* Drag grip */}
                    <div draggable onDragStart={e => onGripDrag(e, col.id)} onDragEnd={onDragEnd}
                      className="flex-shrink-0 cursor-grab text-slate-300 hover:text-slate-500 opacity-0 group-hover/th:opacity-100 transition-colors p-0.5">
                      <GripVertical size={13} />
                    </div>

                    {/* Column name + source indicator */}
                    <span className="text-xs font-semibold text-slate-600 truncate flex-1 select-none">
                      {col.name}
                    </span>
                    {col.source === 'linked'
                      ? <Link2 size={10} className="text-blue-400 flex-shrink-0 opacity-0 group-hover/th:opacity-100" />
                      : <span className="text-xs text-slate-300 opacity-0 group-hover/th:opacity-100 flex-shrink-0 pr-1">⋯</span>
                    }
                  </div>

                  {/* Resize handle */}
                  <div className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize z-10 opacity-0 group-hover/th:opacity-100 bg-blue-300 transition-opacity"
                    onMouseDown={e => startResize(e, col.id, col.width)} />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="text-center py-14 text-sm text-slate-400">
                  No leads at Contacted, Interviewed, or Hired stage yet.
                </td>
              </tr>
            ) : rows.map(row => (
              <tr key={row.uniqueId}
                ref={el => {
                  if (!el || !searchHighlight) return;
                  const q = searchHighlight.toLowerCase();
                  const matches = row.uniqueId.toLowerCase().includes(q) || Object.values(row.data).some(v => String(v).toLowerCase().includes(q));
                  el.setAttribute('data-la-highlight', matches ? 'true' : 'false');
                }}
                onClick={() => setSelectedRow(row.uniqueId === selectedRow ? null : row.uniqueId)}
                className={`border-b border-slate-100 last:border-0 transition-colors group/row cursor-pointer ${
                  searchHighlight && (row.uniqueId.toLowerCase().includes(searchHighlight.toLowerCase()) || Object.values(row.data).some(v => String(v).toLowerCase().includes(searchHighlight.toLowerCase())))
                    ? 'bg-amber-50 border-l-4 border-l-amber-400'
                    : selectedRow === row.uniqueId
                    ? 'bg-blue-50 border-l-2 border-l-blue-400'
                    : 'hover:bg-blue-50/30'
                }`}
                style={{ height: ROW_H }}>

                {/* Unique ID */}
                <td className="border-r border-slate-100 px-3" style={{ width: ID_W }}>
                  <span className="text-xs font-mono font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">
                    {row.uniqueId}
                  </span>
                </td>

                {/* Current status badge */}
                <td className="border-r border-slate-100 px-2.5" style={{ width: ST_W }}>
                  {row.currentStatus ? (
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${getFunnelStatusStyle(row.currentStatus).full}`}>
                      {row.currentStatus}
                    </span>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>

                {/* Lead Category from prioritization */}
                <td className="border-r border-slate-100 px-2.5" style={{ width: 140 }}>
                  {priorityByUniqueId[row.uniqueId] ? (() => {
                    const p = priorityByUniqueId[row.uniqueId];
                    const tierStyle =
                      p.tier === 'High Tier'   ? 'bg-emerald-100 text-emerald-700' :
                      p.tier === 'Medium Tier' ? 'bg-amber-100 text-amber-700' :
                                                  'bg-slate-100 text-slate-600';
                    return (
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${tierStyle}`}>
                          {p.tier.replace(' Tier', '')}
                        </span>
                        <span className="text-xs text-slate-500 tabular-nums font-medium">
                          {p.score > 0 ? `+${p.score}` : p.score}
                        </span>
                      </div>
                    );
                  })() : <span className="text-slate-300 text-xs">Not scored</span>}
                </td>

                {/* Data cells */}
                {columns.map(col => (
                  <td key={col.id}
                    className={`border-r border-slate-100 p-0 ${dragId === col.id ? 'opacity-30' : ''}`}
                    style={{ width: col.width, height: ROW_H }}>
                    {col.source === 'linked' ? (
                      <ReadOnlyCell col={col} value={row.data[col.id] ?? ''} />
                    ) : (
                      <EditableCell col={col} value={row.data[col.id] ?? ''}
                        onChange={v => onUpdateCell(row.uniqueId, col.id, v)} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Context menu */}
      {ctxMenu && ctxCol && (
        <LAColumnContextMenu
          column={ctxCol}
          x={ctxMenu.x}
          y={ctxMenu.y}
          isFirst={columns[0]?.id === ctxCol.id}
          isLast={columns[columns.length - 1]?.id === ctxCol.id}
          onClose={() => setCtxMenu(null)}
          onRename={name => { onRenameColumn(ctxCol.id, name); setCtxMenu(null); }}
          onDelete={() => { onDeleteColumn(ctxCol.id); setCtxMenu(null); }}
          onMoveLeft={() => { const i = columns.findIndex(c => c.id === ctxCol.id); if (i > 0) onReorderColumns(ctxCol.id, columns[i-1].id, 'before'); setCtxMenu(null); }}
          onMoveRight={() => { const i = columns.findIndex(c => c.id === ctxCol.id); if (i < columns.length-1) onReorderColumns(ctxCol.id, columns[i+1].id, 'after'); setCtxMenu(null); }}
          onSetWidth={w => { onResizeColumn(ctxCol.id, w); }}
          onUpdateOptions={opts => { onUpdateColumnOptions(ctxCol.id, opts); }}
        />
      )}
    </>
  );
};
