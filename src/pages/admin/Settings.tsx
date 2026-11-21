import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Input, Field, Select, Spinner } from '../../components/ui';
import { api } from '../../api';
import { useApp } from '../../store';
import { UI_THEMES } from '../../themes';

const MEAL_KEYS = ['meal.lunch_time', 'meal.lunch_cutoff', 'meal.dinner_time', 'meal.dinner_cutoff'];
const CALC_KEY = 'calc.system';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { toast, uiTheme, setUiTheme, theme, refreshMessName } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<Record<string, string>>({});
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [calcSys, setCalcSys] = useState('EXISTING');
  const [savingCalc, setSavingCalc] = useState(false);

  React.useEffect(() => {
    api.get('/settings').then(r => {
      const all = r.data.rows || [];
      setRows(all.filter((x: any) => !MEAL_KEYS.includes(x.SETTING_KEY) && x.SETTING_KEY !== CALC_KEY));
      const v: Record<string, string> = {};
      const s: Record<string, string> = {};
      all.forEach((x: any) => {
        v[x.SETTING_KEY] = x.SETTING_VALUE;
        if (MEAL_KEYS.includes(x.SETTING_KEY)) s[x.SETTING_KEY] = x.SETTING_VALUE;
        if (x.SETTING_KEY === CALC_KEY) {
          const cv = String(x.SETTING_VALUE || '').replace(/^"|"$/g, '').trim();
          setCalcSys(cv === 'ONE_CREDIT' ? 'ONE_CREDIT' : 'EXISTING');
        }
      });
      setVals(v); setSchedule(s); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    for (const r of rows) {
      const k = r.SETTING_KEY;
      if (vals[k] !== undefined && String(vals[k]) !== String(r.SETTING_VALUE)) {
        await api.put(`/settings/${encodeURIComponent(k)}`, { value: vals[k] });
      }
    }
    await refreshMessName(); // propagate app.mess_name changes immediately
    toast('success', t('saved'));
  };

  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      for (const k of MEAL_KEYS) {
        const val = (schedule[k] || '').trim();
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(val)) { toast('error', `${k}: HH:MM required`); setSavingSchedule(false); return; }
        await api.put(`/settings/${encodeURIComponent(k)}`, { value: val });
      }
      toast('success', t('saved'));
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setSavingSchedule(false); }
  };

  const saveCalc = async () => {
    setSavingCalc(true);
    try {
      await api.put(`/settings/${CALC_KEY}`, { value: calcSys });
      toast('success', t('saved'));
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setSavingCalc(false); }
  };

  if (loading) return <Spinner />;

  const scheduleFields: { key: string; label: string }[] = [
    { key: 'meal.lunch_time', label: t('lunchTime') },
    { key: 'meal.lunch_cutoff', label: t('lunchCutoff') },
    { key: 'meal.dinner_time', label: t('dinnerTime') },
    { key: 'meal.dinner_cutoff', label: t('dinnerCutoff') },
  ];

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="page-title">{t('settings')}</h1>

      <Card title={t('mealSchedule')}>
        <p className="text-xs text-slate-500 mb-4">{t('scheduleHint')} · Asia/Dhaka</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {scheduleFields.map(f => (
            <Field key={f.key} label={f.label}>
              <Input type="time" value={schedule[f.key] || ''}
                onChange={e => setSchedule({ ...schedule, [f.key]: e.target.value })} />
            </Field>
          ))}
        </div>
        <button className="btn-primary mt-4" disabled={savingSchedule} onClick={saveSchedule}>
          {savingSchedule ? t('loading') : t('save')}
        </button>
      </Card>

      <Card title={t('calcSystem')}>
        <p className="text-xs text-slate-500 mb-3">{t('calcSystemHint')}</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="calcSys" checked={calcSys === 'EXISTING'} onChange={() => setCalcSys('EXISTING')} />
            <span><b>{t('calcSystem1')}</b> — {t('calcSystem1Desc')}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="calcSys" checked={calcSys === 'ONE_CREDIT'} onChange={() => setCalcSys('ONE_CREDIT')} />
            <span><b>{t('calcSystem2')}</b> — {t('calcSystem2Desc')}</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button className="btn-primary" disabled={savingCalc} onClick={saveCalc}>
            {savingCalc ? t('loading') : t('save')}
          </button>
          <span className="text-xs text-slate-500">{t('activeCalcSystem')}: <b>{calcSys === 'ONE_CREDIT' ? t('calcSystem2') : t('calcSystem1')}</b></span>
        </div>
      </Card>

      <TelegramCard />

      <Card title={t('appearance')}>
        <p className="text-xs text-slate-500 mb-4">{t('themeHint')}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {UI_THEMES.map(th => {
            const v = theme === 'dark' ? th.dark : th.light;
            const active = uiTheme === th.key;
            return (
              <button key={th.key} onClick={() => setUiTheme(th.key)}
                className={`rounded-xl border-2 p-2 text-left transition ${active ? 'border-amber-500 ring-2 ring-amber-200 dark:ring-amber-900' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'}`}>
                <div className="h-12 rounded-lg mb-1.5 flex overflow-hidden" style={{ background: v.bg }}>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-8 h-5 rounded" style={{ background: v.card, border: `1px solid ${v.border}` }} />
                  </div>
                  <div className="w-1/3 p-1 flex flex-col gap-0.5">
                    <div className="h-2 rounded-sm" style={{ background: v.accent }} />
                    <div className="h-2 rounded-sm" style={{ background: v.text2, opacity: .5 }} />
                  </div>
                </div>
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{i18n.language === 'bn' ? th.bn : th.en}</div>
              </button>
            );
          })}
        </div>
        <button className="btn-ghost mt-3 text-xs" onClick={() => setUiTheme('royal')}>{t('resetToDefault')}</button>
      </Card>

      <Card title={t('settings')}>
        <div className="space-y-4">
          {rows.map(r => {
            const k = r.SETTING_KEY;
            const isSelect = k === 'bill.allocation_method';
            return (
              <Field key={k} label={k} hint={r.DESCRIPTION}>
                {isSelect ? (
                  <Select value={vals[k] || ''} onChange={e => setVals({ ...vals, [k]: e.target.value })}>
                    <option value="EQUAL">EQUAL</option>
                  </Select>
                ) : (
                  <Input value={vals[k] || ''} onChange={e => setVals({ ...vals, [k]: e.target.value })} />
                )}
              </Field>
            );
          })}
          <button className="btn-primary" onClick={save}>{t('save')}</button>
        </div>
      </Card>
    </div>
  );
}

// ── Telegram Notifications (Super Admin) ──
function TelegramCard() {
  const { t } = useTranslation();
  const { toast, user } = useApp();
  const role = (user as any)?.role ?? (user as any)?.ROLE_NAME ?? (user as any)?.roleName;
  const isSA = role === 'SUPER_ADMIN';
  const [cfg, setCfg] = useState<any>(null);
  const [form, setForm] = useState<any>({ chatId: '', botToken: '', notifyRequests: true, notifyUpdates: true, notifyCancels: true, notifyCutoff: true });
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const load = React.useCallback(() => {
    if (!isSA) return;
    api.get('/telegram/settings').then(r => {
      setCfg(r.data);
      setForm((f: any) => ({ ...f, chatId: r.data.chatId || '', notifyRequests: r.data.notifyRequests !== false, notifyUpdates: r.data.notifyUpdates !== false, notifyCancels: r.data.notifyCancels !== false, notifyCutoff: r.data.notifyCutoff !== false }));
    }).catch(() => {});
  }, [isSA]);
  React.useEffect(load, [load]);

  if (!isSA) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/telegram/settings', form);
      toast('success', t('saved'));
      setForm((f: any) => ({ ...f, botToken: '' }));
      load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setTestMsg('');
    try {
      // ensure the form values are persisted first — Test uses saved credentials
      if (form.botToken || (form.chatId && form.chatId !== cfg?.chatId)) {
        await api.put('/telegram/settings', form);
        setForm((f: any) => ({ ...f, botToken: '' }));
      }
      const r = await api.post('/telegram/test');
      setTestMsg(r.data.ok ? `✅ ${r.data.message}` : `❌ ${r.data.error || 'FAILED'}`);
      load();
    } catch (e: any) { setTestMsg(`❌ ${e?.response?.data?.error || 'ERROR'}`); }
    finally { setBusy(false); }
  };
  const Toggle = ({ k, label }: { k: string; label: string }) => (
    <label className="flex items-center justify-between py-1.5 cursor-pointer">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={!!form[k]}
        onChange={e => setForm({ ...form, [k]: e.target.checked })} />
    </label>
  );

  return (
    <>
      <Card title={t('telegramNotifications')}>
        <p className="text-xs text-slate-500 mb-4">{t('telegramHint')}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={t('tgBotToken')} hint={cfg?.botTokenSet ? t('tgTokenSet') : t('tgTokenEmpty')}>
            <Input type="password" value={form.botToken} placeholder={cfg?.botTokenSet ? '••••••••••' : '123456:ABC...'}
              onChange={e => setForm({ ...form, botToken: e.target.value })} autoComplete="off" />
          </Field>
          <Field label={t('tgChatId')}>
            <Input value={form.chatId} placeholder="-1001234567890"
              onChange={e => setForm({ ...form, chatId: e.target.value })} />
          </Field>
        </div>
        <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
          <Toggle k="notifyRequests" label={t('tgNotifyRequests')} />
          <Toggle k="notifyUpdates" label={t('tgNotifyUpdates')} />
          <Toggle k="notifyCancels" label={t('tgNotifyCancels')} />
          <Toggle k="notifyCutoff" label={t('tgNotifyCutoff')} />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>
          <button className="btn-ghost" disabled={busy} onClick={test}>{t('tgTestConnection')}</button>
        </div>
        {testMsg && <p className="text-sm mt-3">{testMsg}</p>}
      </Card>
    </>
  );
}
