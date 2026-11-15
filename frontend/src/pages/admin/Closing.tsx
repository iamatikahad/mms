import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, DataTable, Badge, Modal } from '../../components/ui';
import { api, fmtMoney, fmtDate, currentMonth, monthOptions } from '../../api';
import { useApp } from '../../store';

export default function Closing() {
  const { t } = useTranslation();
  const { toast, confirm } = useApp();
  const [month, setMonth] = useState(currentMonth());
  const [validation, setValidation] = useState<any>(null);
  const [closings, setClosings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const [v, c] = await Promise.all([
      api.get(`/closing/${month}/validate`),
      api.get('/closing'),
    ]);
    setValidation(v.data); setClosings(c.data.rows); setLoading(false);
  };
  React.useEffect(() => { load(); }, [month]);

  const close = async () => {
    if (!(await confirm(`${t('confirm')} ${t('closeMonth')} ${month}?`))) return;
    try {
      await api.post(`/closing/${month}/close`, {});
      toast('success', t('closed')); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
  };

  const reopen = async () => {
    const reason = window.prompt(t('reason'));
    if (!reason) return;
    try {
      await api.post(`/closing/${month}/reopen`, { reason });
      toast('success', t('reopened')); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
  };

  const viewSnapshot = async (m: string) => {
    const r = await api.get(`/closing/${m}/snapshot`);
    setSnapshot(r.data);
  };

  const isClosed = closings.find(c => c.ACCOUNT_MONTH === month && c.STATUS === 'CLOSED');
  const fin = validation?.financials;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{t('monthlyClosingTitle')}</h1>
        <Select value={month} onChange={e => setMonth(e.target.value)} className="!w-40">
          {monthOptions(18).map(m => <option key={m} value={m}>{m}</option>)}
        </Select>
      </div>

      {loading || !validation ? <Spinner /> : (
        <>
          <Card title={t('financialSummary')}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>{t('totalMeals')}: <b>{fin.totalMeals}</b> <span className="text-slate-400">({fin.regularMeals}+{fin.guestMeals})</span></div>
              <div>{t('foodExpense')}: <b>{fmtMoney(fin.foodExpense)}</b></div>
              <div>{t('mealRate')}: <b>{fmtMoney(fin.mealRate)}</b></div>
              <div>{t('billsTotal')}: <b>{fmtMoney(fin.totalBills)}</b></div>
              <div>{t('depositsTotal')}: <b>{fmtMoney(fin.totalDeposits)}</b></div>
              <div>{t('otherCharges')}: <b>{fmtMoney(fin.totalOtherCharges)}</b></div>
            </div>
            <div className="mt-3 text-xs text-slate-500">
              {Object.entries(validation.counts).map(([k, v]) => <span key={k} className="mr-3">{k}: <b>{String(v)}</b></span>)}
            </div>
            {validation.issues?.length > 0 && (
              <div className="mt-2 text-sm text-amber-600">⚠ {validation.issues.join(', ')}</div>
            )}
          </Card>

          <div className="flex gap-2">
            {!isClosed && validation.canClose && (
              <button className="btn-primary" onClick={close}>{t('closeMonth')}</button>
            )}
            {isClosed && (
              <>
                <Badge color="green">{t('closed')} — {fmtDate(isClosed.CLOSED_AT)}</Badge>
                {isClosed.REOPEN_COUNT > 0 && <Badge color="amber">{t('reopened')} ×{isClosed.REOPEN_COUNT}</Badge>}
                {isClosed.STATUS === 'REOPENED' && <button className="btn-secondary" onClick={close}>{t('closeMonth')}</button>}
                <button className="btn-danger" onClick={reopen}>{t('reopenMonth')}</button>
              </>
            )}
          </div>

          <Card title={t('monthlyClosingTitle')}>
            <DataTable
              columns={[
                { key: 'ACCOUNT_MONTH', label: t('month') },
                { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'CLOSED' ? 'green' : 'amber'}>{t(r.STATUS.toLowerCase())}</Badge> },
                { key: 'CLOSED_AT', label: t('timestamp'), render: (r: any) => fmtDate(r.CLOSED_AT) },
                { key: 'CLOSED_BY_NAME', label: t('user') },
                { key: 'REOPEN_COUNT', label: t('reopenCount') },
                { key: 'actions', label: t('actions'), render: (r: any) => <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => viewSnapshot(r.ACCOUNT_MONTH)}>{t('snapshot')}</button> },
              ]}
              rows={closings}
            />
          </Card>
        </>
      )}

      <Modal open={!!snapshot} onClose={() => setSnapshot(null)} title={`${t('snapshot')} — ${snapshot?.closing?.ACCOUNT_MONTH}`} wide>
        {snapshot?.snapshot && (
          <div className="space-y-3">
            <div className="text-sm">
              Meal rate: <b>{fmtMoney(snapshot.snapshot.financials?.mealRate)}</b> ·
              Payable: <b>{fmtMoney(snapshot.snapshot.financials && snapshot.snapshot.members?.reduce((a: number, m: any) => a + m.totalPayable, 0))}</b> ·
              Deposits: <b>{fmtMoney(snapshot.snapshot.members?.reduce((a: number, m: any) => a + m.totalDeposits, 0))}</b>
            </div>
            <table className="w-full">
              <thead><tr><th className="th">{t('fullName')}</th><th className="th text-right">{t('totalMeals')}</th><th className="th text-right">{t('foodCost')}</th><th className="th text-right">{t('billShare')}</th><th className="th text-right">{t('totalPayable')}</th><th className="th text-right">{t('totalDeposits')}</th><th className="th text-right">{t('balance')}</th></tr></thead>
              <tbody>{snapshot.snapshot.members?.map((m: any) => (
                <tr key={m.memberId} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="td">{m.fullName}</td><td className="td text-right">{m.totalMeals}</td>
                  <td className="td text-right">{fmtMoney(m.foodCost)}</td><td className="td text-right">{fmtMoney(m.billAllocation)}</td>
                  <td className="td text-right">{fmtMoney(m.totalPayable)}</td><td className="td text-right">{fmtMoney(m.totalDeposits)}</td>
                  <td className={`td text-right font-medium ${m.balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtMoney(m.balance)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
