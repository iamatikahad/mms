import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useApp } from '../store';
import { getSocket } from '../socket';
import { playWelcomeSound, playConfirmSound } from '../sound';
import { Card, Spinner, Field, Input, Modal, Badge } from '../components/ui';

function fmtDT(ts: any) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  catch { return String(ts); }
}

export default function Polls() {
  const { t } = useTranslation();
  const { user, toast, confirm } = useApp();
  const isAdmin = user?.role !== 'MEMBER';
  const [polls, setPolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ question: '', options: '', closesAt: '' });
  const [busy, setBusy] = useState(false);
  const [voting, setVoting] = useState<number | null>(null);

  const load = () => api.get('/polls', { params: { scope: 'all' } })
    .then(r => setPolls(r.data.polls || [])).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    load();
    const s = getSocket();
    const onPoll = () => { toast('info', `📊 ${t('newPollPublished')}`); playWelcomeSound(); load(); };
    s.on('new_poll', onPoll);
    return () => { s.off('new_poll', onPoll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vote = async (poll: any, optionId: number) => {
    if (voting !== null) return;
    setVoting(poll.POLL_ID);
    try {
      await api.post(`/polls/${poll.POLL_ID}/vote`, { optionId });
      playConfirmSound();
      load();
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'ERROR');
      load();
    } finally { setVoting(null); }
  };

  const create = async () => {
    const options = form.options.split('\n').map(x => x.trim()).filter(Boolean);
    if (!form.question.trim() || options.length < 2) { toast('error', t('required')); return; }
    setBusy(true);
    try {
      await api.post('/polls', {
        question: form.question.trim(),
        options,
        closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : undefined,
      });
      toast('success', t('created'));
      setShowCreate(false); setForm({ question: '', options: '', closesAt: '' });
      load();
    } catch (e: any) { toast('error', e?.response?.data?.error || 'ERROR'); }
    finally { setBusy(false); }
  };

  const closePoll = async (p: any) => {
    if (!(await confirm(t('confirmDelete')))) return;
    await api.put(`/polls/${p.POLL_ID}/close`); toast('success', t('closed')); load();
  };
  const deletePoll = async (p: any) => {
    if (!(await confirm(t('confirmDelete')))) return;
    await api.delete(`/polls/${p.POLL_ID}`); toast('success', t('deleted')); load();
  };

  if (loading) return <Spinner />;
  const active = polls.filter(p => p.isOpen);
  const closed = polls.filter(p => !p.isOpen);

  const PollCard = ({ p }: { p: any }) => (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-100">{p.QUESTION}</div>
          <div className="text-xs text-slate-400 mt-1">
            {p.isOpen ? `🟢 ${t('activePolls')}` : `🔴 ${t('pollClosed')}`}
            {p.CLOSES_AT ? ` · ${t('pollEndsAt')} ${fmtDT(p.CLOSES_AT)}` : ''}
            {' · '}{p.totalVotes}/{p.eligible} {t('votes')}
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-1 shrink-0">
            {p.isOpen && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => closePoll(p)}>{t('closePoll')}</button>}
            <button className="btn-ghost !px-2 !py-1 text-xs text-red-500" onClick={() => deletePoll(p)}>🗑</button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {p.options.map((o: any) => {
          const mine = p.myVote === o.OPTION_ID;
          const canVote = p.isOpen && !p.myVote;
          return (
            <button key={o.OPTION_ID}
              disabled={!canVote || voting !== null}
              onClick={() => canVote && vote(p, o.OPTION_ID)}
              className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition relative overflow-hidden ${
                mine ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/40'
                     : canVote ? 'border-slate-200 dark:border-slate-700 hover:border-brand-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer'
                     : 'border-slate-200 dark:border-slate-700 opacity-80'}`}>
              {/* result bar */}
              {(p.myVote || !p.isOpen) && (
                <div className="absolute inset-y-0 left-0 bg-brand-500/15 dark:bg-brand-400/10 transition-all" style={{ width: `${o.pct}%` }} />
              )}
              <div className="relative flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {o.OPTION_TEXT} {mine && <span className="text-brand-600 text-xs">✓ {t('voted')}</span>}
                </span>
                {(p.myVote || !p.isOpen) && (
                  <span className="text-xs font-bold text-brand-700 dark:text-brand-300 shrink-0">{o.pct}% · {o.VOTES}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {p.isOpen && !p.myVote && <div className="text-xs text-slate-400 mt-2">{t('vote')}</div>}
    </Card>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t('polls')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{active.length} {t('activePolls')}</p>
        </div>
        {isAdmin && <button className="btn-primary" onClick={() => setShowCreate(true)}>+ {t('createPoll')}</button>}
      </div>

      {active.length === 0 && closed.length === 0 && <Card><p className="text-slate-400 text-sm text-center py-8">{t('noPolls')}</p></Card>}
      {active.map(p => <PollCard key={p.POLL_ID} p={p} />)}
      {closed.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide pt-2">{t('closedPolls')}</h2>
          {closed.map(p => <PollCard key={p.POLL_ID} p={p} />)}
        </>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('createPoll')}>
        <div className="space-y-3">
          <Field label={t('pollQuestion')} required>
            <Input value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} placeholder="আজ রাতে কি কাচ্চি হবে?" />
          </Field>
          <Field label={t('pollOptions')} required hint="YES – হ্যাঁ&#10;NO – না">
            <textarea className="input w-full" rows={4} value={form.options} onChange={e => setForm({ ...form, options: e.target.value })} />
          </Field>
          <Field label={t('pollEndsAt')}>
            <Input type="datetime-local" value={form.closesAt} onChange={e => setForm({ ...form, closesAt: e.target.value })} />
          </Field>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary" onClick={() => setShowCreate(false)}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={create}>{t('publishPoll')}</button>
        </div>
      </Modal>
    </div>
  );
}
