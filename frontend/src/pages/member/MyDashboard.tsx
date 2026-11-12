import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select } from '../../components/ui';
import { api, fmtMoney, fmtDate, fmtTime, currentMonth, monthOptions } from '../../api';
import { useApp } from '../../store';

export default function MyDashboard() {
  const { t } = useTranslation();
  const { user } = useApp();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mealTimes, setMealTimes] = useState<{ lunch?: string; dinner?: string }>({});
  const [activePolls, setActivePolls] = useState(0);

  React.useEffect(() => {
    setLoading(true);
    api.get('/dashboard/member', { params: { month } }).then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
    Promise.all([
      api.get('/settings/meal.lunch_time'), api.get('/settings/meal.dinner_time'),
      api.get('/polls', { params: { scope: 'active' } }),
    ]).then(([l, d, p]) => {
      setMealTimes({ lunch: l.data?.setting?.SETTING_VALUE, dinner: d.data?.setting?.SETTING_VALUE });
      setActivePolls((p.data?.polls || []).length);
    }).catch(() => {});
  }, [month]);

  if (loading || !data) return <Spinner />;
  const m = data.monthly;
  const bal = m.balance;

  const Stat = ({ label, value, color }: any) => (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${color || ''}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t('myDashboard')} — {user?.fullName}</h1>
          {(mealTimes.lunch || mealTimes.dinner || activePolls > 0) && (
            <div className="text-xs text-slate-500 mt-0.5">
              {mealTimes.lunch || mealTimes.dinner ? `🍽️ ${t('lunch')}: ${fmtTime(mealTimes.lunch || '')} · ${t('dinner')}: ${fmtTime(mealTimes.dinner || '')}` : ''}
              {activePolls > 0 && ` · 🗳️ ${activePolls} ${t('activePolls')}`}
            </div>
          )}
        </div>
        <Select value={month} onChange={e => setMonth(e.target.value)} className="!w-40">
          {monthOptions(6).map(x => <option key={x} value={x}>{x}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t('lunchToday')} value={data.todayStats?.lunch ?? 0} />
        <Stat label={t('dinnerToday')} value={data.todayStats?.dinner ?? 0} />
        <Stat label={t('guestToday')} value={data.todayStats?.guests ?? 0} />
        <Stat label={t('totalToday')} value={(data.todayStats?.lunch || 0) + (data.todayStats?.dinner || 0)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t('monthlyMeals')} value={m.totalMeals} />
        <Stat label={t('mealRate')} value={fmtMoney(m.mealRate)} />
        <Stat label={t('foodCost')} value={fmtMoney(m.foodCost)} />
        <Stat label={t('billShare')} value={fmtMoney(m.billAllocation)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t('otherCharges')} value={fmtMoney(m.otherCharges)} />
        <Stat label={t('totalPayable')} value={fmtMoney(m.totalPayable)} />
        <Stat label={t('totalDeposits')} value={fmtMoney(m.totalDeposits)} />
        <Stat label={t('balance')} value={fmtMoney(bal)} color={bal < 0 ? 'text-red-600' : 'text-emerald-600'} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title={t('mealHistory')}>
          <table className="w-full">
            <thead><tr><th className="th">{t('date')}</th><th className="th text-right">{t('regularQty')}</th></tr></thead>
            <tbody>
              {data.mealHistory?.map((r: any, i: number) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="td">{r.DAY}</td><td className="td text-right">{r.QTY}</td>
                </tr>
              ))}
              {!data.mealHistory?.length && <tr><td className="td text-slate-400" colSpan={2}>{t('noData')}</td></tr>}
            </tbody>
          </table>
        </Card>
        <Card title={t('recentDeposits')}>
          <table className="w-full">
            <thead><tr><th className="th">{t('date')}</th><th className="th text-right">{t('amount')}</th><th className="th">{t('paymentMethod')}</th><th className="th">{t('status')}</th></tr></thead>
            <tbody>
              {data.deposits?.map((r: any) => (
                <tr key={r.DEPOSIT_ID} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="td">{fmtDate(r.DEPOSIT_DATE)}</td><td className="td text-right">{fmtMoney(r.AMOUNT)}</td><td className="td">{r.PAYMENT_METHOD}</td><td className="td">{r.STATUS}</td>
                </tr>
              ))}
              {!data.deposits?.length && <tr><td className="td text-slate-400" colSpan={4}>{t('noData')}</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title={t('monthlyBills')}>
          <table className="w-full">
            <thead><tr><th className="th">{t('month')}</th><th className="th">{t('billCategory')}</th><th className="th text-right">{t('billShare')}</th></tr></thead>
            <tbody>
              {data.bills?.map((r: any, i: number) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="td">{r.BILL_MONTH}</td><td className="td">{r.CATEGORY_NAME}</td>
                  <td className="td text-right">{Number(r.IS_ELIGIBLE) ? fmtMoney(r.ALLOCATED_AMOUNT) : '—'}</td>
                </tr>
              ))}
              {!data.bills?.length && <tr><td className="td text-slate-400" colSpan={3}>{t('noData')}</td></tr>}
            </tbody>
          </table>
        </Card>
        <Card title={t('expenses')}>
          <table className="w-full">
            <thead><tr><th className="th">{t('chargeDate')}</th><th className="th text-right">{t('amount')}</th><th className="th">{t('category')}</th></tr></thead>
            <tbody>
              {data.charges?.map((r: any) => (
                <tr key={r.CHARGE_ID} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="td">{fmtDate(r.CHARGE_DATE)}</td><td className="td text-right">{fmtMoney(r.AMOUNT)}</td><td className="td">{r.CATEGORY}</td>
                </tr>
              ))}
              {!data.charges?.length && <tr><td className="td text-slate-400" colSpan={3}>{t('noData')}</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
