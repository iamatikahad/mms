import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line } from 'recharts';
import { Card, Stat, Spinner, Select } from '../../components/ui';
import { useFetch, fmtMoney, fmtDate, fmtTime, currentMonth, monthOptions } from '../../api';
import { api } from '../../api';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(currentMonth());
  const { data, loading } = useFetch<any>(`/dashboard/admin?month=${month}`, [month]);
  const [mealTimes, setMealTimes] = React.useState<{ lunch?: string; dinner?: string }>({});
  const [activePolls, setActivePolls] = React.useState(0);
  React.useEffect(() => {
    Promise.all([
      api.get('/settings/meal.lunch_time'), api.get('/settings/meal.dinner_time'),
      api.get('/polls', { params: { scope: 'active' } }),
    ]).then(([l, d, p]) => {
      setMealTimes({ lunch: l.data?.setting?.SETTING_VALUE, dinner: d.data?.setting?.SETTING_VALUE });
      setActivePolls((p.data?.polls || []).length);
    }).catch(() => {});
  }, []);

  if (loading || !data) return <Spinner />;
  const s = data.stats;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t('dashboard')}</h1>
          {(mealTimes.lunch || mealTimes.dinner || activePolls > 0) && (
            <div className="text-xs text-slate-500 mt-0.5">
              {mealTimes.lunch || mealTimes.dinner ? `🍽️ ${t('lunch')}: ${fmtTime(mealTimes.lunch || '')} · ${t('dinner')}: ${fmtTime(mealTimes.dinner || '')}` : ''}
              {activePolls > 0 && ` · 🗳️ ${activePolls} ${t('activePolls')}`}
            </div>
          )}
        </div>
        <Select value={month} onChange={e => setMonth(e.target.value)} className="!w-40">
          {monthOptions(12).map(m => <option key={m} value={m}>{m}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Stat label={t('activeMembers')} value={s.activeMembers} sub={`${t('inactiveMembers')}: ${s.inactiveMembers}`} />
        <Stat label={t('todayLunch')} value={s.todayLunch} />
        <Stat label={t('todayDinner')} value={s.todayDinner} />
        <Stat label={t('todayTotalMeals')} value={s.todayTotal} sub={`${t('todayGuestMeals')}: ${s.todayGuests}`} />
        <Stat label={t('monthTotalMeals')} value={s.monthTotalMeals} sub={`${t('regular')}: ${s.monthRegularMeals} · ${t('guest')}: ${s.monthGuestMeals}`} />
        <Stat label={t('mealRate')} value={fmtMoney(s.mealRate)} />
        <Stat label={t('foodExpense')} value={fmtMoney(s.monthFoodExpense)} />
        <Stat label={t('billsTotal')} value={fmtMoney(s.monthBills)} />
        <Stat label={t('depositsTotal')} value={fmtMoney(s.monthDeposits)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title={t('monthlyMealReport')}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.charts.mealChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="DAY" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="LUNCH" name={t('lunch')} fill="#338ffc" />
              <Bar dataKey="DINNER" name={t('dinner')} fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title={t('depositReport')}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.charts.depositChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="DAY" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip formatter={(v: any) => fmtMoney(v)} />
              <Line type="monotone" dataKey="TOTAL" name={t('amount')} stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title={t('recentDeposits')}>
          <table className="w-full">
            <tbody>
              {data.recent.deposits.map((d: any) => (
                <tr key={d.DEPOSIT_ID} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <td className="td">{fmtDate(d.DEPOSIT_DATE)}</td>
                  <td className="td">{d.FULL_NAME}</td>
                  <td className="td">{d.PAYMENT_METHOD}</td>
                  <td className="td text-right font-medium">{fmtMoney(d.AMOUNT)}</td>
                </tr>
              ))}
              {!data.recent.deposits.length && <tr><td className="td text-center text-slate-400">{t('noData')}</td></tr>}
            </tbody>
          </table>
        </Card>
        <Card title={t('recentExpenses')}>
          <table className="w-full">
            <tbody>
              {data.recent.expenses.map((e: any) => (
                <tr key={e.BAZAR_ID} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <td className="td">{fmtDate(e.PURCHASE_DATE)}</td>
                  <td className="td">{e.ITEM_NAME}</td>
                  <td className="td">{e.CATEGORY}</td>
                  <td className="td text-right font-medium">{fmtMoney(e.TOTAL_PRICE)}</td>
                </tr>
              ))}
              {!data.recent.expenses.length && <tr><td className="td text-center text-slate-400">{t('noData')}</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      {data.outstanding.length > 0 && (
        <Card title={t('outstandingReport')}>
          <table className="w-full">
            <tbody>
              {data.outstanding.map((o: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <td className="td">{o.FULL_NAME}</td>
                  <td className="td text-right font-medium text-red-600">{fmtMoney(o.BALANCE)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
