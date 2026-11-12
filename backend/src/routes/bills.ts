import { Router } from 'express';
import oracledb, { Connection } from 'oracledb';
import { q, q1, tx, Bind } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { audit } from '../services/audit';
import { assertMonthOpen, MonthClosedError, eligibleMembersForMonth, equalAllocation } from '../services/finance';
import { notifyAllMembers } from '../services/notify';
import { toDateOnly } from '../util';

export const billsRouter = Router();
billsRouter.use(authMiddleware);
billsRouter.use(requirePerm('bills.manage'));

async function allocateBill(conn: Connection, billId: number, month: string, amount: number, userId: number | null) {
  // remove existing allocations then rebuild
  await conn.execute(`DELETE FROM BILL_ALLOCATIONS WHERE BILL_ID=:1`, [billId]);
  const memberIds = await eligibleMembersForMonth(month);
  if (!memberIds.length) return { allocated: 0, members: 0 };
  const alloc = equalAllocation(amount, memberIds);
  for (const [memberId, amt] of alloc) {
    await conn.execute(
      `INSERT INTO BILL_ALLOCATIONS (BILL_ID, MEMBER_ID, ALLOCATED_AMOUNT, IS_ELIGIBLE)
       VALUES (:1,:2,:3,1)`, [billId, memberId, amt]);
  }
  return { allocated: memberIds.length, members: memberIds.length };
}

// List bills
billsRouter.get('/', async (req, res, next) => {
  try {
    const { month = '', categoryId = '', status = '', page = '1', pageSize = '50' } = req.query as any;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 50));
    const binds: Bind[] = [];
    let where = '1=1';
    if (month) { binds.push(month); where += ` AND b.BILL_MONTH=:${binds.length}`; }
    if (categoryId) { binds.push(Number(categoryId)); where += ` AND b.BILL_CATEGORY_ID=:${binds.length}`; }
    if (status) { binds.push(status); where += ` AND b.STATUS=:${binds.length}`; }

    const total = await q1<{ C: number }>(
      `SELECT COUNT(*) C FROM MONTHLY_BILLS b WHERE ${where}`, binds);
    binds.push(ps, (p - 1) * ps);
    const rows = await q(
      `SELECT b.BILL_ID, b.BILL_MONTH, b.AMOUNT, b.BILL_DATE, b.DUE_DATE, b.DESCRIPTION,
              b.PAYMENT_STATUS, b.STATUS, b.CREATED_AT,
              c.BILL_CATEGORY_ID, c.CATEGORY_NAME, c.ALLOCATION_METHOD,
              u.USERNAME CREATED_BY_NAME,
              (SELECT COUNT(*) FROM BILL_ALLOCATIONS a WHERE a.BILL_ID=b.BILL_ID AND a.IS_ELIGIBLE=1) ALLOC_COUNT,
              (SELECT NVL(SUM(a.ALLOCATED_AMOUNT),0) FROM BILL_ALLOCATIONS a WHERE a.BILL_ID=b.BILL_ID AND a.IS_ELIGIBLE=1) ALLOC_SUM
       FROM MONTHLY_BILLS b
       JOIN BILL_CATEGORIES c ON c.BILL_CATEGORY_ID=b.BILL_CATEGORY_ID
       LEFT JOIN USERS u ON u.USER_ID=b.CREATED_BY
       WHERE ${where} ORDER BY b.BILL_MONTH DESC, b.BILL_ID DESC
       OFFSET :${binds.length - 1} ROWS FETCH NEXT :${binds.length} ROWS ONLY`, binds);
    res.json({ rows, total: Number(total?.C ?? 0), page: p, pageSize: ps });
  } catch (e) { next(e); }
});

billsRouter.get('/categories', async (_req, res, next) => {
  try {
    const rows = await q(`SELECT * FROM BILL_CATEGORIES WHERE IS_ACTIVE=1 ORDER BY CATEGORY_NAME`);
    res.json({ rows });
  } catch (e) { next(e); }
});

// Create bill + auto allocation
billsRouter.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { billMonth, billCategoryId, amount, billDate, dueDate, description, receiptFileId, memberIds } = b;
    if (!billMonth || !billCategoryId || amount === undefined) return res.status(400).json({ error: 'MISSING_FIELDS' });
    if (!/^\d{4}-\d{2}$/.test(billMonth)) return res.status(400).json({ error: 'BAD_MONTH' });
    const amt = Number(amount);
    if (!(amt > 0)) return res.status(400).json({ error: 'BAD_AMOUNT' });

    const outB = [] as any[];
    const id = await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO MONTHLY_BILLS (BILL_MONTH, BILL_CATEGORY_ID, AMOUNT, BILL_DATE, DUE_DATE, DESCRIPTION, RECEIPT_FILE_ID, PAYMENT_STATUS, STATUS, CREATED_BY)
         VALUES (:1,:2,:3,:4,:5,:6,:7,'UNPAID','ACTIVE',:8) RETURNING BILL_ID INTO :9`,
        [billMonth, Number(billCategoryId), amt,
         billDate ? toDateOnly(billDate) : null, dueDate ? toDateOnly(dueDate) : null,
         description || null, receiptFileId ? Number(receiptFileId) : null, req.user!.userId,
         { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
      const billId = Number(outB[0]);

      // allocation: explicit memberIds or all eligible
      await conn.execute(`DELETE FROM BILL_ALLOCATIONS WHERE BILL_ID=:1`, [billId]);
      let ids = Array.isArray(memberIds) && memberIds.length ? memberIds.map(Number) : await eligibleMembersForMonth(billMonth);
      const alloc = equalAllocation(amt, ids);
      for (const [mid, a] of alloc) {
        await conn.execute(
          `INSERT INTO BILL_ALLOCATIONS (BILL_ID, MEMBER_ID, ALLOCATED_AMOUNT, IS_ELIGIBLE) VALUES (:1,:2,:3,1)`,
          [billId, mid, a]);
      }
      return billId;
    });

    await audit(req, 'CREATE', 'MONTHLY_BILL', id, null, { ...b, amount: amt });
    notifyAllMembers('New Monthly Bill', `A new bill of ৳${amt} was added for ${billMonth}.`).catch(() => {});
    res.status(201).json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

// Bill detail incl. allocations
billsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const bill = await q1(
      `SELECT b.*, c.CATEGORY_NAME, c.ALLOCATION_METHOD FROM MONTHLY_BILLS b
       JOIN BILL_CATEGORIES c ON c.BILL_CATEGORY_ID=b.BILL_CATEGORY_ID WHERE b.BILL_ID=:1`, [id]);
    if (!bill) return res.status(404).json({ error: 'NOT_FOUND' });
    const allocations = await q(
      `SELECT a.*, m.MEMBER_CODE, m.FULL_NAME FROM BILL_ALLOCATIONS a
       JOIN MEMBERS m ON m.MEMBER_ID=a.MEMBER_ID WHERE a.BILL_ID=:1 ORDER BY m.FULL_NAME`, [id]);
    const payments = await q(`SELECT * FROM PAYMENTS WHERE BILL_ID=:1 ORDER BY PAYMENT_DATE DESC`, [id]);
    res.json({ bill, allocations, payments });
  } catch (e) { next(e); }
});

// Update bill (re-allocates if amount/month/members change)
billsRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM MONTHLY_BILLS WHERE BILL_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(before.BILL_MONTH + '-01');
    const b = req.body || {};
    const newMonth = b.billMonth || before.BILL_MONTH;
    const newAmt = b.amount !== undefined ? Number(b.amount) : Number(before.AMOUNT);

    await tx(async (conn) => {
      await conn.execute(
        `UPDATE MONTHLY_BILLS SET BILL_MONTH=:2, BILL_CATEGORY_ID=NVL(:3,BILL_CATEGORY_ID), AMOUNT=:4,
           BILL_DATE=NVL(:5,BILL_DATE), DUE_DATE=NVL(:6,DUE_DATE), DESCRIPTION=NVL(:7,DESCRIPTION),
           PAYMENT_STATUS=NVL(:8,PAYMENT_STATUS), UPDATED_AT=SYSTIMESTAMP
         WHERE BILL_ID=:1`,
        [id, newMonth, b.billCategoryId ? Number(b.billCategoryId) : null, newAmt,
         b.billDate ? toDateOnly(b.billDate) : null, b.dueDate ? toDateOnly(b.dueDate) : null,
         b.description ?? null, b.paymentStatus ?? null]);
      if (b.memberIds || b.amount !== undefined || b.billMonth) {
        let ids = Array.isArray(b.memberIds) && b.memberIds.length ? b.memberIds.map(Number) : await eligibleMembersForMonth(newMonth);
        await conn.execute(`DELETE FROM BILL_ALLOCATIONS WHERE BILL_ID=:1`, [id]);
        const alloc = equalAllocation(newAmt, ids);
        for (const [mid, a] of alloc) {
          await conn.execute(`INSERT INTO BILL_ALLOCATIONS (BILL_ID, MEMBER_ID, ALLOCATED_AMOUNT, IS_ELIGIBLE) VALUES (:1,:2,:3,1)`, [id, mid, a]);
        }
      }
    });
    await audit(req, 'UPDATE', 'MONTHLY_BILL', id, before, b);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Exclude/include a member from a bill allocation
billsRouter.put('/:id/allocations/:memberId', async (req, res, next) => {
  try {
    const billId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const { isEligible, exclusionReason } = req.body || {};
    const before = await q1<any>(`SELECT * FROM BILL_ALLOCATIONS WHERE BILL_ID=:1 AND MEMBER_ID=:2`, [billId, memberId]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    const bill = await q1<any>(`SELECT BILL_MONTH FROM MONTHLY_BILLS WHERE BILL_ID=:1`, [billId]);
    await assertMonthOpen((bill?.BILL_MONTH || '1970-01') + '-01');

    await q(
      `UPDATE BILL_ALLOCATIONS SET IS_ELIGIBLE=:3, EXCLUSION_REASON=:4 WHERE BILL_ID=:1 AND MEMBER_ID=:2`,
      [billId, memberId, isEligible ? 1 : 0, exclusionReason || null]);
    await audit(req, 'UPDATE', 'BILL_ALLOCATION', `${billId}:${memberId}`, before, req.body);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Reverse bill
billsRouter.post('/:id/reverse', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM MONTHLY_BILLS WHERE BILL_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(before.BILL_MONTH + '-01');
    await q(`UPDATE MONTHLY_BILLS SET STATUS='REVERSED', UPDATED_AT=SYSTIMESTAMP WHERE BILL_ID=:1`, [id]);
    await audit(req, 'REVERSE', 'MONTHLY_BILL', id, before, null, req.body?.reason);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Record a payment against a bill
billsRouter.post('/:id/payments', async (req, res, next) => {
  try {
    const billId = Number(req.params.id);
    const { paymentDate, amount, paymentMethod, transactionRef, description } = req.body || {};
    if (!paymentDate || amount === undefined) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const bill = await q1<any>(`SELECT * FROM MONTHLY_BILLS WHERE BILL_ID=:1`, [billId]);
    if (!bill) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(bill.BILL_MONTH + '-01');

    const outB = [] as any[];
    const pid = await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO PAYMENTS (BILL_ID, PAYMENT_DATE, AMOUNT, PAYMENT_METHOD, TRANSACTION_REF, DESCRIPTION, CREATED_BY)
         VALUES (:1,:2,:3,:4,:5,:6,:7) RETURNING PAYMENT_ID INTO :8`,
        [billId, toDateOnly(paymentDate), Number(amount), paymentMethod || null,
         transactionRef || null, description || null, req.user!.userId,
         { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
      // update payment status
      const paid = await q1<{ T: number }>(
        `SELECT NVL(SUM(AMOUNT),0) T FROM PAYMENTS WHERE BILL_ID=:1`, [billId]);
      const totalPaid = Number(paid?.T ?? 0);
      const status = totalPaid >= Number(bill.AMOUNT) ? 'PAID' : totalPaid > 0 ? 'PARTIAL' : 'UNPAID';
      await conn.execute(`UPDATE MONTHLY_BILLS SET PAYMENT_STATUS=:2, UPDATED_AT=SYSTIMESTAMP WHERE BILL_ID=:1`, [billId, status]);
      return Number(outB[0]);
    });
    await audit(req, 'CREATE', 'PAYMENT', pid, null, req.body);
    res.status(201).json({ ok: true, id: pid });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});
