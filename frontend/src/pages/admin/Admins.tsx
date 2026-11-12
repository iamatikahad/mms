import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Select, Input, Field, Modal, DataTable, Badge } from '../../components/ui';
import { api, fmtDate } from '../../api';
import { useApp } from '../../store';

export default function Admins() {
  const { t } = useTranslation();
  const { toast, confirm } = useApp();
  const [admins, setAdmins] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [activity, setActivity] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [a, p] = await Promise.all([api.get('/admins'), api.get('/admins/permissions')]);
    setAdmins(a.data.rows); setCatalog(p.data.rows); setLoading(false);
  };
  React.useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    const payload: any = {
      fullName: form.FULL_NAME || form.fullName,
      email: form.EMAIL || form.email,
      phone: form.PHONE || form.phone,
      role: form.ROLE || form.role || 'ADMIN',
      status: form.STATUS || form.status || 'ACTIVE',
      designation: form.DESIGNATION || form.designation,
    };
    if (form.password) payload.password = form.password;
    try {
      if (modal === 'create') {
        await api.post('/admins', { ...payload, username: form.USERNAME || form.username });
      } else {
        await api.put(`/admins/${modal.USER_ID}`, payload);
      }
      toast('success', t('saved')); setModal(null); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const togglePerm = async (u: any, permKey: string, grant: boolean) => {
    await api.put(`/admins/${u.USER_ID}/permissions`, { permissionKey: permKey, isGrant: grant });
    load();
  };

  const viewActivity = async (u: any) => {
    const r = await api.get(`/admins/${u.USER_ID}/activity`);
    setActivity(r.data.rows);
  };

  const overridesOf = (u: any) => new Map((u.overrides || []).map((o: any) => [o.PERMISSION_KEY, Number(o.IS_GRANT)]));

  const cols = [
    { key: 'USERNAME', label: t('username') },
    { key: 'FULL_NAME', label: t('fullName') },
    { key: 'EMAIL', label: t('email') },
    { key: 'ROLE_NAME', label: t('role'), render: (r: any) => <Badge color={r.ROLE_NAME === 'SUPER_ADMIN' ? 'purple' : 'blue'}>{r.ROLE_NAME}</Badge> },
    { key: 'STATUS', label: t('status'), render: (r: any) => <Badge color={r.STATUS === 'ACTIVE' ? 'green' : 'red'}>{r.STATUS}</Badge> },
    { key: 'LAST_LOGIN_AT', label: t('lastLogin') },
    { key: 'actions', label: t('actions'), render: (r: any) => (
      <div className="flex gap-1">
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setForm({ ...r }); setModal(r); }}>{t('edit')}</button>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => viewActivity(r)}>Activity</button>
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{t('adminManagement')}</h1>
        <button className="btn-primary" onClick={() => { setForm({ role: 'ADMIN', status: 'ACTIVE' }); setModal('create'); }}>+ {t('add')}</button>
      </div>
      <Card>
        {loading ? <Spinner /> : <DataTable columns={cols} rows={admins} />}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('adminManagement') : t('edit')} wide>
        <div className="grid md:grid-cols-2 gap-3">
          {modal === 'create' && <Field label={t('username')} required><Input value={form.USERNAME || form.username || ''} onChange={e => setForm({ ...form, USERNAME: e.target.value, username: e.target.value })} /></Field>}
          <Field label={t('fullName')}><Input value={form.FULL_NAME || form.fullName || ''} onChange={e => setForm({ ...form, FULL_NAME: e.target.value, fullName: e.target.value })} /></Field>
          <Field label={t('email')}><Input value={form.EMAIL || form.email || ''} onChange={e => setForm({ ...form, EMAIL: e.target.value, email: e.target.value })} /></Field>
          <Field label={t('phone')}><Input value={form.PHONE || form.phone || ''} onChange={e => setForm({ ...form, PHONE: e.target.value, phone: e.target.value })} /></Field>
          <Field label={t('password')}><Input type="password" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={modal !== 'create' ? 'Leave blank to keep' : ''} /></Field>
          <Field label={t('role')} required><Select value={form.ROLE_NAME || form.ROLE || form.role || 'ADMIN'} onChange={e => setForm({ ...form, ROLE: e.target.value, role: e.target.value })}>
            <option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super Admin</option>
          </Select></Field>
          <Field label={t('status')}><Select value={form.STATUS || form.status || 'ACTIVE'} onChange={e => setForm({ ...form, STATUS: e.target.value, status: e.target.value })}>
            <option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option>
          </Select></Field>
          <Field label="Designation"><Input value={form.DESIGNATION || form.designation || ''} onChange={e => setForm({ ...form, DESIGNATION: e.target.value, designation: e.target.value })} /></Field>
        </div>
        {modal !== 'create' && (
          <div className="mt-4">
            <div className="font-medium text-sm mb-2">Permission Overrides</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1 max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-2">
              {catalog.map(p => {
                const ov = overridesOf(modal).get(p.PERMISSION_KEY);
                return (
                  <label key={p.PERMISSION_KEY} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={ov === 1} onChange={e => togglePerm(modal, p.PERMISSION_KEY, e.target.checked)} />
                    {p.PERMISSION_NAME || p.PERMISSION_KEY}
                    {ov !== undefined && <span className="text-xs text-slate-400">({ov ? 'grant' : 'deny'})</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setModal(null)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
        </div>
      </Modal>

      <Modal open={!!activity.length} onClose={() => setActivity([])} title="Activity" wide>
        <DataTable columns={[
          { key: 'ACTION', label: 'Action' },
          { key: 'RECORD_TYPE', label: 'Type' },
          { key: 'RECORD_ID', label: 'ID' },
          { key: 'CREATED_AT', label: 'Time', render: (r: any) => fmtDate(r.CREATED_AT) },
        ]} rows={activity} />
      </Modal>
    </div>
  );
}
