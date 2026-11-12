import { Router } from 'express';
import oracledb from 'oracledb';
import { q, q1, tx, Bind } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { audit } from '../services/audit';
import { assertMonthOpen, MonthClosedError } from '../services/finance';
import { toDateOnly } from '../util';

export const bazarRouter = Router();
bazarRouter.use(authMiddleware);
bazarRouter.use(requirePerm('bazar.manage'));

const round2 = (x: number) => Math.round(x * 100) / 100;

// List bazar expenses
bazarRouter.get('/', async (req, res, next) => {
  try {
    const { search = '', category = '', memberId = '', month = '', from = '', to = '', status = '', page = '1', pageSize = '20' } = req.query as any;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 20));
    const binds: Bind[] = [];
    let where = '1=1';
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
    const { itemName, category, quantity = 1, unit, unitPrice, purchaseDate, purchasedByMemberId, description, receiptFileId } = b;
    if (!itemName || unitPrice === undefined || !purchaseDate) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const pdate = toDateOnly(purchaseDate);
    await assertMonthOpen(pdate);
    const qty = Number(quantity) || 1;
    const up = Number(unitPrice) || 0;
    const total = round2(qty * up);
    const month = pdate.toISOString().slice(0, 7);

    const outB = [] as any[];
    const id = await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO BAZAR_EXPENSES (PURCHASE_DATE, ITEM_NAME, CATEGORY, QUANTITY, UNIT, UNIT_PRICE, TOTAL_PRICE,
           PURCHASED_BY_MEMBER_ID, DESCRIPTION, RECEIPT_FILE_ID, ACCOUNT_MONTH, STATUS, CREATED_BY)
         VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,'ACTIVE',:12) RETURNING BAZAR_ID INTO :13`,
        [pdate, itemName, category || null, qty, unit || null, up, total,
         purchasedByMemberId ? Number(purchasedByMemberId) : null, description || null,
         receiptFileId ? Number(receiptFileId) : null, month, req.user!.userId,
         { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
      return Number(outB[0]);
    });
    await audit(req, 'CREATE', 'BAZAR_EXPENSE', id, null, { ...b, totalPrice: total });
    res.status(201).json({ ok: true, id, totalPrice: total });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});

// Update
bazarRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM BAZAR_EXPENSES WHERE BAZAR_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(before.PURCHASE_DATE);
    const b = req.body || {};
    const qty = b.quantity !== undefined ? Number(b.quantity) : Number(before.QUANTITY);
    const up = b.unitPrice !== undefined ? Number(b.unitPrice) : Number(before.UNIT_PRICE);
    const total = round2(qty * up);
    const pdate = b.purchaseDate ? toDateOnly(b.purchaseDate) : before.PURCHASE_DATE;
    const month = pdate.toISOString().slice(0, 7);

    await tx(async (conn) => {
      await conn.execute(
        `UPDATE BAZAR_EXPENSES SET PURCHASE_DATE=:2, ITEM_NAME=:3, CATEGORY=:4, QUANTITY=:5, UNIT=:6,
           UNIT_PRICE=:7, TOTAL_PRICE=:8, PURCHASED_BY_MEMBER_ID=:9, DESCRIPTION=:10,
           RECEIPT_FILE_ID=NVL(:11,RECEIPT_FILE_ID), ACCOUNT_MONTH=:12, UPDATED_AT=SYSTIMESTAMP
         WHERE BAZAR_ID=:1`,
        [id, pdate, b.itemName ?? before.ITEM_NAME, b.category ?? before.CATEGORY, qty,
         b.unit ?? before.UNIT, up, total,
         b.purchasedByMemberId !== undefined ? (b.purchasedByMemberId ? Number(b.purchasedByMemberId) : null) : before.PURCHASED_BY_MEMBER_ID,
         b.description ?? before.DESCRIPTION,
         b.receiptFileId !== undefined ? (b.receiptFileId ? Number(b.receiptFileId) : null) : null,
         month]);
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
    const before = await q1<any>(`SELECT * FROM BAZAR_EXPENSES WHERE BAZAR_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    await assertMonthOpen(before.PURCHASE_DATE);
    await q(`UPDATE BAZAR_EXPENSES SET STATUS='REVERSED', UPDATED_AT=SYSTIMESTAMP WHERE BAZAR_ID=:1`, [id]);
    await audit(req, 'REVERSE', 'BAZAR_EXPENSE', id, before, null, req.body?.reason);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof MonthClosedError) return res.status(423).json({ error: 'MONTH_CLOSED', month: e.month });
    next(e);
  }
});
