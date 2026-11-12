import { q, q1, monthBounds, Bind } from '../db';

export class MonthClosedError extends Error {
  constructor(public month: string) {
    super(`MONTH_CLOSED:${month}`);
  }
}

/** Throw if the given 'YYYY-MM' month (derived from a date) is closed. */
export async function assertMonthOpen(date: Date | string) {
  const { monthOf } = await import('../db');
  const month = monthOf(typeof date === 'string' ? new Date(date) : date);
  const row = await q1<{ STATUS: string }>(
    `SELECT STATUS FROM MONTHLY_CLOSINGS WHERE ACCOUNT_MONTH = :1`, [month]);
  if (row && row.STATUS === 'CLOSED') throw new MonthClosedError(month);
}

export async function isMonthClosed(month: string): Promise<boolean> {
  const row = await q1<{ STATUS: string }>(
    `SELECT STATUS FROM MONTHLY_CLOSINGS WHERE ACCOUNT_MONTH = :1`, [month]);
  return !!row && row.STATUS === 'CLOSED';
}

// ---------- Financial calculations (all math in Oracle NUMBER) ----------

export interface MonthFinancials {
  month: string;
  regularMeals: number;
  guestMeals: number;
  totalMeals: number;
  foodExpense: number;
  mealRate: number;
  totalBills: number;
  totalDeposits: number;
  totalOtherCharges: number;
}

const MONTH_SQL = `TO_CHAR(col + INTERVAL '6' HOUR,'YYYY-MM')`;

export async function monthFinancials(month: string): Promise<MonthFinancials> {
  const meals = await q1<any>(
    `SELECT NVL(SUM(REGULAR_QTY),0) REG_QTY
     FROM MEAL_ENTRIES WHERE STATUS='ACTIVE' AND ${MONTH_SQL.replace('col','MEAL_DATE')} = :1`,
    [month]);

  const guests = await q1<any>(
    `SELECT NVL(SUM(GUEST_QTY),0) G FROM GUEST_MEALS WHERE STATUS='ACTIVE' AND ${MONTH_SQL.replace('col','MEAL_DATE')} = :1`,
    [month]);

  const food = await q1<any>(
    `SELECT NVL(SUM(e.TOTAL_PRICE),0) T FROM BAZAR_EXPENSES e
      JOIN EXPENSE_CATEGORIES c ON c.CATEGORY_NAME = e.CATEGORY
     WHERE e.STATUS='ACTIVE' AND e.ACCOUNT_MONTH = :1 AND c.IS_FOOD_ELIGIBLE = 1`,
    [month]);

  const bills = await q1<any>(
    `SELECT NVL(SUM(AMOUNT),0) T FROM MONTHLY_BILLS WHERE STATUS='ACTIVE' AND BILL_MONTH = :1`,
    [month]);

  const deps = await q1<any>(
    `SELECT NVL(SUM(AMOUNT),0) T FROM DEPOSITS WHERE STATUS IN ('ACTIVE','REVERSAL') AND ${MONTH_SQL.replace('col','DEPOSIT_DATE')} = :1`,
    [month]);

  const chg = await q1<any>(
    `SELECT NVL(SUM(AMOUNT),0) T FROM OTHER_CHARGES WHERE STATUS='ACTIVE' AND ${MONTH_SQL.replace('col','CHARGE_DATE')} = :1`,
    [month]);

  const regular = Number(meals?.REG_QTY ?? 0);
  const guest = Number(guests?.G ?? 0);
  const total = regular + guest;
  const foodAmt = Number(food?.T ?? 0);
  // Meal rate computed in SQL to keep decimal precision
  const rateRow = await q1<any>(
    `SELECT ROUND(:1 / NULLIF(:2,0), 4) RATE FROM DUAL`, [foodAmt, total]);

  return {
    month,
    regularMeals: regular,
    guestMeals: guest,
    totalMeals: total,
    foodExpense: foodAmt,
    mealRate: Number(rateRow?.RATE ?? 0),
    totalBills: Number(bills?.T ?? 0),
    totalDeposits: Number(deps?.T ?? 0),
    totalOtherCharges: Number(chg?.T ?? 0),
  };
}

export interface MemberMonthBreakdown {
  memberId: number;
  memberCode: string;
  fullName: string;
  regularMeals: number;
  guestMeals: number;
  totalMeals: number;
  foodCost: number;
  billAllocation: number;
  otherCharges: number;
  totalPayable: number;
  totalDeposits: number;
  balance: number;
}

/** Per-member financial breakdown for a month. All arithmetic in Oracle. */
export async function memberMonthBreakdown(month: string): Promise<MemberMonthBreakdown[]> {
  const { start, end } = monthBounds(month);

  // 1. Meals per member (regular from MEAL_ENTRIES, guest from GUEST_MEALS)
  const mealRows = await q<any>(
    `SELECT m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME,
            NVL(reg.REG_QTY,0) REGULAR_MEALS,
            NVL(gst.G_QTY,0)  GUEST_MEALS
     FROM MEMBERS m
     LEFT JOIN (
       SELECT MEMBER_ID, SUM(REGULAR_QTY) REG_QTY FROM MEAL_ENTRIES
       WHERE STATUS='ACTIVE' AND MEAL_DATE >= :1 AND MEAL_DATE < :2
       GROUP BY MEMBER_ID
     ) reg ON reg.MEMBER_ID = m.MEMBER_ID
     LEFT JOIN (
       SELECT HOST_MEMBER_ID MEMBER_ID, SUM(GUEST_QTY) G_QTY FROM GUEST_MEALS
       WHERE STATUS='ACTIVE' AND MEAL_DATE >= :3 AND MEAL_DATE < :4
       GROUP BY HOST_MEMBER_ID
     ) gst ON gst.MEMBER_ID = m.MEMBER_ID
     WHERE (m.LEAVING_DATE IS NULL OR m.LEAVING_DATE >= :5)
       AND (m.JOINING_DATE IS NULL OR m.JOINING_DATE < :6)
       AND (m.STATUS <> 'LEFT' OR m.LEAVING_DATE IS NOT NULL)`,
    [start, end, start, end, start, end]
  );

  const fin = await monthFinancials(month);
  const rate = fin.mealRate;

  // 2. Bill allocations per member for the month
  const allocRows = await q<any>(
    `SELECT a.MEMBER_ID, NVL(SUM(a.ALLOCATED_AMOUNT),0) ALLOC
     FROM BILL_ALLOCATIONS a JOIN MONTHLY_BILLS b ON b.BILL_ID = a.BILL_ID
     WHERE b.STATUS='ACTIVE' AND b.BILL_MONTH = :1 AND a.IS_ELIGIBLE = 1
     GROUP BY a.MEMBER_ID`, [month]);
  const allocMap = new Map(allocRows.map(r => [Number(r.MEMBER_ID), Number(r.ALLOC)]));

  // 3. Other charges per member (charges whose month matches)
  const chgRows = await q<any>(
    `SELECT c.MEMBER_ID, NVL(SUM(c.AMOUNT),0) CHG
     FROM OTHER_CHARGES c
     WHERE c.STATUS='ACTIVE' AND ${MONTH_SQL.replace('col', 'c.CHARGE_DATE')} = :1
     GROUP BY c.MEMBER_ID`, [month]);
  const chgMap = new Map(chgRows.map(r => [Number(r.MEMBER_ID), Number(r.CHG)]));

  // 4. Deposits per member
  const depRows = await q<any>(
    `SELECT d.MEMBER_ID, NVL(SUM(d.AMOUNT),0) DEP
     FROM DEPOSITS d
     WHERE d.STATUS IN ('ACTIVE','REVERSAL') AND ${MONTH_SQL.replace('col', 'd.DEPOSIT_DATE')} = :1
     GROUP BY d.MEMBER_ID`, [month]);
  const depMap = new Map(depRows.map(r => [Number(r.MEMBER_ID), Number(r.DEP)]));

  // Round to 2dp using integer paisa math for money safety
  const r2 = (x: number) => Math.round(x * 100) / 100;

  return mealRows.map(r => {
    const memberId = Number(r.MEMBER_ID);
    const regular = Number(r.REGULAR_MEALS);
    const guest = Number(r.GUEST_MEALS);
    const total = regular + guest;
    const foodCost = r2(total * rate);
    const billAlloc = r2(allocMap.get(memberId) ?? 0);
    const other = r2(chgMap.get(memberId) ?? 0);
    const payable = r2(foodCost + billAlloc + other);
    const deposits = r2(depMap.get(memberId) ?? 0);
    return {
      memberId,
      memberCode: r.MEMBER_CODE,
      fullName: r.FULL_NAME,
      regularMeals: regular,
      guestMeals: guest,
      totalMeals: total,
      foodCost,
      billAllocation: billAlloc,
      otherCharges: other,
      totalPayable: payable,
      totalDeposits: deposits,
      balance: r2(deposits - payable),
    };
  });
}

/** Eligible members for a bill month: membership overlaps the month. */
export async function eligibleMembersForMonth(month: string): Promise<number[]> {
  const { start, end } = monthBounds(month);
  const rows = await q<{ MEMBER_ID: number }>(
    `SELECT MEMBER_ID FROM MEMBERS
     WHERE (LEAVING_DATE IS NULL OR LEAVING_DATE >= :1)
       AND (JOINING_DATE IS NULL OR JOINING_DATE < :2)
       AND (STATUS <> 'LEFT' OR LEAVING_DATE IS NOT NULL)`,
    [start, end]);
  return rows.map(r => Number(r.MEMBER_ID));
}

/**
 * Equal allocation with exact reconciliation using integer paisa.
 * Largest-remainder method: base = floor(total*100/n)/100, remainder distributed 1 paisa at a time.
 */
export function equalAllocation(total: number, memberIds: number[]): Map<number, number> {
  const totalPaisa = Math.round(total * 100);
  const n = memberIds.length;
  const map = new Map<number, number>();
  if (n === 0) return map;
  const base = Math.floor(totalPaisa / n);
  let rem = totalPaisa - base * n;
  memberIds.forEach((id, i) => {
    // give +1 paisa to first `rem` members deterministically
    map.set(id, (base + (i < rem ? 1 : 0)) / 100);
  });
  return map;
}
