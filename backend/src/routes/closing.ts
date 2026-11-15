import { Router } from 'express';
import oracledb from 'oracledb';
import { q, q1, tx, clobText } from '../db';
import { authMiddleware, requirePerm, requireRole } from '../middleware';
import { audit } from '../services/audit';
import { monthFinancials, memberMonthBreakdown, isMonthClosed } from '../services/finance';
import { notifyAllMembers } from '../services/notify';

export const closingRouter = Router();
closingRouter.use(authMiddleware);

// List closings
closingRouter.get('/', requirePerm('closing.view'), async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT c.CLOSING_ID, c.ACCOUNT_MONTH, c.STATUS, c.CLOSED_AT, c.REOPENED_AT,
              c.REOPEN_REASON, c.REOPEN_COUNT, cu.USERNAME CLOSED_BY_NAME, ru.USERNAME REOPENED_BY_NAME
       FROM MONTHLY_CLOSINGS c
       LEFT JOIN USERS cu ON cu.USER_ID=c.CLOSED_BY
       LEFT JOIN USERS ru ON ru.USER_ID=c.REOPENED_BY
       WHERE c.MESS_ID=${req.messId!} ORDER BY c.ACCOUNT_MONTH DESC`);
    res.json({ rows });
  } catch (e) { next(e); }
});

// Pre-close validation summary
closingRouter.get('/:month/validate', requirePerm('closing.view'), async (req, res, next) => {
  try {
    const month = String(req.params.month);
    const fin = await monthFinancials(month, req.messId);
    const [breakdown, counts] = await Promise.all([
      memberMonthBreakdown(month, req.messId, fin),
      q1<any>(
        `SELECT
          (SELECT COUNT(*) FROM MEAL_ENTRIES e WHERE e.STATUS='ACTIVE' AND e.MESS_ID=:8 AND TO_CHAR(e.MEAL_DATE + INTERVAL '6' HOUR,'YYYY-MM')=:1) MEALS,
          (SELECT COUNT(*) FROM GUEST_MEALS g WHERE g.STATUS='ACTIVE' AND g.MESS_ID=:8 AND TO_CHAR(g.MEAL_DATE + INTERVAL '6' HOUR,'YYYY-MM')=:2) GUESTS,
          (SELECT COUNT(*) FROM BAZAR_EXPENSES b WHERE b.STATUS='ACTIVE' AND b.MESS_ID=:8 AND b.ACCOUNT_MONTH=:3) BAZAR,
          (SELECT COUNT(*) FROM MONTHLY_BILLS b WHERE b.STATUS='ACTIVE' AND b.MESS_ID=:8 AND b.BILL_MONTH=:4) BILLS,
          (SELECT COUNT(*) FROM BILL_ALLOCATIONS a JOIN MONTHLY_BILLS b ON b.BILL_ID=a.BILL_ID WHERE b.BILL_MONTH=:5 AND b.STATUS='ACTIVE' AND b.MESS_ID=:8) ALLOCS,
          (SELECT COUNT(*) FROM DEPOSITS d WHERE d.STATUS IN ('ACTIVE','REVERSAL') AND d.MESS_ID=:8 AND TO_CHAR(d.DEPOSIT_DATE + INTERVAL '6' HOUR,'YYYY-MM')=:6) DEPOSITS,
          (SELECT COUNT(*) FROM OTHER_CHARGES c WHERE c.STATUS='ACTIVE' AND c.MESS_ID=:8 AND TO_CHAR(c.CHARGE_DATE + INTERVAL '6' HOUR,'YYYY-MM')=:7) CHARGES
        FROM DUAL`, [month, month, month, month, month, month, month, req.messId!]),
    ]);

    const issues: string[] = [];
    if (fin.totalMeals === 0 && fin.foodExpense > 0) issues.push('FOOD_EXPENSE_WITHOUT_MEALS');
    if (counts && Number(counts.BILLS) > 0 && Number(counts.ALLOCS) === 0) issues.push('BILLS_WITHOUT_ALLOCATIONS');

    res.json({ month, financials: fin, memberCount: breakdown.length, counts, issues, canClose: issues.length === 0 });
  } catch (e) { next(e); }
});

// Close a month — creates permanent snapshot
closingRouter.post('/:month/close', requirePerm('closing.manage'), async (req, res, next) => {
  try {
    const month = String(req.params.month);
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'BAD_MONTH' });
    if (await isMonthClosed(month, req.messId)) return res.status(409).json({ error: 'ALREADY_CLOSED' });

    const fin = await monthFinancials(month, req.messId);
    const breakdown = await memberMonthBreakdown(month, req.messId, fin);
    const snapshot = JSON.stringify({ financials: fin, members: breakdown, closedAt: new Date().toISOString() });

    await tx(async (conn) => {
      // upsert monthly account
      await conn.execute(
        `MERGE INTO MONTHLY_ACCOUNTS a USING (SELECT :1 M, :3 MID FROM DUAL)
         ON (a.ACCOUNT_MONTH = :1 AND a.MESS_ID = :3)
         WHEN MATCHED THEN UPDATE SET MEAL_RATE=:2, STATUS='CLOSED', UPDATED_AT=SYSTIMESTAMP
         WHEN NOT MATCHED THEN INSERT (ACCOUNT_MONTH, MEAL_RATE, STATUS, MESS_ID) VALUES (:1,:2,'CLOSED',:3)`,
        [month, fin.mealRate, req.messId!]);

      // persist member summaries
      for (const b of breakdown) {
        await conn.execute(
          `MERGE INTO MEMBER_MONTHLY_SUMMARY s USING (SELECT :1 M, :2 MB FROM DUAL)
           ON (s.ACCOUNT_MONTH=:1 AND s.MEMBER_ID=:2 AND s.MESS_ID=:11)
           WHEN MATCHED THEN UPDATE SET REGULAR_MEALS=:3, GUEST_MEALS=:4, FOOD_COST=:5,
             BILL_ALLOCATION=:6, OTHER_CHARGES=:7, TOTAL_PAYABLE=:8, TOTAL_DEPOSITS=:9, BALANCE=:10, UPDATED_AT=SYSTIMESTAMP
           WHEN NOT MATCHED THEN INSERT (ACCOUNT_MONTH, MEMBER_ID, REGULAR_MEALS, GUEST_MEALS, FOOD_COST,
             BILL_ALLOCATION, OTHER_CHARGES, TOTAL_PAYABLE, TOTAL_DEPOSITS, BALANCE, MESS_ID)
           VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11)`,
          [month, b.memberId, b.regularMeals, b.guestMeals, b.foodCost, b.billAllocation,
           b.otherCharges, b.totalPayable, b.totalDeposits, b.balance, req.messId!]);
      }

      const outB = [] as any[];
      await conn.execute(
        `INSERT INTO MONTHLY_CLOSINGS (ACCOUNT_MONTH, STATUS, SNAPSHOT, CLOSED_BY, MESS_ID)
         VALUES (:1,'CLOSED',:2,:3,:5) RETURNING CLOSING_ID INTO :4`,
        [month, snapshot, req.user!.userId, { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }, req.messId!],
        { outBinds: outB });
    });

    await audit(req, 'CLOSE_MONTH', 'MONTHLY_CLOSING', month, null, { mealRate: fin.mealRate, members: breakdown.length });
    notifyAllMembers('Month Closed', `Accounts for ${month} have been closed. Final meal rate: ${fin.mealRate}.`, 'CLOSING', req.messId);
    res.json({ ok: true, month, mealRate: fin.mealRate });
  } catch (e) { next(e); }
});

// Reopen a closed month (requires reason)
closingRouter.post('/:month/reopen', requirePerm('closing.reopen'), async (req, res, next) => {
  try {
    const month = String(req.params.month);
    const reason = String(req.body?.reason || '');
    if (!reason) return res.status(400).json({ error: 'REASON_REQUIRED' });
    const closing = await q1<any>(
      `SELECT * FROM MONTHLY_CLOSINGS WHERE ACCOUNT_MONTH=:1 AND MESS_ID=${req.messId!}
       ORDER BY CLOSING_ID DESC FETCH FIRST 1 ROWS ONLY`, [month]);
    if (!closing) return res.status(404).json({ error: 'NOT_CLOSED' });
    if (closing.STATUS === 'REOPENED') return res.status(409).json({ error: 'ALREADY_REOPENED' });

    await tx(async (conn) => {
      await conn.execute(
        `UPDATE MONTHLY_CLOSINGS SET STATUS='REOPENED', REOPENED_BY=:2, REOPENED_AT=SYSTIMESTAMP,
           REOPEN_REASON=:3, REOPEN_COUNT=REOPEN_COUNT+1 WHERE CLOSING_ID=:4`,
        [month, req.user!.userId, reason, closing.CLOSING_ID]);
      await conn.execute(
        `UPDATE MONTHLY_ACCOUNTS SET STATUS='OPEN', UPDATED_AT=SYSTIMESTAMP WHERE ACCOUNT_MONTH=:1 AND MESS_ID=${req.messId!}`, [month]);
    });
    await audit(req, 'REOPEN_MONTH', 'MONTHLY_CLOSING', month, { status: 'CLOSED' }, { status: 'REOPENED' }, reason);
    notifyAllMembers('Month Reopened', `Accounts for ${month} were reopened.`, 'CLOSING', req.messId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Get snapshot for a closed month
closingRouter.get('/:month/snapshot', requirePerm('closing.view'), async (req, res, next) => {
  try {
    const closing = await q1<any>(
      `SELECT * FROM MONTHLY_CLOSINGS WHERE ACCOUNT_MONTH=:1 AND MESS_ID=${req.messId!}
       ORDER BY CLOSING_ID DESC FETCH FIRST 1 ROWS ONLY`, [req.params.month]);
    if (!closing) return res.status(404).json({ error: 'NOT_FOUND' });
    const snapText = await clobText(closing.SNAPSHOT);
    const { SNAPSHOT, ...closingMeta } = closing;
    res.json({ closing: closingMeta, snapshot: snapText ? JSON.parse(snapText) : null });
  } catch (e) { next(e); }
});
