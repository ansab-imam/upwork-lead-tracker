import React, { useState, useMemo } from 'react';
import { X, Download, Calendar, Filter } from 'lucide-react';
import type { Column, Row } from '../../types/proposals';

interface ExportModalProps {
  columns: Column[];
  rows: Row[];
  onClose: () => void;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function normalizeDate(v: string): string {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const MO: Record<string,string> = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  const m = v.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})$/);
  if (m) { const mo = MO[m[2].toLowerCase()]; const yr = m[3].length===2?`20${m[3]}`:m[3]; if (mo) return `${yr}-${mo}-${m[1].padStart(2,'0')}`; }
  return '';
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [yr, mo, dd] = iso.split('-');
  const mn = parseInt(mo,10)-1;
  return `${dd}-${MONTHS[mn] ?? mo}-${yr}`;
}

function parseAmt(v: string): number {
  return parseFloat((v||'').replace(/[^0-9.-]/g,'')) || 0;
}

export const ExportModal: React.FC<ExportModalProps> = ({ columns, rows, onClose }) => {
  const now = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth();

  const [rangeType,       setRangeType]       = useState<'month'|'quarter'|'year'|'all'|'custom'>('month');
  const [selectedMonth,   setSelectedMonth]   = useState(thisMonth);
  const [selectedYear,    setSelectedYear]    = useState(thisYear);
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(thisMonth/3)+1);
  const [selectedYearQ,   setSelectedYearQ]   = useState(thisYear);
  const [selectedYearFY,  setSelectedYearFY]  = useState(thisYear);
  const [customFrom,      setCustomFrom]      = useState('');
  const [customTo,        setCustomTo]        = useState('');
  const [typeFilter,      setTypeFilter]      = useState('all');

  const amountCol  = useMemo(() => columns.find(c => /amount/i.test(c.name) && !/connect/i.test(c.name)), [columns]);
  const typeCol    = useMemo(() => columns.find(c => /transaction\s*type|^type$/i.test(c.name)), [columns]);
  const dateCol    = useMemo(() => columns.find(c => c.type==='date' || /date/i.test(c.name)), [columns]);
  const profileCol = useMemo(() => columns.find(c => /profile|account/i.test(c.name)), [columns]);

  const optMap = useMemo(() => {
    const map: Record<string,Record<string,string>> = {};
    for (const col of columns) {
      if (col.type==='dropdown' && col.options) {
        map[col.id] = {};
        for (const opt of col.options as {id:string;label:string}[]) map[col.id][opt.id] = opt.label;
      }
    }
    return map;
  }, [columns]);
  const resolve = (colId: string, val: string) => optMap[colId]?.[val] ?? val;

  const { fromDate, toDate, rangeLabel } = useMemo(() => {
    let from = '', to = '', label = '';
    if (rangeType === 'month') {
      const last = new Date(selectedYear, selectedMonth+1, 0).getDate();
      from = `${selectedYear}-${String(selectedMonth+1).padStart(2,'0')}-01`;
      to   = `${selectedYear}-${String(selectedMonth+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
      label = `${MONTHS[selectedMonth]} ${selectedYear}`;
    } else if (rangeType === 'quarter') {
      const startMo = (selectedQuarter-1)*3;
      const endMo   = startMo+2;
      const last = new Date(selectedYearQ, endMo+1, 0).getDate();
      from = `${selectedYearQ}-${String(startMo+1).padStart(2,'0')}-01`;
      to   = `${selectedYearQ}-${String(endMo+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
      label = `Q${selectedQuarter} ${selectedYearQ} (${MONTHS[startMo]}-${MONTHS[endMo]})`;
    } else if (rangeType === 'year') {
      from = `${selectedYearFY}-01-01`; to = `${selectedYearFY}-12-31`;
      label = `Full Year ${selectedYearFY}`;
    } else if (rangeType === 'all') {
      from = '2000-01-01'; to = '2099-12-31';
      label = 'All Data';
    } else {
      from = customFrom; to = customTo;
      label = customFrom && customTo ? `${formatDate(customFrom)} to ${formatDate(customTo)}` : 'Custom Range';
    }
    return { fromDate: from, toDate: to, rangeLabel: label };
  }, [rangeType, selectedMonth, selectedYear, selectedQuarter, selectedYearQ, selectedYearFY, customFrom, customTo]);

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (dateCol && fromDate && toDate) {
        const d = normalizeDate(row.data[dateCol.id] ?? '');
        if (!d || d < fromDate || d > toDate) return false;
      }
      if (typeFilter !== 'all' && typeCol) {
        const label = resolve(typeCol.id, row.data[typeCol.id]??'').toLowerCase();
        const isIncome = /income|earn|credit|revenue/.test(label);
        if (typeFilter==='income' && !isIncome) return false;
        if (typeFilter==='expense' && isIncome) return false;
      }
      return true;
    });
  }, [rows, dateCol, typeCol, fromDate, toDate, typeFilter, optMap]);

  const stats = useMemo(() => {
    let income=0, expense=0, incCount=0, expCount=0;
    for (const row of filteredRows) {
      if (!amountCol) continue;
      const amt = Math.abs(parseAmt(row.data[amountCol.id]??''));
      if (typeCol) {
        const label = resolve(typeCol.id, row.data[typeCol.id]??'').toLowerCase();
        if (/income|earn|credit|revenue/.test(label)) { income+=amt; incCount++; }
        else { expense+=amt; expCount++; }
      } else { income+=amt; incCount++; }
    }
    return { income, expense, balance: income-expense, incCount, expCount };
  }, [filteredRows, amountCol, typeCol, optMap]);

  const profileBreakdown = useMemo(() => {
    if (!profileCol || !amountCol) return [];
    const by: Record<string,{income:number;expense:number;count:number}> = {};
    for (const row of filteredRows) {
      const p = resolve(profileCol.id, row.data[profileCol.id]??'')||'Unknown';
      if (!by[p]) by[p]={income:0,expense:0,count:0};
      by[p].count++;
      const amt = Math.abs(parseAmt(row.data[amountCol.id]??''));
      if (typeCol) {
        const label = resolve(typeCol.id, row.data[typeCol.id]??'').toLowerCase();
        if (/income|earn|credit|revenue/.test(label)) by[p].income+=amt; else by[p].expense+=amt;
      } else by[p].income+=amt;
    }
    return Object.entries(by).sort(([,a],[,b])=>(b.income+b.expense)-(a.income+a.expense));
  }, [filteredRows, profileCol, amountCol, typeCol, optMap]);

  const fmt = (n: number) => n.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});

  const handleExport = () => {
    const lines: string[] = [];
    const q = (v: string|number) => `"${String(v).replace(/"/g,'""')}"`;

    lines.push(q('TRANSACTION REPORT'));
    lines.push(`${q('Period')},${q(rangeLabel)}`);
    lines.push(`${q('Type')},${q(typeFilter==='all'?'All Transactions':typeFilter==='income'?'Income Only':'Expense Only')}`);
    lines.push(`${q('Generated')},${q(new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}))}`);
    lines.push(`${q('Total Records')},${q(filteredRows.length)}`);
    lines.push('');

    lines.push(q('SUMMARY'));
    lines.push(`${q('Total Income')},${q(fmt(stats.income))}`);
    lines.push(`${q('Total Expense')},${q(fmt(stats.expense))}`);
    lines.push(`${q('Net Balance')},${q(fmt(stats.balance))}`);
    lines.push(`${q('Savings Rate')},${q(stats.income>0?`${Math.round(((stats.income-stats.expense)/stats.income)*100)}%`:'N/A')}`);
    lines.push(`${q('Income Transactions')},${q(stats.incCount)}`);
    lines.push(`${q('Expense Transactions')},${q(stats.expCount)}`);
    lines.push('');

    if (profileBreakdown.length > 0) {
      lines.push(q('BREAKDOWN BY PROFILE'));
      lines.push([q('Profile'),q('Income'),q('Expense'),q('Net Balance'),q('Transactions')].join(','));
      for (const [profile, data] of profileBreakdown) {
        lines.push([q(profile),q(fmt(data.income)),q(fmt(data.expense)),q(fmt(data.income-data.expense)),q(data.count)].join(','));
      }
      lines.push('');
    }

    lines.push(q('TRANSACTION DETAIL'));
    lines.push(columns.map(c => q(c.name)).join(','));
    for (const row of filteredRows) {
      lines.push(columns.map(col => q(resolve(col.id, row.data[col.id]??''))).join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transactions-${rangeLabel.replace(/[\s()]/g,'-').toLowerCase()}.csv`;
    a.click();
    onClose();
  };

  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" style={{ boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-800" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Export Transactions</h2>
            <p className="text-xs text-slate-400 mt-0.5">Download filtered CSV with summary + profile breakdown</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><X size={16} className="text-slate-500"/></button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Range type */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Calendar size={11}/>Date Range</label>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {([['month','Month'],['quarter','Quarter'],['year','Full Year'],['all','All Data'],['custom','Custom']] as const).map(([v,l]) => (
                <button key={v} onClick={() => setRangeType(v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${rangeType===v?'bg-blue-600 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
              ))}
            </div>

            {rangeType==='month' && (
              <div className="flex gap-2">
                <select value={selectedMonth} onChange={e=>setSelectedMonth(+e.target.value)} className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">
                  {MONTHS.map((m,i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <select value={selectedYear} onChange={e=>setSelectedYear(+e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            {rangeType==='quarter' && (
              <div className="flex gap-2">
                <select value={selectedQuarter} onChange={e=>setSelectedQuarter(+e.target.value)} className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">
                  {[1,2,3,4].map(q => <option key={q} value={q}>Q{q} ({MONTHS[(q-1)*3]}–{MONTHS[(q-1)*3+2]})</option>)}
                </select>
                <select value={selectedYearQ} onChange={e=>setSelectedYearQ(+e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            {rangeType==='year' && (
              <select value={selectedYearFY} onChange={e=>setSelectedYearFY(+e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {rangeType==='all' && (
              <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2.5">Exports every transaction from all time.</p>
            )}
            {rangeType==='custom' && (
              <div className="flex gap-2">
                <div className="flex-1"><p className="text-xs text-slate-400 mb-1">From</p>
                  <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
                </div>
                <div className="flex-1"><p className="text-xs text-slate-400 mb-1">To</p>
                  <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/>
                </div>
              </div>
            )}
          </div>

          {/* Type filter */}
          {typeCol && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Filter size={11}/>Transaction Type</label>
              <div className="flex gap-1.5">
                {[['all','All'],['income','Income Only'],['expense','Expense Only']].map(([v,l]) => (
                  <button key={v} onClick={()=>setTypeFilter(v)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${typeFilter===v?'bg-blue-600 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
                ))}
              </div>
            </div>
          )}

          {/* Live preview */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-3">Preview — {rangeLabel}</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                {label:'Records',    val:filteredRows.length.toString(), color:'text-slate-800'},
                {label:'Net Balance',val:fmt(stats.balance), color:stats.balance>=0?'text-emerald-600':'text-red-500'},
                {label:'Total Income',val:fmt(stats.income), color:'text-emerald-600'},
                {label:'Total Expense',val:fmt(stats.expense), color:'text-red-500'},
              ].map(({label,val,color})=>(
                <div key={label} className="bg-white rounded-xl p-3 border border-slate-100">
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className={`text-sm font-bold mt-0.5 ${color}`} style={{fontFamily:"'Space Grotesk',sans-serif"}}>{val}</p>
                </div>
              ))}
            </div>
            {profileBreakdown.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-2">By Profile</p>
                <div className="space-y-1.5">
                  {profileBreakdown.slice(0,4).map(([profile,data])=>(
                    <div key={profile} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-600 truncate flex-1">{profile}</span>
                      <span className="text-emerald-600 font-medium">+{fmt(data.income)}</span>
                      <span className="text-red-500 font-medium">-{fmt(data.expense)}</span>
                      <span className={`font-bold ${data.income-data.expense>=0?'text-blue-600':'text-red-500'}`}>=&nbsp;{fmt(data.income-data.expense)}</span>
                    </div>
                  ))}
                  {profileBreakdown.length>4 && <p className="text-xs text-slate-400">+{profileBreakdown.length-4} more in export</p>}
                </div>
              </div>
            )}
            {filteredRows.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">No records match this selection</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-400">{filteredRows.length} rows · CSV includes summary + breakdown + detail</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 font-medium transition-colors">Cancel</button>
            <button onClick={handleExport} disabled={filteredRows.length===0}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl font-medium transition-colors shadow-sm shadow-blue-200">
              <Download size={14}/> Download CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
