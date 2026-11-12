import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, Field, DataTable, Badge } from '../../components/ui';
import { api, fmtMoney, fmtDate, downloadCSV, currentMonth, monthOptions } from '../../api';

const REPORTS = [
  { key: 'daily-meals', label: 'dailyMealReport', admin: true },
  { key: 'monthly-meals', label: 'monthlyMealReport', admin: true },
  { key: 'member-meals', label: 'memberWiseMealReport', admin: true },
  { key: 'guest-meals', label: 'guestMealReport', admin: true },
  { key: 'bazar', label: 'bazarExpenseReport', admin: true },
  { key: 'food-expense', label: 'foodExpenseReport', admin: true },
  { key: 'monthly-bills', label: 'monthlyBillReport', admin: true },
  { key: 'bill-categories', label: 'billCategoryReport', admin: true },
  { key: 'deposits', label: 'depositReport', admin: true },
  { key: 'member-balances', label: 'memberBalanceReport', admin: true },
  { key: 'outstanding', label: 'outstandingReport', admin: true },
  { key: 'advances', label: 'advanceReport', admin: true },
  { key: 'monthly-summary', label: 'monthlyFinancialSummary', admin: true },
  { key: 'closing-report', label: 'monthlyClosingReport', admin: true },
];

const LABELS: Record<string, string> = {
  MEAL_DATE: 'date', MEAL_TYPE: 'type', MEMBER_CODE: 'memberCode', FULL_NAME: 'fullName',
  REGULAR_QTY: 'regularQty', TOTAL_QTY: 'total', MEMBERS_EATING: 'members', HOST_CODE: 'memberCode',
  HOST_NAME: 'hostMember', GUEST_QTY: 'guestQty', NOTES: 'notes', STATUS: 'status',
  PURCHASE_DATE: 'purchaseDate', ITEM_NAME: 'itemName', CATEGORY: 'category', QUANTITY: 'quantity',
  UNIT: 'unit', UNIT_PRICE: 'unitPrice', TOTAL_PRICE: 'totalPrice', PURCHASED_BY: 'purchasedBy',
  DEPOSIT_DATE: 'depositDate', AMOUNT: 'amount', PAYMENT_METHOD: 'paymentMethod', TRANSACTION_REF: 'transactionRef',
  CNT: 'count', QTY: 'quantity', TOTAL: 'total', ALLOCATED_MEMBERS: 'members', TOTAL_ALLOCATED: 'total',
  LUNCH: 'lunch', DINNER: 'dinner', BILL_DATE: 'billDate', CATEGORY_NAME: 'category', PAYMENT_STATUS: 'paymentStatus',
  DESCRIPTION: 'description', MEMBER_ID: 'memberId', BALANCE: 'balance', FOOD_COST: 'foodCost',
  BILL_ALLOCATION: 'billShare', OTHER_CHARGES: 'otherCharges', TOTAL_PAYABLE: 'totalPayable',
  TOTAL_DEPOSITS: 'totalDeposits', REGULAR_MEALS: 'regular', GUEST_MEALS: 'guest', TOTAL_MEALS: 'totalMeals',
  MEMBER_CODE2: 'memberCode',
};

function ReportTable({ rows, summary }: { rows: any[]; summary?: any }) {
  const { t } = useTranslation();
  if (!rows?.length) return <div className="text-center text-slate-400 py-10">{t('noData')}</div>;
  const headers = Object.keys(rows[0]);
  const isMoney = (k: string) => /AMOUNT|TOTAL|COST|PAYABLE|DEPOSITS|BALANCE|RATE|SHARE|CHARGES|ALLOCATED/i.test(k);
  return (
    <div className="overflow-x-auto">
      {summary && (
        <div className="flex flex-wrap gap-4 mb-3 text-sm">
          {Object.entries(summary).map(([k, v]) => (
            <div key={k} className="card !rounded-lg px-3 py-2">
              <span className="text-slate-500 text-xs">{t(k === 'foodExpense' ? 'foodExpense' : k === 'totalMeals' ? 'totalMeals' : k === 'mealRate' ? 'mealRate' : k)}</span>
              <div className="font-bold">{isMoney(k) || k === 'mealRate' ? fmtMoney(v) : String(v)}</div>
            </div>
          ))}
        </div>
      )}
      <table className="w-full">
        <thead><tr className="border-b border-slate-200 dark:border-slate-800">
          {headers.map(h => <th key={h} className="th">{t(LABELS[h] || h)}</th>)}
        </tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            {headers.map(h => {
              const v = r[h];
              return <td key={h} className="td">{isMoney(h) ? fmtMoney(v) : (h.includes('DATE') ? fmtDate(v) : String(v ?? '—'))}</td>;
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function Reports() {
  const { t, i18n } = useTranslation();
  const [type, setType] = useState('monthly-summary');
  const [month, setMonth] = useState(currentMonth());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const needsDates = ['daily-meals', 'deposits'].includes(type);

  const run = async () => {
    setLoading(true);
    const params: any = { month };
    if (needsDates) { if (from) params.from = from; if (to) params.to = to; }
    try {
      const r = await api.get(`/reports/admin/${type}`, { params });
      setData(r.data);
    } finally { setLoading(false); }
  };
  React.useEffect(() => { run(); }, [type]);

  const rows = data?.rows || (Array.isArray(data) ? data : null) || (data?.members && type !== 'monthly-summary' ? data.members : null);

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('reports')}</h1>
      <Card>
        <div className="flex flex-wrap gap-2 items-end">
          <Field label={t('reports')}><Select value={type} onChange={e => setType(e.target.value)} className="!w-64">
            {REPORTS.map(r => <option key={r.key} value={r.key}>{t(r.label)}</option>)}
          </Select></Field>
          <Field label={t('month')}><Select value={month} onChange={e => setMonth(e.target.value)} className="!w-36">
            {monthOptions(18).map(m => <option key={m} value={m}>{m}</option>)}
          </Select></Field>
          {needsDates && <>
            <Field label={t('date') + ' ≥'}><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="!w-36" /></Field>
            <Field label={t('date') + ' ≤'}><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="!w-36" /></Field>
          </>}
          <button className="btn-primary" onClick={run} disabled={loading}>{loading ? t('loading') : t('search')}</button>
          <button className="btn-secondary" disabled={!rows?.length} onClick={() => downloadCSV(`report-${type}`, rows || [])}>{t('csvExport')}</button>
          <button className="btn-secondary" onClick={() => {
            const params = new URLSearchParams({ month, lang: i18n.language });
            if (needsDates) { if (from) params.set('from', from); if (to) params.set('to', to); }
            window.open(`/api/pdf/admin/${type}?${params}`, '_blank');
          }}><span className="text-xs font-bold">PDF</span></button>
          <button className="btn-secondary no-print" onClick={() => window.print()}>{t('printReport')}</button>
        </div>
      </Card>
      <Card>
        {loading ? <Spinner /> : type === 'monthly-summary' && data?.financials ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(data.financials).filter(([k]) => k !== 'month').map(([k, v]) => (
                <div key={k} className="card !rounded-lg p-3">
                  <div className="text-xs text-slate-500">{t(k === 'mealRate' ? 'mealRate' : LABELS[k] || k)}</div>
                  <div className="font-bold">{typeof v === 'number' ? (k.includes('Expense') || k.includes('Bills') || k.includes('Deposits') || k.includes('Charges') ? fmtMoney(v) : k === 'mealRate' ? fmtMoney(v) : v) : String(v)}</div>
                </div>
              ))}
            </div>
            <ReportTable rows={[]} />
          </div>
        ) : (
          <ReportTable rows={rows || []} summary={data?.summary} />
        )}
      </Card>
    </div>
  );
}
