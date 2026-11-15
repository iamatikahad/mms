import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Input, Field, Modal, Badge, Spinner } from '../../components/ui';
import { api } from '../../api';
import { useApp } from '../../store';
import { notifPrefs } from '../../sound';

export default function Profile() {
  const { t } = useTranslation();
  const { user, refreshMe, logout, toast, messName } = useApp();
  const [me, setMe] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [pw, setPw] = useState<any>({});
  const [pwModal, setPwModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<any>({ chatNotify: true, messageSound: true, mealReminder: true, loginSound: true });
  const [browserNotif, setBrowserNotif] = useState<string>('default');

  React.useEffect(() => {
    api.get('/auth/me').then(r => { setMe(r.data.user); setForm(r.data.user); });
    api.get('/chat/prefs').then(r => { setPrefs(r.data.prefs); notifPrefs.cache = r.data.prefs; }).catch(() => {});
    if (typeof Notification !== 'undefined') setBrowserNotif(Notification.permission);
  }, []);

  const savePref = async (key: string, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next); notifPrefs.cache = next;
    try { await api.put('/chat/prefs', { [key]: value }); } catch { /* ignore */ }
  };

  const enableBrowserNotif = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setBrowserNotif(p);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/profile', {
        fullName: form.FULL_NAME || form.fullName,
        email: form.EMAIL || form.email,
        phone: form.PHONE || form.phone,
        emergencyContact: form.EMERGENCY_CONTACT || form.emergencyContact,
      });
      toast('success', t('saved')); refreshMe();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const changePw = async () => {
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast('success', t('saved')); setPwModal(false); setPw({});
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  if (!me) return <Spinner />;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="page-title">{t('profile')}</h1>
      <Card>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-2xl font-bold">
            {(me.FULL_NAME || me.USERNAME || '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{me.FULL_NAME}</div>
            <div className="text-sm text-slate-500">{me.USERNAME} · <Badge color={me.ROLE === 'SUPER_ADMIN' ? 'purple' : me.ROLE === 'ADMIN' ? 'blue' : 'green'}>{me.ROLE}</Badge></div>
          </div>
        </div>
        <div className="space-y-3">
          <Field label={t('fullName')}><Input value={form.FULL_NAME || form.fullName || ''} onChange={e => setForm({ ...form, FULL_NAME: e.target.value, fullName: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('email')}><Input value={form.EMAIL || form.email || ''} onChange={e => setForm({ ...form, EMAIL: e.target.value, email: e.target.value })} /></Field>
            <Field label={t('phone')}><Input value={form.PHONE || form.phone || ''} onChange={e => setForm({ ...form, PHONE: e.target.value, phone: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('language')}><Input value={form.LANGUAGE || form.language || 'en'} disabled /></Field>
            <Field label={t('theme')}><Input value={form.THEME || form.theme || 'light'} disabled /></Field>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
            <button className="btn-secondary" onClick={() => setPwModal(true)}>{t('changePassword')}</button>
          </div>
        </div>
      </Card>
      <Card title={t('account')}>
        <button className="btn-danger" onClick={logout}>{t('logout')}</button>
      </Card>
      <Card title={t('notificationPrefs')}>
        <p className="text-xs text-slate-500 mb-3">{t('prefHint')}</p>
        <div className="space-y-2.5">
          {([
            ['chatNotify', t('prefChatNotify')],
            ['messageSound', t('prefMessageSound')],
            ['mealReminder', t('prefMealReminder')],
            ['loginSound', t('prefLoginSound')],
          ] as [string, string][]).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between text-sm cursor-pointer">
              <span>{label}</span>
              <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={!!prefs[k]} onChange={e => savePref(k, e.target.checked)} />
            </label>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
          {browserNotif === 'granted' ? (
            <p className="text-xs text-emerald-600">✅ {t('browserNotifOn')}</p>
          ) : browserNotif === 'denied' ? (
            <p className="text-xs text-amber-600">⚠️ {t('browserNotifDenied')}</p>
          ) : (
            <button className="btn-secondary !py-1.5 text-xs" onClick={enableBrowserNotif}>{t('enableBrowserNotif')}</button>
          )}
        </div>
      </Card>
      <Card title="About">
        <p className="text-sm text-slate-500">{messName} — {t('appName')}</p>
        <p className="text-xs text-slate-400 mt-2">Developed & Maintained by Atikahad</p>
      </Card>

      <Modal open={pwModal} onClose={() => setPwModal(false)} title={t('changePassword')}>
        <div className="space-y-3">
          <Field label={t('currentPassword')}><Input type="password" value={pw.currentPassword || ''} onChange={e => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label={t('newPassword')}><Input type="password" value={pw.newPassword || ''} onChange={e => setPw({ ...pw, newPassword: e.target.value })} /></Field>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setPwModal(false)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={changePw}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  );
}
