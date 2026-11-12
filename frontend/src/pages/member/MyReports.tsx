import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, DataTable, Select, Badge } from '../../components/ui';
import { api, fmtMoney, fmtDate, currentMonth, monthOptions } from '../../api';

export default function MyReports() {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<any>(null);
  const [meals, setMeals] = useState<any[]>([]);
  const [guests, setGuests] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/reports/my/summary', { params: { month } }),
      api.get('/reports/my/meals', { params: { month } }),
      api.get('/reports/my/guests', { params: { month } }),
      api.get('/reports/my/deposits', { params: { month } }),
      api.get('/reports/my/charges', { params: { month } }),
      api.get('/reports/my/bills', { params: { month } }),
    ]).then(([s, m, g, d, c, b]) => {
      setSummary(s.data); setMeals(m.data.rows || []); setGuests(g.data.rows || []);
      setDeposits(d.data.rows || []); setCharges(c.data.rows || []); setBills(b.data.rows || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [month]);

  const mem = summary?.member;
  const fin = summary ? { ...summary.member, mealRate: summary.mealRate } : null;

  if (loading) return <div className="text-slate-400">{t('loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{t('myReports')}</h1>
        <div className="flex gap-2">
          <Select value={month} onChange={e => setMonth(e.target.value)} className="!w-40">
            {monthOptions(12).map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
          <button className="btn-secondary" onClick={() => window.open(`/api/pdf/my/summary?month=${month}&lang=${i18n.language}`, '_blank')}>PDF</button>
        </div>
      </div>

      {mem && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            [t('regular'), mem.regularMeals],
            [t('guest'), mem.guestMeals],
            [t('totalMeals'), mem.totalMeals],
            [t('mealRate'), fmtMoney(summary.mealRate)],
            [t('foodCost'), fmtMoney(mem.foodCost)],
            [t('billShare'), fmtMoney(mem.billAllocation)],
            [t('otherCharges'), fmtMoney(mem.otherCharges)],
            [t('totalPayable'), fmtMoney(mem.totalPayable)],
            [t('totalDeposits'), fmtMoney(mem.totalDeposits)],
          ].map(([l, v]) => (
            <Card key={l as string}><div className="text-xs text-slate-500">{l}</div><div className="text-lg font-bold">{v}</div></Card>
          ))}
          <Card><div className="text-xs text-slate-500">{t('balance')}</div>
            <div className={`text-lg font-bold ${mem.balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtMoney(mem.balance)}</div></Card>
        </div>
      )}

      <Card title={t('mealHistory')}>
        <DataTable columns={[
          { key: 'MEAL_DATE', label: t('date'), render: (r: any) => fmtDate(r.MEAL_DATE) },
          { key: 'MEAL_TYPE', label: t('type') },
          { key: 'REGULAR_QTY', label: t('regularQty') },
          { key: 'STATUS', label: t('status') },
        ]} rows={meals} />
      </Card>
      <Card title={t('guestMeals')}>
        <DataTable columns={[
          { key: 'MEAL_DATE', label: t('date'), render: (r: any) => fmtDate(r.MEAL_DATE) },
          { key: 'MEAL_TYPE', label: t('type') },
          { key: 'GUEST_QTY', label: t('guestQty') },
          { key: 'NOTES', label: t('notes') },
        ]} rows={guests} />
      </Card>
      <Card title={t('deposits')}>
        <DataTable columns={[
          { key: 'DEPOSIT_DATE', label: t('date'), render: (r: any) => fmtDate(r.DEPOSIT_DATE) },
          { key: 'AMOUNT', label: t('amount'), render: (r: any) => fmtMoney(r.AMOUNT) },
          { key: 'PAYMENT_METHOD', label: t('paymentMethod') },
          { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : 'red'}>{r.STATUS}</Badge> },
        ]} rows={deposits} />
      </Card>
      <Card title={t('monthlyBills')}>
        <DataTable columns={[
          { key: 'BILL_MONTH', label: t('month') },
          { key: 'CATEGORY_NAME', label: t('billCategory') },
          { key: 'ALLOCATED_AMOUNT', label: t('amount'), render: (r: any) => Number(r.IS_ELIGIBLE) ? fmtMoney(r.ALLOCATED_AMOUNT) : '—' },
        ]} rows={bills} />
      </Card>
      <Card title={t('expenses')}>
        <DataTable columns={[
          { key: 'CHARGE_DATE', label: t('date'), render: (r: any) => fmtDate(r.CHARGE_DATE) },
          { key: 'AMOUNT', label: t('amount'), render: (r: any) => fmtMoney(r.AMOUNT) },
          { key: 'CATEGORY', label: t('category') },
          { key: 'DESCRIPTION', label: t('description') },
        ]} rows={charges} />
      </Card>
    </div>
  );
}
