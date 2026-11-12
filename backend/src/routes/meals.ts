import { Router } from 'express';
import oracledb, { Connection } from 'oracledb';
import { q, q1, tx, Bind, clobText } from '../db';
import { authMiddleware, requirePerm, requireRole } from '../middleware';
import { audit } from '../services/audit';
import { assertMonthOpen, MonthClosedError } from '../services/finance';
import { notifyMember } from '../services/notify';
import { nowDhaka, dhakaDateStr, dhakaTimeMinutes, parseHM, toDateOnly } from '../util';

export const mealsRouter = Router();
mealsRouter.use(authMiddleware);

// ---------- helpers ----------

async function getSetting(key: string, dflt: string): Promise<string> {
  const r = await q1<{ SETTING_VALUE: any }>(
    `SELECT SETTING_VALUE FROM SYSTEM_SETTINGS WHERE SETTING_KEY=:1`, [key]);
  const v = await clobText(r?.SETTING_VALUE);
  return v == null ? dflt : v.replace(/^"|"$/g, '');
}

async function cutoffFor(mealType: 'LUNCH' | 'DINNER') {
  return mealType === 'LUNCH'
    ? parseHM(await getSetting('meal.lunch_cutoff', '10:00'))
    : parseHM(await getSetting('meal.dinner_cutoff', '19:30'));
}

/** Is the request window still open for this member/date/mealType? */
async function isOpen(memberDate: Date, mealType: 'LUNCH' | 'DINNER'): Promise<boolean> {
  const today = dhakaDateStr();
  const reqDate = toDateOnly(memberDate).toISOString().slice(0, 10);
  if (reqDate < today) return false;                 // past dates never editable
  if (reqDate > today) return true;                  // future dates always open
  return dhakaTimeMinutes() < (await cutoffFor(mealType));
}

function mealMonth(d: Date | string) {
  const s = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return s.slice(0, 7);
}

/** Upsert effective meal entry (MEAL_ENTRIES) inside a transaction. */
async function syncEntry(
  conn: Connection,
  memberId: number, date: Date, mealType: string,
  regularQty: number, requestId: number | null, createdBy: number | null
) {
  const existing = await conn.execute(
    `SELECT MEAL_ENTRY_ID FROM MEAL_ENTRIES
     WHERE MEMBER_ID=:1 AND TRUNC(MEAL_DATE)=TRUNC(:2) AND MEAL_TYPE=:3 AND STATUS='ACTIVE'`,
    [memberId, date, mealType],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const rows = existing.rows as any[];
  if (rows.length) {
    await conn.execute(
      `UPDATE MEAL_ENTRIES SET REGULAR_QTY=:2, REQUEST_ID=NVL(:3,REQUEST_ID), STATUS='ACTIVE',
         SOURCE=CASE WHEN :3 IS NULL THEN 'ADMIN' ELSE 'REQUEST' END,
         UPDATED_AT=SYSTIMESTAMP WHERE MEAL_ENTRY_ID=:1`,
      [rows[0].MEAL_ENTRY_ID, regularQty, requestId]);
    // Collapse any duplicate ACTIVE rows for the same slot so totals never double-count
    for (const extra of rows.slice(1)) {
      await conn.execute(
        `UPDATE MEAL_ENTRIES SET STATUS='CANCELLED', UPDATED_AT=SYSTIMESTAMP WHERE MEAL_ENTRY_ID=:1`,
        [extra.MEAL_ENTRY_ID]);
    }
  } else if (regularQty > 0 || requestId) {
    await conn.execute(
      `INSERT INTO MEAL_ENTRIES (MEMBER_ID, MEAL_DATE, MEAL_TYPE, REGULAR_QTY, GUEST_QTY, SOURCE, REQUEST_ID, STATUS, CREATED_BY)
       VALUES (:1,:2,:3,:4,0,:5,:6,'ACTIVE',:7)`,
      [memberId, date, mealType, regularQty, requestId ? 'REQUEST' : 'ADMIN', requestId, createdBy]);
  }
}

async function cancelEntry(conn: Connection, memberId: number, date: Date, mealType: string) {
  await conn.execute(
    `UPDATE MEAL_ENTRIES SET STATUS='CANCELLED', UPDATED_AT=SYSTIMESTAMP
     WHERE MEMBER_ID=:1 AND TRUNC(MEAL_DATE)=TRUNC(:2) AND MEAL_TYPE=:3 AND STATUS='ACTIVE'`,
    [memberId, date, mealType]);
}

// ---------- MEMBER endpoints ----------

// Member: my meal data for a month
mealsRouter.get('/my', requireRole('MEMBER'), async (req, res, next) => {
  try {
    const memberId = req.user!.memberId;
    if (!memberId) return res.status(403).json({ error: 'NO_MEMBER_PROFILE' });
    const month = String(req.query.month || mealMonth(new Date()));
    const { start, end } = monthBoundsLocal(month);

    const entries = await q(
      `SELECT MEAL_ENTRY_ID, MEAL_DATE, MEAL_TYPE, REGULAR_QTY, STATUS, UPDATED_AT
       FROM MEAL_ENTRIES WHERE MEMBER_ID=:1 AND MEAL_DATE>=:2 AND MEAL_DATE<:3
       ORDER BY MEAL_DATE, MEAL_TYPE`, [memberId, start, end]);
    const requests = await q(
      `SELECT REQUEST_ID, MEAL_DATE, MEAL_TYPE, REGULAR_QTY, STATUS, REVISION_NO, LOCKED_AT, UPDATED_AT
       FROM MEAL_REQUESTS WHERE MEMBER_ID=:1 AND MEAL_DATE>=:2 AND MEAL_DATE<:3
       ORDER BY MEAL_DATE, MEAL_TYPE`, [memberId, start, end]);
    res.json({ entries, requests, month });
  } catch (e) { next(e); }
});

function monthBoundsLocal(month: string) {
  const [y, m] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - 6 * 3600 * 1000),
    end: new Date(Date.UTC(y, m, 1) - 6 * 3600 * 1000),
  };
}

// Member: submit/update meal requests
mealsRouter.post('/request', requireRole('MEMBER'), async (req, res, next) => {
  try {
    const memberId = req.user!.memberId;
    if (!memberId) return res.status(403).json({ error: 'NO_MEMBER_PROFILE' });
    const { date, meals } = req.body || {};
    if (!date || !Array.isArray(meals)) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const mealDate = toDateOnly(date);
    const today = dhakaDateStr();
    if (mealDate.toISOString().slice(0, 10) < today) {
      return res.status(400).json({ error: 'PAST_DATE_NOT_ALLOWED' });
    }
    await assertMonthOpen(mealDate);

    const results: any[] = [];
    for (const m of meals) {
      const mealType = String(m.mealType || m.type || '').toUpperCase();
      const qty = Math.max(0, Math.min(10, Number(m.regularQty ?? m.qty ?? 0)));
      if (!['LUNCH', 'DINNER'].includes(mealType)) continue;

      const open = await isOpen(mealDate, mealType as any);
      // find existing request
      const existing = await q1<any>(
        `SELECT REQUEST_ID, STATUS, REGULAR_QTY, REVISION_NO FROM MEAL_REQUESTS
         WHERE MEMBER_ID=:1 AND TRUNC(MEAL_DATE)=TRUNC(:2) AND MEAL_TYPE=:3
         ORDER BY REVISION_NO DESC FETCH FIRST 1 ROWS ONLY`,
        [memberId, mealDate, mealType]);

      if (existing && ['LOCKED', 'OVERRIDDEN'].includes(existing.STATUS) && !open) {
        results.push({ mealType, error: 'LOCKED', requestId: existing.REQUEST_ID });
        continue;
      }

      const out = await tx(async (conn) => {
        let requestId: number;
        if (existing) {
          const outB = [] as any[];
          await conn.execute(
            `UPDATE MEAL_REQUESTS SET REGULAR_QTY=:2, STATUS='SUBMITTED',
               DELETED_BY=NULL, DELETED_AT=NULL,
               REVISION_NO=REVISION_NO+1, UPDATED_AT=SYSTIMESTAMP
             WHERE REQUEST_ID=:1`,
            [existing.REQUEST_ID, qty], { outBinds: outB });
          requestId = existing.REQUEST_ID;
        } else {
          const outB = [] as any[];
          await conn.execute(
            `INSERT INTO MEAL_REQUESTS (MEMBER_ID, MEAL_DATE, MEAL_TYPE, REGULAR_QTY, GUEST_QTY, STATUS, REVISION_NO, CREATED_BY)
             VALUES (:1,:2,:3,:4,0,'SUBMITTED',1,:5) RETURNING REQUEST_ID INTO :6`,
            [memberId, mealDate, mealType, qty, req.user!.userId,
             { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
          requestId = Number(outB[0]);
        }
        await syncEntry(conn, memberId, mealDate, mealType, qty, requestId, req.user!.userId);
        return requestId;
      });

      await audit(req, existing ? 'UPDATE' : 'CREATE', 'MEAL_REQUEST', out,
        existing ? { qty: existing.REGULAR_QTY } : null, { date, mealType, qty });
      results.push({ mealType, requestId: out, qty });
    }
    res.json({ ok: true, results });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Member: cancel a request (only while open)
mealsRouter.post('/request/cancel', requireRole('MEMBER'), async (req, res, next) => {
  try {
    const memberId = req.user!.memberId;
    const { date, mealType } = req.body || {};
    const mealDate = toDateOnly(date);
    const type = String(mealType).toUpperCase();
    if (!['LUNCH', 'DINNER'].includes(type)) return res.status(400).json({ error: 'BAD_TYPE' });

    const open = await isOpen(mealDate, type as any);
    if (!open) return res.status(423).json({ error: 'REQUEST_LOCKED' });

    const existing = await q1<any>(
      `SELECT REQUEST_ID, REGULAR_QTY, STATUS FROM MEAL_REQUESTS
       WHERE MEMBER_ID=:1 AND TRUNC(MEAL_DATE)=TRUNC(:2) AND MEAL_TYPE=:3
       ORDER BY REVISION_NO DESC FETCH FIRST 1 ROWS ONLY`,
      [memberId, mealDate, type]);
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND' });

    await tx(async (conn) => {
      await conn.execute(
        `UPDATE MEAL_REQUESTS SET STATUS='CANCELLED', REGULAR_QTY=0, UPDATED_AT=SYSTIMESTAMP WHERE REQUEST_ID=:1`,
        [existing.REQUEST_ID]);
      await cancelEntry(conn, memberId as number, mealDate, type);
    });
    await audit(req, 'CANCEL', 'MEAL_REQUEST', existing.REQUEST_ID, { qty: existing.REGULAR_QTY }, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Member: today's status + cutoffs
mealsRouter.get('/status', requireRole('MEMBER'), async (req, res) => {
  const lunchCut = await getSetting('meal.lunch_cutoff', '10:00');
  const dinnerCut = await getSetting('meal.dinner_cutoff', '19:30');
  const lunchTime = await getSetting('meal.lunch_time', '10:00');
  const dinnerTime = await getSetting('meal.dinner_time', '19:30');
  const now = dhakaTimeMinutes();
  res.json({
    date: dhakaDateStr(),
    nowMinutes: now,
    lunch: { cutoff: lunchCut, time: lunchTime, open: now < parseHM(lunchCut) },
    dinner: { cutoff: dinnerCut, time: dinnerTime, open: now < parseHM(dinnerCut) },
  });
});

// ---------- ADMIN endpoints ----------

// Admin: list effective meal entries (member-wise)
mealsRouter.get('/entries', requirePerm('meals.view'), async (req, res, next) => {
  try {
    const { date = '', month = '', memberId = '' } = req.query as any;
    const binds: Bind[] = [];
    let where = `e.STATUS='ACTIVE'`;
    if (date) { binds.push(toDateOnly(date)); where += ` AND TRUNC(e.MEAL_DATE)=TRUNC(:${binds.length})`; }
    else if (month) {
      const [y, m] = String(month).split('-').map(Number);
      binds.push(new Date(Date.UTC(y, m - 1, 1) - 6 * 3600 * 1000), new Date(Date.UTC(y, m, 1) - 6 * 3600 * 1000));
      where += ` AND e.MEAL_DATE>=:${binds.length - 1} AND e.MEAL_DATE<:${binds.length}`;
    }
    if (memberId) { binds.push(Number(memberId)); where += ` AND e.MEMBER_ID=:${binds.length}`; }

    const rows = await q(
      `SELECT e.MEAL_ENTRY_ID, e.MEAL_DATE, e.MEAL_TYPE, e.REGULAR_QTY, e.GUEST_QTY,
              e.SOURCE, e.STATUS, e.UPDATED_AT,
              m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME
       FROM MEAL_ENTRIES e JOIN MEMBERS m ON m.MEMBER_ID=e.MEMBER_ID
       WHERE ${where} ORDER BY e.MEAL_DATE DESC, e.MEAL_TYPE, m.FULL_NAME`, binds);
    res.json({ rows });
  } catch (e) { next(e); }
});

// Admin: list meal requests
mealsRouter.get('/requests', requirePerm('meals.view'), async (req, res, next) => {
  try {
    const { date = '', month = '', status = '' } = req.query as any;
    const binds: Bind[] = [];
    let where = '1=1';
    if (date) { binds.push(toDateOnly(date)); where += ` AND TRUNC(r.MEAL_DATE)=TRUNC(:${binds.length})`; }
    else if (month) {
      const [y, m] = String(month).split('-').map(Number);
      binds.push(new Date(Date.UTC(y, m - 1, 1) - 6 * 3600 * 1000), new Date(Date.UTC(y, m, 1) - 6 * 3600 * 1000));
      where += ` AND r.MEAL_DATE>=:${binds.length - 1} AND r.MEAL_DATE<:${binds.length}`;
    }
    if (status) { binds.push(status); where += ` AND r.STATUS=:${binds.length}`; }

    const rows = await q(
      `SELECT r.REQUEST_ID, r.MEAL_DATE, r.MEAL_TYPE, r.REGULAR_QTY, r.GUEST_QTY,
              r.STATUS, r.REVISION_NO, r.LOCKED_AT, r.OVERRIDE_REASON, r.UPDATED_AT,
              m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME
       FROM MEAL_REQUESTS r JOIN MEMBERS m ON m.MEMBER_ID=r.MEMBER_ID
       WHERE ${where}
         AND r.REVISION_NO = (SELECT MAX(r2.REVISION_NO) FROM MEAL_REQUESTS r2
                              WHERE r2.MEMBER_ID=r.MEMBER_ID AND TRUNC(r2.MEAL_DATE)=TRUNC(r.MEAL_DATE)
                                AND r2.MEAL_TYPE=r.MEAL_TYPE)
       ORDER BY r.MEAL_DATE DESC, r.MEAL_TYPE, m.FULL_NAME`, binds);
    res.json({ rows });
  } catch (e) { next(e); }
});

// Admin: manual meal entry (no request needed)
mealsRouter.post('/entries', requirePerm('meals.manage'), async (req, res, next) => {
  try {
    const { memberId, date, mealType, regularQty = 0 } = req.body || {};
    const type = String(mealType).toUpperCase();
    if (!memberId || !date || !['LUNCH', 'DINNER'].includes(type)) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const mealDate = toDateOnly(date);
    await assertMonthOpen(mealDate);

    const qty = Math.max(0, Number(regularQty));
    const id = await tx(async (conn) => {
      // Upsert: never create a second ACTIVE entry for the same member/date/type
      // (duplicates would be double-counted in every meal total).
      const existing = await conn.execute(
        `SELECT MEAL_ENTRY_ID FROM MEAL_ENTRIES
         WHERE MEMBER_ID=:1 AND TRUNC(MEAL_DATE)=TRUNC(:2) AND MEAL_TYPE=:3 AND STATUS='ACTIVE'`,
        [Number(memberId), mealDate, type],
        { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const rows = existing.rows as any[];
      if (rows.length) {
        await conn.execute(
          `UPDATE MEAL_ENTRIES SET REGULAR_QTY=:2, UPDATED_AT=SYSTIMESTAMP WHERE MEAL_ENTRY_ID=:1`,
          [rows[0].MEAL_ENTRY_ID, qty]);
        return Number(rows[0].MEAL_ENTRY_ID);
      }
      const outB = [] as any[];
      await conn.execute(
        `INSERT INTO MEAL_ENTRIES (MEMBER_ID, MEAL_DATE, MEAL_TYPE, REGULAR_QTY, GUEST_QTY, SOURCE, STATUS, CREATED_BY)
         VALUES (:1,:2,:3,:4,0,'ADMIN','ACTIVE',:5) RETURNING MEAL_ENTRY_ID INTO :6`,
        [Number(memberId), mealDate, type, qty, req.user!.userId,
         { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
      return Number(outB[0]);
    });
    await audit(req, 'CREATE', 'MEAL_ENTRY', id, null, req.body);
    res.status(201).json({ ok: true, mealEntryId: id });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Admin: update a meal entry
mealsRouter.put('/entries/:id', requirePerm('meals.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM MEAL_ENTRIES WHERE MEAL_ENTRY_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(before.MEAL_DATE);
    const { regularQty, status } = req.body || {};
    await tx(async (conn) => {
      await conn.execute(
        `UPDATE MEAL_ENTRIES SET REGULAR_QTY=NVL(:2,REGULAR_QTY), STATUS=NVL(:3,STATUS), UPDATED_AT=SYSTIMESTAMP
         WHERE MEAL_ENTRY_ID=:1`,
        [id, regularQty !== undefined ? Math.max(0, Number(regularQty)) : null,
         status && ['ACTIVE', 'CANCELLED', 'REVERSED'].includes(status) ? status : null]);
    });
    await audit(req, 'UPDATE', 'MEAL_ENTRY', id, before, req.body);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Admin: override/edit a locked request (requires reason)
mealsRouter.put('/requests/:id', requirePerm('meals.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM MEAL_REQUESTS WHERE REQUEST_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(before.MEAL_DATE);

    const { regularQty, reason } = req.body || {};
    const locked = !await isOpen(toDateOnly(before.MEAL_DATE), before.MEAL_TYPE);
    if (locked && !reason) return res.status(400).json({ error: 'REASON_REQUIRED_FOR_LOCKED' });
    if (locked && !req.user!.permissions.has('meals.override') && req.user!.roleName !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'OVERRIDE_NOT_PERMITTED' });
    }

    await tx(async (conn) => {
      await conn.execute(
        `UPDATE MEAL_REQUESTS SET REGULAR_QTY=:2,
           STATUS=CASE WHEN :3='LOCKED' OR :3='OVERRIDDEN' THEN 'OVERRIDDEN' ELSE 'SUBMITTED' END,
           OVERRIDE_REASON=:4, REVISION_NO=REVISION_NO+1, LOCKED_AT=NVL(LOCKED_AT,SYSTIMESTAMP),
           UPDATED_AT=SYSTIMESTAMP
         WHERE REQUEST_ID=:1`,
        [id, Math.max(0, Number(regularQty ?? before.REGULAR_QTY)), before.STATUS, reason || null]);
      await syncEntry(conn, Number(before.MEMBER_ID), toDateOnly(before.MEAL_DATE), before.MEAL_TYPE,
        Math.max(0, Number(regularQty ?? before.REGULAR_QTY)), id, req.user!.userId);
    });
    await audit(req, 'OVERRIDE', 'MEAL_REQUEST', id, before, req.body, reason);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Admin/Super Admin: delete an incorrect meal request (soft-delete + history)
mealsRouter.delete('/requests/:id', requirePerm('meals.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM MEAL_REQUESTS WHERE REQUEST_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    if (before.STATUS === 'DELETED') return res.status(409).json({ error: 'ALREADY_DELETED' });
    await assertMonthOpen(before.MEAL_DATE);

    await tx(async (conn) => {
      await conn.execute(
        `UPDATE MEAL_REQUESTS SET STATUS='DELETED', DELETED_BY=:2, DELETED_AT=SYSTIMESTAMP, UPDATED_AT=SYSTIMESTAMP
         WHERE REQUEST_ID=:1`, [id, req.user!.userId]);
      // Cancel the synced meal entry only if it was created by this request
      await conn.execute(
        `UPDATE MEAL_ENTRIES SET STATUS='CANCELLED', UPDATED_AT=SYSTIMESTAMP
         WHERE REQUEST_ID=:1 AND STATUS='ACTIVE'`, [id]);
    });
    await audit(req, 'DELETE', 'MEAL_REQUEST', id, before, { deletedBy: req.user!.userId });
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});
