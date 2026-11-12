import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Spinner, Input, Field, Badge, Select } from '../../components/ui';
import { api, fmtDate, fmtMoney, fmtTime, dhakaToday, currentMonth, monthOptions } from '../../api';
import { useApp } from '../../store';

const MEALS = [
  { key: 'LUNCH', labelKey: 'lunch' },
  { key: 'DINNER', labelKey: 'dinner' },
];

export default function MyMeals() {
  const { t } = useTranslation();
  const { toast, confirm } = useApp();
  const [month, setMonth] = useState(currentMonth());
  const [date, setDate] = useState(dhakaToday());
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({ LUNCH: 0, DINNER: 0 });
  const [gqty, setGqty] = useState<Record<string, number>>({ LUNCH: 0, DINNER: 0 });

  const load = async () => {
    setLoading(true);
    const [m, s, g] = await Promise.all([
      api.get('/meals/my', { params: { month } }),
      api.get('/meals/status'),
      api.get('/guests/my', { params: { month } }).catch(() => ({ data: { rows: [] } })),
    ]);
    setData(m.data); setStatus(s.data); setGuests(g.data.rows || g.data.guests || []); setLoading(false);
    const q: Record<string, number> = { LUNCH: 0, DINNER: 0 };
    m.data.entries?.forEach((e: any) => { if (e.STATUS === 'ACTIVE') q[e.MEAL_TYPE] = Number(e.REGULAR_QTY); });
    setQty(q);
  };
  React.useEffect(() => { load(); }, [month]);

  const isToday = date === (status?.date || dhakaToday());
  const cutoffOpen = (type: string) => isToday ? (type === 'LUNCH' ? status?.lunch?.open : status?.dinner?.open) !== false : true;

  const submit = async () => {
    setBusy(true);
    try {
      const meals = MEALS.filter(m => (qty[m.key] || 0) > 0 || gqty[m.key] === 0).map(m => ({ mealType: m.key, regularQty: qty[m.key] || 0 }));
      // submit regular requests (only types with qty>0 or existing entry)
      const toSubmit = MEALS.filter(m => (qty[m.key] || 0) > 0).map(m => ({ mealType: m.key, regularQty: qty[m.key] }));
      if (toSubmit.length) await api.post('/meals/request', { date, meals: toSubmit });
      // guests
      const gList = MEALS.filter(m => (gqty[m.key] || 0) > 0).map(m => ({ mealType: m.key, qty: gqty[m.key] }));
      if (gList.length) await api.post('/guests', { date, guests: gList });
      toast('success', t('saved')); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const cancel = async (mealType: string) => {
    if (!(await confirm(t('cancelRequest')))) return;
    try {
      await api.post('/meals/request/cancel', { date, mealType });
      toast('success', t('cancelled')); load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
  };

  const todayEntries: any[] = (data?.entries || []).filter((e: any) => String(e.MEAL_DATE).slice(0, 10) === date && e.STATUS === 'ACTIVE');
  const todayRequests: any[] = (data?.requests || []).filter((r: any) => String(r.MEAL_DATE).slice(0, 10) === date);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title flex-1">{t('mealRequest')}</h1>
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="!w-40" />
        <Select value={month} onChange={e => setMonth(e.target.value)} className="!w-36">
          {monthOptions(6).map(m => <option key={m} value={m}>{m}</option>)}
        </Select>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {MEALS.map(m => {
          const entry = todayEntries.find(e => e.MEAL_TYPE === m.key);
          const req = todayRequests.filter(r => r.MEAL_TYPE === m.key).sort((a, b) => b.REVISION_NO - a.REVISION_NO)[0];
          const open = cutoffOpen(m.key);
          const cut = m.key === 'LUNCH' ? status?.lunch?.cutoff : status?.dinner?.cutoff;
          const mTime = m.key === 'LUNCH' ? status?.lunch?.time : status?.dinner?.time;
          return (
            <Card key={m.key} title={`${t(m.labelKey)}${mTime ? ` · ${fmtTime(mTime)}` : ''}`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{t('cutoff')} {cut || '—'}</span>
                  {entry ? <Badge color="green">{t('confirmed')}</Badge> : <Badge color="slate">{t('pending')}</Badge>}
                  {!open && <Badge color="red">{t('locked')}</Badge>}
                </div>
                {!open && <div className="text-xs text-red-500">{t('cutoffPass')}</div>}
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('regularQty')}><Input type="number" min={0} max={10} value={qty[m.key] ?? 0} onChange={e => setQty({ ...qty, [m.key]: Number(e.target.value) })} disabled={!open && isToday} /></Field>
                  <Field label={t('guestQty')}><Input type="number" min={0} max={20} value={gqty[m.key] ?? 0} onChange={e => setGqty({ ...gqty, [m.key]: Number(e.target.value) })} disabled={!open && isToday} /></Field>
                </div>
                {req?.STATUS === 'LOCKED' && <div className="text-xs text-amber-600">{t('locked')}</div>}
                {entry && open && isToday && (
                  <button className="btn-danger w-full" onClick={() => cancel(m.key)}>{t('cancelRequest')}</button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={submit}>{t('submitRequest')}</button>
      </div>

      <Card title={t('myMealHistory')}>
        <table className="w-full">
          <thead><tr><th className="th">{t('date')}</th><th className="th">{t('type')}</th><th className="th text-right">{t('regularQty')}</th><th className="th">{t('status')}</th></tr></thead>
          <tbody>
            {(data?.entries || []).map((e: any) => (
              <tr key={e.MEAL_ENTRY_ID} className="border-t border-slate-100 dark:border-slate-800">
                <td className="td">{fmtDate(e.MEAL_DATE)}</td><td className="td">{e.MEAL_TYPE}</td>
                <td className="td text-right">{e.REGULAR_QTY}</td>
                <td className="td"><Badge color={e.STATUS === 'ACTIVE' ? 'green' : 'red'}>{e.STATUS}</Badge></td>
              </tr>
            ))}
            {!data?.entries?.length && <tr><td className="td text-slate-400" colSpan={4}>{t('noData')}</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title={t('guestMeals')}>
        <table className="w-full">
          <thead><tr><th className="th">{t('date')}</th><th className="th">{t('type')}</th><th className="th text-right">{t('guestQty')}</th><th className="th">{t('notes')}</th><th className="th">{t('status')}</th></tr></thead>
          <tbody>
            {guests.map((g: any) => (
              <tr key={g.GUEST_MEAL_ID} className="border-t border-slate-100 dark:border-slate-800">
                <td className="td">{fmtDate(g.MEAL_DATE)}</td><td className="td">{g.MEAL_TYPE}</td>
                <td className="td text-right">{g.GUEST_QTY}</td><td className="td">{g.NOTES}</td>
                <td className="td"><Badge color={g.STATUS === 'ACTIVE' ? 'green' : 'red'}>{g.STATUS}</Badge></td>
              </tr>
            ))}
            {!guests.length && <tr><td className="td text-slate-400" colSpan={5}>{t('noData')}</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
