import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Copy, Trash2, GripVertical } from 'lucide-react';
import type { Column, Row, ColumnType } from '../../types/proposals';
import { TableCell } from './TableCell';
import { ColumnContextMenu } from './ColumnContextMenu';

interface ProposalTableProps {
  columns: Column[];
  rows: Row[];
  searchHighlight?: string;
  hideId?: boolean;
  hideActions?: boolean;
  onUpdateCell: (rowId: string, colId: string, value: string) => void;
  onDuplicateRow: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onRenameColumn: (colId: string, name: string) => void;
  onChangeColumnType: (colId: string, type: ColumnType) => void;
  onDeleteColumn: (colId: string) => void;
  onDuplicateColumn: (colId: string) => void;
  onReorderColumns: (sourceId: string, targetId: string, pos: 'before' | 'after') => void;
  onResizeColumn: (colId: string, width: number) => void;
  onMoveLeft: (colId: string) => void;
  onMoveRight: (colId: string) => void;
  onUpdateColumnOptions: (colId: string, opts: Column['options']) => void;
  getRowClass?: (row: Row) => string;
}

const ROW_H   = 40;
const ID_W    = 88;
const ACT_W   = 72;

export const ProposalTable: React.FC<ProposalTableProps> = ({
  columns, rows, searchHighlight = '', hideId = false, hideActions = false,
  onUpdateCell, onDuplicateRow, onDeleteRow,
  onRenameColumn, onChangeColumnType, onDeleteColumn, onDuplicateColumn,
  onReorderColumns, onResizeColumn, onMoveLeft, onMoveRight, onUpdateColumnOptions, getRowClass,
}) => {
  const tableRef = useRef<HTMLDivElement>(null);

  // ── Keyboard nav ────────────────────────────────────────────────────────
  const focusCell = useCallback((r: number, c: number) => {
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`);
    el?.focus();
  }, []);

  const navigate = useCallback((ri: number, ci: number, rd: number, cd: number) => {
    let nr = ri + rd, nc = ci + cd;
    if (nc < 0)               { nr--; nc = columns.length - 1; }
    if (nc >= columns.length) { nr++; nc = 0; }
    nr = Math.max(0, Math.min(nr, rows.length - 1));
    nc = Math.max(0, Math.min(nc, columns.length - 1));
    focusCell(nr, nc);
  }, [columns.length, rows.length, focusCell]);

  // ── Right-click context menu ─────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ colId: string; x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, colId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ colId, x: e.clientX, y: e.clientY });
  }, []);

  const closeCtx = useCallback(() => setCtxMenu(null), []);

  // ── Double-click inline rename ──────────────────────────────────────────
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback((colId: string, currentName: string) => {
    setRenaming(colId);
    setRenameVal(currentName);
    setTimeout(() => { renameRef.current?.focus(); renameRef.current?.select(); }, 30);
  }, []);

  const commitRename = useCallback(() => {
    if (renaming && renameVal.trim()) onRenameColumn(renaming, renameVal.trim());
    setRenaming(null);
  }, [renaming, renameVal, onRenameColumn]);

  // ── Column resize ────────────────────────────────────────────────────────
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

  // ── Drag reorder ────────────────────────────────────────────────────────
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
    if (dragIdRef.current && dragIdRef.current !== id && dropTarget) onReorderColumns(dragIdRef.current, id, dropTarget.pos);
    dragIdRef.current = null; setDragId(null); setDropTarget(null);
  };
  const onDragEnd = () => { dragIdRef.current = null; setDragId(null); setDropTarget(null); };

  // ── Delete row confirm ───────────────────────────────────────────────────
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [pendingDel, setPendingDel] = useState<string | null>(null);
  const delTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDelRow = (rowId: string) => {
    if (pendingDel === rowId) { if (delTimer.current) clearTimeout(delTimer.current); setPendingDel(null); onDeleteRow(rowId); }
    else { if (delTimer.current) clearTimeout(delTimer.current); setPendingDel(rowId); delTimer.current = setTimeout(() => setPendingDel(null), 3000); }
  };
  useEffect(() => () => { if (delTimer.current) clearTimeout(delTimer.current); }, []);

  if (columns.length === 0) return (
    <div className="flex items-center justify-center py-24 bg-white rounded-xl border border-slate-200">
      <p className="text-sm text-slate-400">No columns yet — click <strong className="text-slate-600">Add Column</strong> to start.</p>
    </div>
  );

  const ctxCol = ctxMenu ? columns.find(c => c.id === ctxMenu.colId) : null;

  return (
    <>
      <div ref={tableRef} className="overflow-x-auto rounded-xl border border-slate-200 bg-white w-full"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <table className="border-collapse w-full" style={{ tableLayout: 'fixed', minWidth: columns.reduce((sum, col) => sum + col.width, (hideId ? 0 : ID_W) + (hideActions ? 0 : ACT_W)) }}>
          <colgroup>
            {!hideId && <col style={{ width: ID_W, minWidth: ID_W }} />}
            {columns.map(c => <col key={c.id} style={{ width: c.width, minWidth: c.width }} />)}
            {!hideActions && <col style={{ width: ACT_W, minWidth: ACT_W }} />}
          </colgroup>

          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {!hideId && <th className="border-r border-slate-100 px-3 text-left" style={{ height: 40 }}>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">ID</span>
              </th>}

              {columns.map((col, _idx) => (
                <th key={col.id}
                  onContextMenu={e => handleContextMenu(e, col.id)}
                  onDragOver={e => onThDragOver(e, col.id)}
                  onDrop={e => onThDrop(e, col.id)}
                  onDragLeave={() => setDropTarget(null)}
                  className={`border-r border-slate-100 text-left relative group/th select-none ${dragId === col.id ? 'opacity-40' : ''}`}
                  style={{ height: 40, width: col.width }}
                >
                  {/* Drop indicators */}
                  {dropTarget?.id === col.id && dropTarget.pos === 'before' && <div className="absolute left-0 top-0 w-0.5 h-full bg-blue-500 z-20" />}
                  {dropTarget?.id === col.id && dropTarget.pos === 'after'  && <div className="absolute right-0 top-0 w-0.5 h-full bg-blue-500 z-20" />}

                  <div className="flex items-center h-full px-1.5 gap-1 overflow-hidden">
                    {/* Grip */}
                    <div draggable onDragStart={e => onGripDrag(e, col.id)} onDragEnd={onDragEnd}
                      className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 opacity-0 group-hover/th:opacity-100 transition-colors p-0.5"
                      title="Drag to reorder">
                      <GripVertical size={13} />
                    </div>

                    {/* Column name — double-click to rename */}
                    {renaming === col.id ? (
                      <input ref={renameRef} value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                        className="flex-1 text-xs font-semibold text-slate-700 bg-white border border-blue-400 rounded px-1.5 py-0.5 outline-none min-w-0"
                      />
                    ) : (
                      <span
                        className="text-xs font-semibold text-slate-600 truncate flex-1 cursor-default"
                        onDoubleClick={() => startRename(col.id, col.name)}
                        title="Double-click to rename"
                      >
                        {col.name}
                      </span>
                    )}

                    {/* Right-click hint */}
                    <span className="text-xs text-slate-300 opacity-0 group-hover/th:opacity-100 flex-shrink-0 pr-1 hidden xl:block" title="Right-click for options">⋯</span>
                  </div>

                  {/* Resize handle */}
                  <div className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize z-10 opacity-0 group-hover/th:opacity-100 bg-blue-300 transition-opacity"
                    onMouseDown={e => startResize(e, col.id, col.width)} />
                </th>
              ))}

              <th className="text-center" style={{ height: 40 }}>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length + 2} className="text-center py-14 text-sm text-slate-400">
                No rows yet — click <strong className="text-slate-600">Add Row</strong> to get started.
              </td></tr>
            ) : rows.map((row, ri) => (
              <tr key={row.id}
                  ref={el => { if (el && searchHighlight && (row.display_id?.toLowerCase().includes(searchHighlight.toLowerCase()) || Object.values(row.data).some(v => String(v).toLowerCase().includes(searchHighlight.toLowerCase())))) el.setAttribute('data-highlight-row','true'); }}
                  onClick={() => setSelectedRow(row.id === selectedRow ? null : row.id)}
                  className={`border-b border-slate-100 last:border-0 transition-colors group/row cursor-pointer ${getRowClass?.(row) ?? ''} ${
                    searchHighlight && (row.display_id?.toLowerCase().includes(searchHighlight.toLowerCase()) || Object.values(row.data).some(v => String(v).toLowerCase().includes(searchHighlight.toLowerCase())))
                      ? 'bg-amber-50 border-l-4 border-l-amber-400'
                      : selectedRow === row.id
                        ? 'bg-blue-50 border-l-2 border-l-blue-400'
                        : 'hover:bg-blue-50/30'
                  }`}
                  style={{ height: ROW_H }}>
                {!hideId && <td className="border-r border-slate-100 px-3" style={{ width: ID_W }}>
                  <span className="text-xs font-mono font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md select-all" title={row.id}>
                    {row.display_id || `UP${String(ri + 1).padStart(3, '0')}`}
                  </span>
                </td>}

                {columns.map((col, ci) => (
                  <td key={col.id} className={`border-r border-slate-100 p-0 ${dragId === col.id ? 'opacity-30' : ''}`}
                    style={{ width: col.width, height: ROW_H }}>
                    <TableCell column={col} value={row.data[col.id] ?? ''}
                      cellKey={`${ri}-${ci}`}
                      onChange={v => onUpdateCell(row.id, col.id, v)}
                      onNavigate={(rd, cd) => navigate(ri, ci, rd, cd)}
                    />
                  </td>
                ))}

                {!hideActions && <td className="text-center" style={{ width: ACT_W }}>
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                    <button tabIndex={-1} onClick={() => onDuplicateRow(row.id)} title="Duplicate"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Copy size={13} />
                    </button>
                    <div className="relative">
                      <button tabIndex={-1} onClick={() => handleDelRow(row.id)}
                        title={pendingDel === row.id ? 'Click again to confirm' : 'Delete'}
                        className={`p-1.5 rounded-lg transition-all ${pendingDel === row.id ? 'text-white bg-red-500' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}>
                        <Trash2 size={13} />
                      </button>
                      {pendingDel === row.id && (
                        <div className="absolute bottom-full right-0 mb-1.5 bg-slate-800 text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none z-50 shadow-lg">
                          Click again to delete
                          <div className="absolute top-full right-2 border-4 border-transparent border-t-slate-800" />
                        </div>
                      )}
                    </div>
                  </div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>

        {dragId && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-3 py-1.5 rounded-full shadow-lg pointer-events-none z-50 flex items-center gap-1.5">
            <GripVertical size={12} /> Drop to reorder
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && ctxCol && (
        <ColumnContextMenu
          column={ctxCol}
          x={ctxMenu.x}
          y={ctxMenu.y}
          isFirst={columns[0]?.id === ctxCol.id}
          isLast={columns[columns.length - 1]?.id === ctxCol.id}
          onClose={closeCtx}
          onRename={name => { onRenameColumn(ctxCol.id, name); closeCtx(); }}
          onChangeType={type => { onChangeColumnType(ctxCol.id, type); closeCtx(); }}
          onDelete={() => { onDeleteColumn(ctxCol.id); closeCtx(); }}
          onMoveLeft={() => { onMoveLeft(ctxCol.id); closeCtx(); }}
          onMoveRight={() => { onMoveRight(ctxCol.id); closeCtx(); }}
          onDuplicate={() => { onDuplicateColumn(ctxCol.id); closeCtx(); }}
          onSetWidth={w => onResizeColumn(ctxCol.id, w)}
          onUpdateOptions={opts => onUpdateColumnOptions(ctxCol.id, opts)}
        />
      )}
    </>
  );
};
