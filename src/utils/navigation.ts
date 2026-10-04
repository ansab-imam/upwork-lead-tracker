import {
  LayoutDashboard, FileText, BarChart3, TrendingUp,
  Star, CreditCard, NotebookPen, CheckSquare, Activity, PenLine,
  type LucideIcon,
} from 'lucide-react';
import type { PageId } from '../App';

export interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',           label: 'Dashboard',           icon: LayoutDashboard, description: 'Overview and key metrics' },
  { id: 'proposals',           label: 'Proposal Details',    icon: FileText,        description: 'Track and manage proposals' },
  { id: 'reporting',           label: 'Reporting',           icon: BarChart3,       description: 'Detailed reports and exports' },
  { id: 'lead-analysis',       label: 'Lead Analysis',       icon: TrendingUp,      description: 'Analyze and score leads' },
  { id: 'lead-prioritization', label: 'Lead Prioritization', icon: Star,            description: 'Rank and prioritize leads' },
  { id: 'transactions',        label: 'Transactions',        icon: CreditCard,      description: 'Payments and spending history' },
  { id: 'tasks',               label: 'Task Tracker',         icon: CheckSquare,     description: 'Track tasks and tickets' },
  { id: 'activity',            label: 'Activity Log',         icon: Activity,        description: 'Track all user activity' },
  { id: 'canvas',              label: 'Canvas',               icon: PenLine,         description: 'Infinite drawing board' },
  { id: 'notes',               label: 'Notes',                icon: NotebookPen,     description: 'Capture ideas and notes' },
];
