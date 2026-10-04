import React, { useState, useEffect, useMemo } from 'react';
import { Save, RotateCcw, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { CriteriaChecklist } from '../components/leadPriority/CriteriaChecklist';
import { ScoreDisplay } from '../components/leadPriority/ScoreDisplay';
import { SavedRecords } from '../components/leadPriority/SavedRecords';
import { TierBadge } from '../components/leadPriority/TierBadge';
import { useProposals } from '../context/ProposalContext';
import { calcScore, getTier, CRITERIA } from '../types/leadPriority';
import type { LeadPriorityRecord } from '../types/leadPriority';

const LA_QUALIFYING = ['contacted', 'interviewed', 'hired'];

export const LeadPrioritizationPage: React.FC = () => {
  const { priorityRecords: records, priorityLoading: loading, savePriorityRecord: saveRecord, deletePriorityRecord: deleteRecord, getPriorityByUniqueId: getByUniqueId } = useProposals();
  const { columns: proposalColumns, rows: proposalRows } = useProposals();

  const [uniqueId,      setUniqueId]      = useState('');
  const [selected,      setSelected]      = useState<string[]>([]);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [saveStatus,    setSaveStatus]    = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [existingWarn,  setExistingWarn]  = useState(false);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [idSearch,      setIdSearch]      = useState('');

  const statusCol = useMemo(() =>
    proposalColumns.find(c => c.type === 'dropdown' && c.name.toLowerCase().includes('status')),
    [proposalColumns]
  );

  const allUniqueIds = useMemo(() => {
    if (!statusCol) return [];
    const qualifying: string[] = [];
    for (const row of proposalRows) {
      const val = row.data[statusCol.id] ?? '';
      const opt = (statusCol.options as any[])?.find((o: any) => o.id === val);
      const label = opt?.label ?? val;
      if (LA_QUALIFYING.includes(label.toLowerCase()) && row.display_id) {
        qualifying.push(row.display_id);
      }
    }
    return qualifying.sort((a, b) => {
      const na = parseInt(a.replace('UP', ''), 10);
      const nb = parseInt(b.replace('UP', ''), 10);
      return nb - na;
    });
  }, [proposalRows, statusCol]);

  const filteredIds = useMemo(() =>
    idSearch.trim()
      ? allUniqueIds.filter(id => id.toLowerCase().includes(idSearch.toLowerCase()))
      : allUniqueIds.slice(0, 50),
    [allUniqueIds, idSearch]
  );

  const score = React.useMemo(() => calcScore(selected), [selected]);
  const tier  = React.useMemo(() => getTier(score), [score]);

  // Check if uniqueId exists in Proposal Details
  const idExistsInSystem = useMemo(() =>
    allUniqueIds.includes(uniqueId.trim().toUpperCase()),
    [uniqueId, allUniqueIds]
  );

  // Check if a priority record already exists for this ID
  useEffect(() => {
    if (!uniqueId.trim()) { setExistingWarn(false); return; }
    const existing = getByUniqueId(uniqueId.trim().toUpperCase());
    setExistingWarn(!!existing && editingId !== existing.id);
  }, [uniqueId, records, editingId, getByUniqueId]);

  const handleReset = () => {
    setSelected([]); setUniqueId(''); setEditingId(null);
    setSaveStatus('idle'); setExistingWarn(false); setIdSearch('');
  };

  const handleEdit = (record: LeadPriorityRecord) => {
    setUniqueId(record.unique_id);
    setSelected(record.selected_criteria);
    setEditingId(record.id);
    setSaveStatus('idle');
    setExistingWarn(false);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    const uid = uniqueId.trim().toUpperCase();
    if (!uid || !idExistsInSystem) return;
    setSaveStatus('saving');
    try {
      await saveRecord(uid, selected);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
      setEditingId(null);
      setExistingWarn(false);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleLoadExisting = () => {
    const existing = getByUniqueId(uniqueId.trim().toUpperCase());
    if (existing) handleEdit(existing);
  };

  const selectId = (id: string) => {
    setUniqueId(id);
    setShowDropdown(false);
    setIdSearch('');
    const existing = getByUniqueId(id);
    if (existing) handleEdit(existing);
  };

  const isEditing = editingId !== null;
  // Can only save if ID exists in Proposal Details
  const canSave = uniqueId.trim().length > 0 && idExistsInSystem;

  return (
    <div className="w-full space-y-6 pb-10">
      <PageHeader
        title="Lead Prioritization"
        subtitle="Score leads that have reached Contacted, Interviewed, or Hired stage."
        actions={
          <div className="flex items-center gap-2">
            {isEditing && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-xl font-medium">
                Editing {uniqueId}
              </span>
            )}
            <button onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        }
      />

      {/* Right panel - score, save, summary - shown at top on mobile */}
      <div className="flex flex-wrap gap-3 lg:hidden">
        <div className="flex-1 min-w-48">
          <ScoreDisplay score={score} />
        </div>
        <button onClick={handleSave} disabled={!canSave || saveStatus === 'saving'}
          className={`flex-1 min-w-36 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all ${
            saveStatus === 'saved'  ? 'bg-emerald-500 text-white' :
            saveStatus === 'error'  ? 'bg-red-500 text-white' :
            saveStatus === 'saving' ? 'bg-blue-400 text-white cursor-wait' :
            canSave                 ? 'bg-blue-600 text-white hover:bg-blue-700' :
                                      'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}>
          {saveStatus === 'saved' ? <><CheckCircle2 size={16}/> Saved!</> :
           saveStatus === 'error' ? <><AlertCircle size={16}/> Error</> :
           saveStatus === 'saving' ? <>Saving...</> :
           <><Save size={16}/> {isEditing ? 'Update' : 'Save Record'}</>}
        </button>
      </div>

      {/* Main content - single flow, no grid height issues */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── Left: ID selector + checklist ── */}
        <div className="w-full lg:flex-1 space-y-5">

          {/* Unique ID selector */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Select Lead Unique ID
            </label>
            <p className="text-xs text-slate-400 mb-3">
              Only leads at <strong>Contacted</strong>, <strong>Interviewed</strong>, or <strong>Hired</strong> stage can be scored. Change the lead status in Proposal Details first.
            </p>

            {/* Searchable dropdown */}
            <div className="relative">
              <div
                className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-all ${
                  showDropdown ? 'border-blue-400 ring-2 ring-blue-50' : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setShowDropdown(s => !s)}
              >
                <span className={`flex-1 text-sm font-mono font-semibold ${uniqueId ? 'text-slate-800' : 'text-slate-400 font-normal'}`}>
                  {uniqueId || 'Search or select a Unique ID...'}
                </span>
                {uniqueId && idExistsInSystem && (
                  <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                )}
                <ChevronDown size={15} className={`text-slate-400 flex-shrink-0 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
              </div>

              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl z-[9999]"
                  style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
                  <div className="p-2 border-b border-slate-100">
                    <input
                      autoFocus
                      value={idSearch}
                      onChange={e => setIdSearch(e.target.value)}
                      placeholder="Type to search..."
                      className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-400"
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto py-1">
                    {filteredIds.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4 px-3">No qualifying leads found.<br/>Change a lead status to Contacted in Proposal Details first.</p>
                    ) : filteredIds.map(id => {
                      const hasRecord = !!getByUniqueId(id);
                      return (
                        <button key={id} onClick={() => selectId(id)}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-blue-50 text-left transition-colors ${uniqueId === id ? 'bg-blue-50' : ''}`}>
                          <span className="font-mono font-semibold text-blue-600">{id}</span>
                          {hasRecord && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Scored</span>}
                        </button>
                      );
                    })}
                    {allUniqueIds.length > 50 && !idSearch && (
                      <p className="text-xs text-slate-400 text-center py-2">Showing 50 of {allUniqueIds.length} — type to search</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Validation messages */}
            {uniqueId && !idExistsInSystem && (
              <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-600 font-medium">
                  "{uniqueId}" does not exist in Proposal Details. You can only score leads that are already in the system.
                </p>
              </div>
            )}

            {existingWarn && idExistsInSystem && (
              <div className="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                <AlertCircle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-700">Record already exists for {uniqueId}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Saving will update the existing record.</p>
                </div>
                <button onClick={handleLoadExisting}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex-shrink-0 underline">
                  Load
                </button>
              </div>
            )}
          </div>

          {/* Checklist — only show if valid ID selected */}
          {uniqueId && idExistsInSystem ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <CriteriaChecklist selected={selected} onChange={setSelected} />
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-10 text-center">
              <p className="text-sm font-medium text-slate-500">Select a lead to start scoring</p>
              <p className="text-xs text-slate-400 mt-1">Only leads at Contacted/Interviewed/Hired stage appear here</p>
            </div>
          )}
        </div>

        {/* ── Right: score + save — desktop only ── */}
        <div className="hidden lg:block w-72 flex-shrink-0 space-y-4">
          <ScoreDisplay score={score} />

          <button
            onClick={handleSave}
            disabled={!canSave || saveStatus === 'saving'}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all ${
              saveStatus === 'saved'  ? 'bg-emerald-500 text-white' :
              saveStatus === 'error'  ? 'bg-red-500 text-white' :
              saveStatus === 'saving' ? 'bg-blue-400 text-white cursor-wait' :
              canSave                 ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200' :
                                        'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}>
            {saveStatus === 'saved'  ? <><CheckCircle2 size={16} /> Saved!</> :
             saveStatus === 'error'  ? <><AlertCircle size={16} /> Error — try again</> :
             saveStatus === 'saving' ? <>Saving...</> :
             <><Save size={16} /> {isEditing ? 'Update Record' : 'Save Record'}</>}
          </button>

          {!canSave && uniqueId && !idExistsInSystem && (
            <p className="text-xs text-red-500 text-center">Select a valid lead ID to save</p>
          )}

          {/* Quick summary */}
          {selected.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Summary</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Criteria selected</span>
                  <span className="font-semibold text-slate-700">{selected.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-600">Positive</span>
                  <span className="font-semibold text-emerald-600">
                    +{selected.reduce((s, id) => { const c = CRITERIA.find(cr => cr.id === id && cr.type === 'positive'); return s + (c?.points ?? 0); }, 0)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-red-500">Negative</span>
                  <span className="font-semibold text-red-500">
                    {selected.reduce((s, id) => { const c = CRITERIA.find(cr => cr.id === id && cr.type === 'negative'); return s + (c?.points ?? 0); }, 0)}
                  </span>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-between text-sm">
                  <span className="font-semibold text-slate-600">Final Score</span>
                  <span className="font-bold text-slate-800">{score > 0 ? `+${score}` : score}</span>
                </div>
              </div>
              <TierBadge tier={tier} size="sm" />
            </div>
          )}

          {/* Tier reference */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Tier Reference</p>
            <div className="space-y-2">
              {([
                { tier: 'High Tier'   as const, range: '35+',    color: 'text-emerald-600' },
                { tier: 'Medium Tier' as const, range: '20–34',  color: 'text-amber-600'   },
                { tier: 'Low Tier'    as const, range: '0–19',   color: 'text-slate-500'   },
              ]).map(({ tier: t, range, color }) => (
                <div key={t} className={`flex items-center justify-between rounded-xl px-3 py-2 ${t === tier ? 'bg-slate-50' : ''}`}>
                  <TierBadge tier={t} size="sm" />
                  <span className={`text-xs font-medium ${color}`}>{range}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Saved records */}
      {!loading && (
        <SavedRecords records={records} onEdit={handleEdit} onDelete={deleteRecord} />
      )}
    </div>
  );
};
