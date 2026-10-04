import React, { useState } from 'react';
import { X, Check, Trash2 } from 'lucide-react';
import { formatDisplayDate } from '../../types/reporting';
import type { MarkerType } from './LineChart';
import { MARKER_COLORS, MARKER_LABELS } from './LineChart';
import type { DayMarker } from './LineChart';

interface DayModalProps {
  date: string;
  existingNote: string;
  existingMarker: DayMarker | null;
  onSaveNote: (text: string) => void;
  onDeleteNote: () => void;
  onSaveMarker: (type: MarkerType, note: string) => void;
  onDeleteMarker: () => void;
  onClose: () => void;
}

const MARKER_TYPES: { type: MarkerType; label: string; emoji: string }[] = [
  { type: 'holiday', label: 'Holiday',  emoji: '🎉' },
  { type: 'leave',   label: 'Leave',    emoji: '🌴' },
  { type: 'halfday', label: 'Half Day', emoji: '🌅' },
];

export const DayModal: React.FC<DayModalProps> = ({
  date, existingNote, existingMarker,
  onSaveNote, onDeleteNote, onSaveMarker, onDeleteMarker, onClose,
}) => {
  const [note,       setNote]       = useState(existingNote);
  const [markerType, setMarkerType] = useState<MarkerType | null>(existingMarker?.type ?? null);
  const [markerNote, setMarkerNote] = useState(existingMarker?.note ?? '');

  const handleSave = () => {
    if (note.trim()) onSaveNote(note.trim());
    else if (existingNote) onDeleteNote();

    if (markerType) onSaveMarker(markerType, markerNote.trim());
    else if (existingMarker) onDeleteMarker();

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {formatDisplayDate(date)}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Add a note or mark this day</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Note</label>
            <textarea autoFocus value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Conference day, lower volume expected..."
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 resize-none transition-all"
            />
          </div>

          {/* Marker */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mark this day</label>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setMarkerType(null)}
                className={`flex-1 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                  markerType === null ? 'bg-slate-100 border-slate-300 text-slate-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                }`}>
                None
              </button>
              {MARKER_TYPES.map(m => (
                <button key={m.type} onClick={() => setMarkerType(m.type)}
                  className={`flex-1 px-3 py-2 rounded-xl border text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                    markerType === m.type
                      ? 'text-white border-transparent'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                  style={markerType === m.type ? { backgroundColor: MARKER_COLORS[m.type] } : {}}>
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
            {markerType && (
              <input value={markerNote} onChange={e => setMarkerNote(e.target.value)}
                placeholder={`Optional note for this ${MARKER_LABELS[markerType].toLowerCase()}...`}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-400 transition-all"
              />
            )}
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-6">
          {(existingNote || existingMarker) && (
            <button onClick={() => { onDeleteNote(); onDeleteMarker(); onClose(); }}
              className="px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1.5">
              <Trash2 size={13} /> Clear
            </button>
          )}
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
            <Check size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
};
