import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, AlertCircle, CheckCircle2, FileText, ChevronRight } from 'lucide-react';
import type { Column, Row } from '../../types/proposals';
import { OPTION_COLOR_STYLES } from '../../types/proposals';

interface ImportModalProps {
  columns: Column[];
  existingRows: Row[];
  onImport: (rows: Omit<Row, 'id' | 'created_at'>[], mode: 'skip' | 'overwrite') => void;
  onClose: () => void;
  hideId?: boolean; // When true, no Unique ID column is shown or auto-generated
}

type Step = 'upload' | 'map' | 'preview';

interface ParsedRow {
  [key: string]: string;
}

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 1) return { headers: [], rows: [] };

  // Parse a single CSV line handling quoted fields
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
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

export const ImportModal: React.FC<ImportModalProps> = ({ columns, existingRows, onImport, onClose, hideId = false }) => {
  const [step, setStep]               = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders]   = useState<string[]>([]);
  const [csvRows, setCsvRows]         = useState<ParsedRow[]>([]);
  const [mapping, setMapping]         = useState<Record<string, string>>({});  // csvHeader -> colId
  const [error, setError]             = useState<string | null>(null);
  const [dragOver, setDragOver]       = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'overwrite'>('skip');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-map CSV headers to columns by name match
  const autoMap = useCallback((headers: string[], cols: Column[]) => {
    const map: Record<string, string> = {};
    headers.forEach(h => {
      // Special: "Unique ID" maps to the display_id field
      if (h.toLowerCase().trim() === 'unique id') {
        map[h] = '__unique_id__';
        return;
      }
      const match = cols.find(c =>
        c.name.toLowerCase().trim() === h.toLowerCase().trim()
      );
      if (match) map[h] = match.id;
    });
    return map;
  }, []);

  const processFile = (file: File) => {
    setError(null);
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setError('Please upload a .csv file');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0) { setError('Could not parse the CSV file. Check it has headers in the first row.'); return; }
      if (rows.length === 0)    { setError('No data rows found in the file.'); return; }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoMap(headers, columns));
      setStep('map');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  // Build preview of what will be imported
  const buildPreviewRows = () => {
    return csvRows.slice(0, 5).map(csvRow => {
      const data: Record<string, string> = {};
      Object.entries(mapping).forEach(([csvHeader, colId]) => {
        if (!colId) return;
        const col = columns.find(c => c.id === colId);
        if (!col) return;
        let val = csvRow[csvHeader] ?? '';
        // For dropdown columns, match by label to option id
        if (col.type === 'dropdown' && val) {
          const opt = col.options?.find(o => o.label.toLowerCase() === val.toLowerCase());
          val = opt?.id ?? val;
        }
        data[colId] = val;
      });
      return data;
    });
  };

  const handleImport = () => {
    // Track which CSV header is mapped to Unique ID (if any)
    const uniqueIdHeader = Object.entries(mapping).find(([, v]) => v === '__unique_id__')?.[0] ?? null;

    // Compute starting display ID for rows that don't have one
    let maxId = 0;
    for (const r of existingRows) {
      const n = parseInt((r.display_id ?? '').replace('UP', ''), 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    }

    const newRows: Omit<Row, 'id' | 'created_at'>[] = csvRows.map((csvRow) => {
      const data: Record<string, string> = {};
      Object.entries(mapping).forEach(([csvHeader, colId]) => {
        if (!colId || colId === '__unique_id__') return;
        const col = columns.find(c => c.id === colId);
        if (!col) return;
        let val = csvRow[csvHeader] ?? '';
        if (col.type === 'dropdown' && val) {
          const opt = col.options?.find(o => o.label.toLowerCase() === val.toLowerCase());
          val = opt?.id ?? val;
        }
        data[colId] = val;
      });

      // Use the Unique ID from CSV if mapped, otherwise auto-generate
      let display_id: string;
      if (uniqueIdHeader && csvRow[uniqueIdHeader]?.trim()) {
        display_id = csvRow[uniqueIdHeader].trim();
      } else {
        maxId += 1;
        display_id = `UP${String(maxId).padStart(3, '0')}`;
      }

      return { display_id, data };
    });

    onImport(newRows, duplicateMode);
    onClose();
  };

  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Import from CSV
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {step === 'upload' ? 'Upload your CSV file' :
               step === 'map'    ? `Map ${csvHeaders.length} columns from your file` :
                                   `Preview ${csvRows.length} rows to import`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-50 flex-shrink-0">
          {(['upload', 'map', 'preview'] as Step[]).map((s, stepIdx) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s ? 'text-blue-600' : stepIdx < (['upload','map','preview'] as Step[]).indexOf(step) ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-blue-600 text-white' : stepIdx < (['upload','map','preview'] as Step[]).indexOf(step) ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {stepIdx < (['upload','map','preview'] as Step[]).indexOf(step) ? '✓' : stepIdx + 1}
                </span>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
              {stepIdx < 2 && <ChevronRight size={13} className="text-slate-300" />}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── STEP 1: Upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                <Upload size={32} className={`mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-slate-300'}`} />
                <p className="text-sm font-semibold text-slate-600 mb-1">
                  {dragOver ? 'Drop your file here' : 'Click or drag your CSV file here'}
                </p>
                <p className="text-xs text-slate-400">Supports .csv files</p>
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
                <p className="text-xs font-semibold text-slate-600 mb-2">Expected format</p>
                <p className="text-xs text-slate-500 mb-2">
                  Your CSV should have a <strong>header row</strong> matching your column names.
                  Export the current table first to see the exact format.
                </p>
                <div className="bg-white border border-slate-200 rounded-lg p-3 font-mono text-xs text-slate-600 overflow-x-auto">
                  {columns.slice(0, 4).map(c => `"${c.name}"`).join(',')},...<br />
                  "Value 1","Value 2","2024-01-15",...
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Map columns ── */}
          {step === 'map' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{csvRows.length} rows found in file</span>
                <span className={`font-medium ${mappedCount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {mappedCount} of {csvHeaders.length} columns mapped
                </span>
              </div>

              {/* Import mode */}
              <div className={`rounded-xl p-3 border ${duplicateMode === 'overwrite' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className="text-xs font-semibold text-slate-600 mb-2">Import Mode</p>
                <div className="flex gap-2">
                  <button onClick={() => setDuplicateMode('skip')}
                    className={`flex-1 text-xs px-3 py-2 rounded-lg font-medium transition-colors border ${
                      duplicateMode === 'skip' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                    Add to existing
                  </button>
                  <button onClick={() => setDuplicateMode('overwrite')}
                    className={`flex-1 text-xs px-3 py-2 rounded-lg font-medium transition-colors border ${
                      duplicateMode === 'overwrite' ? 'bg-red-600 text-white border-red-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                    Replace all data
                  </button>
                </div>
                {duplicateMode === 'overwrite' && (
                  <p className="text-xs text-red-600 font-medium mt-2">
                    ⚠️ This will delete ALL existing rows and replace with the imported data. Lead Analysis will also be reset.
                  </p>
                )}
              </div>

              {/* Mapping table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-500">CSV Column</p>
                  <p className="text-xs font-semibold text-slate-500">Maps to → Lead Tracker Column</p>
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
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-400 bg-white cursor-pointer"
                      >
                        <option value="">— Skip this column</option>
                        {!hideId && <option value="__unique_id__">🔑 Unique ID (display_id)</option>}
                        {columns.map(col => (
                          <option key={col.id} value={col.id}>{col.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Preview ── */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                <p className="text-sm text-emerald-700 font-medium">
                  Ready to import <strong>{csvRows.length}</strong> rows with <strong>{mappedCount}</strong> columns mapped
                </p>
              </div>

              {/* Preview table */}
              <div>
                <p className="text-xs text-slate-400 mb-2">Preview (first 5 rows)</p>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {!hideId && <th className="px-3 py-2 text-left font-semibold text-slate-500">ID</th>}
                        {Object.entries(mapping).filter(([,v]) => v).map(([h, colId]) => {
                          const col = columns.find(c => c.id === colId);
                          return <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{col?.name}</th>;
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {buildPreviewRows().map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          {!hideId && <td className="px-3 py-2 font-mono font-bold text-blue-500">
                            UP{String(existingRows.length + i + 1).padStart(3, '0')}
                          </td>}
                          {Object.entries(mapping).filter(([,v]) => v).map(([h, colId]) => {
                            const col = columns.find(c => c.id === colId);
                            let display = row[colId] ?? '';
                            if (col?.type === 'dropdown' && display) {
                              const opt = col.options?.find(o => o.id === display);
                              if (opt) {
                                const s = OPTION_COLOR_STYLES[opt.color]?.full ?? '';
                                return <td key={h} className="px-3 py-2">
                                  <span className={`px-2 py-0.5 rounded-md font-medium ${s}`}>{opt.label}</span>
                                </td>;
                              }
                            }
                            return <td key={h} className="px-3 py-2 text-slate-600 truncate max-w-32">{display || '—'}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvRows.length > 5 && (
                  <p className="text-xs text-slate-400 mt-2 text-center">
                    ...and {csvRows.length - 5} more rows
                  </p>
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

          {step === 'upload' && (
            <p className="text-xs text-slate-400">Export first to see the expected format</p>
          )}

          {step === 'map' && (
            <button
              onClick={() => setStep('preview')}
              disabled={mappedCount === 0}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Preview Import →
            </button>
          )}

          {step === 'preview' && (
            <button
              onClick={async () => {
                setImporting(true);
                handleImport();
              }}
              disabled={importing}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-70 disabled:cursor-wait transition-colors"
            >
              <Upload size={15} />
              {importing ? 'Importing...' : `Import ${csvRows.length} Rows`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
