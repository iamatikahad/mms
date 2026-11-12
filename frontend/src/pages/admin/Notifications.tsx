import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, DataTable, Badge, Modal, Input, Field, Select, Spinner } from '../../components/ui';
import { api, fmtDate } from '../../api';
import { useApp } from '../../store';

export default function Notifications() {
  const { t } = useTranslation();
  const { toast } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({ type: 'INFO', broadcast: 'members' });
  const [members, setMembers] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const r = await api.get('/notifications/my');
    setData(r.data); setLoading(false);
  };
  React.useEffect(() => { load(); }, []);
  React.useEffect(() => {
    api.get('/members', { params: { pageSize: 100 } }).then(r => setMembers(r.data.rows)).catch(() => {});
  }, []);

  const markRead = async (id: number) => { await api.post(`/notifications/my/${id}/read`); load(); };
  const markAll = async () => { await api.post('/notifications/my/read-all'); load(); };

  const send = async () => {
    if (form.broadcast === 'member' && !form.memberId) { toast('error', 'Select a member'); return; }
    try {
      await api.post('/notifications', {
        title: form.title, message: form.message, type: form.type,
        broadcast: form.broadcast !== 'none' ? form.broadcast : undefined,
        memberId: form.broadcast === 'member' ? Number(form.memberId) : undefined,
      });
      toast('success', 'Sent'); setModal(false); setForm({ type: 'INFO', broadcast: 'members' });
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{t('notificationsTitle')}</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={markAll}>{t('markAllRead')}</button>
          <button className="btn-primary" onClick={() => setModal(true)}>+ {t('add')}</button>
        </div>
      </div>
      <Card>
        {loading ? <Spinner /> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.rows?.map((n: any) => (
              <div key={n.NOTIFICATION_ID} className={`py-3 px-2 flex gap-3 ${n.IS_READ ? 'opacity-60' : ''}`}>
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${n.IS_READ ? 'bg-slate-300' : 'bg-brand-500'}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <b className="text-sm">{n.TITLE}</b>
                    <Badge color={n.NOTIF_TYPE === 'WARNING' ? 'amber' : n.NOTIF_TYPE === 'DEPOSIT' ? 'green' : 'blue'}>{n.NOTIF_TYPE}</Badge>
                    <span className="text-xs text-slate-400">{fmtDate(n.CREATED_AT)}</span>
                  </div>
                  {n.MESSAGE && <div className="text-sm text-slate-600 dark:text-slate-300">{n.MESSAGE}</div>}
                </div>
                {!Number(n.IS_READ) && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => markRead(n.NOTIFICATION_ID)}>{t('markAllRead')}</button>}
              </div>
            ))}
            {!data?.rows?.length && <div className="text-center text-slate-400 py-10">{t('noData')}</div>}
          </div>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={t('notificationsTitle')}>
        <div className="space-y-3">
          <Field label="Send to" required>
            <Select value={form.broadcast} onChange={e => setForm({ ...form, broadcast: e.target.value })}>
              <option value="members">All Members</option>
              <option value="all">All Users</option>
              <option value="member">Specific Member</option>
            </Select>
          </Field>
          {form.broadcast === 'member' && (
            <Field label={t('members')} required>
              <Select value={form.memberId || ''} onChange={e => setForm({ ...form, memberId: e.target.value })}>
                <option value="">—</option>{members.map(m => <option key={m.MEMBER_ID} value={m.MEMBER_ID}>{m.FULL_NAME}</option>)}
              </Select>
            </Field>
          )}
          <Field label={t('name')} required><Input value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label={t('description')}><Input value={form.message || ''} onChange={e => setForm({ ...form, message: e.target.value })} /></Field>
          <Field label="Type"><Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {['INFO', 'WARNING', 'DEPOSIT', 'BILL', 'CLOSING', 'MEAL'].map(x => <option key={x}>{x}</option>)}
          </Select></Field>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setModal(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={send}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  );
}
