import { Router } from 'express';
import { q, q1, tx } from '../db';
import { authMiddleware, requireRole } from '../middleware';
import { tgPublicConfig, tgSaveSettings, tgTest, processQueue } from '../services/telegram';
import { audit } from '../services/audit';

export const telegramRouter = Router();
telegramRouter.use(authMiddleware);

// All endpoints are Super Admin only — bot token is a sensitive credential.
const sa = requireRole('SUPER_ADMIN');

telegramRouter.get('/settings', sa, async (req, res, next) => {
  try { res.json(await tgPublicConfig(req.messId)); } catch (e) { next(e); }
});

telegramRouter.put('/settings', sa, async (req, res, next) => {
  try {
    await tgSaveSettings(req.body || {}, req.messId);
    await audit(req, 'UPDATE', 'TELEGRAM_SETTINGS', null, null, { ...req.body, botToken: req.body?.botToken ? '(set)' : '(unchanged)' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

telegramRouter.post('/test', sa, async (req, res, next) => {
  try {
    const r = await tgTest(req.messId);
    res.json(r.ok ? { ok: true, message: 'Test message sent — check your Telegram chat.' }
                  : { ok: false, error: r.err || 'FAILED', code: r.code });
  } catch (e) { next(e); }
});

telegramRouter.get('/logs', sa, async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const status = String(req.query.status || '');
    const binds: any[] = [];
    let where = `n.MESS_ID = ${req.messId!}`;
    if (status) { binds.push(status); where += ` AND n.STATUS=:${binds.length}`; }
    const rows = await q(
      `SELECT n.NOTIF_ID, n.N_TYPE, n.MEMBER_NAME, n.MESSAGE_PREVIEW, n.STATUS,
              n.ATTEMPTS, n.LAST_ERROR, n.HTTP_CODE, n.SENT_AT, n.CREATED_AT
       FROM TELEGRAM_NOTIFICATIONS n WHERE ${where}
       ORDER BY n.NOTIF_ID DESC OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,
      binds);
    const total = await q1<{ C: number }>(
      `SELECT COUNT(*) C FROM TELEGRAM_NOTIFICATIONS n WHERE ${where}`, binds);
    res.json({ rows, total: Number(total?.C || 0), limit, offset });
  } catch (e) { next(e); }
});

telegramRouter.post('/logs/:id/retry', sa, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await q1<any>(`SELECT NOTIF_ID, STATUS FROM TELEGRAM_NOTIFICATIONS WHERE NOTIF_ID=:1 AND MESS_ID=${req.messId!}`, [id]);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    await tx(async (conn) => {
      await conn.execute(`UPDATE TELEGRAM_NOTIFICATIONS SET STATUS='PENDING', UPDATED_AT=SYSTIMESTAMP WHERE NOTIF_ID=:1 AND MESS_ID=${req.messId!}`, [id]);
    });
    setImmediate(() => void processQueue());
    res.json({ ok: true });
  } catch (e) { next(e); }
});
