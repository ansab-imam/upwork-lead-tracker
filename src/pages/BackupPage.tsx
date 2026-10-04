import React, { useRef, useState } from 'react';
import { Download, Upload, ShieldCheck, AlertTriangle, CheckCircle2, Loader2, FileJson, X, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { supabase } from '../utils/supabase';
import { isMissingSetup, SETUP_MISSING_MSG } from '../hooks/useAuth';

// Shape produced by the export_backup() database function
interface BackupFile {
  format: 'leadtracker-backup';
  version: number;
  created_at: string;
  created_by: string | null;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
}

interface RestoreResult {
  restored: Record<string, number>;
  users_kept: number;
  users_skipped: number;
  backup_created_at: string;
}

const TABLE_LABELS: Record<string, string> = {
  proposal_rows:         'Proposals',
  proposal_columns:      'Proposal columns',
  la_rows:               'Lead Analysis rows',
  la_columns:            'Lead Analysis columns',
  lead_priority_records: 'Lead Prioritization records',
  tx_rows:               'Transactions',
  tx_columns:            'Transaction columns',
  tasks:                 'Tasks',
  team_members:          'Team members',
  todos:                 'To-dos',
  notes:                 'Notes',
  canvases:              'Canvases',
  day_markers:           'Reporting day markers',
  activity_log:          'Activity log entries',
  user_profiles:         'User profiles',
};

const label = (t: string) => TABLE_LABELS[t] ?? t;
const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function friendlyError(error: { code?: string; message?: string }): string {
  if (isMissingSetup(error)) return SETUP_MISSING_MSG;
  return error.message ?? 'Something went wrong.';
}

async function fetchBackup(): Promise<BackupFile> {
  const { data, error } = await supabase.rpc('export_backup');
  if (error) throw new Error(friendlyError(error));
  const b = data as BackupFile;
  // Double-check the file is complete before handing it over
  for (const [t, n] of Object.entries(b.counts)) {
    if (!Array.isArray(b.tables[t]) || b.tables[t].length !== n) {
      throw new Error(`Backup incomplete for ${label(t)}. Please try again.`);
    }
  }
  return b;
}

function downloadFile(b: BackupFile, prefix: string) {
  const stamp = new Date(b.created_at).toISOString().replace(/[:]/g, '-').slice(0, 19);
  const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseBackup(text: string): BackupFile {
  let b: BackupFile;
  try { b = JSON.parse(text); } catch { throw new Error('This file could not be read. Is it a Lead Tracker backup (.json)?'); }
  if (b?.format !== 'leadtracker-backup') throw new Error('This file is not a Lead Tracker backup.');
  if (b.version !== 1) throw new Error(`This backup was made by a different version of Lead Tracker (version ${b.version}).`);
  if (!b.tables || !b.counts) throw new Error('This backup file is incomplete.');
  for (const [t, n] of Object.entries(b.counts)) {
    if (!Array.isArray(b.tables[t]) || b.tables[t].length !== n) {
      throw new Error(`This backup file looks damaged (${label(t)} is incomplete).`);
    }
  }
  return b;
}

export const BackupPage: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastExport, setLastExport] = useState<BackupFile | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: BackupFile; name: string } | null>(null);
  const [current, setCurrent] = useState<Record<string, number> | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreStep, setRestoreStep] = useState('');
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  const handleExport = async () => {
    setExporting(true); setExportMsg(null);
    try {
      const b = await fetchBackup();
      downloadFile(b, 'leadtracker-backup');
      setLastExport(b);
      const total = Object.values(b.counts).reduce((s, n) => s + n, 0);
      setExportMsg({ ok: true, text: `Backup downloaded: ${total.toLocaleString()} items. Keep this file somewhere safe.` });
    } catch (err: any) {
      setExportMsg({ ok: false, text: err?.message ?? 'Backup failed. Nothing was downloaded.' });
    } finally { setExporting(false); }
  };

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImportMsg(null); setResult(null); setConfirmText(''); setPending(null); setCurrent(null);
    try {
      const b = parseBackup(await f.text());
      setPending({ file: b, name: f.name });
      // Show what's in the app right now, for comparison
      const now = await fetchCurrentCounts(Object.keys(b.counts));
      setCurrent(now);
    } catch (err: any) {
      setImportMsg({ ok: false, text: err?.message ?? 'Could not read this file.' });
    }
  };

  const handleRestore = async () => {
    if (!pending || confirmText !== 'RESTORE') return;
    setRestoring(true); setImportMsg(null);
    try {
      // 1. Safety net: download what's in the app right now, before replacing it
      setRestoreStep('Downloading a safety copy of your current data…');
      const safety = await fetchBackup();
      downloadFile(safety, 'leadtracker-before-restore');

      // 2. Restore (all-or-nothing, verified inside the database)
      setRestoreStep('Restoring and checking every item…');
      const { data, error } = await supabase.rpc('restore_backup', { backup: pending.file });
      if (error) throw new Error(friendlyError(error));
      setResult(data as RestoreResult);
      setPending(null); setConfirmText('');
      setImportMsg({ ok: true, text: 'Restore complete. Every item was checked against the backup file.' });
    } catch (err: any) {
      setImportMsg({ ok: false, text: `${err?.message ?? 'Restore failed.'} Your data was not changed.` });
    } finally { setRestoring(false); setRestoreStep(''); }
  };

  return (
    <div className="space-y-5 w-full pb-10 max-w-3xl">
      <PageHeader title="Backup & Restore" subtitle="Download all your data, or bring it back from a backup file · Admin only" />

      {/* ── Download ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><Download size={18} className="text-blue-600" /></div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-800">Download a backup</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Saves everything in Lead Tracker (proposals, leads, transactions, tasks, notes, canvases, activity log and more) into one file on your computer.
            </p>
          </div>
        </div>
        <button onClick={handleExport} disabled={exporting || restoring}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {exporting ? 'Preparing backup…' : 'Download backup'}
        </button>
        {exportMsg && <Message {...exportMsg} />}
        {lastExport && <CountsTable title="What's in this backup" backup={lastExport.counts} />}
      </section>

      {/* ── Restore ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0"><Upload size={18} className="text-amber-600" /></div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-800">Restore from a backup</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Makes Lead Tracker an exact copy of the backup file. Anything added or changed since the backup was made will be replaced.
            </p>
          </div>
        </div>

        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handlePickFile} />
        {!pending && (
          <button onClick={() => fileRef.current?.click()} disabled={restoring || exporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            <FileJson size={16} /> Choose backup file…
          </button>
        )}

        {pending && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{pending.name}</span>
                <span className="mx-1.5">·</span>made {fmtDate(pending.file.created_at)}
                {pending.file.created_by && <> by {pending.file.created_by}</>}
              </div>
              {!restoring && (
                <button onClick={() => { setPending(null); setConfirmText(''); }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
              )}
            </div>

            <CountsTable title="Compare: now vs. after restore" backup={pending.file.counts} current={current ?? undefined} />

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> Before you continue</div>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Anything added after {fmtDate(pending.file.created_at)} will be removed.</li>
                <li>A safety copy of your current data downloads automatically first, so you can undo this.</li>
                <li>It's all-or-nothing: if anything goes wrong, nothing is changed.</li>
                <li>User logins are never deleted. Names and roles are restored; you keep your admin access.</li>
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input value={confirmText} onChange={e => setConfirmText(e.target.value.toUpperCase())} disabled={restoring}
                placeholder="Type RESTORE to confirm"
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-amber-300" />
              <button onClick={handleRestore} disabled={confirmText !== 'RESTORE' || restoring}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-40">
                {restoring ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {restoring ? 'Restoring…' : 'Restore this backup'}
              </button>
            </div>
            {restoring && <p className="text-xs text-slate-500">{restoreStep} Please keep this page open.</p>}
          </div>
        )}

        {importMsg && <Message {...importMsg} />}
        {result && (
          <>
            <CountsTable title="Restored" backup={result.restored} />
            {result.users_skipped > 0 && (
              <p className="text-xs text-slate-500">{result.users_skipped} user profile(s) in the backup belong to logins that no longer exist, so they were skipped. Re-add those people on the Users page.</p>
            )}
            {result.users_kept > 0 && (
              <p className="text-xs text-slate-500">{result.users_kept} user(s) added after the backup were kept, so they can still sign in.</p>
            )}
            <button onClick={() => window.location.reload()} className="text-xs font-medium text-blue-600 hover:underline">
              Reload Lead Tracker to see the restored data
            </button>
          </>
        )}
      </section>

      <ClearDataSection busy={exporting || restoring} />

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck size={14} /> Tip: download a backup regularly (for example weekly) and keep copies in a safe place such as OneDrive.
      </p>
    </div>
  );
};

const CLEAR_PHRASE = 'DELETE ALL DATA';

const ClearDataSection: React.FC<{ busy: boolean }> = ({ busy }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [step, setStep] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [removed, setRemoved] = useState<Record<string, number> | null>(null);

  const handleClear = async () => {
    if (text !== CLEAR_PHRASE) return;
    setClearing(true); setMsg(null);
    try {
      // 1. Safety net: download everything first so it can be restored
      setStep('Downloading a safety copy of all your data…');
      const safety = await fetchBackup();
      downloadFile(safety, 'leadtracker-before-clear');

      // 2. Clear (all-or-nothing, verified inside the database)
      setStep('Clearing all modules…');
      const { data, error } = await supabase.rpc('clear_all_data', { confirm: CLEAR_PHRASE });
      if (error) throw new Error(friendlyError(error));
      setRemoved((data as { removed: Record<string, number> }).removed);
      setOpen(false); setText('');
      setMsg({ ok: true, text: 'All data cleared. A safety copy was downloaded first, so you can bring everything back with "Restore from a backup".' });
    } catch (err: any) {
      setMsg({ ok: false, text: `${err?.message ?? 'Clearing failed.'} Your data was not changed.` });
    } finally { setClearing(false); setStep(''); }
  };

  return (
    <section className="bg-white rounded-2xl border border-red-200 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0"><Trash2 size={18} className="text-red-600" /></div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-800">Start fresh</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Removes all entries from every module so you can start with new data. Column setups, users and all features stay exactly as they are.
          </p>
        </div>
      </div>

      {!open && (
        <button onClick={() => { setOpen(true); setMsg(null); setRemoved(null); }} disabled={busy || clearing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50">
          <Trash2 size={16} /> Clear all data…
        </button>
      )}

      {open && (
        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> This will remove</div>
            <p>Proposals, Lead Analysis, Lead Prioritization, Transactions, Tasks, Team members, To-dos, Notes, Canvases, Reporting day markers and the Activity log.</p>
            <div className="font-semibold pt-1">Kept</div>
            <p>Column setups in Proposals, Lead Analysis and Transactions · user logins and roles · every feature of the app.</p>
            <p className="pt-1">A full backup downloads automatically first, so you can undo this with "Restore from a backup".</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={text} onChange={e => setText(e.target.value.toUpperCase())} disabled={clearing}
              placeholder={`Type ${CLEAR_PHRASE} to confirm`}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-red-300" />
            <button onClick={handleClear} disabled={text !== CLEAR_PHRASE || clearing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40">
              {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {clearing ? 'Clearing…' : 'Clear all data'}
            </button>
            {!clearing && <button onClick={() => { setOpen(false); setText(''); }} className="text-xs text-slate-500 hover:underline">Cancel</button>}
          </div>
          {clearing && <p className="text-xs text-slate-500">{step} Please keep this page open.</p>}
        </div>
      )}

      {msg && <Message {...msg} />}
      {removed && (
        <>
          <CountsTable title="Removed" backup={removed} />
          <button onClick={() => window.location.reload()} className="text-xs font-medium text-blue-600 hover:underline">
            Reload Lead Tracker to start fresh
          </button>
        </>
      )}
    </section>
  );
};

async function fetchCurrentCounts(tables: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(tables.map(async t => {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    return [t, count ?? 0] as const;
  }));
  return Object.fromEntries(entries);
}

const Message: React.FC<{ ok: boolean; text: string }> = ({ ok, text }) => (
  <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
    {ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
    <span>{text}</span>
  </div>
);

const CountsTable: React.FC<{ title: string; backup: Record<string, number>; current?: Record<string, number> }> = ({ title, backup, current }) => {
  const rows = Object.keys(TABLE_LABELS).filter(t => t in backup);
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-600">{title}</div>
      <table className="w-full text-xs">
        {current && (
          <thead><tr className="text-slate-400">
            <th className="text-left font-medium px-3 py-1.5">Data</th>
            <th className="text-right font-medium px-3 py-1.5">Now</th>
            <th className="text-right font-medium px-3 py-1.5">After restore</th>
          </tr></thead>
        )}
        <tbody>
          {rows.map(t => {
            const changed = current && current[t] !== backup[t];
            return (
              <tr key={t} className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-600">{label(t)}</td>
                {current && <td className="px-3 py-1.5 text-right text-slate-500">{(current[t] ?? 0).toLocaleString()}</td>}
                <td className={`px-3 py-1.5 text-right font-medium ${changed ? 'text-amber-700' : 'text-slate-800'}`}>{backup[t].toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
