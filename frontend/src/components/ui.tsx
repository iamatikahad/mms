import React, { useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function Card({ title, children, actions, className = '' }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={`card p-4 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="font-semibold text-sm">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export function Field({ label, children, required, hint }: { label: string; children: ReactNode; required?: boolean; hint?: string }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className || ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input ${props.className || ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input ${props.className || ''}`} />;
}

export function Badge({ children, color = 'slate' }: { children: ReactNode; color?: string }) {
  const map: Record<string, string> = {
    slate: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    blue: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[color] || map.slate}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 no-print" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold">{title}</h3>
          <button className="btn-ghost !px-2" onClick={onClose}>✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
}

export function Empty({ text }: { text?: string }) {
  const { t } = useTranslation();
  return <div className="text-center text-slate-400 py-10 text-sm">{text || t('noData')}</div>;
}

export function DataTable({ columns, rows, empty }: { columns: { key: string; label: string; render?: (row: any) => ReactNode }[]; rows: any[]; empty?: string }) {
  const { t } = useTranslation();
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead><tr className="border-b border-slate-200 dark:border-slate-800">{columns.map(c => <th key={c.key} className="th">{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
            {columns.map(c => <td key={c.key} className="td">{c.render ? c.render(r) : r[c.key]}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 justify-end mt-3 text-sm">
      <button className="btn-secondary !py-1 !px-3" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('prev')}</button>
      <span className="text-slate-500">{t('page')} {page} {t('of')} {pages}</span>
      <button className="btn-secondary !py-1 !px-3" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('next')}</button>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useTranslation();
  const [v, setV] = useState(value);
  return (
    <input className="input !w-64" placeholder={placeholder || t('search')}
      value={v} onChange={e => { setV(e.target.value); onChange(e.target.value); }} />
  );
}

export function useFetch<T = any>(url: string, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => {
    setLoading(true); setError(null);
    try { const r = await api.get(url); setData(r.data); }
    catch (e: any) { setError(e?.response?.data?.error || 'ERROR'); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { reload(); }, deps);
  return { data, loading, error, reload, setData };
}

import { api } from '../api';
