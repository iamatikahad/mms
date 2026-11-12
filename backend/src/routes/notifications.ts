import { Router } from 'express';
import oracledb from 'oracledb';
import { q, q1, tx } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { audit } from '../services/audit';
import { notify } from '../services/notify';

export const notificationsRouter = Router();
notificationsRouter.use(authMiddleware);

// My notifications
notificationsRouter.get('/my', async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT NOTIFICATION_ID, TITLE, MESSAGE, NOTIF_TYPE, IS_READ, CREATED_AT
       FROM NOTIFICATIONS WHERE USER_ID=:1 OR USER_ID IS NULL
       ORDER BY CREATED_AT DESC FETCH FIRST 100 ROWS ONLY`, [req.user!.userId]);
    const unread = await q1<{ C: number }>(
      `SELECT COUNT(*) C FROM NOTIFICATIONS WHERE (USER_ID=:1 OR USER_ID IS NULL) AND IS_READ=0`, [req.user!.userId]);
    res.json({ rows, unread: Number(unread?.C ?? 0) });
  } catch (e) { next(e); }
});

notificationsRouter.post('/my/:id/read', async (req, res, next) => {
  try {
    await q(`UPDATE NOTIFICATIONS SET IS_READ=1 WHERE NOTIFICATION_ID=:1 AND (USER_ID=:2 OR USER_ID IS NULL)`,
      [Number(req.params.id), req.user!.userId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

notificationsRouter.post('/my/read-all', async (req, res, next) => {
  try {
    await q(`UPDATE NOTIFICATIONS SET IS_READ=1 WHERE (USER_ID=:1 OR USER_ID IS NULL) AND IS_READ=0`, [req.user!.userId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Admin: send notification (to a user, a member's user, or broadcast)
notificationsRouter.post('/', requirePerm('notifications.manage'), async (req, res, next) => {
  try {
    const { userId, memberId, title, message, type = 'INFO', broadcast } = req.body || {};
    if (!title) return res.status(400).json({ error: 'MISSING_FIELDS' });
    if (broadcast === 'member' && !memberId) return res.status(400).json({ error: 'MEMBER_REQUIRED' });

    let targets: number[] = [];
    if (broadcast === 'members' || broadcast === 'all') {
      const rows = await q<{ USER_ID: number }>(
        broadcast === 'all'
          ? `SELECT USER_ID FROM USERS WHERE STATUS='ACTIVE'`
          : `SELECT u.USER_ID FROM MEMBERS m JOIN USERS u ON u.USER_ID=m.USER_ID WHERE m.STATUS='ACTIVE' AND u.STATUS='ACTIVE'`);
      targets = rows.map(r => Number(r.USER_ID));
    } else if (memberId) {
      const r = await q1<{ USER_ID: number }>(`SELECT USER_ID FROM MEMBERS WHERE MEMBER_ID=:1`, [Number(memberId)]);
      if (r) targets = [Number(r.USER_ID)];
    } else if (userId) {
      targets = [Number(userId)];
    }

    const outB = [] as any[];
    await tx(async (conn) => {
      for (const uid of targets.length ? targets : [null as any]) {
        await conn.execute(
          `INSERT INTO NOTIFICATIONS (USER_ID, TITLE, MESSAGE, NOTIF_TYPE) VALUES (:1,:2,:3,:4)`,
          [uid ?? null, title, message || null, type]);
      }
    });
    await audit(req, 'CREATE', 'NOTIFICATION', null, null, { title, targets: targets.length });
    res.status(201).json({ ok: true, sent: targets.length || 1 });
  } catch (e) { next(e); }
});
