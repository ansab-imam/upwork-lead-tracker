import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Plus, Search, X, MessageSquare, Users, Trash2, Edit2,
  LayoutGrid, List, CheckCircle2, Circle, Loader, PauseCircle,
  XCircle, Download, Upload, Link2, Paperclip, Target,
  AlertTriangle
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { useTasks } from '../hooks/useTasks';
import type { Task, SubTask, TaskStatus, TaskUrgency, TaskTracking, TaskAssignee } from '../types/tasks';
import { URGENCY_CONFIG, STATUS_CONFIG, STATUS_ORDER, TRACKING_TYPE_CONFIG } from '../types/tasks';

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const isOverdue = (t: Task) => !!t.deadline && new Date(t.deadline) < new Date() && t.status!=='completed' && t.status!=='cancelled';
const isDueToday = (t: Task) => { if (!t.deadline) return false; return new Date(t.deadline).toDateString()===new Date().toDateString(); };
const isDueThisWeek = (t: Task) => { if (!t.deadline) return false; const d=new Date(t.deadline),n=new Date(),e=new Date(n); e.setDate(n.getDate()+7); return d>=n&&d<=e; };

const fmtTracking = (tr: TaskTracking) => {
  const cfg = TRACKING_TYPE_CONFIG[tr.type];
  const cur = tr.type==='money' ? `$${tr.current.toLocaleString()}` : `${cfg.prefix}${tr.current.toLocaleString()}${cfg.suffix?` ${cfg.suffix}`:''}`;
  const tgt = tr.type==='money' ? `$${tr.target.toLocaleString()}` : `${cfg.prefix}${tr.target.toLocaleString()}${cfg.suffix?` ${cfg.suffix}`:''}`;
  const pct = tr.target>0 ? Math.round((tr.current/tr.target)*100) : 0;
  return { cur, tgt, pct: Math.min(100,pct) };
};

const StatusIcon: React.FC<{status: TaskStatus; size?: number}> = ({ status, size=14 }) => {
  const map: Record<TaskStatus,React.ReactNode> = {
    not_started: <Circle size={size} className="text-slate-400"/>,
    in_progress: <Loader size={size} className="text-blue-500"/>,
    waiting:     <PauseCircle size={size} className="text-amber-500"/>,
    completed:   <CheckCircle2 size={size} className="text-emerald-500"/>,
    delayed:     <AlertTriangle size={size} className="text-orange-500"/>,
    cancelled:   <XCircle size={size} className="text-slate-400"/>,
  };
  return <>{map[status]}</>;
};

const UrgencyDot: React.FC<{urgency: TaskUrgency}> = ({ urgency }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${URGENCY_CONFIG[urgency].dot}`} title={URGENCY_CONFIG[urgency].label}/>
);

const StatusSelect: React.FC<{value: TaskStatus; onChange:(v:TaskStatus)=>void}> = ({ value, onChange }) => {
  const c = STATUS_CONFIG[value];
  return (
    <select value={value} onChange={e=>onChange(e.target.value as TaskStatus)}
      onClick={e=>e.stopPropagation()}
      className={`text-xs font-semibold px-2 py-1 rounded-lg border cursor-pointer outline-none ${c.bg} ${c.color} ${c.border}`}>
      {Object.entries(STATUS_CONFIG).map(([v,sc])=><option key={v} value={v}>{sc.label}</option>)}
    </select>
  );
};

const ProgressBar: React.FC<{value: number; size?: 'sm'|'md'; showLabel?: boolean}> = ({ value, size='md', showLabel=false }) => (
  <div className="flex items-center gap-2 flex-1">
    <div className={`flex-1 bg-slate-100 rounded-full overflow-hidden ${size==='sm'?'h-1.5':'h-2'}`}>
      <div className={`h-full rounded-full transition-all ${value===100?'bg-emerald-500':value>60?'bg-blue-500':value>30?'bg-amber-400':'bg-slate-300'}`} style={{width:`${value}%`}}/>
    </div>
    {showLabel && <span className="text-xs font-bold text-slate-500 flex-shrink-0 w-8 text-right">{value}%</span>}
  </div>
);

// ── Task Form ─────────────────────────────────────────────────────────────
const TaskForm: React.FC<{
  members: {id:string;name:string}[];
  initial?: Partial<Task>;
  onSave: (data: Partial<Task>&{title:string}) => void;
  onClose: () => void;
}> = ({ members, initial, onSave, onClose }) => {
  const [title,       setTitle]       = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [createdBy,   setCreatedBy]   = useState(initial?.created_by ?? '');
  const [urgency,     setUrgency]     = useState<TaskUrgency>(initial?.urgency ?? 'medium');
  const [status,      setStatus]      = useState<TaskStatus>(initial?.status ?? 'not_started');
  const [startDate,   setStartDate]   = useState(initial?.start_date ?? '');
  const [deadline,    setDeadline]    = useState(initial?.deadline ?? '');
  const [category,    setCategory]    = useState(initial?.category ?? '');
  const [notes,       setNotes]       = useState(initial?.notes ?? '');
  const [assignees,   setAssignees]   = useState<TaskAssignee[]>(initial?.assignees ?? []);
  const [tracking,    setTracking]    = useState<TaskTracking[]>(initial?.tracking ?? []);
  const [selMember,   setSelMember]   = useState('');

  const addAssignee = () => {
    if (!selMember || assignees.find(a=>a.member_id===selMember)) return;
    setAssignees(p=>[...p,{member_id:selMember,assigned_date:new Date().toISOString().slice(0,10),status:'not_started',progress:0}]);
    setSelMember('');
  };

  const addTracking = () => setTracking(p=>[...p,{type:'percentage',label:'Progress',current:0,target:100,unit:''}]);
  const removeTracking = (i: number) => setTracking(p=>p.filter((_,idx)=>idx!==i));
  const updateTracking = (i: number, field: string, value: any) => setTracking(p=>p.map((tr,idx)=>idx===i?{...tr,[field]:field==='current'||field==='target'?+value:value}:tr));

  const memberName = (id:string) => members.find(m=>m.id===id)?.name ?? id;
  const available = members.filter(m=>!assignees.find(a=>a.member_id===m.id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title, description, created_by: createdBy, urgency, status, start_date: startDate||undefined, deadline: deadline||undefined, category: category||undefined, notes, assignees, tracking });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" style={{boxShadow:'0 24px 64px rgba(0,0,0,0.2)'}}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{initial?.id?'Edit Task':'New Task'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} className="text-slate-500"/></button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Title *</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Task title..."
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Description</label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Describe this task..."
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 resize-none"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Created By</label>
              <input value={createdBy} onChange={e=>setCreatedBy(e.target.value)} placeholder="Your name"
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"/></div>
            <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Category</label>
              <input value={category} onChange={e=>setCategory(e.target.value)} placeholder="e.g. Marketing"
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Urgency</label>
              <select value={urgency} onChange={e=>setUrgency(e.target.value as TaskUrgency)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 bg-white">
                {Object.entries(URGENCY_CONFIG).map(([v,c])=><option key={v} value={v}>{c.label}</option>)}</select></div>
            <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</label>
              <select value={status} onChange={e=>setStatus(e.target.value as TaskStatus)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 bg-white">
                {Object.entries(STATUS_CONFIG).map(([v,c])=><option key={v} value={v}>{c.label}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Start Date</label>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"/></div>
            <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Deadline</label>
              <input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"/></div>
          </div>

          {/* Assignees */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 block">Assignees</label>
            <div className="flex gap-2 mb-2">
              <select value={selMember} onChange={e=>setSelMember(e.target.value)}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
                <option value="">Select member...</option>
                {available.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button type="button" onClick={addAssignee} disabled={!selMember}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40"><Plus size={14}/></button>
            </div>
            {assignees.map(a=>(
              <div key={a.member_id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 mb-1.5 border border-slate-100">
                <span className="w-6 h-6 bg-blue-100 text-blue-600 text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">{memberName(a.member_id)[0]}</span>
                <span className="text-sm font-medium text-slate-700 flex-1">{memberName(a.member_id)}</span>
                <input type="date" value={a.deadline??''} onChange={e=>setAssignees(p=>p.map(x=>x.member_id===a.member_id?{...x,deadline:e.target.value}:x))}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none w-32"/>
                <button type="button" onClick={()=>setAssignees(p=>p.filter(x=>x.member_id!==a.member_id))} className="text-slate-400 hover:text-red-500"><X size={13}/></button>
              </div>
            ))}
          </div>

          {/* Progress tracking */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Progress Tracking</label>
              <button type="button" onClick={addTracking} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"><Plus size={12}/>Add Tracker</button>
            </div>
            {tracking.map((tr,i)=>(
              <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100 mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <select value={tr.type} onChange={e=>updateTracking(i,'type',e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white outline-none">
                    {Object.entries(TRACKING_TYPE_CONFIG).map(([v,c])=><option key={v} value={v}>{c.label}</option>)}
                  </select>
                  <input value={tr.label} onChange={e=>updateTracking(i,'label',e.target.value)} placeholder="Label e.g. Calls Made"
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-blue-400"/>
                  <button type="button" onClick={()=>removeTracking(i)} className="text-slate-400 hover:text-red-500"><X size={13}/></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-xs text-slate-400 mb-1">Current</p>
                    <input type="number" value={tr.current} onChange={e=>updateTracking(i,'current',e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-400"/></div>
                  <div><p className="text-xs text-slate-400 mb-1">Target</p>
                    <input type="number" value={tr.target} onChange={e=>updateTracking(i,'target',e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-400"/></div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 resize-none"/>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 font-medium">Cancel</button>
          <button type="submit" className="px-5 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-medium shadow-sm shadow-blue-200">{initial?.id?'Save Changes':'Create Task'}</button>
        </div>
      </form>
    </div>
  );
};

// ── SubTasks Panel ───────────────────────────────────────────────────────────
const SubTasksPanel: React.FC<{
  task: Task;
  members: {id:string;name:string}[];
  onAdd: (data: Partial<SubTask>&{title:string}, author:string) => void;
  onUpdate: (subId:string, changes:Partial<SubTask>, author:string) => void;
  onDelete: (subId:string, author:string) => void;
}> = ({ task, members, onAdd, onUpdate, onDelete }) => {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [author, setAuthor] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const member = members.find(m => m.id === newAssignee);
    onAdd({
      title: newTitle.trim(), description: newDesc.trim() || undefined,
      assignee_id: newAssignee || undefined, assignee_name: member?.name,
      deadline: newDeadline || undefined, status: 'not_started', progress: 0,
    }, author || 'User');
    setNewTitle(''); setNewDesc(''); setNewAssignee(''); setNewDeadline(''); setAdding(false);
  };

  const completed = task.subtasks?.filter(s => s.status === 'completed').length ?? 0;
  const total     = task.subtasks?.length ?? 0;

  return (
    <div className="space-y-3">
      {/* Summary */}
      {total > 0 && (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span className="font-semibold">{completed}/{total} subtasks complete</span>
            <span className="font-bold text-slate-700">{task.progress}%</span>
          </div>
          <ProgressBar value={task.progress} size="md"/>
        </div>
      )}

      {/* Subtask list */}
      {(task.subtasks ?? []).map(sub => {
        const sc = STATUS_CONFIG[sub.status];
        const memberName = members.find(m => m.id === sub.assignee_id)?.name ?? sub.assignee_name;
        return (
          <div key={sub.id} className={`border rounded-xl p-3 ${sub.status==='completed'?'border-emerald-100 bg-emerald-50/30':'border-slate-100 bg-white'}`}>
            <div className="flex items-start gap-2 mb-2">
              <button onClick={()=>onUpdate(sub.id,{status:sub.status==='completed'?'not_started':'completed',progress:sub.status==='completed'?0:100,completion_date:sub.status==='completed'?undefined:new Date().toISOString().slice(0,10)},memberName??'User')}
                className="mt-0.5 flex-shrink-0">
                {sub.status==='completed'
                  ? <CheckCircle2 size={16} className="text-emerald-500"/>
                  : <Circle size={16} className="text-slate-300 hover:text-emerald-400 transition-colors"/>}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold leading-snug ${sub.status==='completed'?'line-through text-slate-400':'text-slate-800'}`}>{sub.title}</p>
                {sub.description && <p className="text-xs text-slate-500 mt-0.5">{sub.description}</p>}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {memberName && (
                    <div className="flex items-center gap-1">
                      <span className="w-5 h-5 bg-blue-100 text-blue-600 text-xs font-bold rounded-full flex items-center justify-center">{memberName[0]}</span>
                      <span className="text-xs text-slate-600 font-medium">{memberName}</span>
                    </div>
                  )}
                  {sub.deadline && <span className={`text-xs font-medium ${new Date(sub.deadline)<new Date()&&sub.status!=='completed'?'text-red-600':'text-slate-400'}`}>📅 {fmt(sub.deadline)}</span>}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${sc.bg} ${sc.color}`}>{sc.label}</span>
                </div>
              </div>
              <button onClick={()=>onDelete(sub.id,'User')} className="text-slate-300 hover:text-red-400 flex-shrink-0 p-1"><Trash2 size={13}/></button>
            </div>
            {/* Progress slider */}
            {sub.status !== 'completed' && (
              <div className="flex items-center gap-2 mt-2 pl-6">
                <input type="range" min={0} max={100} value={sub.progress}
                  onChange={e=>onUpdate(sub.id,{progress:+e.target.value},memberName??'User')}
                  className="flex-1 accent-blue-500 cursor-pointer"/>
                <span className="text-xs font-bold text-slate-500 w-8 text-right">{sub.progress}%</span>
              </div>
            )}
            {/* Status select */}
            {sub.status !== 'completed' && (
              <div className="pl-6 mt-1.5">
                <select value={sub.status} onChange={e=>onUpdate(sub.id,{status:e.target.value as TaskStatus},memberName??'User')}
                  className={`text-xs font-semibold px-2 py-1 rounded-lg border cursor-pointer outline-none ${sc.bg} ${sc.color} ${sc.border}`}>
                  {Object.entries(STATUS_CONFIG).map(([v,s])=><option key={v} value={v}>{s.label}</option>)}
                </select>
              </div>
            )}
          </div>
        );
      })}

      {/* Add subtask form */}
      {adding ? (
        <form onSubmit={submit} className="border border-blue-200 rounded-xl p-4 bg-blue-50/30 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New Subtask</p>
          <input autoFocus value={newTitle} onChange={e=>setNewTitle(e.target.value)} required placeholder="Subtask title *"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"/>
          <input value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="Description (optional)"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"/>
          <div className="grid grid-cols-2 gap-2">
            <select value={newAssignee} onChange={e=>setNewAssignee(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
              <option value="">Unassigned</option>
              {members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input type="date" value={newDeadline} onChange={e=>setNewDeadline(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
          </div>
          <input value={author} onChange={e=>setAuthor(e.target.value)} placeholder="Your name"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"/>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={!newTitle.trim()}
              className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-40 font-medium">Add Subtask</button>
            <button type="button" onClick={()=>{setAdding(false);setNewTitle('');}}
              className="px-4 py-2 bg-slate-100 text-slate-600 text-sm rounded-xl hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={()=>setAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
          <Plus size={14}/> Add Subtask
        </button>
      )}
    </div>
  );
};

// ── Side Panel ─────────────────────────────────────────────────────────────
const SidePanel: React.FC<{
  task: Task;
  members: {id:string;name:string}[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onComment: (text:string, author:string, status?:TaskStatus) => void;
  onAddLink: (name:string, url:string, author:string) => void;
  onAddFile: (name:string, url:string, size:number, author:string) => void;
  onRemoveAttachment: (id:string) => void;
  onUpdateTracking: (tracking:TaskTracking[]) => void;
  onUpdateAssignee: (memberId:string, changes:any, author:string) => void;
  onUpdateStatus: (status:TaskStatus) => void;
  onAddSubTask: (data:Partial<SubTask>&{title:string}, author:string) => void;
  onUpdateSubTask: (subId:string, changes:Partial<SubTask>, author:string) => void;
  onDeleteSubTask: (subId:string, author:string) => void;
}> = ({ task, members, onClose, onEdit, onDelete, onComment, onAddLink, onAddFile, onRemoveAttachment, onUpdateTracking, onUpdateAssignee, onUpdateStatus, onAddSubTask, onUpdateSubTask, onDeleteSubTask }) => {
  const [tab, setTab] = useState<'overview'|'subtasks'|'tracking'|'assignees'|'comments'|'attachments'|'history'>('overview');
  const [commentText, setCommentText] = useState('');
  const [commentBy,   setCommentBy]   = useState('');
  const [commentStatus, setCommentStatus] = useState<TaskStatus|''>('');
  const [linkName, setLinkName] = useState('');
  const [linkUrl,  setLinkUrl]  = useState('');
  const [linkBy,   setLinkBy]   = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileBy, setFileBy] = useState('');

  const memberName = (id:string) => members.find(m=>m.id===id)?.name ?? id;
  const uc = URGENCY_CONFIG[task.urgency];

  const submitComment = () => {
    if (!commentText.trim()||!commentBy.trim()) return;
    onComment(commentText.trim(), commentBy.trim(), commentStatus||undefined);
    setCommentText(''); setCommentStatus('');
  };

  const submitLink = () => {
    if (!linkUrl.trim()||!linkBy.trim()) return;
    onAddLink(linkName||linkUrl, linkUrl.trim(), linkBy.trim());
    setLinkName(''); setLinkUrl('');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file||!fileBy.trim()) { alert('Enter your name first'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      onAddFile(file.name, url, file.size, fileBy.trim());
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const updateTrackingField = (i: number, field: string, val: any) => {
    const updated = task.tracking.map((tr,idx) => idx===i ? {...tr,[field]:field==='current'||field==='target'?+val:val} : tr);
    onUpdateTracking(updated);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex" style={{width:'min(480px, 100vw)'}}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 -z-10" onClick={onClose}/>
      <div className="ml-auto w-full bg-white border-l border-slate-200 flex flex-col shadow-2xl" style={{boxShadow:'-8px 0 32px rgba(0,0,0,0.1)'}}>
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-mono font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded">{task.task_id}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${uc.bg} ${uc.color} ${uc.border}`}>{uc.label}</span>
                {isOverdue(task) && <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Overdue</span>}
              </div>
              <h3 className="text-base font-bold text-slate-800 leading-snug" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{task.title}</h3>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={onEdit} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-500" title="Edit"><Edit2 size={14}/></button>
              <button onClick={()=>{if(window.confirm('Delete this task?')) onDelete();}} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500" title="Delete"><Trash2 size={14}/></button>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><X size={16}/></button>
            </div>
          </div>
          {/* Status + Progress */}
          <div className="flex items-center gap-3 mb-2">
            <StatusSelect value={task.status} onChange={onUpdateStatus}/>
            <div className="flex-1">
              <ProgressBar value={task.progress} size="md" showLabel/>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-0 overflow-x-auto border-b border-slate-100 -mx-5 px-5">
            {(['overview','subtasks','tracking','assignees','comments','attachments','history'] as const).map(t=>(
              <button key={t} onClick={()=>setTab(t)}
                className={`px-3 py-2 text-xs font-medium capitalize whitespace-nowrap border-b-2 -mb-px transition-colors ${tab===t?'border-blue-500 text-blue-600':'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {t}{t==='comments'&&task.comments.length>0?` (${task.comments.length})`:''}
                {t==='attachments'&&task.attachments.length>0?` (${task.attachments.length})`:''}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Overview */}
          {tab==='overview' && (
            <div className="space-y-4">
              {task.description && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Description</p><p className="text-sm text-slate-700 leading-relaxed">{task.description}</p></div>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[['Created By',task.created_by||'—'],['Category',task.category||'—'],['Start Date',fmt(task.start_date)],['Deadline',fmt(task.deadline)],['Completed',fmt(task.completion_date)],['Assignees',task.assignees.length>0?task.assignees.map(a=>memberName(a.member_id)).join(', '):'—']].map(([l,v])=>(
                  <div key={l}><p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{l}</p><p className="text-sm text-slate-700 mt-0.5">{v}</p></div>
                ))}
              </div>
              {task.notes && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</p><p className="text-sm text-slate-700 leading-relaxed">{task.notes}</p></div>}
            </div>
          )}

          {/* Subtasks */}
          {tab==='subtasks' && (
            <SubTasksPanel
              task={task}
              members={members}
              onAdd={onAddSubTask}
              onUpdate={onUpdateSubTask}
              onDelete={onDeleteSubTask}
            />
          )}

          {/* Tracking */}
          {tab==='tracking' && (
            <div className="space-y-4">
              {task.tracking.length===0 ? (
                <div className="text-center py-12">
                  <Target size={32} className="text-slate-200 mx-auto mb-3"/>
                  <p className="text-sm text-slate-400">No tracking configured</p>
                  <p className="text-xs text-slate-300 mt-1">Edit the task to add progress trackers</p>
                </div>
              ) : task.tracking.map((tr,i)=>{
                const { cur, tgt, pct } = fmtTracking(tr);
                return (
                  <div key={i} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{tr.label}</p>
                        <p className="text-xs text-slate-400 capitalize">{TRACKING_TYPE_CONFIG[tr.type].label}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-blue-600" style={{fontFamily:"'Space Grotesk',sans-serif"}}>{cur}</p>
                        <p className="text-xs text-slate-400">of {tgt}</p>
                      </div>
                    </div>
                    <ProgressBar value={pct} showLabel/>
                    <p className="text-xs text-slate-400 mt-2 text-center">{pct}% complete</p>
                    {/* Quick update current value */}
                    <div className="mt-3 flex items-center gap-2">
                      <label className="text-xs text-slate-500 flex-shrink-0">Update current:</label>
                      <input type="number" value={tr.current}
                        onChange={e=>updateTrackingField(i,'current',e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"/>
                      <span className="text-xs text-slate-400">/ {tr.target}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Assignees */}
          {tab==='assignees' && (
            <div className="space-y-3">
              {task.assignees.length===0 ? <p className="text-sm text-slate-400 text-center py-8">No assignees</p> : task.assignees.map(a=>(
                <div key={a.member_id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-8 h-8 bg-blue-100 text-blue-600 text-sm font-bold rounded-full flex items-center justify-center">{memberName(a.member_id)[0]}</span>
                    <div className="flex-1"><p className="text-sm font-bold text-slate-800">{memberName(a.member_id)}</p><p className="text-xs text-slate-400">Deadline: {fmt(a.deadline)}</p></div>
                    <StatusSelect value={a.status} onChange={v=>onUpdateAssignee(a.member_id,{status:v},memberName(a.member_id))}/>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={100} value={a.progress}
                      onChange={e=>onUpdateAssignee(a.member_id,{progress:+e.target.value},memberName(a.member_id))}
                      className="flex-1 accent-blue-500"/>
                    <span className="text-sm font-bold text-slate-600 w-10 text-right">{a.progress}%</span>
                  </div>
                  <ProgressBar value={a.progress} size="sm"/>
                </div>
              ))}
            </div>
          )}

          {/* Comments */}
          {tab==='comments' && (
            <div className="space-y-4">
              {task.comments.map(c=>(
                <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-6 h-6 bg-violet-100 text-violet-600 text-xs font-bold rounded-full flex items-center justify-center">{c.author_name[0]}</span>
                    <span className="text-xs font-bold text-slate-700">{c.author_name}</span>
                    {c.status_update && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_CONFIG[c.status_update].bg} ${STATUS_CONFIG[c.status_update].color}`}>→ {STATUS_CONFIG[c.status_update].label}</span>}
                    <span className="text-xs text-slate-400 ml-auto">{fmtTime(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{c.text}</p>
                </div>
              ))}
              {task.comments.length===0 && <p className="text-sm text-slate-400 text-center py-4">No comments yet</p>}
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <input value={commentBy} onChange={e=>setCommentBy(e.target.value)} placeholder="Your name"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
                <textarea value={commentText} onChange={e=>setCommentText(e.target.value)} rows={3} placeholder="Write a comment..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none"/>
                <div className="flex gap-2">
                  <select value={commentStatus} onChange={e=>setCommentStatus(e.target.value as any)}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-400 bg-white">
                    <option value="">No status update</option>
                    {Object.entries(STATUS_CONFIG).map(([v,c])=><option key={v} value={v}>→ {c.label}</option>)}
                  </select>
                  <button onClick={submitComment} disabled={!commentText.trim()||!commentBy.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-40 font-medium">Post</button>
                </div>
              </div>
            </div>
          )}

          {/* Attachments */}
          {tab==='attachments' && (
            <div className="space-y-4">
              {task.attachments.map(a=>(
                <div key={a.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100 group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.type==='link'?'bg-blue-100':'bg-emerald-100'}`}>
                    {a.type==='link' ? <Link2 size={14} className="text-blue-600"/> : <Paperclip size={14} className="text-emerald-600"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{a.name}</p>
                    <p className="text-xs text-slate-400">{a.uploaded_by} · {fmtTime(a.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a href={a.url} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-slate-200 rounded-lg" title="Open"><Link2 size={13} className="text-slate-500"/></a>
                    <button onClick={()=>onRemoveAttachment(a.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"><X size={13}/></button>
                  </div>
                </div>
              ))}
              {task.attachments.length===0 && <p className="text-sm text-slate-400 text-center py-4">No attachments yet</p>}

              {/* Add link */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1"><Link2 size={11}/>Add Link</p>
                <input value={linkName} onChange={e=>setLinkName(e.target.value)} placeholder="Link name (optional)"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
                <input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
                <input value={linkBy} onChange={e=>setLinkBy(e.target.value)} placeholder="Your name"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
                <button onClick={submitLink} disabled={!linkUrl.trim()||!linkBy.trim()}
                  className="w-full py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 font-medium">Add Link</button>
              </div>

              {/* Upload file */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1"><Paperclip size={11}/>Upload File</p>
                <input value={fileBy} onChange={e=>setFileBy(e.target.value)} placeholder="Your name"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
                <input ref={fileInputRef} type="file" onChange={handleFile} className="hidden"/>
                <button onClick={()=>fileInputRef.current?.click()} disabled={!fileBy.trim()}
                  className="w-full py-2 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40 font-medium flex items-center justify-center gap-2">
                  <Upload size={14}/>Choose File
                </button>
                <p className="text-xs text-slate-400 text-center">Files are stored as base64 in the database</p>
              </div>
            </div>
          )}

          {/* History */}
          {tab==='history' && (
            <div className="space-y-1">
              {[...task.history].reverse().map((h,i)=>{
                const dotColor =
                  h.action==='created'      ? 'bg-blue-500' :
                  h.action==='completed'    ? 'bg-emerald-500' :
                  h.action==='status_change'? 'bg-violet-500' :
                  h.action==='assigned'     ? 'bg-cyan-500' :
                  h.action==='unassigned'   ? 'bg-red-400' :
                  h.action==='deadline_change'? 'bg-amber-500' :
                  h.action==='comment'      ? 'bg-slate-400' :
                  h.action==='attachment'   ? 'bg-emerald-400' :
                  h.action==='progress'     ? 'bg-blue-400' :
                  'bg-slate-300';
                const icon =
                  h.action==='created'       ? '✦' :
                  h.action==='completed'     ? '✓' :
                  h.action==='status_change' ? '⟳' :
                  h.action==='assigned'      ? '👤' :
                  h.action==='unassigned'    ? '✕' :
                  h.action==='comment'       ? '💬' :
                  h.action==='attachment'    ? '📎' :
                  h.action==='progress'      ? '📈' :
                  h.action==='deadline_change'? '📅' : '•';
                return (
                  <div key={h.id} className="flex gap-3 py-2.5 border-b border-slate-50 last:border-0">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-6 h-6 rounded-full ${dotColor} flex items-center justify-center text-white text-xs`}>{icon}</div>
                      {i < task.history.length-1 && <div className="w-px flex-1 bg-slate-100 my-1"/>}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <p className="text-sm text-slate-700 leading-snug">{h.detail}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-medium text-slate-500">{h.author_name}</span>
                        <span className="text-xs text-slate-400">{fmtTime(h.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {task.history.length===0 && <p className="text-sm text-slate-400 text-center py-8">No history yet</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Inline Link Adder (on kanban card) ───────────────────────────────────
const InlineLinkAdder: React.FC<{
  taskId: string;
  onAdd: (taskId:string, name:string, url:string, type:'link'|'file', author:string, size?:number) => void;
}> = ({ taskId, onAdd }) => {
  const [open, setOpen] = useState(false);
  const [url,  setUrl]  = useState('');
  const [name, setName] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!url.trim()) return;
    onAdd(taskId, name.trim() || url.trim(), url.trim(), 'link', 'User');
    setUrl(''); setName(''); setOpen(false);
  };

  if (!open) return (
    <button
      onClick={e => { e.stopPropagation(); setOpen(true); }}
      className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 transition-colors mt-0.5">
      <Link2 size={11}/> Add link
    </button>
  );

  return (
    <form onSubmit={submit} onClick={e=>e.stopPropagation()} className="mt-1 space-y-1">
      <input autoFocus value={url} onChange={e=>setUrl(e.target.value)}
        placeholder="Paste URL here..."
        className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-xs outline-none bg-blue-50"/>
      <input value={name} onChange={e=>setName(e.target.value)}
        placeholder="Label (optional)"
        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-400"/>
      <div className="flex gap-1">
        <button type="submit" disabled={!url.trim()}
          className="flex-1 bg-blue-600 text-white text-xs rounded-lg py-1.5 font-medium hover:bg-blue-700 disabled:opacity-40">
          Add
        </button>
        <button type="button" onClick={e=>{e.stopPropagation();setOpen(false);setUrl('');setName('');}}
          className="px-3 bg-slate-100 text-slate-600 text-xs rounded-lg py-1.5 hover:bg-slate-200">
          Cancel
        </button>
      </div>
    </form>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────
export const TaskTrackerPage: React.FC = () => {
  const { tasks, members, loading, createTask, updateTask, deleteTask, addComment, addAttachment, removeAttachment, updateTracking, updateAssignee, addMember, deleteMember, addSubTask, updateSubTask, deleteSubTask } = useTasks();

  const [view,         setView]         = useState<'table'|'kanban'>('table');
  const [showForm,     setShowForm]     = useState(false);
  const [editTask,     setEditTask]     = useState<Task|null>(null);
  const [panelTask,    setPanelTask]    = useState<Task|null>(null);
  const [showMembers,  setShowMembers]  = useState(false);
  const [newMember,    setNewMember]    = useState('');
  const [searchQ,      setSearchQ]      = useState('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus|'all'>('all');
  const [filterUrgency,setFilterUrgency]= useState<TaskUrgency|'all'>('all');
  const [filterMember, setFilterMember] = useState('all');
  const [filterDue,    setFilterDue]    = useState<'all'|'today'|'week'|'overdue'>('all');

  // Keep panel task synced with live data
  const livePanelTask = useMemo(() =>
    panelTask ? (tasks.find(t=>t.id===panelTask.id) ?? panelTask) : null,
    [panelTask, tasks]
  );

  const memberName = useCallback((id:string) => members.find(m=>m.id===id)?.name??id, [members]);

  const filtered = useMemo(() => tasks.filter(t => {
    if (filterStatus!=='all' && t.status!==filterStatus) return false;
    if (filterUrgency!=='all' && t.urgency!==filterUrgency) return false;
    if (filterMember!=='all' && !t.assignees.find(a=>a.member_id===filterMember)) return false;
    if (filterDue==='today' && !isDueToday(t)) return false;
    if (filterDue==='week' && !isDueThisWeek(t)) return false;
    if (filterDue==='overdue' && !isOverdue(t)) return false;
    if (searchQ && !t.title.toLowerCase().includes(searchQ.toLowerCase()) && !t.task_id.toLowerCase().includes(searchQ.toLowerCase()) && !(t.category??'').toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  }), [tasks, filterStatus, filterUrgency, filterMember, filterDue, searchQ]);

  const stats = useMemo(() => ({
    total: tasks.length, open: tasks.filter(t=>t.status!=='completed'&&t.status!=='cancelled').length,
    completed: tasks.filter(t=>t.status==='completed').length, delayed: tasks.filter(t=>t.status==='delayed').length,
    critical: tasks.filter(t=>t.urgency==='critical'&&t.status!=='completed').length,
    today: tasks.filter(isDueToday).length, week: tasks.filter(isDueThisWeek).length, overdue: tasks.filter(isOverdue).length,
  }), [tasks]);

  const handleCreate = async (data: any) => { await createTask(data); setShowForm(false); };
  const handleEdit = async (data: any) => {
    if (!editTask) return;
    // Only update editable fields — never overwrite comments, attachments, history
    const safeChanges = {
      title:       data.title,
      description: data.description,
      created_by:  data.created_by,
      urgency:     data.urgency,
      status:      data.status,
      start_date:  data.start_date,
      deadline:    data.deadline,
      category:    data.category,
      notes:       data.notes,
      assignees:   data.assignees,
      tracking:    data.tracking,
      // Always carry over these — never let form overwrite them
      _memberNames: Object.fromEntries(members.map(m => [m.id, m.name])),
    };
    updateTask(editTask.id, safeChanges, 'Task edited', data.created_by || 'User');
    setEditTask(null);
  };
  const handleAddMember = async () => { if (!newMember.trim()) return; await addMember(newMember.trim()); setNewMember(''); };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({tasks,members,exported_at:new Date().toISOString(),version:1},null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`tasks-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
  };
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try {
        const data=JSON.parse(ev.target?.result as string);
        if(!data.tasks||!Array.isArray(data.tasks)){alert('Invalid backup.');return;}
        if(!window.confirm(`Import ${data.tasks.length} tasks?`)) return;
        if(data.members) for(const m of data.members) if(!members.find(x=>x.id===m.id)) await addMember(m.name,m.email);
        for(const t of data.tasks) if(!tasks.find(x=>x.id===t.id)) await createTask({...t});
        alert('Import complete.');
      } catch { alert('Invalid file.'); }
    };
    reader.readAsText(file); e.target.value='';
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
      <span className="text-sm text-slate-500">Loading tasks...</span>
    </div>
  );

  return (
    <div className="space-y-5 w-full pb-10">
      <PageHeader title="Task Tracker" subtitle={`${stats.total} tasks · ${stats.open} open · ${stats.overdue} overdue`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 cursor-pointer transition-colors" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <Upload size={14}/> Import <input type="file" accept=".json" onChange={handleImport} className="hidden"/>
            </label>
            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <Download size={14}/> Export
            </button>
            <button onClick={()=>setShowMembers(s=>!s)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <Users size={14}/> Team ({members.length})
            </button>
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              <button onClick={()=>setView('table')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${view==='table'?'bg-white text-slate-800 shadow-sm':'text-slate-500'}`}><List size={13} className="inline mr-1"/>Table</button>
              <button onClick={()=>setView('kanban')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${view==='kanban'?'bg-white text-slate-800 shadow-sm':'text-slate-500'}`}><LayoutGrid size={13} className="inline mr-1"/>Kanban</button>
            </div>
            <button onClick={()=>setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
              <Plus size={14}/> New Task
            </button>
          </div>
        }
      />

      {/* Team Members */}
      {showMembers && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800" style={{fontFamily:"'Space Grotesk',sans-serif"}}>Team Members</h3>
            <button onClick={()=>setShowMembers(false)} className="text-slate-400 hover:text-slate-600"><X size={14}/></button>
          </div>
          <div className="flex gap-2 mb-3">
            <input value={newMember} onChange={e=>setNewMember(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAddMember()} placeholder="Add team member name..."
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
            <button onClick={handleAddMember} disabled={!newMember.trim()} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-40 font-medium">Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map(m=>(
              <div key={m.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                <span className="w-6 h-6 bg-blue-100 text-blue-600 text-xs font-bold rounded-full flex items-center justify-center">{m.name[0]}</span>
                <span className="text-sm text-slate-700 font-medium">{m.name}</span>
                <button onClick={()=>deleteMember(m.id)} className="text-slate-300 hover:text-red-500"><X size={12}/></button>
              </div>
            ))}
            {members.length===0 && <p className="text-sm text-slate-400">No team members yet.</p>}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        {[
          {label:'Total',    val:stats.total,    color:'text-slate-700', bg:'bg-white border-slate-100',          fn:null},
          {label:'Open',     val:stats.open,     color:'text-blue-700',  bg:'bg-blue-50 border-blue-100',         fn:()=>setFilterStatus('in_progress')},
          {label:'Completed',val:stats.completed,color:'text-emerald-700',bg:'bg-emerald-50 border-emerald-100', fn:()=>setFilterStatus('completed')},
          {label:'Delayed',  val:stats.delayed,  color:'text-orange-700',bg:'bg-orange-50 border-orange-100',    fn:()=>setFilterStatus('delayed')},
          {label:'Critical', val:stats.critical, color:'text-red-700',   bg:'bg-red-50 border-red-100',          fn:()=>setFilterUrgency('critical')},
          {label:'Due Today',val:stats.today,    color:'text-violet-700',bg:'bg-violet-50 border-violet-100',    fn:()=>setFilterDue('today')},
          {label:'This Week',val:stats.week,     color:'text-cyan-700',  bg:'bg-cyan-50 border-cyan-100',        fn:()=>setFilterDue('week')},
          {label:'Overdue',  val:stats.overdue,  color:'text-red-700',   bg:'bg-red-50 border-red-100',          fn:()=>setFilterDue('overdue')},
        ].map(({label,val,color,bg,fn})=>(
          <button key={label} onClick={()=>fn&&fn()} className={`${bg} border rounded-xl p-3 text-left transition-all hover:shadow-sm`}>
            <p className={`text-xl font-bold ${color}`} style={{fontFamily:"'Space Grotesk',sans-serif"}}>{val}</p>
            <p className={`text-xs font-medium ${color} opacity-70 mt-0.5`}>{label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-48" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
          <Search size={14} className="text-slate-400"/>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search tasks..." className="text-sm bg-transparent outline-none flex-1 text-slate-700"/>
          {searchQ && <button onClick={()=>setSearchQ('')}><X size={13} className="text-slate-400"/></button>}
        </div>
        {[
          {val:filterStatus,  set:(v:string)=>setFilterStatus(v as any),  opts:[['all','All Status'],...Object.entries(STATUS_CONFIG).map(([v,c])=>[v,c.label])]},
          {val:filterUrgency, set:(v:string)=>setFilterUrgency(v as any), opts:[['all','All Urgency'],...Object.entries(URGENCY_CONFIG).map(([v,c])=>[v,c.label])]},
          {val:filterMember,  set:(v:string)=>setFilterMember(v),         opts:[['all','All Members'],...members.map(m=>[m.id,m.name])]},
          {val:filterDue,     set:(v:string)=>setFilterDue(v as any),     opts:[['all','Any Date'],['today','Due Today'],['week','This Week'],['overdue','Overdue']]},
        ].map(({val,set,opts},i)=>(
          <select key={i} value={val} onChange={e=>set(e.target.value)}
            className={`border rounded-xl px-3 py-2 text-sm outline-none cursor-pointer bg-white ${val!=='all'?'border-blue-300 text-blue-600':'border-slate-200 text-slate-600'}`} style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            {opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        {(filterStatus!=='all'||filterUrgency!=='all'||filterMember!=='all'||filterDue!=='all'||searchQ) &&
          <button onClick={()=>{setFilterStatus('all');setFilterUrgency('all');setFilterMember('all');setFilterDue('all');setSearchQ('');}} className="text-xs text-slate-400 hover:text-red-500 px-2">Clear all</button>}
        <span className="ml-auto text-xs text-slate-400">{filtered.length} tasks</span>
      </div>

      {/* ── Table View ── */}
      {view==='table' && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
          {filtered.length===0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <CheckCircle2 size={36} className="text-slate-200"/>
              <p className="text-sm font-semibold text-slate-400">No tasks found</p>
              <button onClick={()=>setShowForm(true)} className="text-sm text-blue-600 hover:underline">Create your first task</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['','Task','Status','Urgency','Assignees','Progress','Tracking','Deadline',''].map((h,i)=>(
                      <th key={i} className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t=>{
                    const over = isOverdue(t);
                    return (
                      <React.Fragment key={t.id}>
                      <tr
                        onClick={()=>setPanelTask(t)}
                        className={`border-b border-slate-50 last:border-0 cursor-pointer hover:bg-blue-50/20 transition-colors group ${over?'bg-red-50/20':''}` }>
                        {/* Urgency dot */}
                        <td className="pl-4 pr-2 py-3 w-6"><UrgencyDot urgency={t.urgency}/></td>
                        {/* Title + details */}
                        <td className="px-3 py-3 min-w-64">
                          <p className="text-sm font-semibold text-slate-800 leading-snug">{t.title}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs font-mono text-blue-400">{t.task_id}</span>
                            {t.category && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{t.category}</span>}
                          </div>
                          {t.description && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{t.description}</p>}
                          <div className="flex items-center gap-3 mt-1.5">
                            {t.comments.length>0 && <span className="flex items-center gap-0.5 text-xs text-slate-400"><MessageSquare size={10}/>{t.comments.length}</span>}
                          {(t.subtasks?.length??0)>0 && <span className="text-xs text-slate-400">{t.subtasks.filter(s=>s.status==='completed').length}/{t.subtasks.length} subtasks</span>}
                            {t.attachments.slice(0,2).map(a=>(
                              <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                                onClick={e=>e.stopPropagation()}
                                className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border truncate max-w-24 ${a.type==='link'?'bg-blue-50 text-blue-600 border-blue-200':'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                                title={a.name}>
                                {a.type==='link'?<Link2 size={9}/>:<Paperclip size={9}/>}
                                <span className="truncate">{a.name}</span>
                              </a>
                            ))}
                            {t.attachments.length>2 && <span className="text-xs text-slate-400">+{t.attachments.length-2} files</span>}
                            {t.start_date && <span className="text-xs text-slate-400">Start: {fmt(t.start_date)}</span>}
                          </div>
                        </td>
                        {/* Status */}
                        <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                          <StatusSelect value={t.status} onChange={v=>updateTask(t.id,{status:v},`Status changed to ${STATUS_CONFIG[v].label}`,'User')}/>
                        </td>
                        {/* Urgency */}
                        <td className="px-3 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${URGENCY_CONFIG[t.urgency].bg} ${URGENCY_CONFIG[t.urgency].color} ${URGENCY_CONFIG[t.urgency].border}`}>
                            {URGENCY_CONFIG[t.urgency].label}
                          </span>
                        </td>
                        {/* Assignees */}
                        <td className="px-3 py-3">
                          <div className="flex -space-x-1">
                            {t.assignees.slice(0,4).map(a=>(
                              <span key={a.member_id} title={memberName(a.member_id)}
                                className="w-6 h-6 bg-blue-100 text-blue-600 text-xs font-bold rounded-full flex items-center justify-center border-2 border-white">
                                {memberName(a.member_id)[0]}
                              </span>
                            ))}
                            {t.assignees.length>4 && <span className="w-6 h-6 bg-slate-100 text-slate-500 text-xs font-bold rounded-full flex items-center justify-center border-2 border-white">+{t.assignees.length-4}</span>}
                          </div>
                        </td>
                        {/* Progress */}
                        <td className="px-3 py-3 min-w-28">
                          <ProgressBar value={t.progress} size="sm" showLabel/>
                        </td>
                        {/* Tracking summary */}
                        <td className="px-3 py-3 min-w-36">
                          {t.tracking.length===0 ? <span className="text-xs text-slate-300">—</span> :
                            t.tracking.slice(0,2).map((tr,i)=>{
                              const {cur,tgt} = fmtTracking(tr);
                              return <p key={i} className="text-xs text-slate-600 truncate"><span className="font-medium">{tr.label}:</span> {cur} / {tgt}</p>;
                            })
                          }
                        </td>
                        {/* Deadline */}
                        <td className="px-3 py-3">
                          <span className={`text-xs font-medium ${over?'text-red-600':isDueToday(t)?'text-amber-600':'text-slate-500'}`}>
                            {over && '⚠ '}{fmt(t.deadline)}
                          </span>
                        </td>
                        {/* Actions */}
                        <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={()=>{setEditTask(t);}} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-500"><Edit2 size={13}/></button>
                            <button onClick={()=>{if(window.confirm('Delete?')) deleteTask(t.id);}} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"><Trash2 size={13}/></button>
                          </div>
                        </td>
                      </tr>
                      {/* Subtask rows */}
                      {(t.subtasks??[]).map(sub=>{
                        const done = sub.status==='completed';
                        const overdue = sub.deadline && new Date(sub.deadline)<new Date() && !done;
                        const sc = STATUS_CONFIG[sub.status];
                        return (
                          <tr key={sub.id} className={`border-b border-slate-50 last:border-0 ${done?'opacity-60':''}`}>
                            <td className="pl-8 pr-2 py-2">
                              {done ? <CheckCircle2 size={13} className="text-emerald-500"/> : <Circle size={13} className="text-slate-300"/>}
                            </td>
                            <td className="px-3 py-2" colSpan={2}>
                              <div className="flex items-center gap-2">
                                <span className="w-1 h-4 bg-slate-200 rounded-full flex-shrink-0"/>
                                <p className={`text-xs font-medium ${done?'line-through text-slate-400':'text-slate-700'}`}>{sub.title}</p>
                                {sub.description && <p className="text-xs text-slate-400 truncate max-w-32">{sub.description}</p>}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${sc.bg} ${sc.color}`}>{sc.label}</span>
                            </td>
                            <td className="px-3 py-2">
                              {sub.assignee_name && (
                                <div className="flex items-center gap-1">
                                  <span className="w-5 h-5 bg-blue-100 text-blue-600 text-xs font-bold rounded-full flex items-center justify-center">{sub.assignee_name[0]}</span>
                                  <span className="text-xs text-slate-600">{sub.assignee_name}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${done?'bg-emerald-400':sub.progress>50?'bg-blue-400':'bg-slate-300'}`} style={{width:`${sub.progress}%`}}/>
                                </div>
                                <span className="text-xs font-bold text-slate-500">{sub.progress}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-2"/>
                            <td className="px-3 py-2">
                              <span className={`text-xs ${overdue?'text-red-600 font-semibold':isDueToday({deadline:sub.deadline} as any)?'text-amber-600':'text-slate-400'}`}>
                                {fmt(sub.deadline)}
                              </span>
                            </td>
                            <td className="px-3 py-2"/>
                          </tr>
                        );
                      })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Kanban View ── */}
      {view==='kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_ORDER.map(status=>{
            const col = filtered.filter(t=>t.status===status);
            const sc = STATUS_CONFIG[status];
            return (
              <div key={status} className="flex-shrink-0 w-72">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-3 ${sc.bg} ${sc.border} border`}>
                  <StatusIcon status={status}/>
                  <span className={`text-xs font-bold ${sc.color}`}>{sc.label}</span>
                  <span className={`ml-auto text-xs font-bold ${sc.color} opacity-60`}>{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map(t=>(
                    <div key={t.id} onClick={()=>setPanelTask(t)}
                      className={`bg-white rounded-xl border p-3 cursor-pointer hover:shadow-md transition-all ${isOverdue(t)?'border-red-300 bg-red-50/30':isDueToday(t)?'border-amber-200':'border-slate-100'}`}
                      style={{boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-start gap-1.5 flex-1 min-w-0">
                          <UrgencyDot urgency={t.urgency}/>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 leading-snug">{t.title}</p>
                            <span className="text-xs font-mono text-blue-400">{t.task_id}</span>
                          </div>
                        </div>
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${URGENCY_CONFIG[t.urgency].bg} ${URGENCY_CONFIG[t.urgency].color}`}>{URGENCY_CONFIG[t.urgency].label}</span>
                      </div>
                      {/* Description */}
                      {t.description && <p className="text-xs text-slate-500 mb-2 line-clamp-2 leading-relaxed">{t.description}</p>}
                      {/* Tracking */}
                      {t.tracking.length>0 && (
                        <div className="mb-3 space-y-2 bg-slate-50 rounded-lg p-2">
                          {t.tracking.map((tr,i)=>{
                            const {cur,tgt,pct} = fmtTracking(tr);
                            return (
                              <div key={i}>
                                <div className="flex justify-between text-xs mb-0.5">
                                  <span className="text-slate-600 font-medium">{tr.label}</span>
                                  <span className="text-slate-500 font-bold">{cur} / {tgt} <span className="text-slate-400">({pct}%)</span></span>
                                </div>
                                <ProgressBar value={pct} size="sm"/>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Overall progress */}
                      {t.tracking.length===0 && (
                        <div className="mb-2">
                          <div className="flex justify-between text-xs text-slate-400 mb-0.5"><span>Progress</span><span>{t.progress}%</span></div>
                          <ProgressBar value={t.progress} size="sm"/>
                        </div>
                      )}
                      {/* Assignees */}
                      {t.assignees.length>0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {t.assignees.map(a=>(
                            <div key={a.member_id} className="flex items-center gap-1 bg-blue-50 rounded-full px-2 py-0.5">
                              <span className="w-4 h-4 bg-blue-200 text-blue-700 text-xs font-bold rounded-full flex items-center justify-center">{memberName(a.member_id)[0]}</span>
                              <span className="text-xs text-blue-700 font-medium">{memberName(a.member_id)}</span>
                              <span className="text-xs text-blue-500">{a.progress}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Attachments — always visible, add inline */}
                      <div className="mb-2">
                        {t.attachments.length>0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {t.attachments.map(a=>(
                              <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                                onClick={e=>e.stopPropagation()}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border hover:opacity-80 truncate max-w-full ${a.type==='link'?'bg-blue-50 text-blue-600 border-blue-200':'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                                title={a.name}>
                                {a.type==='link'?<Link2 size={10}/>:<Paperclip size={10}/>}
                                <span className="truncate max-w-28">{a.name}</span>
                              </a>
                            ))}
                          </div>
                        )}
                        <InlineLinkAdder taskId={t.id} onAdd={addAttachment}/>
                      </div>
                      {/* Subtasks inline */}
                      {(t.subtasks?.length??0)>0 && (
                        <div className="mb-2 border border-slate-100 rounded-xl overflow-hidden" onClick={e=>e.stopPropagation()}>
                          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                            <span className="text-xs font-semibold text-slate-500">Subtasks</span>
                            <span className="text-xs text-slate-400">{t.subtasks.filter(s=>s.status==='completed').length}/{t.subtasks.length} done</span>
                          </div>
                          {t.subtasks.map(sub=>{
                            const done = sub.status==='completed';
                            const overdue = sub.deadline && new Date(sub.deadline)<new Date() && !done;
                            return (
                              <div key={sub.id} className={`flex items-center gap-2 px-3 py-2 border-b border-slate-50 last:border-0 ${done?'opacity-50':''}`}>
                                <div className="flex-shrink-0">
                                  {done
                                    ? <CheckCircle2 size={13} className="text-emerald-500"/>
                                    : <Circle size={13} className="text-slate-300"/>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium truncate ${done?'line-through text-slate-400':'text-slate-700'}`}>{sub.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {sub.assignee_name && (
                                      <span className="flex items-center gap-1">
                                        <span className="w-4 h-4 bg-blue-100 text-blue-600 text-xs font-bold rounded-full flex items-center justify-center">{sub.assignee_name[0]}</span>
                                        <span className="text-xs text-slate-500">{sub.assignee_name}</span>
                                      </span>
                                    )}
                                    {sub.deadline && <span className={`text-xs ${overdue?'text-red-500 font-semibold':'text-slate-400'}`}>{fmt(sub.deadline)}</span>}
                                  </div>
                                </div>
                                <div className="flex-shrink-0 text-right">
                                  <span className={`text-xs font-bold ${done?'text-emerald-500':sub.progress>50?'text-blue-500':'text-slate-400'}`}>{sub.progress}%</span>
                                  <div className="w-12 h-1 bg-slate-100 rounded-full mt-0.5">
                                    <div className={`h-full rounded-full ${done?'bg-emerald-400':sub.progress>50?'bg-blue-400':'bg-slate-300'}`} style={{width:`${sub.progress}%`}}/>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          {t.comments.length>0 && <span className="flex items-center gap-0.5 text-xs text-slate-400"><MessageSquare size={10}/>{t.comments.length}</span>}
                          {t.category && <span className="text-xs text-slate-400">{t.category}</span>}
                        </div>
                        {t.deadline && (
                          <span className={`text-xs font-medium flex items-center gap-0.5 ${isOverdue(t)?'text-red-600':isDueToday(t)?'text-amber-600':'text-slate-400'}`}>
                            {isOverdue(t)&&'⚠ '}{fmt(t.deadline)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {col.length===0 && <div className="text-center py-8 text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">No tasks</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showForm && <TaskForm members={members} onSave={handleCreate} onClose={()=>setShowForm(false)}/>}
      {editTask  && <TaskForm members={members} initial={editTask} onSave={handleEdit} onClose={()=>setEditTask(null)}/>}

      {/* Side Panel */}
      {livePanelTask && (
        <SidePanel
          task={livePanelTask}
          members={members}
          onClose={()=>setPanelTask(null)}
          onEdit={()=>{setEditTask(livePanelTask);}}
          onDelete={()=>{deleteTask(livePanelTask.id);setPanelTask(null);}}
          onComment={(text,author,status)=>addComment(livePanelTask.id,text,author,status)}
          onAddLink={(name,url,author)=>addAttachment(livePanelTask.id,name,url,'link',author)}
          onAddFile={(name,url,size,author)=>addAttachment(livePanelTask.id,name,url,'file',author,size)}
          onRemoveAttachment={(id)=>removeAttachment(livePanelTask.id,id)}
          onUpdateTracking={(tr)=>updateTracking(livePanelTask.id,tr)}
          onUpdateAssignee={(mid,changes,author)=>updateAssignee(livePanelTask.id,mid,changes,author)}
          onUpdateStatus={(status)=>updateTask(livePanelTask.id,{status},`Status → ${STATUS_CONFIG[status].label}`,'User')}
          onAddSubTask={(data,author)=>addSubTask(livePanelTask.id,data,author)}
          onUpdateSubTask={(subId,changes,author)=>updateSubTask(livePanelTask.id,subId,changes,author)}
          onDeleteSubTask={(subId,author)=>deleteSubTask(livePanelTask.id,subId,author)}
        />
      )}
    </div>
  );
};
