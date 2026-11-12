import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, Field, Modal, DataTable, Badge, SearchBox } from '../../components/ui';
import { api, fmtDate, downloadCSV } from '../../api';
import { useApp } from '../../store';

export default function MealRequests() {
  const { t } = useTranslation();
  const { toast, confirm } = useApp();
  const [q, setQ] = useState({ date: '', month: '', status: '' });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const params: any = {};
    if (q.date) params.date = q.date; else if (q.month) params.month = q.month;
    if (q.status) params.status = q.status;
    const r = await api.get('/meals/requests', { params });
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, [q]);

  const openEdit = (r: any) => { setEdit(r); setForm({ regularQty: r.REGULAR_QTY, reason: '' }); };

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/meals/requests/${edit.REQUEST_ID}`, { regularQty: Number(form.regularQty), reason: form.reason || undefined });
      toast('success', t('updated')); setEdit(null); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const cols = [
    { key: 'MEAL_DATE', label: t('date'), render: (r: any) => fmtDate(r.MEAL_DATE) },
    { key: 'MEAL_TYPE', label: t('type'), render: (r: any) => <Badge color={r.MEAL_TYPE === 'LUNCH' ? 'amber' : 'blue'}>{t(r.MEAL_TYPE.toLowerCase())}</Badge> },
    { key: 'FULL_NAME', label: t('fullName'), render: (r: any) => `${r.FULL_NAME} (${r.MEMBER_CODE})` },
    { key: 'REGULAR_QTY', label: t('regularQty') },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'SUBMITTED' ? 'green' : r.STATUS === 'CANCELLED' ? 'red' : 'amber'}>{r.STATUS}</Badge> },
    { key: 'REVISION_NO', label: 'Rev' },
    { key: 'actions', label: t('actions'), render: (r: any) => (
      <div className="flex gap-1">
        {r.STATUS !== 'CANCELLED' && r.STATUS !== 'DELETED' && (
          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => openEdit(r)}>{t('edit')}</button>
        )}
        {r.STATUS !== 'DELETED' && (
          <button className="btn-ghost !px-2 !py-1 text-xs text-red-600" onClick={async () => {
            if (await confirm(t('confirmDeleteRequest'))) {
              try { await api.delete(`/meals/requests/${r.REQUEST_ID}`); toast('success', t('requestDeleted')); load(); }
              catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
            }
          }}>{t('delete')}</button>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title flex-1">{t('mealRequestsTitle')}</h1>
        <Input type="date" value={q.date} onChange={e => setQ({ ...q, date: e.target.value, month: '' })} className="!w-40" />
        <Input type="month" value={q.month} onChange={e => setQ({ ...q, month: e.target.value, date: '' })} className="!w-40" />
        <Select value={q.status} onChange={e => setQ({ ...q, status: e.target.value })} className="!w-36">
          <option value="">{t('status')}</option>
          <option value="SUBMITTED">SUBMITTED</option>
          <option value="LOCKED">LOCKED</option>
          <option value="OVERRIDDEN">OVERRIDDEN</option>
          <option value="CANCELLED">CANCELLED</option>
        </Select>
        <button className="btn-secondary" onClick={() => downloadCSV('meal-requests', data?.rows || [])}>{t('export')}</button>
      </div>
      <Card>
        {loading ? <Spinner /> : <DataTable columns={cols} rows={data?.rows || []} />}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`${t('edit')} — ${edit?.FULL_NAME} · ${fmtDate(edit?.MEAL_DATE)} · ${edit?.MEAL_TYPE}`}>
        <div className="space-y-3">
          <Field label={t('regularQty')}><Input type="number" min={0} max={10} value={form.regularQty} onChange={e => setForm({ ...form, regularQty: e.target.value })} /></Field>
          <Field label={t('reason')}><Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Required if locked" /></Field>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setEdit(null)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  );
}
