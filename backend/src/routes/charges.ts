import { Router } from 'express';
import oracledb from 'oracledb';
import { q, q1, tx, Bind, monthBounds } from '../db';
import { authMiddleware, requirePerm, requireRole } from '../middleware';
import { audit } from '../services/audit';
import { assertMonthOpen, MonthClosedError } from '../services/finance';
import { notifyMember } from '../services/notify';
import { toDateOnly } from '../util';

export const chargesRouter = Router();
chargesRouter.use(authMiddleware);

// ---------- MEMBER: own charges ----------
chargesRouter.get('/my', requireRole('MEMBER'), async (req, res, next) => {
  try {
    const memberId = req.user!.memberId;
    if (!memberId) return res.status(403).json({ error: 'NO_MEMBER_PROFILE' });
    const month = String(req.query.month || '');
    const binds: Bind[] = [memberId];
    let monthFilter = '';
    if (/^\d{4}-\d{2}$/.test(month)) {
      const { start, end } = monthBounds(month);
      binds.push(start, end);
      monthFilter = ' AND CHARGE_DATE>=:2 AND CHARGE_DATE<:3';
    }
    const rows = await q(
      `SELECT CHARGE_ID, CHARGE_DATE, AMOUNT, CATEGORY, DESCRIPTION, REFERENCE, STATUS, CREATED_AT
       FROM OTHER_CHARGES WHERE MEMBER_ID=:1${monthFilter} ORDER BY CHARGE_DATE DESC FETCH FIRST 200 ROWS ONLY`,
      binds);
    res.json({ rows });
  } catch (e) { next(e); }
});

// ---------- ADMIN ----------
chargesRouter.get('/', requirePerm('expenses.manage'), async (req, res, next) => {
  try {
    const { memberId = '', from = '', to = '', category = '', status = '', page = '1', pageSize = '20' } = req.query as any;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 20));
    const binds: Bind[] = [];
    let where = '1=1';
    if (memberId) { binds.push(Number(memberId)); where += ` AND c.MEMBER_ID=:${binds.length}`; }
    if (from) { binds.push(toDateOnly(from)); where += ` AND c.CHARGE_DATE>=:${binds.length}`; }
    if (to) { binds.push(toDateOnly(to)); where += ` AND c.CHARGE_DATE<=:${binds.length}`; }
    if (category) { binds.push(category); where += ` AND UPPER(c.CATEGORY)=UPPER(:${binds.length})`; }
    if (status) { binds.push(status); where += ` AND c.STATUS=:${binds.length}`; }

    const total = await q1<{ C: number }>(`SELECT COUNT(*) C FROM OTHER_CHARGES c WHERE ${where}`, binds);
    binds.push((p - 1) * ps, ps);
    const rows = await q(
      `SELECT c.CHARGE_ID, c.MEMBER_ID, c.CHARGE_DATE, c.AMOUNT, c.CATEGORY, c.DESCRIPTION,
              c.REFERENCE, c.STATUS, c.CREATED_AT,
              m.MEMBER_CODE, m.FULL_NAME, u.USERNAME CREATED_BY_NAME
       FROM OTHER_CHARGES c
       JOIN MEMBERS m ON m.MEMBER_ID=c.MEMBER_ID
       LEFT JOIN USERS u ON u.USER_ID=c.CREATED_BY
       WHERE ${where} ORDER BY c.CHARGE_DATE DESC, c.CHARGE_ID DESC
       OFFSET :${binds.length - 1} ROWS FETCH NEXT :${binds.length} ROWS ONLY`, binds);
    res.json({ rows, total: Number(total?.C ?? 0), page: p, pageSize: ps });
  } catch (e) { next(e); }
});

chargesRouter.post('/', requirePerm('expenses.manage'), async (req, res, next) => {
  try {
    const { memberId, chargeDate, amount, category, description, reference } = req.body || {};
    if (!memberId || !chargeDate || amount === undefined) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const amt = Number(amount);
    if (!amt) return res.status(400).json({ error: 'BAD_AMOUNT' });
    const cdate = toDateOnly(chargeDate);
    await assertMonthOpen(cdate);

    const outB = [] as any[];
    const id = await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO OTHER_CHARGES (MEMBER_ID, CHARGE_DATE, AMOUNT, CATEGORY, DESCRIPTION, REFERENCE, STATUS, CREATED_BY)
         VALUES (:1,:2,:3,:4,:5,:6,'ACTIVE',:7) RETURNING CHARGE_ID INTO :8`,
        [Number(memberId), cdate, amt, category || null, description || null, reference || null,
         req.user!.userId, { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
      return Number(outB[0]);
    });
    await audit(req, 'CREATE', 'OTHER_CHARGE', id, null, { ...req.body, amount: amt });
    if (amt > 0) notifyMember(Number(memberId), 'New Charge', `A charge of ৳${amt} was added: ${description || category || ''}.`, 'CHARGE');
    res.status(201).json({ ok: true, id });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

chargesRouter.put('/:id', requirePerm('expenses.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM OTHER_CHARGES WHERE CHARGE_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    if (before.STATUS !== 'ACTIVE') return res.status(409).json({ error: 'NOT_EDITABLE' });
    await assertMonthOpen(before.CHARGE_DATE);
    const b = req.body || {};
    await tx(async (conn) => {
      await conn.execute(
        `UPDATE OTHER_CHARGES SET CHARGE_DATE=NVL(:2,CHARGE_DATE), AMOUNT=NVL(:3,AMOUNT),
           CATEGORY=NVL(:4,CATEGORY), DESCRIPTION=NVL(:5,DESCRIPTION), REFERENCE=NVL(:6,REFERENCE),
           UPDATED_AT=SYSTIMESTAMP WHERE CHARGE_ID=:1`,
        [id, b.chargeDate ? toDateOnly(b.chargeDate) : null,
         b.amount !== undefined ? Number(b.amount) : null,
         b.category ?? null, b.description ?? null, b.reference ?? null]);
    });
    await audit(req, 'UPDATE', 'OTHER_CHARGE', id, before, b);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

chargesRouter.post('/:id/reverse', requirePerm('expenses.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM OTHER_CHARGES WHERE CHARGE_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    if (before.STATUS !== 'ACTIVE') return res.status(409).json({ error: 'ALREADY_REVERSED' });
    await assertMonthOpen(before.CHARGE_DATE);
    await q(`UPDATE OTHER_CHARGES SET STATUS='REVERSED', UPDATED_AT=SYSTIMESTAMP WHERE CHARGE_ID=:1`, [id]);
    await audit(req, 'REVERSE', 'OTHER_CHARGE', id, before, null, req.body?.reason);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});
