import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Card, Input, Badge } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useTranslation } from 'react-i18next';

interface Mess { messId: number; messName: string; messCode: string; address?: string; contactNumber?: string; status: string; }
interface AccessRow { ACCESS_ID: number; USER_ID: number; USERNAME: string; FULL_NAME: string; ACCESS_ROLE: string; STATUS: string; }
interface Assignable { USER_ID: number; USERNAME: string; FULL_NAME: string; ROLE_NAME: string; }

export default function Messes() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Mess[]>([]);
  const [users, setUsers] = useState<Assignable[]>([]);
  const [access, setAccess] = useState<Record<number, AccessRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ messName: '', messCode: '', address: '', contactNumber: '' });
  const [saving, setSaving] = useState(false);
  const [grantSel, setGrantSel] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadAccess = async (mid: number) => {
    try {
      const r = await api.get(`/mess/locations/${mid}/access`);
      setAccess(prev => ({ ...prev, [mid]: r.data.rows || [] }));
    } catch { /* ignore */ }
  };

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [m, u] = await Promise.all([
        api.get('/mess/locations'),
        api.get('/mess/assignable-users'),
      ]);
      // API returns uppercase Oracle columns — normalize to camelCase
      const norm = (m.data.rows || []).map((r: any) => ({
        messId: Number(r.MESS_ID ?? r.messId),
        messName: r.MESS_NAME ?? r.messName ?? '',
        messCode: r.MESS_CODE ?? r.messCode ?? '',
        address: r.ADDRESS ?? r.address ?? '',
        contactNumber: r.CONTACT_NUMBER ?? r.contactNumber ?? '',
        status: r.STATUS ?? r.status ?? 'ACTIVE',
      }));
      setRows(norm);
      setUsers(u.data.rows || []);
      await Promise.all(norm.map((x: Mess) => loadAccess(x.messId)));
    } catch (e: any) { setError(e.response?.data?.error || 'LOAD_FAILED'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.messName.trim() || !form.messCode.trim()) return;
    setSaving(true);
    try {
      await api.post('/mess/locations', form);
      setForm({ messName: '', messCode: '', address: '', contactNumber: '' });
      load();
    } catch (e: any) { setError(e.response?.data?.error || 'SAVE_FAILED'); }
    setSaving(false);
  };

  const toggleStatus = async (m: Mess) => {
    try { await api.put(`/mess/locations/${m.messId}`, { status: m.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }); load(); } catch { /* ignore */ }
  };

  const startEdit = (m: Mess) => { setEditing(m.messId); setEditName(m.messName); };

  const saveEdit = async (m: Mess) => {
    const name = editName.trim();
    if (name.length < 2) { setError('NAME_TOO_SHORT'); return; }
    setEditSaving(true); setError('');
    try {
      await api.put(`/mess/locations/${m.messId}`, { messName: name });
      setEditing(null);
      await load();
    } catch (e: any) {
      const code = e.response?.data?.error;
      setError(code === 'NAME_INVALID' ? 'NAME_INVALID' : code || 'SAVE_FAILED');
    }
    setEditSaving(false);
  };

  const grant = async (mid: number) => {
    const uid = Number(grantSel[mid]);
    if (!uid) return;
    try {
      await api.put(`/mess/locations/${mid}/access`, { userId: uid, accessRole: 'MESS_ADMIN', status: 'ACTIVE' });
      setGrantSel(prev => ({ ...prev, [mid]: '' }));
      loadAccess(mid);
    } catch (e: any) { setError(e.response?.data?.error || 'GRANT_FAILED'); }
  };

  const revoke = async (mid: number, uid: number) => {
    try {
      await api.put(`/mess/locations/${mid}/access`, { userId: uid, status: 'REVOKED' });
      loadAccess(mid);
    } catch { /* ignore */ }
  };

  const assignedMessNames = (uid: number) =>
    rows.filter(m => (access[m.messId] || []).some(a => a.USER_ID === uid && a.STATUS === 'ACTIVE')).map(m => m.messName).join(', ') || '—';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{t('messManagement', 'Mess Management')}</h1>
      {error && <div className="text-sm text-red-500">{error}</div>}
      <Card title={t('createMess', 'Create Mess')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder={t('messName', 'Mess name')} value={form.messName} onChange={e => setForm({ ...form, messName: e.target.value })} />
          <Input placeholder={t('messCode', 'Code (e.g. ATTIC712)')} value={form.messCode} onChange={e => setForm({ ...form, messCode: e.target.value })} />
          <Input placeholder={t('address', 'Address')} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          <Input placeholder={t('contactNumber', 'Contact')} value={form.contactNumber} onChange={e => setForm({ ...form, contactNumber: e.target.value })} />
        </div>
        <button className="btn-primary mt-3" onClick={create} disabled={saving}>{saving ? '…' : t('create', 'Create')}</button>
      </Card>

      <Card title={t('allMesses', 'All Messes')}>
        {loading ? <div className="text-sm text-slate-500">{t('loading')}</div> :
         rows.length === 0 ? <div className="text-sm text-slate-500">{t('noData', 'No messes')}</div> :
         <div className="space-y-4">
           {rows.map(m => (
             <div key={m.messId} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
               <div className="flex items-center justify-between flex-wrap gap-2">
                 <div className="flex items-center gap-2 flex-wrap">
                   {editing === m.messId ? (
                     <>
                       <input className="text-sm font-semibold border border-brand-400 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                         value={editName} onChange={e => setEditName(e.target.value)}
                         onKeyDown={e => { if (e.key === 'Enter') saveEdit(m); if (e.key === 'Escape') setEditing(null); }}
                         maxLength={120} autoFocus />
                       <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => saveEdit(m)} disabled={editSaving}>{editSaving ? '…' : t('save', 'Save')}</button>
                       <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(null)} disabled={editSaving}>{t('cancel', 'Cancel')}</button>
                     </>
                   ) : (
                     <>
                       <span className="font-semibold">{m.messName}</span>
                       <button className="btn-ghost !px-1.5 !py-0.5 text-xs" title={t('rename', 'Rename')} onClick={() => startEdit(m)}><Icon name="edit" size={14} /></button>
                     </>
                   )}
                   <span className="text-xs text-slate-500 ml-2">{m.messCode}</span>
                   {m.address && <span className="text-xs text-slate-500 ml-2">{m.address}</span>}
                 </div>
                 <div className="flex items-center gap-2">
                   <Badge color={m.status === 'ACTIVE' ? 'green' : 'gray'}>{m.status}</Badge>
                   <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => toggleStatus(m)}>{m.status === 'ACTIVE' ? t('deactivate') : t('activate')}</button>
                 </div>
               </div>
               <div className="mt-2">
                 <div className="text-xs font-semibold text-slate-500 mb-1">{t('assignedAdmins', 'Assigned Admins')}</div>
                 <div className="flex flex-wrap gap-1 mb-2">
                   {(access[m.messId] || []).filter(a => a.STATUS === 'ACTIVE').map(a => (
                     <span key={a.USER_ID} className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 rounded px-2 py-0.5">
                       {a.FULL_NAME || a.USERNAME}
                       <button className="text-red-500" onClick={() => revoke(m.messId, a.USER_ID)}><Icon name="close" size={14} /></button>
                     </span>
                   ))}
                   {(access[m.messId] || []).filter(a => a.STATUS === 'ACTIVE').length === 0 &&
                     <span className="text-xs text-slate-400">{t('none', 'None')}</span>}
                 </div>
                 <div className="flex gap-2">
                   <select className="text-sm border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800"
                     value={grantSel[m.messId] || ''}
                     onChange={e => setGrantSel(prev => ({ ...prev, [m.messId]: e.target.value }))}>
                     <option value="">{t('selectAdmin', 'Select admin…')}</option>
                     {users.filter(u => !(access[m.messId] || []).some(a => a.USER_ID === u.USER_ID && a.STATUS === 'ACTIVE')).map(u => (
                       <option key={u.USER_ID} value={u.USER_ID}>{u.FULL_NAME || u.USERNAME} ({u.ROLE_NAME})</option>
                     ))}
                   </select>
                   <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => grant(m.messId)} disabled={!grantSel[m.messId]}>{t('assign', 'Assign')}</button>
                 </div>
               </div>
             </div>
           ))}
         </div>}
      </Card>

      <Card title={t('adminMessAssignments', 'Admin Mess Assignments')}>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th>{t('admin', 'Admin')}</th><th>{t('role')}</th><th>{t('assignedMesses', 'Assigned Messes')}</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.USER_ID} className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-1.5 font-semibold">{u.FULL_NAME || u.USERNAME}</td>
                <td>{u.ROLE_NAME}</td>
                <td className="text-xs">{assignedMessNames(u.USER_ID)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
