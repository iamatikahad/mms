import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, DataTable, Pagination, Badge } from '../../components/ui';
import { api, fmtDate } from '../../api';

const ACTIONS = ['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'REVERSE', 'OVERRIDE', 'CLOSE', 'REOPEN'];
const TYPES = ['MEMBER', 'MEAL_REQUEST', 'MEAL_ENTRY', 'GUEST_MEAL', 'BAZAR_EXPENSE', 'MONTHLY_BILL', 'BILL_ALLOCATION', 'DEPOSIT', 'PAYMENT', 'OTHER_CHARGE', 'MONTHLY_CLOSING', 'NOTIFICATION', 'ADMIN_USER', 'SETTING', 'PROFILE', 'USER'];

export default function AuditLogs() {
  const { t } = useTranslation();
  const [q, setQ] = useState({ page: 1, action: '', recordType: '', search: '' });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const r = await api.get('/audit', { params: { ...q, pageSize: 30 } });
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, [q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title flex-1">{t('auditLogs')}</h1>
        <Select value={q.action} onChange={e => setQ({ ...q, action: e.target.value, page: 1 })} className="!w-40">
          <option value="">{t('action')}</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select value={q.recordType} onChange={e => setQ({ ...q, recordType: e.target.value, page: 1 })} className="!w-44">
          <option value="">{t('type')}</option>
          {TYPES.map(a => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Input placeholder={t('search')} value={q.search} onChange={e => setQ({ ...q, search: e.target.value, page: 1 })} className="!w-44" />
      </div>
      <Card>
        {loading ? <Spinner /> : <>
          <DataTable columns={[
            { key: 'CREATED_AT', label: t('timestamp'), render: (r: any) => fmtDate(r.CREATED_AT) },
            { key: 'USERNAME', label: t('username') },
            { key: 'ROLE_NAME', label: t('role') },
            { key: 'ACTION', label: t('action'), render: (r: any) => <Badge color={r.ACTION === 'DELETE' || r.ACTION === 'REVERSE' ? 'red' : r.ACTION === 'OVERRIDE' || r.ACTION === 'REOPEN' ? 'amber' : 'blue'}>{r.ACTION}</Badge> },
            { key: 'RECORD_TYPE', label: t('type') },
            { key: 'RECORD_ID', label: t('id') },
            { key: 'REASON', label: t('reason') },
            { key: 'actions', label: '', render: (r: any) => (r.PREVIOUS_VALUE || r.NEW_VALUE) && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setDetail(r)}>{t('view' as any) || 'View'}</button> },
          ]} rows={data?.rows || []} />
          <Pagination page={q.page} pageSize={30} total={data?.total || 0} onPage={p => setQ({ ...q, page: p })} />
        </>}
      </Card>

      {detail && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="card w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold">{detail.ACTION} · {detail.RECORD_TYPE} · {detail.RECORD_ID}</div>
            <div className="p-4 space-y-3 text-sm">
              <div><b>Previous:</b><pre className="mt-1 p-2 bg-slate-50 dark:bg-slate-900 rounded text-xs overflow-x-auto">{detail.PREVIOUS_VALUE || '—'}</pre></div>
              <div><b>New:</b><pre className="mt-1 p-2 bg-slate-50 dark:bg-slate-900 rounded text-xs overflow-x-auto">{detail.NEW_VALUE || '—'}</pre></div>
              {detail.REASON && <div><b>Reason:</b> {detail.REASON}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
