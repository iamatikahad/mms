import { Router } from 'express';
import oracledb from 'oracledb';
import { q, q1, tx } from '../db';
import { authMiddleware, requirePerm, requireRole } from '../middleware';
import { audit } from '../services/audit';
import { assertMonthOpen, MonthClosedError } from '../services/finance';
import { notifyMember } from '../services/notify';
import { toDateOnly } from '../util';

export const guestsRouter = Router();
guestsRouter.use(authMiddleware);

// ---------- MEMBER ----------
// Member: my guest meals
guestsRouter.get('/my', requireRole('MEMBER'), async (req, res, next) => {
  try {
    const memberId = req.user!.memberId;
    if (!memberId) return res.status(403).json({ error: 'NO_MEMBER_PROFILE' });
    const month = String(req.query.month || '');
    let where = 'g.HOST_MEMBER_ID = :1 AND g.STATUS = \'ACTIVE\'';
    const binds: any[] = [memberId];
    if (month) {
      const [y, m] = month.split('-').map(Number);
      binds.push(new Date(Date.UTC(y, m - 1, 1) - 6 * 3600 * 1000), new Date(Date.UTC(y, m, 1) - 6 * 3600 * 1000));
      where += ` AND g.MEAL_DATE>=:2 AND g.MEAL_DATE<:3`;
    }
    const rows = await q(
      `SELECT g.GUEST_MEAL_ID, g.MEAL_DATE, g.MEAL_TYPE, g.GUEST_QTY, g.NOTES, g.STATUS, g.CREATED_AT,
              m.FULL_NAME HOST_NAME
       FROM GUEST_MEALS g JOIN MEMBERS m ON m.MEMBER_ID=g.HOST_MEMBER_ID
       WHERE ${where} ORDER BY g.MEAL_DATE DESC`, binds);
    res.json({ rows });
  } catch (e) { next(e); }
});

// Member: register guest meal(s) — host = self
// Body: { date, guests: [{ mealType, qty, notes }] }
guestsRouter.post('/', requireRole('MEMBER'), async (req, res, next) => {
  try {
    const memberId = req.user!.memberId;
    if (!memberId) return res.status(403).json({ error: 'NO_MEMBER_PROFILE' });
    const { date, guests } = req.body || {};
    if (!date || !Array.isArray(guests) || !guests.length) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const mealDate = toDateOnly(date);
    if (mealDate.toISOString().slice(0, 10) < new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10)) {
      return res.status(400).json({ error: 'PAST_DATE_NOT_ALLOWED' });
    }
    await assertMonthOpen(mealDate);

    const ids: number[] = [];
    for (const g of guests) {
      const type = String(g.mealType || g.type || '').toUpperCase();
      const qty = Math.max(1, Math.min(20, Number(g.qty || 0)));
      if (!['LUNCH', 'DINNER'].includes(type) || !qty) continue;
      const outB = [] as any[];
      await tx(async (conn) => {
        await conn.execute(
          `INSERT INTO GUEST_MEALS (MEAL_DATE, MEAL_TYPE, GUEST_QTY, HOST_MEMBER_ID, NOTES, STATUS, CREATED_BY)
           VALUES (:1,:2,:3,:4,:5,'ACTIVE',:6) RETURNING GUEST_MEAL_ID INTO :7`,
          [mealDate, type, qty, memberId, g.notes || null, req.user!.userId,
           { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
        ids.push(Number(outB[0]));
      });
      await audit(req, 'CREATE', 'GUEST_MEAL', ids[ids.length - 1], null, { ...g, date });
    }
    res.status(201).json({ ok: true, ids });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// ---------- ADMIN ----------
// Admin: list guest meals
guestsRouter.get('/', requirePerm('guests.manage'), async (req, res, next) => {
  try {
    const { date = '', month = '', memberId = '', status = '' } = req.query as any;
    const binds: any[] = [];
    let where = '1=1';
    if (date) { binds.push(toDateOnly(date)); where += ` AND TRUNC(g.MEAL_DATE)=TRUNC(:${binds.length})`; }
    else if (month) {
      const [y, m] = String(month).split('-').map(Number);
      binds.push(new Date(Date.UTC(y, m - 1, 1) - 6 * 3600 * 1000), new Date(Date.UTC(y, m, 1) - 6 * 3600 * 1000));
      where += ` AND g.MEAL_DATE>=:${binds.length - 1} AND g.MEAL_DATE<:${binds.length}`;
    }
    if (memberId) { binds.push(Number(memberId)); where += ` AND g.HOST_MEMBER_ID=:${binds.length}`; }
    if (status) { binds.push(status); where += ` AND g.STATUS=:${binds.length}`; }

    const rows = await q(
      `SELECT g.GUEST_MEAL_ID, g.MEAL_DATE, g.MEAL_TYPE, g.GUEST_QTY, g.NOTES, g.STATUS, g.CREATED_AT,
              m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME HOST_NAME, u.USERNAME CREATED_BY_NAME
       FROM GUEST_MEALS g
       JOIN MEMBERS m ON m.MEMBER_ID=g.HOST_MEMBER_ID
       LEFT JOIN USERS u ON u.USER_ID=g.CREATED_BY
       WHERE ${where} ORDER BY g.MEAL_DATE DESC, g.GUEST_MEAL_ID DESC`, binds);
    res.json({ rows });
  } catch (e) { next(e); }
});

// Admin: create guest meal (any host)
guestsRouter.post('/admin', requirePerm('guests.manage'), async (req, res, next) => {
  try {
    const { memberId, date, mealType, qty, notes } = req.body || {};
    const type = String(mealType).toUpperCase();
    const q_ = Math.max(1, Number(qty));
    if (!memberId || !date || !['LUNCH', 'DINNER'].includes(type) || !q_) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    const mealDate = toDateOnly(date);
    await assertMonthOpen(mealDate);
    const outB = [] as any[];
    const id = await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO GUEST_MEALS (MEAL_DATE, MEAL_TYPE, GUEST_QTY, HOST_MEMBER_ID, NOTES, STATUS, CREATED_BY)
         VALUES (:1,:2,:3,:4,:5,'ACTIVE',:6) RETURNING GUEST_MEAL_ID INTO :7`,
        [mealDate, type, q_, Number(memberId), notes || null, req.user!.userId,
         { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
      return Number(outB[0]);
    });
    await audit(req, 'CREATE', 'GUEST_MEAL', id, null, req.body);
    await notifyMember(Number(memberId), 'Guest Meal Recorded',
      `${q_} guest meal(s) (${type}) recorded for ${mealDate.toISOString().slice(0, 10)}.`);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Admin: update guest meal
guestsRouter.put('/:id', requirePerm('guests.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM GUEST_MEALS WHERE GUEST_MEAL_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(before.MEAL_DATE);
    const { qty, mealType, notes, status } = req.body || {};
    const type = mealType ? String(mealType).toUpperCase() : before.MEAL_TYPE;
    await tx(async (conn) => {
      await conn.execute(
        `UPDATE GUEST_MEALS SET GUEST_QTY=NVL(:2,GUEST_QTY), MEAL_TYPE=:3, NOTES=NVL(:4,NOTES),
           STATUS=NVL(:5,STATUS), UPDATED_AT=SYSTIMESTAMP
         WHERE GUEST_MEAL_ID=:1`,
        [id, qty !== undefined ? Math.max(1, Number(qty)) : null, type,
         notes !== undefined ? notes : null,
         status && ['ACTIVE', 'REVERSED', 'CANCELLED'].includes(status) ? status : null]);
    });
    await audit(req, 'UPDATE', 'GUEST_MEAL', id, before, req.body);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Admin: delete/cancel guest meal (soft)
guestsRouter.delete('/:id', requirePerm('guests.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM GUEST_MEALS WHERE GUEST_MEAL_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(before.MEAL_DATE);
    await q(`UPDATE GUEST_MEALS SET STATUS='CANCELLED', UPDATED_AT=SYSTIMESTAMP WHERE GUEST_MEAL_ID=:1`, [id]);
    await audit(req, 'CANCEL', 'GUEST_MEAL', id, before, null);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});
