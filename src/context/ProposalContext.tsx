import React, { createContext, useContext } from 'react';
import { useProposalTable } from '../hooks/useProposalTable';
import { useLeadPriority } from '../hooks/useLeadPriority';
import { useLeadAnalysis } from '../hooks/useLeadAnalysis';
import type { Column, Row, ColumnType } from '../types/proposals';
import type { LeadPriorityRecord } from '../types/leadPriority';
import type { LAColumn } from '../types/leadAnalysis';
import type { MergedRow } from '../hooks/useLeadAnalysis';

interface ProposalContextType {
  columns: Column[];
  rows: Row[];
  loading: boolean;
  error: string | null;
  addRow: () => void;
  duplicateRow: (rowId: string) => void;
  deleteRow: (rowId: string) => void;
  updateCell: (rowId: string, colId: string, value: string) => void;
  importRows: (rows: Omit<Row, 'id' | 'created_at'>[], mode?: 'skip' | 'overwrite') => Promise<void>;
  clearAllRows: () => Promise<void>;
  addColumn: (name: string, type: ColumnType, options?: { label: string; color: string }[]) => void;
  deleteColumn: (colId: string) => void;
  renameColumn: (colId: string, name: string) => void;
  changeColumnType: (colId: string, type: ColumnType) => void;
  resizeColumn: (colId: string, width: number) => void;
  reorderColumns: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
  updateColumnOptions: (colId: string, options: any) => void;
  // Lead Analysis — shared for global search
  laColumns: LAColumn[];
  laMergedRows: MergedRow[];
  // Lead Priority — shared so only one Supabase subscription exists
  priorityRecords: LeadPriorityRecord[];
  priorityLoading: boolean;
  savePriorityRecord: (uniqueId: string, selectedCriteria: string[]) => Promise<LeadPriorityRecord>;
  deletePriorityRecord: (id: string) => Promise<void>;
  getPriorityByUniqueId: (uniqueId: string) => LeadPriorityRecord | null;
}

const ProposalContext = createContext<ProposalContextType | null>(null);

export const ProposalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const proposalData  = useProposalTable();
  const priorityData  = useLeadPriority();
  const laData        = useLeadAnalysis(proposalData.columns, proposalData.rows);

  const value: ProposalContextType = {
    ...proposalData,
    laColumns:             laData.laColumns,
    laMergedRows:          laData.mergedRows,
    priorityRecords:       priorityData.records,
    priorityLoading:       priorityData.loading,
    savePriorityRecord:    priorityData.saveRecord,
    deletePriorityRecord:  priorityData.deleteRecord,
    getPriorityByUniqueId: priorityData.getByUniqueId,
  };

  return (
    <ProposalContext.Provider value={value}>
      {children}
    </ProposalContext.Provider>
  );
};

export function useProposals() {
  const ctx = useContext(ProposalContext);
  if (!ctx) throw new Error('useProposals must be used inside ProposalProvider');
  return ctx;
}
