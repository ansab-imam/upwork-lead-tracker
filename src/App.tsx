import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Layout } from './components/layout/Layout';
import { ProposalProvider } from './context/ProposalContext';
import { Shield } from 'lucide-react';
import { AuthProvider, useAuthContext } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { DashboardPage } from './pages/DashboardPage';
import { ProposalsPage } from './pages/ProposalsPage';
import { LeadAnalysisPage } from './pages/LeadAnalysisPage';
const LeadPrioritizationPage = lazy(() => import('./pages/LeadPrioritizationPage').then(m => ({ default: m.LeadPrioritizationPage })));
const ReportingPage = lazy(() => import('./pages/ReportingPage').then(m => ({ default: m.ReportingPage })));
import { NotesPage } from './pages/NotesPage';
const TransactionsPage = lazy(() => import('./pages/TransactionsPage').then(m => ({ default: m.TransactionsPage })));
const TaskTrackerPage = lazy(() => import('./pages/TaskTrackerPage').then(m => ({ default: m.TaskTrackerPage })));
const ActivityPage = lazy(() => import('./pages/ActivityPage').then(m => ({ default: m.ActivityPage })));
const CanvasPage = lazy(() => import('./pages/CanvasPage').then(m => ({ default: m.CanvasPage })));
const BackupPage = lazy(() => import('./pages/BackupPage').then(m => ({ default: m.BackupPage })));
import { setActivityUser } from './hooks/useActivityLog';

export type PageId =
  | 'dashboard' | 'proposals' | 'reporting'
  | 'lead-analysis'
  | 'lead-prioritization' | 'transactions' | 'notes' | 'tasks' | 'users' | 'activity' | 'canvas' | 'backup';

// Map between URL hash and PageId
const HASH_TO_PAGE: Record<string, PageId> = {
  '#/dashboard':           'dashboard',
  '#/proposals':           'proposals',
  '#/reporting':           'reporting',
  '#/lead-analysis':       'lead-analysis',
  '#/lead-prioritization': 'lead-prioritization',
  '#/transactions':        'transactions',
  '#/notes':               'notes',
  '#/tasks':              'tasks',
  '#/users':             'users',
  '#/activity':          'activity',
  '#/canvas':           'canvas',
  '#/backup':           'backup',
};

const PAGE_TO_HASH: Record<PageId, string> = {
  'dashboard':           '#/dashboard',
  'proposals':           '#/proposals',
  'reporting':           '#/reporting',
  'lead-analysis':       '#/lead-analysis',
  'lead-prioritization': '#/lead-prioritization',
  'transactions':        '#/transactions',
  'notes':               '#/notes',
  'tasks':              '#/tasks',
  'users':             '#/users',
  'activity':          '#/activity',
  'canvas':           '#/canvas',
  'backup':           '#/backup',
};

function getPageFromHash(): PageId {
  return HASH_TO_PAGE[window.location.hash] ?? 'dashboard';
}

function AppInner() {
  const { profile, loading: authLoading, signIn, signOut, isAdmin } = useAuthContext();
  const [currentPage, setCurrentPage] = useState<PageId>(getPageFromHash);
  const [searchHighlight, setSearchHighlight] = useState('');

  // Clear stale localStorage keys on startup
  useEffect(() => {
    const KEYS = [
      'leadtracker_proposal_columns_v2', 'leadtracker_proposal_rows_v2',
      'leadtracker_la_columns_v1', 'leadtracker_la_rows_v1', 'leadtracker_lead_priority_v1',
    ];
    KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  }, []);

  // Sync URL hash → page state on browser back/forward
  useEffect(() => {
    const onHashChange = () => setCurrentPage(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Navigate: update state + URL hash
  const navigate = (page: PageId, highlight = '') => {
    setCurrentPage(page);
    setSearchHighlight(highlight);
    window.location.hash = PAGE_TO_HASH[page];
  };

  const LoadFallback = () => (<div className="flex items-center justify-center h-40"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':           return <DashboardPage />;
      case 'proposals':           return <ProposalsPage searchHighlight={searchHighlight} onClearHighlight={() => setSearchHighlight('')} />;
      case 'reporting':           return <Suspense fallback={<LoadFallback/>}><ReportingPage /></Suspense>;
      case 'lead-analysis':       return <ErrorBoundary><LeadAnalysisPage searchHighlight={searchHighlight} /></ErrorBoundary>;
      case 'lead-prioritization': return <Suspense fallback={<LoadFallback/>}><ErrorBoundary><LeadPrioritizationPage /></ErrorBoundary></Suspense>;
      case 'transactions':        return isAdmin ? <ErrorBoundary><TransactionsPage /></ErrorBoundary> : <div className="flex flex-col items-center justify-center h-64 gap-3"><Shield size={32} className="text-slate-200"/><p className="text-sm font-semibold text-slate-500">Admin access required</p><p className="text-xs text-slate-400">The Transactions module is restricted to administrators.</p></div>;
      case 'tasks':               return <Suspense fallback={<LoadFallback/>}><ErrorBoundary><TaskTrackerPage /></ErrorBoundary></Suspense>;
      case 'canvas':              return <Suspense fallback={<LoadFallback/>}><CanvasPage /></Suspense>;
      case 'activity':            return isAdmin ? <ActivityPage /> : <div className="flex items-center justify-center h-64"><p className="text-slate-500">Admin access required.</p></div>;
      case 'users':               return isAdmin ? <UsersPage currentProfile={profile!} /> : <div className="flex items-center justify-center h-64"><p className="text-slate-500">Admin access required.</p></div>;
      case 'backup':              return isAdmin ? <Suspense fallback={<LoadFallback/>}><ErrorBoundary><BackupPage /></ErrorBoundary></Suspense> : <div className="flex items-center justify-center h-64"><p className="text-slate-500">Admin access required.</p></div>;
      case 'notes':               return <NotesPage />;
      default:                    return <DashboardPage />;
    }
  };

  // Set activity user context whenever profile changes
  // Re-set activity user context when returning from existing session (no sign-in event)
  const sessionSetRef = useRef(false);
  useEffect(() => {
    if (profile && !sessionSetRef.current) {
      sessionSetRef.current = true;
      setActivityUser(profile.id, profile.full_name, profile.email);
    }
  }, [profile?.id]);

  if (authLoading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
        <span className="text-sm text-slate-500">Loading Lead Tracker...</span>
      </div>
    </div>
  );

  if (!profile) return <LoginPage onLogin={signIn}/>;

  return (
    <ProposalProvider>
      <Layout currentPage={currentPage} onNavigate={navigate} profile={profile!} onSignOut={signOut} isAdmin={isAdmin}>
        {renderPage()}
      </Layout>
    </ProposalProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

export default App;
