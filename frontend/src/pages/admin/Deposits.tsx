import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, Field, Modal, DataTable, Pagination, Badge, SearchBox } from '../../components/ui';
import { api, fmtDate, fmtMoney, downloadCSV } from '../../api';
import { useApp } from '../../store';

const METHODS = ['CASH', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'OTHER'];

export default function Deposits() {
  const { t } = useTranslation();
  const { toast, confirm } = useApp();
  const [q, setQ] = useState({ memberId: '', from: '', to: '', method: '', status: '', search: '', page: 1 });
  const [data, setData] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any>(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await api.get('/deposits', { params: { ...q, page: q.page, pageSize: 20 } });
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, [q]);
  React.useEffect(() => {
    api.get('/members', { params: { pageSize: 100 } }).then(r => setMembers(r.data.rows)).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    const payload = { memberId: Number(form.memberId || form.MEMBER_ID), depositDate: form.depositDate || String(form.DEPOSIT_DATE).slice(0, 10), amount: Number(form.amount ?? form.AMOUNT), paymentMethod: form.paymentMethod || form.PAYMENT_METHOD, transactionRef: form.transactionRef ?? form.TRANSACTION_REF, description: form.description ?? form.DESCRIPTION };
    try {
      if (edit) await api.put(`/deposits/${edit.DEPOSIT_ID}`, payload);
      else await api.post('/deposits', payload);
      toast('success', t('saved')); setModal(false); setEdit(null); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const reverse = async (r: any) => {
    const reason = window.prompt(t('reason'));
    if (reason === null) return;
    try { await api.post(`/deposits/${r.DEPOSIT_ID}/reverse`, { reason }); toast('success', t('reversed')); load(); }
    catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
  };

  const cols = [
    { key: 'DEPOSIT_DATE', label: t('depositDate'), render: (r: any) => fmtDate(r.DEPOSIT_DATE) },
    { key: 'FULL_NAME', label: t('fullName'), render: (r: any) => `${r.FULL_NAME} (${r.MEMBER_CODE})` },
    { key: 'AMOUNT', label: t('amount'), render: (r: any) => <b className={Number(r.AMOUNT) < 0 ? 'text-red-600' : ''}>{fmtMoney(r.AMOUNT)}</b> },
    { key: 'PAYMENT_METHOD', label: t('paymentMethod') },
    { key: 'TRANSACTION_REF', label: t('transactionRef') },
    { key: 'RECORDED_BY', label: t('user') },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : r.STATUS === 'REVERSAL' ? 'red' : 'amber'}>{r.STATUS}</Badge> },
    { key: 'actions', label: t('actions'), render: (r: any) => r.STATUS === 'ACTIVE' && Number(r.AMOUNT) > 0 && (
      <div className="flex gap-1">
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setEdit(r); setForm({ ...r }); setModal(true); }}>{t('edit')}</button>
        <button className="btn-ghost !px-2 !py-1 text-xs text-red-600" onClick={() => reverse(r)}>{t('reverse')}</button>
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title flex-1">{t('deposits')}</h1>
        <Select value={q.memberId} onChange={e => setQ({ ...q, memberId: e.target.value, page: 1 })} className="!w-44">
          <option value="">{t('members')}</option>
          {members.map(m => <option key={m.MEMBER_ID} value={m.MEMBER_ID}>{m.FULL_NAME}</option>)}
        </Select>
        <Input type="date" value={q.from} onChange={e => setQ({ ...q, from: e.target.value, page: 1 })} className="!w-36" />
        <Input type="date" value={q.to} onChange={e => setQ({ ...q, to: e.target.value, page: 1 })} className="!w-36" />
        <Select value={q.method} onChange={e => setQ({ ...q, method: e.target.value, page: 1 })} className="!w-36">
          <option value="">{t('paymentMethod')}</option>
          {METHODS.map(m => <option key={m} value={m}>{t(m.toLowerCase())}</option>)}
        </Select>
        <SearchBox value={q.search} onChange={v => setQ({ ...q, search: v, page: 1 })} />
        <button className="btn-secondary" onClick={() => downloadCSV('deposits', data?.rows || [])}>{t('export')}</button>
        <button className="btn-primary" onClick={() => { setEdit(null); setForm({ depositDate: new Date().toISOString().slice(0, 10), paymentMethod: 'CASH' }); setModal(true); }}>+ {t('addDeposit')}</button>
      </div>
      <Card>
        {loading ? <Spinner /> : <>
          <DataTable columns={cols} rows={data?.rows || []} />
          <Pagination page={q.page} pageSize={20} total={data?.total || 0} onPage={p => setQ({ ...q, page: p })} />
        </>}
      </Card>
      <Modal open={modal} onClose={() => setModal(null)} title={edit ? t('edit') : t('addDeposit')}>
        <div className="space-y-3">
          <Field label={t('members')} required><Select value={form.memberId || form.MEMBER_ID || ''} onChange={e => setForm({ ...form, memberId: e.target.value, MEMBER_ID: e.target.value })} disabled={!!edit}>
            <option value="">—</option>{members.map(m => <option key={m.MEMBER_ID} value={m.MEMBER_ID}>{m.FULL_NAME}</option>)}
          </Select></Field>
          <Field label={t('depositDate')} required><Input type="date" value={form.depositDate || String(form.DEPOSIT_DATE || '').slice(0, 10)} onChange={e => setForm({ ...form, depositDate: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('amount')} required><Input type="number" step="0.01" value={form.amount ?? form.AMOUNT ?? ''} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label={t('paymentMethod')} required><Select value={form.paymentMethod || form.PAYMENT_METHOD || 'CASH'} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
              {METHODS.map(m => <option key={m} value={m}>{t(m.toLowerCase())}</option>)}
            </Select></Field>
          </div>
          <Field label={t('transactionRef')}><Input value={form.transactionRef ?? form.TRANSACTION_REF ?? ''} onChange={e => setForm({ ...form, transactionRef: e.target.value })} /></Field>
          <Field label={t('description')}><Input value={form.description ?? form.DESCRIPTION ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  );
}
