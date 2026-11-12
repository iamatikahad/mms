import { Router } from 'express';
import oracledb from 'oracledb';
import { q, q1, tx } from '../db';
import { authMiddleware, requireRole } from '../middleware';
import { audit } from '../services/audit';
import { notifyAllUsers } from '../services/notify';
import { getIo } from '../socket';

export const pollsRouter = Router();
pollsRouter.use(authMiddleware);

function isPollOpen(p: any): boolean {
  if (p.STATUS !== 'OPEN') return false;
  if (p.CLOSES_AT) {
    const close = p.CLOSES_AT instanceof Date ? p.CLOSES_AT : new Date(p.CLOSES_AT);
    if (close.getTime() <= Date.now()) return false;
  }
  return true;
}

// List polls with options, results and caller's vote
pollsRouter.get('/', async (req, res, next) => {
  try {
    const scope = String(req.query.scope || 'all'); // 'active' | 'all'
    const polls = await q<any>(
      `SELECT POLL_ID, QUESTION, STATUS, CREATED_BY, CLOSES_AT, CREATED_AT, CLOSED_AT
       FROM POLLS WHERE STATUS != 'DELETED'
       ORDER BY CREATED_AT DESC FETCH FIRST 100 ROWS ONLY`);
    const voterCount = await q1<{ C: number }>(
      `SELECT COUNT(*) C FROM USERS u JOIN ROLES r ON r.ROLE_ID=u.ROLE_ID WHERE u.STATUS='ACTIVE'`);
    const eligible = Number(voterCount?.C || 0);

    const out = [] as any[];
    for (const p of polls) {
      const options = await q<any>(
        `SELECT o.OPTION_ID, o.OPTION_TEXT, o.SORT_ORDER,
                (SELECT COUNT(*) FROM POLL_VOTES v WHERE v.OPTION_ID=o.OPTION_ID) VOTES
         FROM POLL_OPTIONS o WHERE o.POLL_ID=:1 ORDER BY o.SORT_ORDER, o.OPTION_ID`, [p.POLL_ID]);
      const totalRow = await q1<{ C: number }>(
        `SELECT COUNT(*) C FROM POLL_VOTES WHERE POLL_ID=:1`, [p.POLL_ID]);
      const myVote = await q1<{ OPTION_ID: number }>(
        `SELECT OPTION_ID FROM POLL_VOTES WHERE POLL_ID=:1 AND USER_ID=:2`, [p.POLL_ID, req.user!.userId]);
      const totalVotes = Number(totalRow?.C || 0);
      out.push({
        ...p,
        isOpen: isPollOpen(p),
        totalVotes,
        myVote: myVote ? Number(myVote.OPTION_ID) : null,
        eligible,
        options: options.map(o => ({
          ...o,
          VOTES: Number(o.VOTES),
          pct: totalVotes ? Math.round((Number(o.VOTES) / totalVotes) * 100) : 0,
        })),
      });
    }
    const filtered = scope === 'active' ? out.filter(p => p.isOpen) : out;
    res.json({ polls: filtered });
  } catch (e) { next(e); }
});

// Create poll (admin / super admin)
pollsRouter.post('/', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const question = String(req.body?.question || '').trim().slice(0, 500);
    const options = Array.isArray(req.body?.options) ? req.body.options.map((o: any) => String(o).trim().slice(0, 300)).filter(Boolean) : [];
    const closesAt = req.body?.closesAt ? new Date(req.body.closesAt) : null;
    if (!question || options.length < 2) return res.status(400).json({ error: 'MISSING_FIELDS' });
    if (closesAt && isNaN(closesAt.getTime())) return res.status(400).json({ error: 'BAD_CLOSES_AT' });

    const pollId = await tx(async (conn) => {
      const outB = [] as any[];
      await conn.execute(
        `INSERT INTO POLLS (QUESTION, STATUS, CREATED_BY, CLOSES_AT)
         VALUES (:1,'OPEN',:2,:3) RETURNING POLL_ID INTO :4`,
        [question, req.user!.userId, closesAt, { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }],
        { outBinds: outB });
      const pid = Number(outB[0]);
      for (let i = 0; i < options.length; i++) {
        await conn.execute(
          `INSERT INTO POLL_OPTIONS (POLL_ID, OPTION_TEXT, SORT_ORDER) VALUES (:1,:2,:3)`,
          [pid, options[i], i]);
      }
      return pid;
    });

    await notifyAllUsers('📊 New Poll', question, 'POLL');
    getIo()?.to('community').emit('new_poll', { pollId });
    await audit(req, 'CREATE', 'POLL', pollId, null, { question, options, closesAt });
    res.status(201).json({ ok: true, pollId });
  } catch (e) { next(e); }
});

// Vote (any authenticated user, once per poll)
pollsRouter.post('/:id/vote', async (req, res, next) => {
  try {
    const pollId = Number(req.params.id);
    const optionId = Number(req.body?.optionId);
    if (!pollId || !optionId) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const poll = await q1<any>(`SELECT * FROM POLLS WHERE POLL_ID=:1 AND STATUS != 'DELETED'`, [pollId]);
    if (!poll) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isPollOpen(poll)) return res.status(423).json({ error: 'POLL_CLOSED' });

    const opt = await q1<any>(`SELECT OPTION_ID FROM POLL_OPTIONS WHERE OPTION_ID=:1 AND POLL_ID=:2`, [optionId, pollId]);
    if (!opt) return res.status(400).json({ error: 'BAD_OPTION' });

    const dup = await q1<any>(`SELECT VOTE_ID FROM POLL_VOTES WHERE POLL_ID=:1 AND USER_ID=:2`, [pollId, req.user!.userId]);
    if (dup) return res.status(409).json({ error: 'ALREADY_VOTED' });

    await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO POLL_VOTES (POLL_ID, USER_ID, OPTION_ID) VALUES (:1,:2,:3)`,
        [pollId, req.user!.userId, optionId]);
    });
    res.json({ ok: true });
  } catch (e: any) {
    if (String(e?.message || '').includes('UQ_POLL_VOTE') || String(e?.code) === 'ORA-00001') {
      return res.status(409).json({ error: 'ALREADY_VOTED' });
    }
    next(e);
  }
});

// Close poll manually (admin / super admin)
pollsRouter.put('/:id/close', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const pollId = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM POLLS WHERE POLL_ID=:1`, [pollId]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await q(`UPDATE POLLS SET STATUS='CLOSED', CLOSED_AT=SYSTIMESTAMP WHERE POLL_ID=:1`, [pollId]);
    await audit(req, 'CLOSE', 'POLL', pollId, before, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Delete/archive poll (admin / super admin)
pollsRouter.delete('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const pollId = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM POLLS WHERE POLL_ID=:1`, [pollId]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await q(`UPDATE POLLS SET STATUS='DELETED' WHERE POLL_ID=:1`, [pollId]);
    await audit(req, 'DELETE', 'POLL', pollId, before, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
