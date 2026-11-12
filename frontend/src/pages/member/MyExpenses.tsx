import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, DataTable, Pagination, Badge } from '../../components/ui';
import { api, fmtDate, fmtMoney, currentMonth, monthOptions } from '../../api';

export default function MyExpenses() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'deposits' | 'bills' | 'charges'>('deposits');
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    setLoading(true);
    const url = tab === 'deposits' ? '/deposits/my' : tab === 'bills' ? '/reports/my/bills' : '/charges/my';
    api.get(url, { params: { month, pageSize: 100 } }).then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [tab, month]);

  const rows = data?.rows || [];

  const cols = tab === 'deposits' ? [
    { key: 'DEPOSIT_DATE', label: t('depositDate'), render: (r: any) => fmtDate(r.DEPOSIT_DATE) },
    { key: 'AMOUNT', label: t('amount'), render: (r: any) => fmtMoney(r.AMOUNT) },
    { key: 'PAYMENT_METHOD', label: t('paymentMethod') },
    { key: 'TRANSACTION_REF', label: t('transactionRef') },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : 'red'}>{r.STATUS}</Badge> },
  ] : tab === 'bills' ? [
    { key: 'BILL_MONTH', label: t('month') },
    { key: 'CATEGORY_NAME', label: t('billCategory') },
    { key: 'AMOUNT', label: t('amount'), render: (r: any) => fmtMoney(r.AMOUNT) },
    { key: 'PAYMENT_STATUS', label: t('paymentStatus'), render: (r: any) => <Badge color={r.PAYMENT_STATUS === 'PAID' ? 'green' : 'amber'}>{t(r.PAYMENT_STATUS.toLowerCase())}</Badge> },
  ] : [
    { key: 'CHARGE_DATE', label: t('chargeDate'), render: (r: any) => fmtDate(r.CHARGE_DATE) },
    { key: 'AMOUNT', label: t('amount'), render: (r: any) => fmtMoney(r.AMOUNT) },
    { key: 'CATEGORY', label: t('category') },
    { key: 'DESCRIPTION', label: t('description') },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : 'red'}>{r.STATUS}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title flex-1">{t('myExpenses')}</h1>
        <Select value={month} onChange={e => setMonth(e.target.value)} className="!w-36">
          {monthOptions(12).map(m => <option key={m} value={m}>{m}</option>)}
        </Select>
      </div>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['deposits', 'bills', 'charges'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500'}`}>
            {t(k === 'deposits' ? 'deposits' : k === 'bills' ? 'monthlyBills' : 'expenses')}
          </button>
        ))}
      </div>
      <Card>
        {loading ? <Spinner /> : <DataTable columns={cols} rows={rows} />}
      </Card>
    </div>
  );
}
