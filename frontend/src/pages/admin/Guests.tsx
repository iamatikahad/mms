import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, Field, Modal, DataTable, Badge, SearchBox } from '../../components/ui';
import { api, fmtDate, downloadCSV } from '../../api';
import { useApp } from '../../store';

export default function Guests() {
  const { t } = useTranslation();
  const { toast, confirm } = useApp();
  const [q, setQ] = useState({ date: '', month: '', memberId: '', status: '' });
  const [data, setData] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const params: any = {};
    if (q.date) params.date = q.date; else if (q.month) params.month = q.month;
    if (q.memberId) params.memberId = q.memberId;
    if (q.status) params.status = q.status;
    const r = await api.get('/guests', { params });
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, [q]);
  React.useEffect(() => {
    api.get('/members', { params: { pageSize: 100 } }).then(r => setMembers(r.data.rows)).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/guests/admin', { memberId: Number(form.memberId), date: form.date, mealType: form.mealType, qty: Number(form.qty), notes: form.notes });
      toast('success', t('created')); setModal(false); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const cols = [
    { key: 'MEAL_DATE', label: t('date'), render: (r: any) => fmtDate(r.MEAL_DATE) },
    { key: 'MEAL_TYPE', label: t('type'), render: (r: any) => <Badge color={r.MEAL_TYPE === 'LUNCH' ? 'amber' : 'blue'}>{t(r.MEAL_TYPE.toLowerCase())}</Badge> },
    { key: 'FULL_NAME', label: t('hostMember') },
    { key: 'GUEST_QTY', label: t('guestQty') },
    { key: 'NOTES', label: t('notes') },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : 'red'}>{r.STATUS}</Badge> },
    { key: 'actions', label: t('actions'), render: (r: any) => r.STATUS === 'ACTIVE' && (
      <button className="btn-ghost !px-2 !py-1 text-xs text-red-600" onClick={async () => {
        if (await confirm(t('confirmDelete'))) { await api.delete(`/guests/${r.GUEST_MEAL_ID}`); load(); }
      }}>{t('delete')}</button>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title flex-1">{t('guestMeals')}</h1>
        <Input type="date" value={q.date} onChange={e => setQ({ ...q, date: e.target.value, month: '' })} className="!w-40" />
        <Input type="month" value={q.month} onChange={e => setQ({ ...q, month: e.target.value, date: '' })} className="!w-40" />
        <Select value={q.memberId} onChange={e => setQ({ ...q, memberId: e.target.value })} className="!w-44">
          <option value="">{t('hostMember')}</option>
          {members.map(m => <option key={m.MEMBER_ID} value={m.MEMBER_ID}>{m.FULL_NAME}</option>)}
        </Select>
        <button className="btn-secondary" onClick={() => downloadCSV('guest-meals', data?.rows || [])}>{t('export')}</button>
        <button className="btn-primary" onClick={() => { setForm({ mealType: 'LUNCH', qty: 1, date: new Date().toISOString().slice(0, 10) }); setModal(true); }}>+ {t('addGuestMeal')}</button>
      </div>
      <Card>
        {loading ? <Spinner /> : <DataTable columns={cols} rows={data?.rows || []} />}
      </Card>
      <Modal open={modal} onClose={() => setModal(false)} title={t('addGuestMeal')}>
        <div className="space-y-3">
          <Field label={t('hostMember')} required><Select value={form.memberId || ''} onChange={e => setForm({ ...form, memberId: e.target.value })}>
            <option value="">—</option>{members.map(m => <option key={m.MEMBER_ID} value={m.MEMBER_ID}>{m.FULL_NAME}</option>)}
          </Select></Field>
          <Field label={t('date')} required><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('type')} required><Select value={form.mealType} onChange={e => setForm({ ...form, mealType: e.target.value })}>
              <option value="LUNCH">{t('lunch')}</option><option value="DINNER">{t('dinner')}</option>
            </Select></Field>
            <Field label={t('guestQty')} required><Input type="number" min={1} max={20} value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></Field>
          </div>
          <Field label={t('notes')}><Input value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setModal(false)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  );
}
