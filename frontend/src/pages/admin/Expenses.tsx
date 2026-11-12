import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, Field, Modal, DataTable, Pagination, Badge } from '../../components/ui';
import { api, fmtDate, fmtMoney, downloadCSV } from '../../api';
import { useApp } from '../../store';

export default function Expenses() {
  const { t } = useTranslation();
  const { toast } = useApp();
  const [q, setQ] = useState({ memberId: '', from: '', to: '', category: '', page: 1 });
  const [data, setData] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await api.get('/charges', { params: { ...q, page: q.page, pageSize: 20 } });
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, [q]);
  React.useEffect(() => {
    api.get('/members', { params: { pageSize: 100 } }).then(r => setMembers(r.data.rows)).catch(() => {});
    api.get('/charges', { params: { pageSize: 200 } }).then(r => {
      const set = new Set<string>((r.data.rows || []).map((x: any) => x.CATEGORY).filter(Boolean));
      setCats([...set] as string[]);
    }).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    const payload = { memberId: Number(form.memberId || form.MEMBER_ID), chargeDate: form.chargeDate || String(form.CHARGE_DATE || '').slice(0, 10), amount: Number(form.amount ?? form.AMOUNT), category: form.category ?? form.CATEGORY, description: form.description ?? form.DESCRIPTION, reference: form.reference ?? form.REFERENCE };
    try {
      if (modal === 'create') await api.post('/charges', payload);
      else await api.put(`/charges/${modal.CHARGE_ID}`, payload);
      toast('success', t('saved')); setModal(null); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const reverse = async (r: any) => {
    const reason = window.prompt(t('reason'));
    if (reason === null) return;
    await api.post(`/charges/${r.CHARGE_ID}/reverse`, { reason });
    toast('success', t('reversed')); load();
  };

  const cols = [
    { key: 'CHARGE_DATE', label: t('chargeDate'), render: (r: any) => fmtDate(r.CHARGE_DATE) },
    { key: 'FULL_NAME', label: t('fullName'), render: (r: any) => `${r.FULL_NAME} (${r.MEMBER_CODE})` },
    { key: 'AMOUNT', label: t('amount'), render: (r: any) => <b className={Number(r.AMOUNT) < 0 ? 'text-emerald-600' : ''}>{fmtMoney(r.AMOUNT)}</b> },
    { key: 'CATEGORY', label: t('category') },
    { key: 'DESCRIPTION', label: t('description') },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : 'red'}>{r.STATUS}</Badge> },
    { key: 'actions', label: t('actions'), render: (r: any) => r.STATUS === 'ACTIVE' && (
      <div className="flex gap-1">
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setForm({ ...r }); setModal(r); }}>{t('edit')}</button>
        <button className="btn-ghost !px-2 !py-1 text-xs text-red-600" onClick={() => reverse(r)}>{t('reverse')}</button>
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title flex-1">{t('expenses')}</h1>
        <Select value={q.memberId} onChange={e => setQ({ ...q, memberId: e.target.value, page: 1 })} className="!w-44">
          <option value="">{t('members')}</option>
          {members.map(m => <option key={m.MEMBER_ID} value={m.MEMBER_ID}>{m.FULL_NAME}</option>)}
        </Select>
        <Input type="date" value={q.from} onChange={e => setQ({ ...q, from: e.target.value, page: 1 })} className="!w-36" />
        <Input type="date" value={q.to} onChange={e => setQ({ ...q, to: e.target.value, page: 1 })} className="!w-36" />
        <Select value={q.category} onChange={e => setQ({ ...q, category: e.target.value, page: 1 })} className="!w-40">
          <option value="">{t('category')}</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <button className="btn-secondary" onClick={() => downloadCSV('expenses', data?.rows || [])}>{t('export')}</button>
        <button className="btn-primary" onClick={() => { setForm({ chargeDate: new Date().toISOString().slice(0, 10) }); setModal('create'); }}>+ {t('addCharge')}</button>
      </div>
      <Card>
        {loading ? <Spinner /> : <>
          <DataTable columns={cols} rows={data?.rows || []} />
          <Pagination page={q.page} pageSize={20} total={data?.total || 0} onPage={p => setQ({ ...q, page: p })} />
        </>}
      </Card>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('addCharge') : t('edit')}>
        <div className="space-y-3">
          <Field label={t('members')} required><Select value={form.memberId || form.MEMBER_ID || ''} onChange={e => setForm({ ...form, memberId: e.target.value, MEMBER_ID: e.target.value })} disabled={modal !== 'create'}>
            <option value="">—</option>{members.map(m => <option key={m.MEMBER_ID} value={m.MEMBER_ID}>{m.FULL_NAME}</option>)}
          </Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('chargeDate')} required><Input type="date" value={form.chargeDate || String(form.CHARGE_DATE || '').slice(0, 10)} onChange={e => setForm({ ...form, chargeDate: e.target.value })} /></Field>
            <Field label={t('amount')} required><Input type="number" step="0.01" value={form.amount ?? form.AMOUNT ?? ''} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
          </div>
          <Field label={t('category')}><Input value={form.category ?? form.CATEGORY ?? ''} onChange={e => setForm({ ...form, category: e.target.value })} list="charge-cats" /><datalist id="charge-cats">{cats.map(c => <option key={c} value={c} />)}</datalist></Field>
          <Field label={t('description')}><Input value={form.description ?? form.DESCRIPTION ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label={t('reference')}><Input value={form.reference ?? form.REFERENCE ?? ''} onChange={e => setForm({ ...form, reference: e.target.value })} /></Field>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  );
}
