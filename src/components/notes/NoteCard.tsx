import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Pin, PinOff, Trash2, Palette, X } from 'lucide-react';
import type { Note, NoteColor } from '../../types/notes';

// ── Full note editing modal ───────────────────────────────────────────────
const NoteModal: React.FC<{
  note: Note;
  colors: { bg: string; border: string; text: string };
  onUpdate: (id: string, changes: Partial<Note>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}> = ({ note, colors, onUpdate, onDelete, onClose }) => {
  const [title,   setTitle]   = useState(note.title);
  const [content, setContent] = useState(note.content);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Auto-save with debounce
  const save = (t: string, cont: string) => {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      if (t !== note.title || cont !== note.content) {
        onUpdate(note.id, { title: t.trim() || 'Untitled note', content: cont });
      }
    }, 600);
  };

  const handleClose = () => {
    clearTimeout(saveTimeout.current);
    if (title !== note.title || content !== note.content) {
      onUpdate(note.id, { title: title.trim() || 'Untitled note', content });
    }
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', h);
    return () => { document.removeEventListener('keydown', h); clearTimeout(saveTimeout.current); };
  }, [title, content]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`${colors.bg} ${colors.border} border rounded-2xl shadow-2xl w-full flex flex-col`}
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.2)', maxHeight: '92vh', width: 'min(860px, 95vw)' }}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${colors.border}`}>
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); save(e.target.value, content); }}
            placeholder="Note title..."
            className={`flex-1 text-lg font-bold bg-transparent outline-none ${colors.text} placeholder-current placeholder-opacity-30`}
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          />
          <div className="flex items-center gap-1 ml-3">
            <button onClick={() => { if (window.confirm('Delete this note?')) { onDelete(note.id); onClose(); } }}
              className="p-2 hover:bg-red-100 rounded-xl text-slate-400 hover:text-red-500 transition-colors" title="Delete">
              <Trash2 size={15}/>
            </button>
            <button onClick={handleClose}
              className="p-2 hover:bg-black/10 rounded-xl text-slate-400 hover:text-slate-600 transition-colors" title="Close (Esc)">
              <X size={16}/>
            </button>
          </div>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <textarea
            autoFocus
            value={content}
            onChange={e => { setContent(e.target.value); save(title, e.target.value); }}
            placeholder="Write your note here..."
            className={`w-full h-full bg-transparent outline-none resize-none text-sm leading-relaxed ${colors.text} placeholder-current placeholder-opacity-30`}
            style={{ minHeight: '500px' }}
          />
        </div>
        {/* Footer */}
        <div className={`px-5 py-3 border-t ${colors.border} flex items-center justify-between`}>
          <p className={`text-xs opacity-50 ${colors.text}`}>
            {note.updatedAt ? `Last edited ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(note.updatedAt))}` : ''}
          </p>
          <p className={`text-xs opacity-40 ${colors.text}`}>Auto-saves · Esc to close</p>
        </div>
      </div>
    </div>
  );
};

interface NoteCardProps {
  note: Note;
  onUpdate: (id: string, changes: Partial<Note>) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onChangeColor: (id: string, color: NoteColor) => void;
}

const colorMap: Record<NoteColor, { bg: string; border: string; text: string }> = {
  white:  { bg: 'bg-white',       border: 'border-slate-100',   text: 'text-slate-700'   },
  yellow: { bg: 'bg-amber-50',    border: 'border-amber-100',   text: 'text-amber-900'   },
  blue:   { bg: 'bg-blue-50',     border: 'border-blue-100',    text: 'text-blue-900'    },
  green:  { bg: 'bg-emerald-50',  border: 'border-emerald-100', text: 'text-emerald-900' },
  pink:   { bg: 'bg-pink-50',     border: 'border-pink-100',    text: 'text-pink-900'    },
  purple: { bg: 'bg-violet-50',   border: 'border-violet-100',  text: 'text-violet-900'  },
};

const colorOptions: { color: NoteColor; hex: string }[] = [
  { color: 'white',  hex: '#ffffff' },
  { color: 'yellow', hex: '#fef3c7' },
  { color: 'blue',   hex: '#eff6ff' },
  { color: 'green',  hex: '#ecfdf5' },
  { color: 'pink',   hex: '#fdf2f8' },
  { color: 'purple', hex: '#f5f3ff' },
];

export const NoteCard: React.FC<NoteCardProps> = ({ note, onUpdate, onDelete, onTogglePin, onChangeColor }) => {
  const [modalOpen,      setModalOpen]      = useState(false);
  const [editingTitle,   setEditingTitle]   = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [localTitle,     setLocalTitle]     = useState(note.title);
  const [localContent,   setLocalContent]   = useState(note.content);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorRef   = useRef<HTMLDivElement>(null);
  const titleRef   = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Sync from parent when note updates externally
  useEffect(() => { setLocalTitle(note.title); },   [note.title]);
  useEffect(() => { setLocalContent(note.content); }, [note.content]);

  useEffect(() => { if (editingTitle)   titleRef.current?.select(); },   [editingTitle]);
  useEffect(() => { if (editingContent) contentRef.current?.focus(); }, [editingContent]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setShowColorPicker(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const saveTitle = useCallback(() => {
    setEditingTitle(false);
    const t = localTitle.trim() || 'Untitled note';
    setLocalTitle(t);
    if (t !== note.title) onUpdate(note.id, { title: t });
  }, [localTitle, note.id, note.title, onUpdate]);

  const saveContent = useCallback(() => {
    setEditingContent(false);
    if (localContent !== note.content) onUpdate(note.id, { content: localContent });
  }, [localContent, note.id, note.content, onUpdate]);

  const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
  const colors = colorMap[note.color];

  return (
    <>
    {modalOpen && (
      <NoteModal
        note={{ ...note, title: localTitle, content: localContent }}
        colors={colorMap[note.color]}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onClose={() => setModalOpen(false)}
      />
    )}
    <div className={`group relative rounded-2xl border p-3 flex flex-col gap-2 hover:shadow-md transition-all duration-200 cursor-pointer ${colors.bg} ${colors.border}`}
      onClick={() => setModalOpen(true)}
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)', minHeight: '100px', maxHeight: '180px', overflow: 'hidden' }}>

      {note.pinned && <div className="absolute top-3 right-3"><Pin size={13} className="text-slate-400 rotate-45" /></div>}

      {/* ── Title ── */}
      {editingTitle ? (
        <input ref={titleRef}
          onClick={e => e.stopPropagation()}
          className={`text-sm font-semibold bg-white/70 border border-blue-300 rounded-lg px-2 py-1 outline-none w-full ${colors.text}`}
          value={localTitle}
          onChange={e => setLocalTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={e => { if (e.key === 'Enter') { saveTitle(); setEditingContent(true); } if (e.key === 'Escape') saveTitle(); }}
          placeholder="Note title..."
        />
      ) : (
        <h3 onClick={() => setEditingTitle(true)}
          className={`text-sm font-semibold leading-snug pr-5 cursor-text hover:underline decoration-dotted underline-offset-2 ${colors.text}`}
          title="Click to edit title">
          {localTitle || <span className="italic opacity-40 font-normal">Click to add title...</span>}
        </h3>
      )}

      {/* ── Content / Description ── */}
      {editingContent ? (
        <textarea ref={contentRef}
          onClick={e => e.stopPropagation()}
          className={`text-xs bg-white/70 border border-blue-300 rounded-lg px-2.5 py-2 outline-none w-full resize-none leading-relaxed ${colors.text}`}
          value={localContent}
          onChange={e => setLocalContent(e.target.value)}
          onBlur={saveContent}
          onKeyDown={e => { if (e.key === 'Escape') saveContent(); }}
          rows={5}
          placeholder="Write your note here..."
        />
      ) : (
        <div onClick={() => setEditingContent(true)}
          className={`text-xs leading-relaxed cursor-text min-h-[48px] rounded-lg px-1 py-0.5 hover:bg-black/5 transition-colors ${colors.text}`}
          style={{ whiteSpace: 'pre-wrap' }}>
          {localContent
            ? <span className="opacity-75">{localContent}</span>
            : <span className="italic opacity-40">Click to add description...</span>}
        </div>
      )}

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {note.tags.map(tag => (
            <span key={tag} className={`text-xs px-1.5 py-0.5 rounded-md font-medium opacity-60 ${colors.text} bg-black/5`}>#{tag}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className={`text-xs opacity-40 ${colors.text}`}>{fmt(note.updatedAt)}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Color picker */}
          <div className="relative" ref={colorRef}>
            <button className={`p-1.5 rounded-lg hover:bg-black/5 transition-colors ${colors.text} opacity-60 hover:opacity-100`}
              onClick={() => setShowColorPicker(s => !s)} title="Change color">
              <Palette size={13} />
            </button>
            {showColorPicker && (
              <div className="absolute bottom-full mb-1 right-0 bg-white border border-slate-100 rounded-xl p-2 shadow-lg z-20 flex gap-1">
                {colorOptions.map(({ color, hex }) => (
                  <button key={color}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${note.color === color ? 'border-blue-500 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: hex, boxShadow: '0 0 0 1px rgba(0,0,0,0.1)' }}
                    onClick={() => { onChangeColor(note.id, color); setShowColorPicker(false); }}
                  />
                ))}
              </div>
            )}
          </div>
          <button className={`p-1.5 rounded-lg hover:bg-black/5 transition-colors ${colors.text} opacity-60 hover:opacity-100`}
            onClick={() => onTogglePin(note.id)} title={note.pinned ? 'Unpin' : 'Pin'}>
            {note.pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
            onClick={() => onDelete(note.id)} title="Delete note">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
    </>
  );
};
