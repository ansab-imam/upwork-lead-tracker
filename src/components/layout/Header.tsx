import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Menu, Bell, X, AlertTriangle, Clock, CheckCircle2, Calendar } from 'lucide-react';
import { NAV_ITEMS } from '../../utils/navigation';
import { GlobalSearch } from './GlobalSearch';

import { useTasks } from '../../hooks/useTasks';
import { useTodos } from '../../hooks/useTodos';
import type { PageId } from '../../App';

interface HeaderProps {
  onMobileMenuOpen: () => void;
  currentPage: PageId;
  onNavigate: (page: PageId, highlight?: string) => void;
}

interface Notification {
  id: string;
  type: 'overdue' | 'due_today' | 'due_soon' | 'completed';
  title: string;
  detail: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  time: string;
  page?: PageId;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

export const Header: React.FC<HeaderProps> = ({ onMobileMenuOpen, currentPage, onNavigate }) => {
  const currentNav = NAV_ITEMS.find(item => item.id === currentPage);
  const [showNotifs, setShowNotifs] = useState(false);
  const [dismissed,  setDismissed]  = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('dismissed_notifs') ?? '[]')); } catch { return new Set(); }
  });
  const panelRef = useRef<HTMLDivElement>(null);

  const { tasks } = useTasks();
  const { todos }  = useTodos();

  const today    = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  const in3days  = new Date(today); in3days.setDate(today.getDate()+3);

  const notifications = useMemo((): Notification[] => {
    const notifs: Notification[] = [];

    // ── Tasks ──
    tasks.forEach(t => {
      if (t.status === 'completed' || t.status === 'cancelled') return;
      if (!t.deadline) return;
      const d = new Date(t.deadline); d.setHours(0,0,0,0);

      if (d < today) {
        notifs.push({ id:`task_overdue_${t.id}`, type:'overdue', title:`Task overdue: ${t.title}`, detail:`Deadline was ${fmt(t.deadline)}`, icon:<AlertTriangle size={14}/>, color:'text-red-600', bg:'bg-red-50', time:t.deadline, page:'tasks' });
      } else if (d.getTime() === today.getTime()) {
        notifs.push({ id:`task_today_${t.id}`, type:'due_today', title:`Due today: ${t.title}`, detail:'Task deadline is today', icon:<Clock size={14}/>, color:'text-amber-600', bg:'bg-amber-50', time:t.deadline, page:'tasks' });
      } else if (d <= in3days) {
        notifs.push({ id:`task_soon_${t.id}`, type:'due_soon', title:`Due soon: ${t.title}`, detail:`Due ${fmt(t.deadline)}`, icon:<Calendar size={14}/>, color:'text-blue-600', bg:'bg-blue-50', time:t.deadline, page:'tasks' });
      }

      // Subtask deadlines
      (t.subtasks ?? []).forEach(sub => {
        if (sub.status === 'completed' || !sub.deadline) return;
        const sd = new Date(sub.deadline); sd.setHours(0,0,0,0);
        if (sd < today) {
          notifs.push({ id:`sub_overdue_${sub.id}`, type:'overdue', title:`Subtask overdue: ${sub.title}`, detail:`In "${t.title}" · was ${fmt(sub.deadline)}${sub.assignee_name ? ` · ${sub.assignee_name}` : ''}`, icon:<AlertTriangle size={14}/>, color:'text-red-600', bg:'bg-red-50', time:sub.deadline, page:'tasks' });
        } else if (sd.getTime() === today.getTime()) {
          notifs.push({ id:`sub_today_${sub.id}`, type:'due_today', title:`Subtask due today: ${sub.title}`, detail:`In "${t.title}"${sub.assignee_name ? ` · ${sub.assignee_name}` : ''}`, icon:<Clock size={14}/>, color:'text-amber-600', bg:'bg-amber-50', time:sub.deadline, page:'tasks' });
        }
      });
    });

    // ── Todos ──
    todos.filter(t => !t.completed && t.dueDate).forEach(t => {
      const d = new Date(t.dueDate!); d.setHours(0,0,0,0);
      if (d < today) {
        notifs.push({ id:`todo_overdue_${t.id}`, type:'overdue', title:`Todo overdue: ${t.text}`, detail:`Due ${fmt(t.dueDate!)}`, icon:<AlertTriangle size={14}/>, color:'text-red-600', bg:'bg-red-50', time:t.dueDate!, page:'notes' });
      } else if (d.getTime() === today.getTime()) {
        notifs.push({ id:`todo_today_${t.id}`, type:'due_today', title:`Todo due today: ${t.text}`, detail:'Complete it today', icon:<Clock size={14}/>, color:'text-amber-600', bg:'bg-amber-50', time:t.dueDate!, page:'notes' });
      }
    });

    // Sort: overdue first, then today, then soon
    const order = { overdue: 0, due_today: 1, due_soon: 2, completed: 3 };
    return notifs.sort((a,b) => order[a.type] - order[b.type]);
  }, [tasks, todos]);

  const visible = notifications.filter(n => !dismissed.has(n.id));
  const count   = visible.length;

  const dismiss = (id: string) => {
    const next = new Set(dismissed); next.add(id);
    setDismissed(next);
    localStorage.setItem('dismissed_notifs', JSON.stringify([...next]));
  };

  const dismissAll = () => {
    const next = new Set([...dismissed, ...visible.map(n => n.id)]);
    setDismissed(next);
    localStorage.setItem('dismissed_notifs', JSON.stringify([...next]));
  };

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowNotifs(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-100 flex items-center px-4 md:px-6 gap-4 flex-shrink-0"
      style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>

      <button onClick={onMobileMenuOpen} className="md:hidden p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
        <Menu size={20} />
      </button>

      <div className="hidden md:block">
        <h1 className="text-base font-semibold text-slate-800 leading-tight" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>
          {currentNav?.label ?? 'Lead Tracker'}
        </h1>
        {currentNav?.description && <p className="text-xs text-slate-400 mt-0.5">{currentNav.description}</p>}
      </div>
      <div className="md:hidden">
        <h1 className="text-sm font-semibold text-slate-800">{currentNav?.label ?? 'Lead Tracker'}</h1>
      </div>

      <div className="flex-1" />
      <GlobalSearch onNavigate={onNavigate} />

      {/* Notification Bell */}
      <div className="relative" ref={panelRef}>
        <button onClick={() => setShowNotifs(s => !s)}
          className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
          <Bell size={18} />
          {count > 0 && (
            <span className="absolute top-1 right-1 min-w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-0.5">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>

        {showNotifs && (
          <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl border border-slate-100 shadow-2xl z-50 overflow-hidden"
            style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>
                Notifications {count > 0 && <span className="text-red-500">({count})</span>}
              </h3>
              <div className="flex items-center gap-2">
                {count > 0 && <button onClick={dismissAll} className="text-xs text-slate-400 hover:text-slate-600">Dismiss all</button>}
                <button onClick={() => setShowNotifs(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={14} className="text-slate-400"/></button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <CheckCircle2 size={28} className="text-emerald-300"/>
                  <p className="text-sm font-medium text-slate-400">All caught up!</p>
                  <p className="text-xs text-slate-300">No pending deadlines</p>
                </div>
              ) : visible.map(n => (
                <div key={n.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${n.bg}`}>
                  <div className={`flex-shrink-0 mt-0.5 ${n.color}`}>{n.icon}</div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { if (n.page) { onNavigate(n.page); setShowNotifs(false); } }}>
                    <p className="text-xs font-semibold text-slate-800 truncate">{n.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{n.detail}</p>
                  </div>
                  <button onClick={() => dismiss(n.id)} className="flex-shrink-0 p-1 hover:bg-white rounded-lg text-slate-300 hover:text-slate-500">
                    <X size={12}/>
                  </button>
                </div>
              ))}
            </div>

            {notifications.length > visible.length && (
              <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
                <p className="text-xs text-slate-400 text-center">{notifications.length - visible.length} dismissed notifications</p>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
