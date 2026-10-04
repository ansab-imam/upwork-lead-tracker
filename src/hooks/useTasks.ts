import { useState, useEffect, useCallback, useRef } from 'react';
import { logActivity } from './useActivityLog';
import { supabase } from '../utils/supabase';
import type { Task, SubTask, TeamMember, TaskStatus, TaskAssignee, TaskComment, TaskAttachment, TaskTracking, TaskHistoryEntry } from '../types/tasks';

const uid = (p='t') => `${p}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const bg = (p: PromiseLike<unknown>) => Promise.resolve(p).catch(e => console.error('Task save error:', e));

const now = () => new Date().toISOString();

function calcSubtaskProgress(subtasks: SubTask[]): number {
  if (subtasks.length === 0) return 0;
  return Math.round(subtasks.reduce((s, st) => s + st.progress, 0) / subtasks.length);
}

function rowToTask(r: any): Task {
  return {
    id: r.id, task_id: r.task_id, title: r.title, description: r.description ?? '',
    created_by: r.created_by ?? '', assignees: r.assignees ?? [], urgency: r.urgency,
    status: r.status, start_date: r.start_date, deadline: r.deadline,
    completion_date: r.completion_date, category: r.category, notes: r.notes ?? '',
    subtasks: r.subtasks ?? [], tracking: r.tracking ?? [], comments: r.comments ?? [],
    attachments: r.attachments ?? [], history: r.history ?? [],
    progress: r.progress ?? 0, created_at: r.created_at, updated_at: r.updated_at,
  };
}

const addHistory = (action: string, detail: string, author: string): TaskHistoryEntry =>
  ({ id: uid('h'), action, detail, author_name: author, created_at: now() });

export function useTasks() {
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const localIns = useRef<Set<string>>(new Set());
  const localDel = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const [{ data: td }, { data: md }] = await Promise.all([
          supabase.from('tasks').select('*').order('created_at', { ascending: false }),
          supabase.from('team_members').select('*').order('name'),
        ]);
        if (td) setTasks(td.map(rowToTask));
        if (md) setMembers(md as TeamMember[]);
      } catch { } finally { setLoading(false); }
    })();

    const ch = supabase.channel(`tasks_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, ({ eventType, new: n, old: o }) => {
        if (eventType === 'INSERT') { const r = rowToTask(n); if (localIns.current.has(r.id)) { localIns.current.delete(r.id); return; } setTasks(p => p.find(x => x.id === r.id) ? p : [r, ...p]); }
        if (eventType === 'UPDATE') setTasks(p => p.map(x => x.id === (n as any).id ? rowToTask(n) : x));
        if (eventType === 'DELETE') { const id = (o as any).id; if (localDel.current.has(id)) { localDel.current.delete(id); return; } setTasks(p => p.filter(x => x.id !== id)); }
      }).subscribe();
    const mch = supabase.channel(`members_rt_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, ({ eventType, new: n, old: o }) => {
        if (eventType === 'INSERT') setMembers(p => [...p, n as TeamMember].sort((a,b)=>a.name.localeCompare(b.name)));
        if (eventType === 'DELETE') setMembers(p => p.filter((x:TeamMember) => x.id !== (o as any).id));
      }).subscribe();
    return () => { supabase.removeChannel(ch); supabase.removeChannel(mch); };
  }, []);

  const nextTaskId = useCallback(() => {
    const max = tasks.reduce((m,t) => { const n=parseInt(t.task_id.replace('TK-',''),10); return n>m?n:m; }, 0);
    return `TK-${String(max+1).padStart(3,'0')}`;
  }, [tasks]);

  const updateTaskInDb = async (id: string, changes: Partial<Task>) => {
    const { error } = await supabase.from('tasks').update({ ...changes, updated_at: now() }).eq('id', id);
    if (error) console.error('updateTask error:', id, error.message, error);
  };

  const createTask = useCallback(async (data: Partial<Task> & { title: string }) => {
    const task: Task = {
      id: uid('task'), task_id: nextTaskId(),
      title: data.title, description: data.description ?? '',
      created_by: data.created_by ?? '', assignees: data.assignees ?? [],
      urgency: data.urgency ?? 'medium', status: data.status ?? 'not_started',
      start_date: data.start_date, deadline: data.deadline,
      completion_date: undefined, category: data.category, notes: data.notes ?? '',
      subtasks: data.subtasks ?? [], tracking: data.tracking ?? [], comments: [], attachments: [],
      history: [
        addHistory('created', `Task "${data.title}" created by ${data.created_by ?? 'User'}`, data.created_by ?? 'User'),
        ...(data.assignees ?? []).map((a: TaskAssignee) => addHistory('assigned', `Assigned to member ID ${a.member_id}${a.deadline ? `, deadline: ${a.deadline}` : ''}`, data.created_by ?? 'User')),
      ],
      progress: 0, created_at: now(), updated_at: now(),
    };
    localIns.current.add(task.id);
    setTasks(p => [task, ...p]);
    await supabase.from('tasks').insert(task);
    logActivity('created', 'Tasks', task.task_id, `Created task: "${task.title}"${task.assignees.length ? ` — assigned to ${task.assignees.length} person(s)` : ''}`);
    return task;
  }, [nextTaskId]);

  const updateTask = useCallback((id: string, changes: Partial<Task>, histNote?: string, author = 'User') => {
    setTasks(p => p.map(t => {
      if (t.id !== id) return t;
      const entries: TaskHistoryEntry[] = [];
      if (histNote) entries.push(addHistory('updated', histNote, author));
      if (changes.status && changes.status !== t.status) {
        logActivity('status_changed', 'Tasks', t.task_id, `Status changed: ${t.status.replace(/_/g,' ')} → ${changes.status.replace(/_/g,' ')} on "${t.title}"`);
        entries.push(addHistory('status_change', `Status changed: ${t.status.replace(/_/g,' ')} → ${changes.status.replace(/_/g,' ')}`, author));
      }
      if (changes.deadline && changes.deadline !== t.deadline) {
        logActivity('updated', 'Tasks', t.task_id, `Deadline changed on "${t.title}" → ${changes.deadline}`);
        entries.push(addHistory('deadline_change', `Deadline changed: ${t.deadline ?? 'none'} → ${changes.deadline}`, author));
      }
      if (changes.urgency && changes.urgency !== t.urgency)
        entries.push(addHistory('urgency_change', `Urgency changed: ${t.urgency} → ${changes.urgency}`, author));
      if (changes.assignees) {
        const added = (changes.assignees as TaskAssignee[]).filter(a => !t.assignees.find(x => x.member_id === a.member_id));
        const removed = t.assignees.filter(a => !(changes.assignees as TaskAssignee[]).find(x => x.member_id === a.member_id));
        added.forEach(a => entries.push(addHistory('assigned', `Assigned to: ${(changes as any)._memberNames?.[a.member_id] ?? a.member_id}${a.deadline ? ` (deadline: ${a.deadline})` : ''}`, author)));
        removed.forEach(a => entries.push(addHistory('unassigned', `Removed assignee: ${(changes as any)._memberNames?.[a.member_id] ?? a.member_id}`, author)));
      }
      const history = entries.length > 0 ? [...t.history, ...entries] : t.history;

      // IMPORTANT: never overwrite comments, attachments with undefined
      const safeChanges: Partial<Task> = { ...changes };
      if (!('comments'   in changes)) delete (safeChanges as any).comments;
      if (!('attachments' in changes)) delete (safeChanges as any).attachments;
      // Strip internal helper keys
      delete (safeChanges as any)._memberNames;

      // Recalculate progress from tracking if tracking changed
      const newTracking = 'tracking' in safeChanges ? safeChanges.tracking! : t.tracking;
      const calcProgress = newTracking.length > 0
        ? Math.round(newTracking.reduce((s, tr) => s + (tr.target > 0 ? Math.min(100, (tr.current / tr.target) * 100) : 0), 0) / newTracking.length)
        : ('progress' in safeChanges ? safeChanges.progress ?? t.progress : t.progress);

      const updated = {
        ...t,
        ...safeChanges,
        comments:    'comments'    in changes ? changes.comments!    : t.comments,
        attachments: 'attachments' in changes ? changes.attachments! : t.attachments,
        progress: calcProgress,
        history,
        updated_at: now(),
      };
      updateTaskInDb(id, { ...safeChanges, progress: calcProgress, history });
      return updated;
    }));
  }, []);

  const deleteTask = useCallback((id: string) => {
    const t = tasks.find(x=>x.id===id);
    if(t) logActivity('deleted','Tasks',t.task_id,`Deleted task: "${t.title}"`);
    localDel.current.add(id);
    setTasks(p => p.filter(t => t.id !== id));
    bg(supabase.from('tasks').delete().eq('id', id));
  }, []);

  const addComment = useCallback((taskId: string, text: string, authorName: string, statusUpdate?: TaskStatus) => {
    const comment: TaskComment = { id: uid('c'), text, author_name: authorName, created_at: now(), status_update: statusUpdate };
    logActivity('commented', 'Tasks', taskId, `${authorName} commented on task`);
    setTasks(p => p.map(t => {
      if (t.id !== taskId) return t;
      const comments = [...t.comments, comment];
      const status = statusUpdate ?? t.status;
      const history = [...t.history, addHistory('comment', `${authorName}: "${text.slice(0,60)}${text.length>60?'...':''}"`, authorName)];
      const updated = { ...t, comments, status, history, updated_at: now() };
      updateTaskInDb(taskId, { comments, status, history });
      return updated;
    }));
  }, []);

  const addAttachment = useCallback(async (taskId: string, name: string, url: string, type: 'link'|'file', uploadedBy: string, size?: number) => {
    const att: TaskAttachment = { id: uid('a'), type, name, url, size, uploaded_by: uploadedBy, created_at: now() };
    setTasks(p => p.map(t => {
      if (t.id !== taskId) return t;
      const attachments = [...t.attachments, att];
      const history = [...t.history, addHistory('attachment', `${uploadedBy} added ${type}: ${name}`, uploadedBy)];
      const updated = { ...t, attachments, history, updated_at: now() };
      updateTaskInDb(taskId, { attachments, history });
      return updated;
    }));
  }, []);

  const removeAttachment = useCallback((taskId: string, attId: string) => {
    setTasks(p => p.map(t => {
      if (t.id !== taskId) return t;
      const attachments = t.attachments.filter(a => a.id !== attId);
      updateTaskInDb(taskId, { attachments });
      return { ...t, attachments, updated_at: now() };
    }));
  }, []);

  const updateTracking = useCallback((taskId: string, tracking: TaskTracking[]) => {
    const avgProgress = tracking.length > 0
      ? Math.round(tracking.reduce((s,tr) => s + (tr.target > 0 ? Math.min(100, (tr.current/tr.target)*100) : 0), 0) / tracking.length)
      : 0;
    setTasks(p => p.map(t => {
      if (t.id !== taskId) return t;
      const updated = { ...t, tracking, progress: avgProgress, updated_at: now() };
      updateTaskInDb(taskId, { tracking, progress: avgProgress });
      return updated;
    }));
  }, []);

  const updateAssignee = useCallback((taskId: string, memberId: string, changes: Partial<TaskAssignee>, author: string) => {
    setTasks(p => p.map(t => {
      if (t.id !== taskId) return t;
      const prev = t.assignees.find(a => a.member_id === memberId);
      const assignees = t.assignees.map(a => a.member_id === memberId ? { ...a, ...changes } : a);
      const histEntries: TaskHistoryEntry[] = [];
      if (changes.status && prev?.status !== changes.status)
        histEntries.push(addHistory('status_change', `${author}'s status changed from ${changes.status ? prev?.status ?? 'none' : ''} → ${changes.status}`, author));
      if (changes.progress !== undefined && prev?.progress !== changes.progress)
        histEntries.push(addHistory('progress', `${author} updated progress: ${prev?.progress ?? 0}% → ${changes.progress}%`, author));
      if (changes.deadline && prev?.deadline !== changes.deadline)
        histEntries.push(addHistory('deadline', `${author}'s deadline updated to ${changes.deadline}`, author));
      if (changes.completion_date)
        histEntries.push(addHistory('completed', `${author} marked their part as complete on ${changes.completion_date}`, author));
      if (histEntries.length === 0)
        histEntries.push(addHistory('assignee', `${author} updated`, author));
      const history = [...t.history, ...histEntries];
      const updated = { ...t, assignees, history, updated_at: now() };
      updateTaskInDb(taskId, { assignees, history });
      return updated;
    }));
  }, []);

  const addMember = useCallback(async (name: string, email?: string) => {
    const member: TeamMember = { id: uid('m'), name, email, created_at: now() };
    setMembers(p => [...p, member].sort((a,b)=>a.name.localeCompare(b.name)));
    await supabase.from('team_members').insert(member);
    return member;
  }, []);

  const deleteMember = useCallback((id: string) => {
    setMembers(p => p.filter(m => m.id !== id));
    bg(supabase.from('team_members').delete().eq('id', id));
  }, []);

  const addSubTask = useCallback((taskId: string, data: Partial<SubTask> & { title: string }, author: string) => {
    logActivity('created', 'Tasks', taskId, `Added subtask "${data.title}"${data.assignee_name ? ` → ${data.assignee_name}` : ''}`);
    const sub: SubTask = {
      id: uid('s'), title: data.title, description: data.description,
      assignee_id: data.assignee_id, assignee_name: data.assignee_name,
      status: data.status ?? 'not_started', progress: 0,
      start_date: data.start_date, deadline: data.deadline, notes: data.notes,
      created_at: now(),
    };
    setTasks(p => p.map(t => {
      if (t.id !== taskId) return t;
      const subtasks = [...t.subtasks, sub];
      const progress = calcSubtaskProgress(subtasks);
      const history = [...t.history, addHistory('subtask_added', `Subtask added: "${sub.title}"${sub.assignee_name ? ` → assigned to ${sub.assignee_name}` : ''}${sub.deadline ? `, deadline: ${sub.deadline}` : ''}`, author)];
      const updated = { ...t, subtasks, progress, history, updated_at: now() };
      updateTaskInDb(taskId, { subtasks, progress, history });
      return updated;
    }));
    return sub;
  }, []);

  const updateSubTask = useCallback((taskId: string, subId: string, changes: Partial<SubTask>, author: string) => {
    setTasks(p => p.map(t => {
      if (t.id !== taskId) return t;
      const prev = t.subtasks.find(s => s.id === subId);
      const subtasks = t.subtasks.map(s => s.id === subId ? { ...s, ...changes } : s);
      const progress = calcSubtaskProgress(subtasks);
      const histEntries: TaskHistoryEntry[] = [];
      if (changes.status && prev?.status !== changes.status)
        histEntries.push(addHistory('subtask_status', `Subtask "${prev?.title}" status: ${prev?.status?.replace(/_/g,' ')} → ${changes.status.replace(/_/g,' ')}`, author));
      if (changes.progress !== undefined && prev?.progress !== changes.progress)
        histEntries.push(addHistory('subtask_progress', `Subtask "${prev?.title}" progress: ${prev?.progress ?? 0}% → ${changes.progress}%`, author));
      if (changes.deadline && prev?.deadline !== changes.deadline)
        histEntries.push(addHistory('subtask_deadline', `Subtask "${prev?.title}" deadline: ${prev?.deadline ?? 'none'} → ${changes.deadline}`, author));
      if (changes.completion_date)
        histEntries.push(addHistory('subtask_completed', `Subtask "${prev?.title}" completed by ${author}`, author));
      const history = histEntries.length > 0 ? [...t.history, ...histEntries] : t.history;
      const updated = { ...t, subtasks, progress, history, updated_at: now() };
      updateTaskInDb(taskId, { subtasks, progress, history });
      return updated;
    }));
  }, []);

  const deleteSubTask = useCallback((taskId: string, subId: string, author: string) => {
    setTasks(p => p.map(t => {
      if (t.id !== taskId) return t;
      const sub = t.subtasks.find(s => s.id === subId);
      const subtasks = t.subtasks.filter(s => s.id !== subId);
      const progress = calcSubtaskProgress(subtasks);
      const history = [...t.history, addHistory('subtask_removed', `Subtask removed: "${sub?.title ?? ''}"`, author)];
      const updated = { ...t, subtasks, progress, history, updated_at: now() };
      updateTaskInDb(taskId, { subtasks, progress, history });
      return updated;
    }));
  }, []);

  return { tasks, members, loading, createTask, updateTask, deleteTask, addComment, addAttachment, removeAttachment, updateTracking, updateAssignee, addMember, deleteMember, addSubTask, updateSubTask, deleteSubTask };
}
