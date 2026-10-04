import { logActivity } from './useActivityLog';
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import type { Note, NoteColor } from '../types/notes';

const uid = () => `note_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const bg  = (p: PromiseLike<unknown>) => Promise.resolve(p).catch(() => {});

function rowToNote(r: any): Note {
  return {
    id: r.id, title: r.title, content: r.content, color: r.color,
    pinned: r.pinned, tags: r.tags ?? [],
    createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  };
}

export function useNotes() {
  const [notes,   setNotes]   = useState<Note[]>([]);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);
  const localInserts = useRef<Set<string>>(new Set());
  const localDeletes = useRef<Set<string>>(new Set());

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('notes').select('*')
          .order('pinned', { ascending: false }).order('updated_at', { ascending: false });
        if (error?.code === '42P01') { setLoading(false); return; }
        if (!error && data) setNotes(data.map(rowToNote));
      } catch { } finally { setLoading(false); }
    })();

    // ── Realtime ──────────────────────────────────────────────────────────
    const ch = supabase.channel(`notes_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') {
            const r = rowToNote(n);
            if (localInserts.current.has(r.id)) { localInserts.current.delete(r.id); return; }
            setNotes(prev => prev.find(x => x.id === r.id) ? prev : [r, ...prev]);
          }
          if (eventType === 'UPDATE') {
            setNotes(prev => prev.map(x => x.id === (n as any).id ? rowToNote(n) : x));
          }
          if (eventType === 'DELETE') {
            const id = (o as any).id;
            if (localDeletes.current.has(id)) { localDeletes.current.delete(id); return; }
            setNotes(prev => prev.filter(x => x.id !== id));
          }
        }).subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const filteredNotes = search
    ? notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase()) ||
        n.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
    : notes;

  const pinnedNotes   = filteredNotes.filter(n => n.pinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.pinned);

  const addNote = useCallback(() => {
    const now = new Date();
    const note: Note = { id: uid(), title: 'Untitled note', content: '', color: 'white', pinned: false, createdAt: now, updatedAt: now, tags: [] };
    localInserts.current.add(note.id);
    setNotes(prev => [note, ...prev]);
    logActivity('created', 'Notes', note.id, `Created note: "${note.title}"`);
    bg(supabase.from('notes').insert({ id: note.id, title: note.title, content: note.content, color: note.color, pinned: note.pinned, tags: note.tags, created_at: now.toISOString(), updated_at: now.toISOString() }));
    return note.id;
  }, []);

  const noteLogDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const updateNote = useCallback((id: string, changes: Partial<Note>) => {
    const n = notes.find(x => x.id === id);
    if (n && (changes.title !== undefined || changes.content !== undefined)) {
      clearTimeout(noteLogDebounce.current[id]);
      noteLogDebounce.current[id] = setTimeout(() => {
        logActivity('updated', 'Notes', id, `Updated note: "${changes.title ?? n.title}"`);
      }, 2000);
    }
    const now = new Date();
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...changes, updatedAt: now } : n));
    const db: any = { updated_at: now.toISOString() };
    if (changes.title   !== undefined) db.title   = changes.title;
    if (changes.content !== undefined) db.content = changes.content;
    if (changes.color   !== undefined) db.color   = changes.color;
    if (changes.pinned  !== undefined) db.pinned  = changes.pinned;
    if (changes.tags    !== undefined) db.tags    = changes.tags;
    bg(supabase.from('notes').update(db).eq('id', id));
  }, []);

  const deleteNote = useCallback((id: string) => {
    localDeletes.current.add(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    const _n = notes.find(x=>x.id===id);
    if(_n) logActivity('deleted', 'Notes', id, `Deleted note: "${_n.title}"`);
    bg(supabase.from('notes').delete().eq('id', id));
  }, []);

  const togglePin = useCallback((id: string) => {
    setNotes(prev => prev.map(n => {
      if (n.id !== id) return n;
      const pinned = !n.pinned;
      bg(supabase.from('notes').update({ pinned, updated_at: new Date().toISOString() }).eq('id', id));
      return { ...n, pinned, updatedAt: new Date() };
    }));
  }, []);

  const changeColor = useCallback((id: string, color: NoteColor) => {
    setNotes(prev => prev.map(n => {
      if (n.id !== id) return n;
      bg(supabase.from('notes').update({ color, updated_at: new Date().toISOString() }).eq('id', id));
      return { ...n, color, updatedAt: new Date() };
    }));
  }, []);

  return { notes: filteredNotes, pinnedNotes, unpinnedNotes, search, setSearch, addNote, updateNote, deleteNote, togglePin, changeColor, total: notes.length, loading };
}
