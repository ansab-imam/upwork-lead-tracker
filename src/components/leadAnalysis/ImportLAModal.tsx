import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import type { LAColumn } from '../../types/leadAnalysis';

interface ImportLAModalProps {
  laColumns: LAColumn[];        // only local columns will be shown for mapping
  existingUniqueIds: string[];  // unique IDs currently in Lead Analysis
  onImport: (updates: { uniqueId: string; colId: string; value: string }[]) => void;
  onClose: () => void;
}

type Step = 'upload' | 'map' | 'preview';

interface ParsedRow { [key: string]: string; }

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line: string) => {
    const fields: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseLine(line);
    const row: ParsedRow = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

export const ImportLAModal: React.FC<ImportLAModalProps> = ({
  laColumns, existingUniqueIds, onImport, onClose,
}) => {
  const [step,       setStep]       = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows,    setCsvRows]    = useState<ParsedRow[]>([]);
  const [mapping,    setMapping]    = useState<Record<string, string>>({});
  const [error,      setError]      = useState<string | null>(null);
  const [dragOver,   setDragOver]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Only local columns can be mapped to (linked columns are read-only)
  const localCols = laColumns.filter(c => c.source === 'local');

  const autoMap = useCallback((headers: string[]) => {
    const map: Record<string, string> = {};
    headers.forEach(h => {
      // Auto-detect Unique ID column
      if (h.toLowerCase().replace(/\s/g,'') === 'uniqueid' || h.toLowerCase() === 'id') {
        map[h] = '__unique_id__';
        return;
      }
      const match = localCols.find(c => c.name.toLowerCase().trim() === h.toLowerCase().trim());
      if (match) map[h] = match.id;
    });
    return map;
  }, [localCols]);

  const processFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (!headers.length) { setError('Could not parse file — make sure it has a header row.'); return; }
      if (!rows.length)    { setError('No data rows found in the file.'); return; }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoMap(headers));
      setStep('map');
    };
    reader.readAsText(file);
  };

  // Build preview
  const uidHeader   = Object.entries(mapping).find(([, v]) => v === '__unique_id__')?.[0] ?? null;
  const mappedCols  = Object.entries(mapping).filter(([, v]) => v && v !== '__unique_id__');

  // Stats for preview
  const matched   = csvRows.filter(r => uidHeader && existingUniqueIds.includes(r[uidHeader]?.trim())).length;
  const skipped   = csvRows.length - matched;

  const handleImport = () => {
    if (!uidHeader) return;
    const updates: { uniqueId: string; colId: string; value: string }[] = [];
    for (const csvRow of csvRows) {
      const uid = csvRow[uidHeader]?.trim();
      if (!uid || !existingUniqueIds.includes(uid)) continue; // skip rows not in Lead Analysis
      for (const [csvHeader, colId] of mappedCols) {
        const value = csvRow[csvHeader] ?? '';
        updates.push({ uniqueId: uid, colId, value });
      }
    }
    onImport(updates);
    onClose();
  };

  const stepIndex = (s: Step) => ['upload','map','preview'].indexOf(s);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Import to Lead Analysis
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Only local columns will be updated — linked columns stay untouched</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-50 flex-shrink-0">
          {(['upload','map','preview'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? 'text-blue-600' : stepIndex(step) > i ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-blue-600 text-white' : stepIndex(step) > i ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {stepIndex(step) > i ? '✓' : i + 1}
                </span>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
              {i < 2 && <ChevronRight size={13} className="text-slate-300" />}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}>
                <Upload size={32} className={`mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-slate-300'}`} />
                <p className="text-sm font-semibold text-slate-600 mb-1">Click or drag your CSV file here</p>
                <p className="text-xs text-slate-400">Must include a "Unique ID" column matching UP001, UP002 etc.</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Format guide */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-600 mb-2">Expected CSV format</p>
                <div className="bg-white border border-slate-200 rounded-lg p-3 font-mono text-xs text-slate-600 overflow-x-auto">
                  "Unique ID","{localCols[0]?.name ?? 'Column C'}","{localCols[1]?.name ?? 'Column D'}",...<br/>
                  "UP001","Value 1","Value 2",...<br/>
                  "UP002","Value 3","Value 4",...
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  ⚠️ Only rows matching existing Unique IDs in Lead Analysis will be updated. Others are skipped safely.
                </p>
                {localCols.length === 0 && (
                  <p className="text-xs text-amber-600 font-medium mt-2">
                    You haven't added any local columns yet. Add columns in Lead Analysis first, then import.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Map */}
          {step === 'map' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{csvRows.length} rows in file</span>
                <span className={`font-medium ${uidHeader ? 'text-emerald-600' : 'text-red-500'}`}>
                  {uidHeader ? `✓ Unique ID mapped to "${uidHeader}"` : '⚠ Map the Unique ID column first'}
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-500">CSV Column</p>
                  <p className="text-xs font-semibold text-slate-500">Maps to → Lead Analysis Column</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {csvHeaders.map(header => (
                    <div key={header} className="grid grid-cols-2 items-center px-4 py-2.5 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={13} className="text-slate-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700 truncate font-medium">{header}</span>
                      </div>
                      <select
                        value={mapping[header] ?? ''}
                        onChange={e => setMapping(prev => ({ ...prev, [header]: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-400 bg-white">
                        <option value="">— Skip</option>
                        <option value="__unique_id__">🔑 Unique ID (required)</option>
                        {localCols.map(col => (
                          <option key={col.id} value={col.id}>{col.name} (local)</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safety note */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <p className="text-xs text-blue-700 font-semibold mb-1">🔒 Linked columns are protected</p>
                <p className="text-xs text-blue-600">Columns linked from Proposal Details cannot be mapped or modified here. Only your local columns appear in the dropdown.</p>
              </div>
            </div>
          )}

          {/* STEP 3: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{matched}</p>
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">Rows will update</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-500" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{skipped}</p>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Skipped (ID not found)</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{mappedCols.length}</p>
                  <p className="text-xs text-blue-500 font-medium mt-0.5">Columns updating</p>
                </div>
              </div>

              {/* Preview table */}
              <div>
                <p className="text-xs text-slate-400 mb-2">Preview (first 5 matching rows)</p>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 text-left font-semibold text-slate-500">Unique ID</th>
                        {mappedCols.map(([h, colId]) => {
                          const col = localCols.find(c => c.id === colId);
                          return <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{col?.name ?? h}</th>;
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {csvRows
                        .filter(r => uidHeader && existingUniqueIds.includes(r[uidHeader]?.trim()))
                        .slice(0, 5)
                        .map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-bold text-blue-500">{uidHeader ? row[uidHeader] : ''}</td>
                            {mappedCols.map(([h]) => (
                              <td key={h} className="px-3 py-2 text-slate-600 truncate max-w-32">{row[h] || '—'}</td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {matched === 0 && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-3">
                    <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-700">No matching Unique IDs found. Make sure your CSV has a "Unique ID" column with values like UP001, UP002.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={step === 'upload' ? onClose : () => setStep(step === 'map' ? 'upload' : 'map')}
            className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">
            {step === 'upload' ? 'Cancel' : 'Back'}
          </button>

          {step === 'map' && (
            <button onClick={() => setStep('preview')} disabled={!uidHeader || mappedCols.length === 0}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Preview →
            </button>
          )}
          {step === 'preview' && (
            <button onClick={handleImport} disabled={matched === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <CheckCircle2 size={15} />
              Update {matched} Rows
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
