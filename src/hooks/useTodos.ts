import { logActivity } from './useActivityLog';
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import type { TodoItem, Priority } from '../types/notes';

const uid = () => `todo_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const bg  = (p: PromiseLike<unknown>) => Promise.resolve(p).catch(() => {});

function rowToTodo(r: any): TodoItem {
  return { id: r.id, text: r.text, completed: r.completed, priority: r.priority, dueDate: r.due_date ?? undefined, createdAt: new Date(r.created_at) };
}

export function useTodos() {
  const [todos,          setTodos]          = useState<TodoItem[]>([]);
  const [filter,         setFilter]         = useState<'all'|'active'|'completed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<Priority|'all'>('all');
  const [loading,        setLoading]        = useState(true);
  const localInserts = useRef<Set<string>>(new Set());
  const localDeletes = useRef<Set<string>>(new Set());

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('todos').select('*').order('created_at', { ascending: false });
        if (error?.code === '42P01') { setLoading(false); return; }
        if (!error && data) setTodos(data.map(rowToTodo));
      } catch { } finally { setLoading(false); }
    })();

    // ── Realtime ──────────────────────────────────────────────────────────
    const ch = supabase.channel(`todos_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') {
            const r = rowToTodo(n);
            if (localInserts.current.has(r.id)) { localInserts.current.delete(r.id); return; }
            setTodos(prev => prev.find(x => x.id === r.id) ? prev : [r, ...prev]);
          }
          if (eventType === 'UPDATE') {
            setTodos(prev => prev.map(x => x.id === (n as any).id ? rowToTodo(n) : x));
          }
          if (eventType === 'DELETE') {
            const id = (o as any).id;
            if (localDeletes.current.has(id)) { localDeletes.current.delete(id); return; }
            setTodos(prev => prev.filter(x => x.id !== id));
          }
        }).subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const filteredTodos = todos.filter(t => {
    const matchesStatus   = filter === 'all' || (filter === 'active' && !t.completed) || (filter === 'completed' && t.completed);
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    return matchesStatus && matchesPriority;
  });

  const priorityOrder: Record<Priority,number> = { high: 0, medium: 1, low: 2 };
  const sortedTodos = [...filteredTodos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const addTodo = useCallback((text: string, priority: Priority = 'medium') => {
    const now = new Date();
    const todo: TodoItem = { id: uid(), text, completed: false, priority, createdAt: now };
    localInserts.current.add(todo.id);
    setTodos(prev => [todo, ...prev]);
    logActivity('created', 'Todos', todo.id, `Added todo: "${text}"`);
    bg(supabase.from('todos').insert({ id: todo.id, text, completed: false, priority, created_at: now.toISOString() }));
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos(prev => prev.map(t => {
      if (t.id !== id) return t;
      const completed = !t.completed;
      bg(supabase.from('todos').update({ completed }).eq('id', id));
      return { ...t, completed };
    }));
  }, []);

  const updateTodo = useCallback((id: string, changes: Partial<TodoItem>) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
    const db: any = {};
    if (changes.text      !== undefined) db.text      = changes.text;
    if (changes.priority  !== undefined) db.priority  = changes.priority;
    if (changes.dueDate   !== undefined) db.due_date  = changes.dueDate;
    if (changes.completed !== undefined) db.completed = changes.completed;
    bg(supabase.from('todos').update(db).eq('id', id));
  }, []);

  const deleteTodo = useCallback((id: string) => {
    localDeletes.current.add(id);
    setTodos(prev => prev.filter(t => t.id !== id));
    const _t = todos.find(x=>x.id===id);
    if(_t) logActivity('deleted', 'Todos', id, `Deleted todo: "${_t.text}"`);
    bg(supabase.from('todos').delete().eq('id', id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTodos(prev => {
      const done = prev.filter(t => t.completed);
      done.forEach(t => { localDeletes.current.add(t.id); bg(supabase.from('todos').delete().eq('id', t.id)); });
      return prev.filter(t => !t.completed);
    });
  }, []);

  const stats = {
    total:     todos.length,
    active:    todos.filter(t => !t.completed).length,
    completed: todos.filter(t => t.completed).length,
    high:      todos.filter(t => t.priority === 'high' && !t.completed).length,
  };

  return { todos: sortedTodos, filter, setFilter, priorityFilter, setPriorityFilter, addTodo, toggleTodo, updateTodo, deleteTodo, clearCompleted, stats, loading };
}
