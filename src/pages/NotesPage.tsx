import React from 'react';
import { NotebookPen, Plus, Search, Pin, StickyNote } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { NoteCard } from '../components/notes/NoteCard';
import { useNotes } from '../hooks/useNotes';

export const NotesPage: React.FC = () => {
  const { pinnedNotes, unpinnedNotes, search, setSearch, addNote, updateNote, deleteNote, togglePin, changeColor } = useNotes();

  return (
    <div className="space-y-6 max-w-screen-xl">
      <PageHeader
        title="Notes"
        subtitle="Capture ideas and keep your thoughts organized"
        actions={
          <button onClick={addNote}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
            <Plus size={15}/> New Note
          </button>
        }
      />

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl px-3 py-2 w-72 focus-within:border-blue-300 transition-colors"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Search size={14} className="text-slate-400 flex-shrink-0"/>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search notes..." className="flex-1 text-sm text-slate-700 placeholder-slate-400 outline-none bg-transparent"/>
      </div>

      {/* Pinned notes */}
      {pinnedNotes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Pin size={13} className="text-slate-400"/>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pinned</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {pinnedNotes.map(note => (
              <NoteCard key={note.id} note={note} onUpdate={updateNote} onDelete={deleteNote} onTogglePin={togglePin} onChangeColor={changeColor}/>
            ))}
          </div>
        </div>
      )}

      {/* All other notes */}
      {unpinnedNotes.length > 0 && (
        <div>
          {pinnedNotes.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <NotebookPen size={13} className="text-slate-400"/>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {unpinnedNotes.map(note => (
              <NoteCard key={note.id} note={note} onUpdate={updateNote} onDelete={deleteNote} onTogglePin={togglePin} onChangeColor={changeColor}/>
            ))}
            <button onClick={addNote}
              className="rounded-2xl border-2 border-dashed border-slate-200 p-4 flex flex-col items-center justify-center gap-2 text-slate-300 hover:text-slate-400 hover:border-slate-300 hover:bg-slate-50/50 transition-all min-h-32">
              <Plus size={20}/><span className="text-sm font-medium">New note</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {pinnedNotes.length === 0 && unpinnedNotes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <StickyNote size={28} className="text-slate-300"/>
          </div>
          <h3 className="text-base font-semibold text-slate-500 mb-1">
            {search ? 'No notes match your search' : 'No notes yet'}
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            {search ? 'Try different keywords' : 'Create your first note to get started'}
          </p>
          {!search && (
            <button onClick={addNote}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
              <Plus size={15}/> Create Note
            </button>
          )}
        </div>
      )}
    </div>
  );
};
