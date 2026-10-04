import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, AlertCircle, Pencil, Check, X } from 'lucide-react';
import type { TodoItem, Priority } from '../../types/notes';

interface TodoListComponentProps {
  todos: TodoItem[];
  filter: 'all' | 'active' | 'completed';
  setFilter: (f: 'all' | 'active' | 'completed') => void;
  priorityFilter: Priority | 'all';
  setPriorityFilter: (p: Priority | 'all') => void;
  onAdd: (text: string, priority: Priority) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, changes: Partial<TodoItem>) => void;
  onClearCompleted: () => void;
  stats: { total: number; active: number; completed: number; high: number };
}

const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string; border: string }> = {
  high:   { label: 'High',   dot: 'bg-red-500',   border: 'border-red-200'   },
  medium: { label: 'Medium', dot: 'bg-amber-400',  border: 'border-amber-200' },
  low:    { label: 'Low',    dot: 'bg-slate-300',  border: 'border-slate-200' },
};

const EditableTodo: React.FC<{
  todo: TodoItem;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (changes: Partial<TodoItem>) => void;
}> = ({ todo, onToggle, onDelete, onUpdate }) => {
  const [editing,  setEditing]  = useState(false);
  const [draftText, setDraftText] = useState(todo.text);
  const [draftPri,  setDraftPri]  = useState<Priority>(todo.priority);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    if (draftText.trim()) onUpdate({ text: draftText.trim(), priority: draftPri });
    setEditing(false);
  };

  const cancel = () => {
    setDraftText(todo.text);
    setDraftPri(todo.priority);
    setEditing(false);
  };

  const pc = PRIORITY_CONFIG[todo.priority];

  return (
    <div className={`group flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
      todo.completed ? 'bg-slate-50 border-slate-50' : `bg-white ${pc.border} hover:shadow-sm`
    }`}>
      <button onClick={onToggle} className="mt-0.5 flex-shrink-0 hover:scale-110 transition-transform">
        {todo.completed
          ? <CheckCircle2 size={18} className="text-emerald-500" />
          : <Circle size={18} className={todo.priority==='high' ? 'text-red-300' : 'text-slate-300'} />}
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <input ref={inputRef} value={draftText} onChange={e => setDraftText(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') cancel(); }}
              className="w-full text-sm text-slate-700 border border-blue-300 rounded-lg px-2.5 py-1.5 outline-none bg-blue-50" />
            <div className="flex items-center gap-2">
              <select value={draftPri} onChange={e => setDraftPri(e.target.value as Priority)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none bg-white">
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">⚪ Low</option>
              </select>
              <button onClick={commit} className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs rounded-lg font-medium hover:bg-blue-700">
                <Check size={11}/> Save
              </button>
              <button onClick={cancel} className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg font-medium hover:bg-slate-200">
                <X size={11}/> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className={`text-sm leading-snug ${todo.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
              {todo.text}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`flex items-center gap-1 text-xs font-medium ${todo.completed ? 'opacity-40' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_CONFIG[todo.priority].dot}`} />
                {PRIORITY_CONFIG[todo.priority].label}
              </span>
            </div>
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-300 hover:text-blue-500 transition-colors" title="Edit">
            <Pencil size={13}/>
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors" title="Delete">
            <Trash2 size={13}/>
          </button>
        </div>
      )}
    </div>
  );
};

export const TodoListComponent: React.FC<TodoListComponentProps> = ({
  todos, filter, setFilter, priorityFilter, setPriorityFilter,
  onAdd, onToggle, onDelete, onUpdate, onClearCompleted, stats,
}) => {
  const [newText,     setNewText]     = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');

  const handleAdd = () => {
    if (!newText.trim()) return;
    onAdd(newText.trim(), newPriority);
    setNewText(''); setNewPriority('medium');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['all','active','completed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filter===f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
              <span className={`ml-1.5 ${filter===f ? 'text-blue-600' : 'text-slate-400'}`}>
                {f==='all' ? stats.total : f==='active' ? stats.active : stats.completed}
              </span>
            </button>
          ))}
        </div>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as Priority|'all')}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white outline-none cursor-pointer">
          <option value="all">All priorities</option>
          <option value="high">High priority</option>
          <option value="medium">Medium priority</option>
          <option value="low">Low priority</option>
        </select>
        {stats.completed > 0 && (
          <button onClick={onClearCompleted} className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors">
            Clear completed ({stats.completed})
          </button>
        )}
      </div>

      {/* Add input */}
      <div className="flex gap-2 mb-4">
        <div className="flex flex-1 items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 focus-within:border-blue-300 transition-colors">
          <Plus size={15} className="text-slate-300 flex-shrink-0" />
          <input type="text" value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key==='Enter' && handleAdd()}
            placeholder="Add a new task..."
            className="flex-1 text-sm text-slate-700 placeholder-slate-400 outline-none bg-transparent" />
          <select value={newPriority} onChange={e => setNewPriority(e.target.value as Priority)}
            className="text-xs text-slate-500 outline-none bg-transparent cursor-pointer border-l border-slate-100 pl-2">
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">⚪ Low</option>
          </select>
        </div>
        <button onClick={handleAdd} disabled={!newText.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0">
          Add
        </button>
      </div>

      {stats.high > 0 && filter !== 'completed' && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 mb-3">
          <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-600 font-medium">{stats.high} high-priority {stats.high===1?'task needs':'tasks need'} attention</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1.5">
        {todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 size={36} className="text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-400">No tasks here</p>
            <p className="text-xs text-slate-300 mt-1">{filter==='completed' ? 'Complete some tasks first' : 'Add a task above to get started'}</p>
          </div>
        ) : todos.map(todo => (
          <EditableTodo key={todo.id} todo={todo}
            onToggle={() => onToggle(todo.id)}
            onDelete={() => onDelete(todo.id)}
            onUpdate={changes => onUpdate(todo.id, changes)} />
        ))}
      </div>
    </div>
  );
};
