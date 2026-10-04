export type TaskUrgency = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus  = 'not_started' | 'in_progress' | 'waiting' | 'completed' | 'delayed' | 'cancelled';
export type TrackingType = 'percentage' | 'number' | 'money' | 'activity';

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  created_at: string;
}

export interface SubTask {
  id: string;
  title: string;
  description?: string;
  assignee_id?: string;
  assignee_name?: string;
  status: TaskStatus;
  progress: number;
  start_date?: string;
  deadline?: string;
  completion_date?: string;
  notes?: string;
  created_at: string;
}

export interface TaskAssignee {
  member_id: string;
  assigned_date: string;
  deadline?: string;
  status: TaskStatus;
  progress: number;
  completion_date?: string;
  notes?: string;
}

export interface TaskComment {
  id: string;
  text: string;
  author_name: string;
  created_at: string;
  status_update?: TaskStatus;
}

export interface TaskAttachment {
  id: string;
  type: 'link' | 'file';
  name: string;
  url: string;
  size?: number;
  uploaded_by: string;
  created_at: string;
}

export interface TaskTracking {
  type: TrackingType;
  label: string;       // e.g. "Calls Made", "Revenue", "Tasks Done"
  current: number;
  target: number;
  unit?: string;       // e.g. "$", "calls", "tasks"
}

export interface TaskHistoryEntry {
  id: string;
  action: string;
  detail: string;
  author_name: string;
  created_at: string;
}

export interface Task {
  id: string;
  task_id: string;
  title: string;
  description: string;
  created_by: string;
  assignees: TaskAssignee[];
  urgency: TaskUrgency;
  status: TaskStatus;
  start_date?: string;
  deadline?: string;
  completion_date?: string;
  category?: string;
  notes?: string;
  subtasks: SubTask[];
  tracking: TaskTracking[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
  history: TaskHistoryEntry[];
  progress: number;
  created_at: string;
  updated_at: string;
}

export const URGENCY_CONFIG: Record<TaskUrgency, { label: string; color: string; bg: string; border: string; dot: string }> = {
  low:      { label: 'Low',      color: 'text-slate-600',   bg: 'bg-slate-100',   border: 'border-slate-200',   dot: 'bg-slate-400'   },
  medium:   { label: 'Medium',   color: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-200',   dot: 'bg-amber-400'   },
  high:     { label: 'High',     color: 'text-orange-700',  bg: 'bg-orange-100',  border: 'border-orange-200',  dot: 'bg-orange-500'  },
  critical: { label: 'Critical', color: 'text-red-700',     bg: 'bg-red-100',     border: 'border-red-200',     dot: 'bg-red-600'     },
};

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; border: string }> = {
  not_started: { label: 'Not Started', color: 'text-slate-600',   bg: 'bg-slate-100',   border: 'border-slate-200'   },
  in_progress: { label: 'In Progress', color: 'text-blue-700',    bg: 'bg-blue-100',    border: 'border-blue-200'    },
  waiting:     { label: 'Waiting',     color: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-200'   },
  completed:   { label: 'Completed',   color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200' },
  delayed:     { label: 'Delayed',     color: 'text-orange-700',  bg: 'bg-orange-100',  border: 'border-orange-200'  },
  cancelled:   { label: 'Cancelled',   color: 'text-slate-500',   bg: 'bg-slate-100',   border: 'border-slate-200'   },
};

export const STATUS_ORDER: TaskStatus[] = ['not_started','in_progress','waiting','completed','delayed','cancelled'];

export const TRACKING_TYPE_CONFIG: Record<TrackingType, { label: string; prefix: string; suffix: string }> = {
  percentage: { label: 'Percentage',    prefix: '',  suffix: '%'    },
  number:     { label: 'Number/Count',  prefix: '',  suffix: ''     },
  money:      { label: 'Money',         prefix: '$', suffix: ''     },
  activity:   { label: 'Activity',      prefix: '',  suffix: 'done' },
};
