import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, Field, Modal, DataTable, Pagination, Badge, SearchBox } from '../../components/ui';
import { api, fmtDate, fmtTime, downloadCSV } from '../../api';
import { useApp } from '../../store';

export default function Meals() {
  const { t } = useTranslation();
  const { toast, confirm } = useApp();
  const [q, setQ] = useState({ date: '', month: '', memberId: '', page: 1 });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [mealTimes, setMealTimes] = useState<{ lunch?: string; dinner?: string }>({});

  React.useEffect(() => {
    Promise.all([
      api.get('/settings/meal.lunch_time'), api.get('/settings/meal.dinner_time'),
    ]).then(([l, d]) => setMealTimes({
      lunch: l.data?.setting?.SETTING_VALUE, dinner: d.data?.setting?.SETTING_VALUE,
    })).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    const params: any = {};
    if (q.date) params.date = q.date; else if (q.month) params.month = q.month;
    if (q.memberId) params.memberId = q.memberId;
    const r = await api.get('/meals/entries', { params });
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, [q]);
  React.useEffect(() => {
    api.get('/members', { params: { pageSize: 100 } }).then(r => setMembers(r.data.rows)).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/meals/entries', { memberId: Number(form.memberId), date: form.date, mealType: form.mealType, regularQty: Number(form.regularQty || 0) });
      toast('success', t('created')); setModal(false); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const cols = [
    { key: 'MEAL_DATE', label: t('date'), render: (r: any) => fmtDate(r.MEAL_DATE) },
    { key: 'MEAL_TYPE', label: t('type'), render: (r: any) => <Badge color={r.MEAL_TYPE === 'LUNCH' ? 'amber' : 'blue'}>{t(r.MEAL_TYPE.toLowerCase())}</Badge> },
    { key: 'FULL_NAME', label: t('fullName'), render: (r: any) => `${r.FULL_NAME} (${r.MEMBER_CODE})` },
    { key: 'REGULAR_QTY', label: t('regularQty') },
    { key: 'SOURCE', label: 'Source' },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : 'red'}>{r.STATUS}</Badge> },
    { key: 'actions', label: t('actions'), render: (r: any) => (
      <div className="flex gap-1">
        {r.STATUS === 'ACTIVE' && <button className="btn-ghost !px-2 !py-1 text-xs text-red-600" onClick={async () => {
          if (await confirm(t('confirmDelete'))) { await api.put(`/meals/entries/${r.MEAL_ENTRY_ID}`, { status: 'CANCELLED' }); load(); }
        }}>{t('cancel')}</button>}
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="page-title">{t('mealManagement')}</h1>
          {(mealTimes.lunch || mealTimes.dinner) && (
            <div className="text-xs text-slate-500 mt-0.5">
              🍽️ {t('lunch')}: {fmtTime(mealTimes.lunch || '')} · {t('dinner')}: {fmtTime(mealTimes.dinner || '')}
            </div>
          )}
        </div>
        <Input type="date" value={q.date} onChange={e => setQ({ ...q, date: e.target.value, month: '' })} className="!w-40" />
        <Input type="month" value={q.month} onChange={e => setQ({ ...q, month: e.target.value, date: '' })} className="!w-40" />
        <Select value={q.memberId} onChange={e => setQ({ ...q, memberId: e.target.value })} className="!w-44">
          <option value="">{t('members')}</option>
          {members.map(m => <option key={m.MEMBER_ID} value={m.MEMBER_ID}>{m.FULL_NAME}</option>)}
        </Select>
        <button className="btn-secondary" onClick={() => downloadCSV('meals', data?.rows || [])}>{t('export')}</button>
        <button className="btn-primary" onClick={() => { setForm({ mealType: 'LUNCH', regularQty: 1 }); setModal(true); }}>+ {t('add')}</button>
      </div>
      <Card>
        {loading ? <Spinner /> : <DataTable columns={cols} rows={data?.rows || []} />}
      </Card>
      <Modal open={modal} onClose={() => setModal(false)} title={t('mealEntries')}>
        <div className="space-y-3">
          <Field label={t('members')} required><Select value={form.memberId || ''} onChange={e => setForm({ ...form, memberId: e.target.value })}>
            <option value="">—</option>{members.map(m => <option key={m.MEMBER_ID} value={m.MEMBER_ID}>{m.FULL_NAME}</option>)}
          </Select></Field>
          <Field label={t('date')} required><Input type="date" value={form.date || ''} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('type')} required><Select value={form.mealType} onChange={e => setForm({ ...form, mealType: e.target.value })}>
              <option value="LUNCH">{t('lunch')}</option><option value="DINNER">{t('dinner')}</option>
            </Select></Field>
            <Field label={t('regularQty')}><Input type="number" min={0} max={10} value={form.regularQty} onChange={e => setForm({ ...form, regularQty: e.target.value })} /></Field>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setModal(false)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  );
}
