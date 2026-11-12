import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select } from '../../components/ui';
import { api, fmtMoney, currentMonth, monthOptions } from '../../api';

function FlowBox({ title, steps, color = 'brand' }: { title: string; steps: any[]; color?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  return (
    <Card>
      <button className="w-full flex items-center justify-between" onClick={() => setOpen(o => !o)}>
        <h3 className="font-semibold">{title}</h3>
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</div>
              <div className="flex-1 card !rounded-lg !shadow-none px-3 py-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{typeof s.label === 'string' && s.label.startsWith('flow') ? t(s.label) : s.label}</div>
                  {s.formula && <div className="text-xs text-slate-400 font-mono">{s.formula}</div>}
                </div>
                {s.value !== null && s.value !== undefined && <div className="font-bold text-brand-600 dark:text-brand-400">{typeof s.value === 'number' && Math.abs(s.value) > 100 ? fmtMoney(s.value) : s.value}{s.precision ? '' : ''}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Flowchart() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    setLoading(true);
    api.get(`/flowchart/data?month=${month}`).then(r => setData(r.data)).finally(() => setLoading(false));
  }, [month]);

  if (loading || !data) return <Spinner />;

  const f3 = data.flow3;
  const example = f3.example;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{t('flowchart')}</h1>
        <Select value={month} onChange={e => setMonth(e.target.value)} className="!w-40">
          {monthOptions(18).map(m => <option key={m} value={m}>{m}</option>)}
        </Select>
      </div>
      <p className="text-sm text-slate-500">{t('selectMonth')}: <b>{data.month}</b> — {t('formula')}: all values computed from Oracle records.</p>

      <FlowBox title={t('flowMealTitle')} steps={data.flow1.steps} />

      {data.flow1.memberFoodCostExample?.length > 0 && (
        <Card title={t('memberWise')}>
          <table className="w-full">
            <thead><tr><th className="th">{t('fullName')}</th><th className="th text-right">{t('totalMeals')}</th><th className="th text-right">{t('foodCost')}</th></tr></thead>
            <tbody>{data.flow1.memberFoodCostExample.map((m: any, i: number) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="td">{m.name}</td><td className="td text-right">{m.meals}</td><td className="td text-right font-medium">{fmtMoney(m.foodCost)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      <FlowBox title={t('flowBillTitle')} steps={data.flow2.steps} />
      {data.flow2.allocations?.length > 0 && (
        <Card>
          <table className="w-full">
            <thead><tr><th className="th">{t('fullName')}</th><th className="th text-right">{t('billShare')}</th></tr></thead>
            <tbody>{data.flow2.allocations.map((a: any, i: number) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="td">{a.name}</td><td className="td text-right font-medium">{fmtMoney(a.share)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      <FlowBox title={t('flowFinalTitle')} steps={f3.steps.map((s: any) => ({
        ...s,
        value: s.label === t('flowFinalTitle') ? null : undefined,
      }))} />

      {example && (
        <Card title={`${t('memberWise')} — ${example.fullName} (${example.memberCode})`}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>{t('regular')}: <b>{example.regularMeals}</b></div>
            <div>{t('guest')}: <b>{example.guestMeals}</b></div>
            <div>{t('totalMeals')}: <b>{example.totalMeals}</b></div>
            <div>{t('foodCost')}: <b>{fmtMoney(example.foodCost)}</b></div>
            <div>{t('billShare')}: <b>{fmtMoney(example.billAllocation)}</b></div>
            <div>{t('otherCharges')}: <b>{fmtMoney(example.otherCharges)}</b></div>
            <div>{t('totalPayable')}: <b>{fmtMoney(example.totalPayable)}</b></div>
            <div>{t('totalDeposits')}: <b>{fmtMoney(example.totalDeposits)}</b></div>
            <div>{t('balance')}: <b className={example.balance < 0 ? 'text-red-600' : 'text-emerald-600'}>{fmtMoney(example.balance)}</b></div>
          </div>
        </Card>
      )}

      <Card title={t('monthlyFinancialSummary')}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>{t('foodCost')}: <b>{fmtMoney(f3.totals.food)}</b></div>
          <div>{t('totalPayable')}: <b>{fmtMoney(f3.totals.payable)}</b></div>
          <div>{t('totalDeposits')}: <b>{fmtMoney(f3.totals.deposits)}</b></div>
          <div>{t('balance')}: <b className={f3.totals.balance < 0 ? 'text-red-600' : 'text-emerald-600'}>{fmtMoney(f3.totals.balance)}</b></div>
        </div>
      </Card>
    </div>
  );
}
