import { Router } from 'express';
import oracledb from 'oracledb';
import { q, q1, tx, Bind } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { audit } from '../services/audit';
import { emitToMess } from '../socket';
import { assertMonthOpen, MonthClosedError } from '../services/finance';
import { toDateOnly } from '../util';
import { q1 as _q1 } from '../db';

export const bazarRouter = Router();
bazarRouter.use(authMiddleware);
bazarRouter.use(requirePerm('bazar.manage'));

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Active calculation system: 'EXISTING' | 'ONE_CREDIT' */
async function calcSystem(messId?: number | null): Promise<string> {
  const r = await _q1<{ SETTING_VALUE: any }>(
    `SELECT SETTING_VALUE FROM SYSTEM_SETTINGS WHERE SETTING_KEY='calc.system' AND (MESS_ID IS NULL OR MESS_ID=:1) ORDER BY MESS_ID DESC FETCH FIRST 1 ROWS ONLY`, [messId ?? -1]);
  const v = r?.SETTING_VALUE;
  const s = typeof v === 'string' ? v : (v?.getData ? await new Promise<string>(res => v.getData((e: any, d: string) => res(d || ''))) : '');
  return String(s || 'EXISTING').replace(/^"|"$/g, '').trim() || 'EXISTING';
}
const oneCredit = async (messId?: number | null) => (await calcSystem(messId)) === 'ONE_CREDIT';

/** Reverse an auto-credit deposit if present (sets STATUS='REVERSED'). */
async function reverseAutoCredit(conn: any, depositId: number | null) {
  if (!depositId) return;
  await conn.execute(
    `UPDATE DEPOSITS SET STATUS='REVERSED', UPDATED_AT=SYSTIMESTAMP WHERE DEPOSIT_ID=:1 AND STATUS='ACTIVE'`,
    [depositId]);
}
/** Create/update the auto bazar credit inside the same transaction. */
async function syncAutoCredit(conn: any, opts: {
  bazarId: number; memberId: number | null; amount: number; date: Date; desc: string; userId: number | null;
  existingDepositId: number | null;
  messId?: number | null;
}) {
  const { bazarId, memberId, amount, date, desc, userId, existingDepositId, messId } = opts;
  // no payer or non-positive amount → ensure no stale credit remains
  if (!memberId || amount <= 0) { await reverseAutoCredit(conn, existingDepositId); return null; }
  const label = `Auto Bazar Credit: ${desc}`.slice(0, 200);
  if (existingDepositId) {
    // payer/amount/date changed → update the linked deposit (keep history via audit)
    const st = await conn.execute(
      `SELECT STATUS FROM DEPOSITS WHERE DEPOSIT_ID=:1`, [existingDepositId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const rows = st.rows as any[];
    if (rows.length && rows[0].STATUS === 'ACTIVE') {
      await conn.execute(
        `UPDATE DEPOSITS SET MEMBER_ID=:2, DEPOSIT_DATE=:3, AMOUNT=:4, DESCRIPTION=:5, UPDATED_AT=SYSTIMESTAMP
         WHERE DEPOSIT_ID=:1`,
        [existingDepositId, memberId, date, amount, label]);
      await conn.execute(`UPDATE BAZAR_EXPENSES SET CREDIT_DEPOSIT_ID=:2 WHERE BAZAR_ID=:1`, [bazarId, existingDepositId]);
      return existingDepositId;
    }
    // credit was reversed manually → fall through and create a fresh one
  }
  const outB = [] as any[];
  await conn.execute(
    `INSERT INTO DEPOSITS (MEMBER_ID, DEPOSIT_DATE, AMOUNT, PAYMENT_METHOD, DESCRIPTION, STATUS, SOURCE_TYPE, SOURCE_ID, CREATED_BY, MESS_ID)
     VALUES (:1,:2,:3,'CASH',:4,'ACTIVE','BAZAR_AUTO',:5,:6,:8) RETURNING DEPOSIT_ID INTO :7`,
    [memberId, date, amount, label, bazarId, userId, messId ?? null,
     { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
  const depId = Number(outB[0]);
  await conn.execute(`UPDATE BAZAR_EXPENSES SET CREDIT_DEPOSIT_ID=:2 WHERE BAZAR_ID=:1`, [bazarId, depId]);
  return depId;
}

// List bazar expenses
bazarRouter.get('/', async (req, res, next) => {
  try {
    const { search = '', category = '', memberId = '', month = '', from = '', to = '', status = '', page = '1', pageSize = '20' } = req.query as any;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 20));
    const binds: Bind[] = [];
    let where = `e.MESS_ID = ${req.messId!}`;
    if (search) {
      binds.push(`%${search}%`, `%${search}%`);
      const b = binds.length - 1;
      where += ` AND (UPPER(e.ITEM_NAME) LIKE UPPER(:${b}) OR UPPER(e.DESCRIPTION) LIKE UPPER(:${b + 1}))`;
    }
    if (category) { binds.push(category); where += ` AND e.CATEGORY=:${binds.length}`; }
    if (memberId) { binds.push(Number(memberId)); where += ` AND e.PURCHASED_BY_MEMBER_ID=:${binds.length}`; }
    if (month) { binds.push(month); where += ` AND e.ACCOUNT_MONTH=:${binds.length}`; }
    if (from) { binds.push(toDateOnly(from)); where += ` AND e.PURCHASE_DATE>=:${binds.length}`; }
    if (to) { binds.push(toDateOnly(to)); where += ` AND e.PURCHASE_DATE<=:${binds.length}`; }
    if (status) { binds.push(status); where += ` AND e.STATUS=:${binds.length}`; }

    const total = await q1<{ C: number }>(`SELECT COUNT(*) C FROM BAZAR_EXPENSES e WHERE ${where}`, binds);
    binds.push((p - 1) * ps, ps);
    const rows = await q(
      `SELECT e.BAZAR_ID, e.PURCHASE_DATE, e.ITEM_NAME, e.CATEGORY, e.QUANTITY, e.UNIT,
              e.UNIT_PRICE, e.TOTAL_PRICE, e.DESCRIPTION, e.ACCOUNT_MONTH, e.STATUS, e.UPDATED_AT,
              m.MEMBER_ID, m.FULL_NAME PURCHASED_BY_NAME, u.USERNAME CREATED_BY_NAME
       FROM BAZAR_EXPENSES e
       LEFT JOIN MEMBERS m ON m.MEMBER_ID=e.PURCHASED_BY_MEMBER_ID
       LEFT JOIN USERS u ON u.USER_ID=e.CREATED_BY
       WHERE ${where} ORDER BY e.PURCHASE_DATE DESC, e.BAZAR_ID DESC
       OFFSET :${binds.length - 1} ROWS FETCH NEXT :${binds.length} ROWS ONLY`, binds);
    res.json({ rows, total: Number(total?.C ?? 0), page: p, pageSize: ps });
  } catch (e) { next(e); }
});

// Categories
bazarRouter.get('/categories', async (_req, res, next) => {
  try {
    const rows = await q(`SELECT * FROM EXPENSE_CATEGORIES WHERE IS_ACTIVE=1 ORDER BY CATEGORY_NAME`);
    res.json({ rows });
  } catch (e) { next(e); }
});

// Create
bazarRouter.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { itemName, category, quantity = 1, unit, unitPrice, purchaseDate, purchasedByMemberId, description, receiptFileId, paymentSource } = b;
    if (!itemName || unitPrice === undefined || !purchaseDate) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const pdate = toDateOnly(purchaseDate);
    await assertMonthOpen(pdate, req.messId);
    const qty = Number(quantity) || 1;
    const up = Number(unitPrice) || 0;
    const total = round2(qty * up);
    const month = pdate.toISOString().slice(0, 7);
    const payerId = purchasedByMemberId ? Number(purchasedByMemberId) : null;
    if (payerId) {
      const pm = await q1(`SELECT MEMBER_ID FROM MEMBERS WHERE MEMBER_ID=:1 AND MESS_ID=:2`, [payerId, req.messId!]);
      if (!pm) return res.status(400).json({ error: 'MEMBER_NOT_IN_MESS' });
    }
    const src = String(paymentSource || 'PERSONAL').toUpperCase() === 'COMMON' ? 'COMMON' : 'PERSONAL';
    const creditEligible = (await oneCredit(req.messId)) && src === 'PERSONAL' && !!payerId;

    const outB = [] as any[];
    const id = await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO BAZAR_EXPENSES (PURCHASE_DATE, ITEM_NAME, CATEGORY, QUANTITY, UNIT, UNIT_PRICE, TOTAL_PRICE,
           PURCHASED_BY_MEMBER_ID, DESCRIPTION, RECEIPT_FILE_ID, ACCOUNT_MONTH, STATUS, CREATED_BY, PAYMENT_SOURCE, MESS_ID)
         VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,'ACTIVE',:12,:13,:14) RETURNING BAZAR_ID INTO :15`,
        [pdate, itemName, category || null, qty, unit || null, up, total,
         payerId, description || null,
         receiptFileId ? Number(receiptFileId) : null, month, req.user!.userId, src,
         req.messId!,
         { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
      const newId = Number(outB[0]);
      if (creditEligible) {
        await syncAutoCredit(conn, { bazarId: newId, memberId: payerId, amount: total, date: pdate,
          desc: `${itemName} (${pdate.toISOString().slice(0, 10)})`, userId: req.user!.userId, existingDepositId: null, messId: req.messId });
      }
      return newId;
    });
    await audit(req, 'CREATE', 'BAZAR_EXPENSE', id, null, { ...b, totalPrice: total });
    res.status(201).json({ ok: true, id, totalPrice: total });
    emitToMess(req.messId, 'data:bazar', {});
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Update
bazarRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM BAZAR_EXPENSES WHERE BAZAR_ID=:1 AND MESS_ID=${req.messId!}`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(before.PURCHASE_DATE, req.messId);
    const b = req.body || {};
    const qty = b.quantity !== undefined ? Number(b.quantity) : Number(before.QUANTITY);
    const up = b.unitPrice !== undefined ? Number(b.unitPrice) : Number(before.UNIT_PRICE);
    const total = round2(qty * up);
    const pdate = b.purchaseDate ? toDateOnly(b.purchaseDate) : before.PURCHASE_DATE;
    const month = pdate.toISOString().slice(0, 7);

    const newPayer = b.purchasedByMemberId !== undefined ? (b.purchasedByMemberId ? Number(b.purchasedByMemberId) : null) : before.PURCHASED_BY_MEMBER_ID;
    if (newPayer && newPayer !== before.PURCHASED_BY_MEMBER_ID) {
      const pm = await q1(`SELECT MEMBER_ID FROM MEMBERS WHERE MEMBER_ID=:1 AND MESS_ID=:2`, [newPayer, req.messId!]);
      if (!pm) return res.status(400).json({ error: 'MEMBER_NOT_IN_MESS' });
    }
    const newSrc = b.paymentSource !== undefined
      ? (String(b.paymentSource).toUpperCase() === 'COMMON' ? 'COMMON' : 'PERSONAL')
      : (before.PAYMENT_SOURCE || 'PERSONAL');
    const creditEligible = (await oneCredit(req.messId)) && newSrc === 'PERSONAL' && !!newPayer;

    await tx(async (conn) => {
      await conn.execute(
        `UPDATE BAZAR_EXPENSES SET PURCHASE_DATE=:2, ITEM_NAME=:3, CATEGORY=:4, QUANTITY=:5, UNIT=:6,
           UNIT_PRICE=:7, TOTAL_PRICE=:8, PURCHASED_BY_MEMBER_ID=:9, DESCRIPTION=:10,
           RECEIPT_FILE_ID=NVL(:11,RECEIPT_FILE_ID), ACCOUNT_MONTH=:12, PAYMENT_SOURCE=:14, UPDATED_AT=SYSTIMESTAMP
         WHERE BAZAR_ID=:1`,
        [id, pdate, b.itemName ?? before.ITEM_NAME, b.category ?? before.CATEGORY, qty,
         b.unit ?? before.UNIT, up, total,
         newPayer,
         b.description ?? before.DESCRIPTION,
         b.receiptFileId !== undefined ? (b.receiptFileId ? Number(b.receiptFileId) : null) : null,
         month, null, newSrc]);
      // keep auto-credit in sync (same transaction — no orphans)
      await syncAutoCredit(conn, {
        bazarId: id, memberId: creditEligible ? newPayer : null, amount: creditEligible ? total : 0,
        date: pdate, desc: `${b.itemName ?? before.ITEM_NAME} (${pdate.toISOString().slice(0, 10)})`,
        userId: req.user!.userId, existingDepositId: before.CREDIT_DEPOSIT_ID ?? null, messId: req.messId,
      });
    });
    await audit(req, 'UPDATE', 'BAZAR_EXPENSE', id, before, { ...b, totalPrice: total });
    res.json({ ok: true, totalPrice: total });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Reverse (soft delete — never hard delete financial records)
bazarRouter.post('/:id/reverse', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM BAZAR_EXPENSES WHERE BAZAR_ID=:1 AND MESS_ID=${req.messId!}`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(before.PURCHASE_DATE, req.messId);
    await tx(async (conn) => {
      await conn.execute(`UPDATE BAZAR_EXPENSES SET STATUS='REVERSED', UPDATED_AT=SYSTIMESTAMP WHERE BAZAR_ID=:1`, [id]);
      await reverseAutoCredit(conn, before.CREDIT_DEPOSIT_ID ?? null);
      await conn.execute(`UPDATE BAZAR_EXPENSES SET CREDIT_DEPOSIT_ID=NULL WHERE BAZAR_ID=:1`, [id]);
    });
    await audit(req, 'REVERSE', 'BAZAR_EXPENSE', id, before, null, req.body?.reason);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});
