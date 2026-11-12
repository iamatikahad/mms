import { q, q1, Bind, clobText } from '../db';
import { monthFinancials, memberMonthBreakdown } from '../services/finance';
import { monthOf } from '../db';
import { toDateOnly } from '../util';

const DAT = `+ INTERVAL '6' HOUR`;

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  return [new Date(Date.UTC(y, m - 1, 1) - 6 * 3600e3), new Date(Date.UTC(y, m, 1) - 6 * 3600e3)];
}

export interface ReportResult {
  rows?: any[];
  columns?: string[];
  financials?: any;
  totals?: any;
  members?: any;
  closing?: any;
  member?: any;
  mealRate?: number;
  month?: string;
  summary?: any;
}

/** Shared report data for ADMIN reports — used by JSON route and PDF export. */
export async function getAdminReport(type: string, opts: { month?: string; memberId?: number | null; from?: Date | null; to?: Date | null }): Promise<ReportResult> {
  const month = String(opts.month || monthOf(new Date()));
  if (!/^\d{4}-\d{2}$/.test(month)) throw Object.assign(new Error('BAD_MONTH'), { status: 400 });
  const memberId = opts.memberId ?? null;
  const from = opts.from ?? null;
  const to = opts.to ?? null;
  const [ms, me] = monthRange(month);

  switch (type) {
    case 'daily-meals': {
      const binds: Bind[] = [from || ms, to || me];
      let memberFilter = '';
      if (memberId) { binds.push(memberId); memberFilter = ` AND e.MEMBER_ID=:${binds.length}`; }
      const rows = await q(
        `SELECT TO_CHAR(e.MEAL_DATE ${DAT},'YYYY-MM-DD') MEAL_DATE, e.MEAL_TYPE,
                m.MEMBER_CODE, m.FULL_NAME, e.REGULAR_QTY
         FROM MEAL_ENTRIES e JOIN MEMBERS m ON m.MEMBER_ID=e.MEMBER_ID
         WHERE e.STATUS='ACTIVE' AND e.MEAL_DATE>=:1 AND e.MEAL_DATE<:2 ${memberFilter}
         ORDER BY e.MEAL_DATE, e.MEAL_TYPE, m.FULL_NAME`, binds);
      return { rows, columns: ['MEAL_DATE', 'MEAL_TYPE', 'MEMBER_CODE', 'FULL_NAME', 'REGULAR_QTY'] };
    }
    case 'monthly-meals': {
      const rows = await q(
        `SELECT TO_CHAR(e.MEAL_DATE ${DAT},'YYYY-MM-DD') MEAL_DATE, e.MEAL_TYPE,
                SUM(e.REGULAR_QTY) TOTAL_QTY, COUNT(DISTINCT e.MEMBER_ID) MEMBERS_EATING
         FROM MEAL_ENTRIES e
         WHERE e.STATUS='ACTIVE' AND e.MEAL_DATE>=:1 AND e.MEAL_DATE<:2
         GROUP BY TO_CHAR(e.MEAL_DATE ${DAT},'YYYY-MM-DD'), e.MEAL_TYPE
         ORDER BY MEAL_DATE, MEAL_TYPE`, [ms, me]);
      return { rows };
    }
    case 'member-meals': {
      const rows = await q(
        `SELECT m.MEMBER_CODE, m.FULL_NAME,
                SUM(CASE WHEN e.MEAL_TYPE='LUNCH' THEN e.REGULAR_QTY ELSE 0 END) LUNCH,
                SUM(CASE WHEN e.MEAL_TYPE='DINNER' THEN e.REGULAR_QTY ELSE 0 END) DINNER,
                SUM(e.REGULAR_QTY) TOTAL
         FROM MEAL_ENTRIES e JOIN MEMBERS m ON m.MEMBER_ID=e.MEMBER_ID
         WHERE e.STATUS='ACTIVE' AND e.MEAL_DATE>=:1 AND e.MEAL_DATE<:2
         GROUP BY m.MEMBER_CODE, m.FULL_NAME ORDER BY m.FULL_NAME`, [ms, me]);
      return { rows };
    }
    case 'guest-meals': {
      const binds: Bind[] = [ms, me];
      let mf = '';
      if (memberId) { binds.push(memberId); mf = ` AND g.HOST_MEMBER_ID=:${binds.length}`; }
      const rows = await q(
        `SELECT TO_CHAR(g.MEAL_DATE ${DAT},'YYYY-MM-DD') MEAL_DATE, g.MEAL_TYPE,
                hm.MEMBER_CODE HOST_CODE, hm.FULL_NAME HOST_NAME, g.GUEST_QTY, g.NOTES, g.STATUS
         FROM GUEST_MEALS g JOIN MEMBERS hm ON hm.MEMBER_ID=g.HOST_MEMBER_ID
         WHERE g.STATUS='ACTIVE' AND g.MEAL_DATE>=:1 AND g.MEAL_DATE<:2 ${mf}
         ORDER BY g.MEAL_DATE DESC, g.GUEST_MEAL_ID DESC`, binds);
      return { rows };
    }
    case 'bazar': {
      const binds: Bind[] = [month];
      let mf = '';
      if (memberId) { binds.push(memberId); mf = ` AND e.PURCHASED_BY_MEMBER_ID=:${binds.length}`; }
      const rows = await q(
        `SELECT TO_CHAR(e.PURCHASE_DATE ${DAT},'YYYY-MM-DD') PURCHASE_DATE, e.ITEM_NAME, e.CATEGORY,
                e.QUANTITY, e.UNIT, e.UNIT_PRICE, e.TOTAL_PRICE, m.FULL_NAME PURCHASED_BY, e.STATUS
         FROM BAZAR_EXPENSES e LEFT JOIN MEMBERS m ON m.MEMBER_ID=e.PURCHASED_BY_MEMBER_ID
         WHERE e.STATUS='ACTIVE' AND e.ACCOUNT_MONTH=:1 ${mf} ORDER BY e.PURCHASE_DATE DESC`, binds);
      return { rows };
    }
    case 'food-expense': {
      const rows = await q(
        `SELECT e.CATEGORY, COUNT(*) CNT, SUM(e.QUANTITY) QTY, SUM(e.TOTAL_PRICE) TOTAL
         FROM BAZAR_EXPENSES e JOIN EXPENSE_CATEGORIES c ON c.CATEGORY_NAME=e.CATEGORY
         WHERE e.STATUS='ACTIVE' AND e.ACCOUNT_MONTH=:1 AND c.IS_FOOD_ELIGIBLE=1
         GROUP BY e.CATEGORY ORDER BY TOTAL DESC`, [month]);
      const fin = await monthFinancials(month);
      return { rows, summary: { foodExpense: fin.foodExpense, totalMeals: fin.totalMeals, mealRate: fin.mealRate } };
    }
    case 'monthly-bills': {
      const rows = await q(
        `SELECT TO_CHAR(b.BILL_DATE ${DAT},'YYYY-MM-DD') BILL_DATE, c.CATEGORY_NAME, b.AMOUNT,
                b.PAYMENT_STATUS, b.STATUS, b.DESCRIPTION
         FROM MONTHLY_BILLS b JOIN BILL_CATEGORIES c ON c.BILL_CATEGORY_ID=b.BILL_CATEGORY_ID
         WHERE b.BILL_MONTH=:1 ORDER BY c.CATEGORY_NAME`, [month]);
      return { rows };
    }
    case 'bill-categories': {
      const rows = await q(
        `SELECT c.CATEGORY_NAME, b.AMOUNT, b.PAYMENT_STATUS,
                COUNT(CASE WHEN a.IS_ELIGIBLE=1 THEN 1 END) ALLOCATED_MEMBERS,
                SUM(CASE WHEN a.IS_ELIGIBLE=1 THEN a.ALLOCATED_AMOUNT ELSE 0 END) TOTAL_ALLOCATED
         FROM MONTHLY_BILLS b
         JOIN BILL_CATEGORIES c ON c.BILL_CATEGORY_ID=b.BILL_CATEGORY_ID
         LEFT JOIN BILL_ALLOCATIONS a ON a.BILL_ID=b.BILL_ID
         WHERE b.BILL_MONTH=:1 AND b.STATUS='ACTIVE'
         GROUP BY c.CATEGORY_NAME, b.AMOUNT, b.PAYMENT_STATUS ORDER BY c.CATEGORY_NAME`, [month]);
      return { rows };
    }
    case 'deposits': {
      const binds: Bind[] = [];
      let where = `d.STATUS IN ('ACTIVE','REVERSAL')`;
      if (from) { binds.push(from); where += ` AND d.DEPOSIT_DATE>=:${binds.length}`; }
      if (to) { binds.push(to); where += ` AND d.DEPOSIT_DATE<=:${binds.length}`; }
      if (!from && !to) { binds.push(ms, me); where += ` AND d.DEPOSIT_DATE>=:1 AND d.DEPOSIT_DATE<:2`; }
      if (memberId) { binds.push(memberId); where += ` AND d.MEMBER_ID=:${binds.length}`; }
      const rows = await q(
        `SELECT TO_CHAR(d.DEPOSIT_DATE ${DAT},'YYYY-MM-DD') DEPOSIT_DATE, m.MEMBER_CODE, m.FULL_NAME,
                d.AMOUNT, d.PAYMENT_METHOD, d.TRANSACTION_REF, d.STATUS
         FROM DEPOSITS d JOIN MEMBERS m ON m.MEMBER_ID=d.MEMBER_ID
         WHERE ${where} ORDER BY d.DEPOSIT_DATE DESC, d.DEPOSIT_ID DESC FETCH FIRST 1000 ROWS ONLY`, binds);
      return { rows };
    }
    case 'member-balances':
    case 'outstanding':
    case 'advances': {
      const breakdown = await memberMonthBreakdown(month);
      let rows = breakdown;
      if (type === 'outstanding') rows = breakdown.filter(b => b.balance < 0).sort((a, b) => a.balance - b.balance);
      if (type === 'advances') rows = breakdown.filter(b => b.balance > 0).sort((a, b) => b.balance - a.balance);
      return { rows };
    }
    case 'monthly-summary': {
      const fin = await monthFinancials(month);
      const breakdown = await memberMonthBreakdown(month);
      const totals = breakdown.reduce((acc, b) => ({
        foodCost: acc.foodCost + b.foodCost,
        billAllocation: acc.billAllocation + b.billAllocation,
        otherCharges: acc.otherCharges + b.otherCharges,
        totalPayable: acc.totalPayable + b.totalPayable,
        totalDeposits: acc.totalDeposits + b.totalDeposits,
        balance: acc.balance + b.balance,
      }), { foodCost: 0, billAllocation: 0, otherCharges: 0, totalPayable: 0, totalDeposits: 0, balance: 0 });
      return { financials: fin, totals, members: breakdown.length, month };
    }
    case 'closing-report': {
      const fin = await monthFinancials(month);
      const breakdown = await memberMonthBreakdown(month);
      const closing = await q1<any>(`SELECT * FROM MONTHLY_CLOSINGS WHERE ACCOUNT_MONTH=:1`, [month]);
      let closingSafe: any = null;
      if (closing) {
        const snapText = await clobText(closing.SNAPSHOT);
        const { SNAPSHOT, ...meta } = closing;
        closingSafe = { ...meta, snapshot: snapText ? JSON.parse(snapText) : null };
      }
      return { financials: fin, members: breakdown, closing: closingSafe, month };
    }
    default:
      throw Object.assign(new Error('UNKNOWN_REPORT'), { status: 404 });
  }
}

/** Shared report data for MEMBER reports (own data only). */
export async function getMemberReport(type: string, memberId: number, month: string): Promise<ReportResult> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw Object.assign(new Error('BAD_MONTH'), { status: 400 });
  const [ms, me] = monthRange(month);
  const DAT2 = DAT;

  switch (type) {
    case 'meals': {
      const rows = await q(
        `SELECT TO_CHAR(MEAL_DATE ${DAT2},'YYYY-MM-DD') MEAL_DATE, MEAL_TYPE, REGULAR_QTY, STATUS
         FROM MEAL_ENTRIES WHERE MEMBER_ID=:1 AND STATUS='ACTIVE' AND MEAL_DATE>=:2 AND MEAL_DATE<:3
         ORDER BY MEAL_DATE DESC`, [memberId, ms, me]);
      return { rows };
    }
    case 'guests': {
      const rows = await q(
        `SELECT TO_CHAR(MEAL_DATE ${DAT2},'YYYY-MM-DD') MEAL_DATE, MEAL_TYPE, GUEST_QTY, NOTES, STATUS
         FROM GUEST_MEALS WHERE HOST_MEMBER_ID=:1 AND STATUS='ACTIVE' AND MEAL_DATE>=:2 AND MEAL_DATE<:3
         ORDER BY MEAL_DATE DESC`, [memberId, ms, me]);
      return { rows };
    }
    case 'deposits': {
      const rows = await q(
        `SELECT TO_CHAR(DEPOSIT_DATE ${DAT2},'YYYY-MM-DD') DEPOSIT_DATE, AMOUNT, PAYMENT_METHOD, TRANSACTION_REF, STATUS
         FROM DEPOSITS WHERE MEMBER_ID=:1 AND STATUS IN ('ACTIVE','REVERSAL')
           AND DEPOSIT_DATE>=:2 AND DEPOSIT_DATE<:3
         ORDER BY DEPOSIT_DATE DESC`, [memberId, ms, me]);
      return { rows };
    }
    case 'charges': {
      const rows = await q(
        `SELECT TO_CHAR(CHARGE_DATE ${DAT2},'YYYY-MM-DD') CHARGE_DATE, AMOUNT, CATEGORY, DESCRIPTION, STATUS
         FROM OTHER_CHARGES WHERE MEMBER_ID=:1 AND STATUS='ACTIVE'
           AND CHARGE_DATE>=:2 AND CHARGE_DATE<:3
         ORDER BY CHARGE_DATE DESC`, [memberId, ms, me]);
      return { rows };
    }
    case 'bills': {
      const rows = await q(
        `SELECT b.BILL_MONTH, c.CATEGORY_NAME, a.ALLOCATED_AMOUNT, a.ALLOCATED_AMOUNT AMOUNT, a.IS_ELIGIBLE, b.PAYMENT_STATUS
         FROM BILL_ALLOCATIONS a
         JOIN MONTHLY_BILLS b ON b.BILL_ID=a.BILL_ID
         JOIN BILL_CATEGORIES c ON c.BILL_CATEGORY_ID=b.BILL_CATEGORY_ID
         WHERE a.MEMBER_ID=:1 AND b.STATUS='ACTIVE' AND b.BILL_MONTH=:2
         ORDER BY b.BILL_MONTH DESC`, [memberId, month]);
      return { rows };
    }
    case 'summary': {
      const breakdown = await memberMonthBreakdown(month);
      const mine = breakdown.find(b => b.memberId === memberId);
      const fin = await monthFinancials(month);
      return { member: mine, mealRate: fin.mealRate, month };
    }
    default:
      throw Object.assign(new Error('UNKNOWN_REPORT'), { status: 404 });
  }
}
