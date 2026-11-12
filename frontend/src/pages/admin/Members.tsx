import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Stat, Spinner, Select, Input, Field, Modal, DataTable, Pagination, Badge, SearchBox } from '../../components/ui';
import { api, fmtMoney, fmtDate, downloadCSV, currentMonth, monthOptions } from '../../api';
import { useApp } from '../../store';

export default function Members() {
  const { t } = useTranslation();
  const { toast, confirm } = useApp();
  const [q, setQ] = useState({ search: '', status: '', page: 1 });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any>(null); // null | {} create | member edit
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await api.get('/members', { params: { search: q.search, status: q.status, page: q.page, pageSize: 20 } });
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, [q]);

  const openCreate = () => { setForm({ status: 'ACTIVE' }); setModal('create'); };
  const openEdit = (m: any) => { setForm({ ...m }); setModal(m); };

  const save = async () => {
    setBusy(true);
    const payload: any = {
      fullName: form.FULL_NAME || form.fullName,
      memberCode: form.MEMBER_CODE,
      username: form.USERNAME || form.username,
      phone: form.PHONE || form.phone,
      email: form.EMAIL || form.email,
      joiningDate: form.JOINING_DATE,
      leavingDate: form.LEAVING_DATE,
      emergencyContact: form.EMERGENCY_CONTACT,
      status: form.STATUS,
    };
    if (form.password) payload.password = form.password;
    try {
      if (modal === 'create') {
        await api.post('/members', payload);
        toast('success', t('created'));
      } else {
        await api.put(`/members/${modal.MEMBER_ID}`, payload);
        toast('success', t('updated'));
      }
      setModal(null); load();
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'ERROR');
    } finally { setBusy(false); }
  };

  const setStatus = async (m: any, status: string) => {
    if (!(await confirm(`${t('confirm')} ${status}?`))) return;
    await api.post(`/members/${m.MEMBER_ID}/status`, { status });
    toast('success', t('updated')); load();
  };

  const cols = [
    { key: 'MEMBER_CODE', label: t('memberCode') },
    { key: 'FULL_NAME', label: t('fullName'), render: (r: any) => <div>{r.FULL_NAME}<div className="text-xs text-slate-400">{r.USERNAME}</div></div> },
    { key: 'PHONE', label: t('phone') },
    { key: 'JOINING_DATE', label: t('joiningDate'), render: (r: any) => fmtDate(r.JOINING_DATE) },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : r.STATUS === 'LEFT' ? 'red' : 'amber'}>{t(r.STATUS.toLowerCase())}</Badge> },
    { key: 'actions', label: t('actions'), render: (r: any) => (
      <div className="flex gap-1">
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => openEdit(r)}>{t('edit')}</button>
        {r.STATUS === 'ACTIVE'
          ? <button className="btn-ghost !px-2 !py-1 text-xs text-amber-600" onClick={() => setStatus(r, 'INACTIVE')}>{t('deactivate')}</button>
          : <button className="btn-ghost !px-2 !py-1 text-xs text-emerald-600" onClick={() => setStatus(r, 'ACTIVE')}>{t('activate')}</button>}
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title flex-1">{t('memberManagement')}</h1>
        <SearchBox value={q.search} onChange={v => setQ({ ...q, search: v, page: 1 })} />
        <Select value={q.status} onChange={e => setQ({ ...q, status: e.target.value, page: 1 })} className="!w-36">
          <option value="">{t('status')}</option>
          <option value="ACTIVE">{t('active')}</option>
          <option value="INACTIVE">{t('inactive')}</option>
          <option value="LEFT">{t('left')}</option>
        </Select>
        <button className="btn-secondary" onClick={() => downloadCSV('members', data?.rows || [])}>{t('export')}</button>
        <button className="btn-primary" onClick={openCreate}>+ {t('addMember')}</button>
      </div>

      <Card>
        {loading ? <Spinner /> : <>
          <DataTable columns={cols} rows={data?.rows || []} />
          <Pagination page={q.page} pageSize={20} total={data?.total || 0} onPage={p => setQ({ ...q, page: p })} />
        </>}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('addMember') : t('editMember')} wide>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label={t('fullName')} required><Input value={form.FULL_NAME || form.fullName || ''} onChange={e => setForm({ ...form, FULL_NAME: e.target.value, fullName: e.target.value })} /></Field>
          <Field label={t('memberCode')}><Input value={form.MEMBER_CODE || ''} onChange={e => setForm({ ...form, MEMBER_CODE: e.target.value })} /></Field>
          <Field label={t('username')} required><Input value={form.USERNAME || form.username || ''} onChange={e => setForm({ ...form, USERNAME: e.target.value, username: e.target.value })} disabled={modal !== 'create'} /></Field>
          {modal === 'create' && <Field label={t('password')} required><Input type="password" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>}
          {modal !== 'create' && <Field label={t('password')}><Input type="password" placeholder="••••••••" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>}
          <Field label={t('phone')}><Input value={form.PHONE || form.phone || ''} onChange={e => setForm({ ...form, PHONE: e.target.value, phone: e.target.value })} /></Field>
          <Field label={t('email')}><Input value={form.EMAIL || form.email || ''} onChange={e => setForm({ ...form, EMAIL: e.target.value, email: e.target.value })} /></Field>
          <Field label={t('joiningDate')}><Input type="date" value={form.JOINING_DATE ? String(form.JOINING_DATE).slice(0, 10) : ''} onChange={e => setForm({ ...form, JOINING_DATE: e.target.value })} /></Field>
          <Field label={t('leavingDate')}><Input type="date" value={form.LEAVING_DATE ? String(form.LEAVING_DATE).slice(0, 10) : ''} onChange={e => setForm({ ...form, LEAVING_DATE: e.target.value })} /></Field>
          <Field label={t('emergencyContact')}><Input value={form.EMERGENCY_CONTACT || ''} onChange={e => setForm({ ...form, EMERGENCY_CONTACT: e.target.value })} /></Field>
          <Field label={t('status')}><Select value={form.STATUS || 'ACTIVE'} onChange={e => setForm({ ...form, STATUS: e.target.value })}>
            <option value="ACTIVE">{t('active')}</option><option value="INACTIVE">{t('inactive')}</option><option value="LEFT">{t('left')}</option>
          </Select></Field>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  );
}
