import { Router } from 'express';
import oracledb from 'oracledb';
import { q, q1, tx, Bind, monthBounds } from '../db';
import { authMiddleware, requirePerm, requireRole } from '../middleware';
import { audit } from '../services/audit';
import { assertMonthOpen, MonthClosedError } from '../services/finance';
import { notifyMember, notify } from '../services/notify';
import { toDateOnly } from '../util';

export const depositsRouter = Router();
depositsRouter.use(authMiddleware);

const METHODS = ['CASH', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'OTHER'];

// ---------- MEMBER: own deposits ----------
depositsRouter.get('/my', requireRole('MEMBER'), async (req, res, next) => {
  try {
    const memberId = req.user!.memberId;
    if (!memberId) return res.status(403).json({ error: 'NO_MEMBER_PROFILE' });
    const month = String(req.query.month || '');
    const binds: Bind[] = [memberId];
    let monthFilter = '';
    if (/^\d{4}-\d{2}$/.test(month)) {
      const { start, end } = monthBounds(month);
      binds.push(start, end);
      monthFilter = ' AND DEPOSIT_DATE>=:2 AND DEPOSIT_DATE<:3';
    }
    const rows = await q(
      `SELECT DEPOSIT_ID, DEPOSIT_DATE, AMOUNT, PAYMENT_METHOD, TRANSACTION_REF, DESCRIPTION, STATUS, CREATED_AT
       FROM DEPOSITS WHERE MEMBER_ID=:1${monthFilter} ORDER BY DEPOSIT_DATE DESC, DEPOSIT_ID DESC FETCH FIRST 200 ROWS ONLY`,
      binds);
    res.json({ rows });
  } catch (e) { next(e); }
});

// ---------- ADMIN ----------
const adminGuard = requirePerm('deposits.manage');

depositsRouter.get('/', adminGuard, async (req, res, next) => {
  try {
    const { memberId = '', from = '', to = '', method = '', status = '', search = '', page = '1', pageSize = '20' } = req.query as any;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 20));
    const binds: Bind[] = [];
    let where = '1=1';
    if (memberId) { binds.push(Number(memberId)); where += ` AND d.MEMBER_ID=:${binds.length}`; }
    if (from) { binds.push(toDateOnly(from)); where += ` AND d.DEPOSIT_DATE>=:${binds.length}`; }
    if (to) { binds.push(toDateOnly(to)); where += ` AND d.DEPOSIT_DATE<=:${binds.length}`; }
    if (method) { binds.push(method); where += ` AND d.PAYMENT_METHOD=:${binds.length}`; }
    if (status) { binds.push(status); where += ` AND d.STATUS=:${binds.length}`; }
    if (search) {
      binds.push(`%${search}%`, `%${search}%`);
      const b = binds.length - 1;
      where += ` AND (UPPER(d.TRANSACTION_REF) LIKE UPPER(:${b}) OR UPPER(d.DESCRIPTION) LIKE UPPER(:${b + 1}))`;
    }

    const total = await q1<{ C: number }>(`SELECT COUNT(*) C FROM DEPOSITS d WHERE ${where}`, binds);
    binds.push((p - 1) * ps, ps);
    const rows = await q(
      `SELECT d.DEPOSIT_ID, d.MEMBER_ID, d.DEPOSIT_DATE, d.AMOUNT, d.PAYMENT_METHOD,
              d.TRANSACTION_REF, d.DESCRIPTION, d.STATUS, d.REVERSAL_OF_ID, d.CREATED_AT,
              m.MEMBER_CODE, m.FULL_NAME, u.USERNAME RECORDED_BY
       FROM DEPOSITS d
       JOIN MEMBERS m ON m.MEMBER_ID=d.MEMBER_ID
       LEFT JOIN USERS u ON u.USER_ID=d.CREATED_BY
       WHERE ${where} ORDER BY d.DEPOSIT_DATE DESC, d.DEPOSIT_ID DESC
       OFFSET :${binds.length - 1} ROWS FETCH NEXT :${binds.length} ROWS ONLY`, binds);
    res.json({ rows, total: Number(total?.C ?? 0), page: p, pageSize: ps });
  } catch (e) { next(e); }
});

depositsRouter.post('/', adminGuard, async (req, res, next) => {
  try {
    const { memberId, depositDate, amount, paymentMethod, transactionRef, description, receiptFileId } = req.body || {};
    if (!memberId || !depositDate || amount === undefined || !paymentMethod) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    if (!METHODS.includes(paymentMethod)) return res.status(400).json({ error: 'BAD_METHOD' });
    const amt = Number(amount);
    if (!amt) return res.status(400).json({ error: 'BAD_AMOUNT' });
    const ddate = toDateOnly(depositDate);
    await assertMonthOpen(ddate);

    const member = await q1(`SELECT MEMBER_ID FROM MEMBERS WHERE MEMBER_ID=:1`, [Number(memberId)]);
    if (!member) return res.status(404).json({ error: 'MEMBER_NOT_FOUND' });

    const outB = [] as any[];
    const id = await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO DEPOSITS (MEMBER_ID, DEPOSIT_DATE, AMOUNT, PAYMENT_METHOD, TRANSACTION_REF, DESCRIPTION, RECEIPT_FILE_ID, STATUS, CREATED_BY)
         VALUES (:1,:2,:3,:4,:5,:6,:7,'ACTIVE',:8) RETURNING DEPOSIT_ID INTO :9`,
        [Number(memberId), ddate, amt, paymentMethod, transactionRef || null, description || null,
         receiptFileId ? Number(receiptFileId) : null, req.user!.userId,
         { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
      return Number(outB[0]);
    });
    await audit(req, 'CREATE', 'DEPOSIT', id, null, { ...req.body, amount: amt });
    notifyMember(Number(memberId), 'Deposit Recorded', `৳${amt} deposit recorded via ${paymentMethod}.`, 'DEPOSIT');
    res.status(201).json({ ok: true, id });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Edit permitted fields
depositsRouter.put('/:id', adminGuard, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM DEPOSITS WHERE DEPOSIT_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    if (before.STATUS !== 'ACTIVE') return res.status(409).json({ error: 'NOT_EDITABLE' });
    await assertMonthOpen(before.DEPOSIT_DATE);
    const b = req.body || {};
    await tx(async (conn) => {
      await conn.execute(
        `UPDATE DEPOSITS SET DEPOSIT_DATE=NVL(:2,DEPOSIT_DATE), AMOUNT=NVL(:3,AMOUNT),
           PAYMENT_METHOD=NVL(:4,PAYMENT_METHOD), TRANSACTION_REF=NVL(:5,TRANSACTION_REF),
           DESCRIPTION=NVL(:6,DESCRIPTION), UPDATED_AT=SYSTIMESTAMP
         WHERE DEPOSIT_ID=:1`,
        [id, b.depositDate ? toDateOnly(b.depositDate) : null,
         b.amount !== undefined ? Number(b.amount) : null,
         b.paymentMethod ?? null, b.transactionRef ?? null, b.description ?? null]);
    });
    await audit(req, 'UPDATE', 'DEPOSIT', id, before, b);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Reverse a deposit (auditable: marks original REVERSED + inserts negative reversal)
depositsRouter.post('/:id/reverse', adminGuard, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM DEPOSITS WHERE DEPOSIT_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    if (before.STATUS !== 'ACTIVE') return res.status(409).json({ error: 'ALREADY_REVERSED' });
    await assertMonthOpen(before.DEPOSIT_DATE);
    const reason = req.body?.reason;
    if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });

    // ensure not already reversed
    const existingReversal = await q1(
      `SELECT DEPOSIT_ID FROM DEPOSITS WHERE REVERSAL_OF_ID=:1 AND STATUS='REVERSAL'`, [id]);
    if (existingReversal) return res.status(409).json({ error: 'ALREADY_REVERSED' });
    if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });

    await tx(async (conn) => {
      // original stays ACTIVE; a negative REVERSAL row offsets it (net = 0)
      await conn.execute(
        `INSERT INTO DEPOSITS (MEMBER_ID, DEPOSIT_DATE, AMOUNT, PAYMENT_METHOD, TRANSACTION_REF, DESCRIPTION, STATUS, REVERSAL_OF_ID, CREATED_BY)
         VALUES (:1,:2,:3,:4,:5,:6,'REVERSAL',:7,:8)`,
        [before.MEMBER_ID, before.DEPOSIT_DATE, -Number(before.AMOUNT), before.PAYMENT_METHOD,
         before.TRANSACTION_REF, `Reversal of deposit #${id}: ${reason}`, id, req.user!.userId]);
    });
    await audit(req, 'REVERSE', 'DEPOSIT', id, before, null, reason);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});
