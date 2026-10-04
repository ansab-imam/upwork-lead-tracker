import { useState, useCallback, useEffect } from 'react';

const LS_KEY = 'leadtracker_day_notes_v1';

export interface DayNote {
  date:      string; // yyyy-mm-dd
  text:      string;
  updatedAt: string;
}

function load(): Record<string, DayNote> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); } catch { return {}; }
}
function save(notes: Record<string, DayNote>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(notes)); } catch {}
}

export function useDayNotes() {
  const [notes, setNotes] = useState<Record<string, DayNote>>(load);

  useEffect(() => { save(notes); }, [notes]);

  const getNote = useCallback((date: string) => notes[date] ?? null, [notes]);

  const setNote = useCallback((date: string, text: string) => {
    setNotes(prev => ({
      ...prev,
      [date]: { date, text, updatedAt: new Date().toISOString() },
    }));
  }, []);

  const deleteNote = useCallback((date: string) => {
    setNotes(prev => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  }, []);

  return { notes, getNote, setNote, deleteNote };
}
