// Independent financial audit — recomputes everything from raw Oracle rows.
require('./backend/node_modules/dotenv').config({ path: 'backend/.env' });
const oracledb = require('./backend/node_modules/oracledb');

const r2 = x => Math.round(x * 100) / 100;
const out = {};

async function main() {
  const conn = await oracledb.getConnection({
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  });
  const q = async (sql, b = []) => (await conn.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows || [];
  const q1 = async (sql, b = []) => (await q(sql, b))[0] || null;

  // ---- discover months present ----
  const months = await q(`SELECT DISTINCT TO_CHAR(MEAL_DATE,'YYYY-MM') M FROM MEAL_ENTRIES
    UNION SELECT DISTINCT TO_CHAR(MEAL_DATE,'YYYY-MM') FROM GUEST_MEALS
    UNION SELECT DISTINCT ACCOUNT_MONTH FROM BAZAR_EXPENSES
    UNION SELECT DISTINCT BILL_MONTH FROM MONTHLY_BILLS
    UNION SELECT DISTINCT TO_CHAR(DEPOSIT_DATE,'YYYY-MM') FROM DEPOSITS
    UNION SELECT DISTINCT TO_CHAR(CHARGE_DATE,'YYYY-MM') FROM OTHER_CHARGES
    ORDER BY 1`);
  out.months = months.map(r => r.M);

  // ---- invariant checks ----
  out.invariants = {};
  // 1. duplicate ACTIVE meal entries same member/date/type
  out.invariants.dupActiveMealEntries = await q(`SELECT MEMBER_ID, TRUNC(MEAL_DATE) D, MEAL_TYPE, COUNT(*) C
    FROM MEAL_ENTRIES WHERE STATUS='ACTIVE' GROUP BY MEMBER_ID, TRUNC(MEAL_DATE), MEAL_TYPE HAVING COUNT(*)>1`);
  // 2. bazar total = qty*price?
  out.invariants.bazarMismatches = await q(`SELECT BAZAR_ID, QUANTITY, UNIT_PRICE, TOTAL_PRICE FROM BAZAR_EXPENSES
    WHERE STATUS='ACTIVE' AND ABS(TOTAL_PRICE - ROUND(QUANTITY*UNIT_PRICE,2)) > 0.004 FETCH FIRST 20 ROWS ONLY`);
  out.invariants.bazarMismatchCount = Number((await q1(`SELECT COUNT(*) C FROM BAZAR_EXPENSES e
    WHERE e.STATUS='ACTIVE' AND ABS(e.TOTAL_PRICE - ROUND(e.QUANTITY*e.UNIT_PRICE,2)) > 0.004`))?.C || 0);
  // 3. bill allocation sums vs bill amounts
  out.invariants.billAllocMismatches = await q(`SELECT b.BILL_ID, b.BILL_MONTH, b.AMOUNT,
      NVL(SUM(CASE WHEN a.IS_ELIGIBLE=1 THEN a.ALLOCATED_AMOUNT END),0) ALLOC_SUM,
      COUNT(CASE WHEN a.IS_ELIGIBLE=1 THEN 1 END) N
    FROM MONTHLY_BILLS b LEFT JOIN BILL_ALLOCATIONS a ON a.BILL_ID=b.BILL_ID
    WHERE b.STATUS='ACTIVE' GROUP BY b.BILL_ID, b.BILL_MONTH, b.AMOUNT
    HAVING ABS(NVL(SUM(CASE WHEN a.IS_ELIGIBLE=1 THEN a.ALLOCATED_AMOUNT END),0) - b.AMOUNT) > 0.01`);
  // 4. payments vs bill status consistency
  out.invariants.paymentStatusMismatches = await q(`SELECT b.BILL_ID, b.AMOUNT, b.PAYMENT_STATUS,
      NVL((SELECT SUM(p.AMOUNT) FROM PAYMENTS p WHERE p.BILL_ID=b.BILL_ID),0) PAID
    FROM MONTHLY_BILLS b WHERE b.STATUS='ACTIVE'
    AND ((b.PAYMENT_STATUS='PAID' AND NVL((SELECT SUM(p.AMOUNT) FROM PAYMENTS p WHERE p.BILL_ID=b.BILL_ID),0) < b.AMOUNT - 0.004)
      OR (b.PAYMENT_STATUS='UNPAID' AND NVL((SELECT SUM(p.AMOUNT) FROM PAYMENTS p WHERE p.BILL_ID=b.BILL_ID),0) > 0)
      OR (b.PAYMENT_STATUS='PARTIAL' AND (NVL((SELECT SUM(p.AMOUNT) FROM PAYMENTS p WHERE p.BILL_ID=b.BILL_ID),0) <= 0
        OR NVL((SELECT SUM(p.AMOUNT) FROM PAYMENTS p WHERE p.BILL_ID=b.BILL_ID),0) >= b.AMOUNT)))`);
  // 5. deposit reversals net to zero
  out.invariants.orphanReversals = await q(`SELECT d.DEPOSIT_ID, d.REVERSAL_OF_ID, d.AMOUNT FROM DEPOSITS d
    WHERE d.STATUS='REVERSAL' AND NOT EXISTS (SELECT 1 FROM DEPOSITS o WHERE o.DEPOSIT_ID=d.REVERSAL_OF_ID)`);
  // 6. members with meals but status LEFT / joined-after checks
  out.invariants.members = await q(`SELECT MEMBER_ID, MEMBER_CODE, FULL_NAME, STATUS, JOINING_DATE, LEAVING_DATE FROM MEMBERS ORDER BY MEMBER_ID`);

  // ---- per-month independent recompute (replicating intended formulas) ----
  out.monthsDetail = {};
  for (const { M: month } of months) {
    const [y, m] = month.split('-').map(Number);
    const ms = new Date(Date.UTC(y, m - 1, 1) - 6 * 3600e3);
    const me = new Date(Date.UTC(y, m, 1) - 6 * 3600e3);
    const d = {};
    d.regularMeals = Number((await q1(`SELECT NVL(SUM(REGULAR_QTY),0) T FROM MEAL_ENTRIES
      WHERE STATUS='ACTIVE' AND MEAL_DATE>=:1 AND MEAL_DATE<:2`, [ms, me]))?.T || 0);
    d.guestMeals = Number((await q1(`SELECT NVL(SUM(GUEST_QTY),0) T FROM GUEST_MEALS
      WHERE STATUS='ACTIVE' AND MEAL_DATE>=:1 AND MEAL_DATE<:2`, [ms, me]))?.T || 0);
    d.totalMeals = d.regularMeals + d.guestMeals;
    d.foodExpense = Number((await q1(`SELECT NVL(SUM(e.TOTAL_PRICE),0) T FROM BAZAR_EXPENSES e
      JOIN EXPENSE_CATEGORIES c ON c.CATEGORY_NAME=e.CATEGORY
      WHERE e.STATUS='ACTIVE' AND e.ACCOUNT_MONTH=:1 AND c.IS_FOOD_ELIGIBLE=1`, [month]))?.T || 0);
    d.mealRate = d.totalMeals ? r2(d.foodExpense / d.totalMeals * 10000) / 10000 : 0; // ROUND(x,4)
    // also exact Oracle ROUND semantics check
    d.mealRateOracle = Number((await q1(`SELECT ROUND(:1/NULLIF(:2,0),4) R FROM DUAL`, [d.foodExpense, d.totalMeals]))?.R || 0);
    d.totalBills = Number((await q1(`SELECT NVL(SUM(AMOUNT),0) T FROM MONTHLY_BILLS WHERE STATUS='ACTIVE' AND BILL_MONTH=:1`, [month]))?.T || 0);
    d.totalDeposits = Number((await q1(`SELECT NVL(SUM(AMOUNT),0) T FROM DEPOSITS WHERE STATUS IN ('ACTIVE','REVERSAL') AND DEPOSIT_DATE>=:1 AND DEPOSIT_DATE<:2`, [ms, me]))?.T || 0);
    d.totalCharges = Number((await q1(`SELECT NVL(SUM(AMOUNT),0) T FROM OTHER_CHARGES WHERE STATUS='ACTIVE' AND CHARGE_DATE>=:1 AND CHARGE_DATE<:2`, [ms, me]))?.T || 0);
    d.bazarAll = Number((await q1(`SELECT NVL(SUM(TOTAL_PRICE),0) T FROM BAZAR_EXPENSES WHERE STATUS='ACTIVE' AND ACCOUNT_MONTH=:1`, [month]))?.T || 0);
    d.bazarNonFood = r2(d.bazarAll - d.foodExpense);

    // per-member breakdown (independent re-implementation)
    const mealRows = await q(`SELECT m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME, m.STATUS MST, m.JOINING_DATE, m.LEAVING_DATE,
        NVL(reg.REG_QTY,0) REG, NVL(gst.G_QTY,0) GQ
      FROM MEMBERS m
      LEFT JOIN (SELECT MEMBER_ID, SUM(REGULAR_QTY) REG_QTY FROM MEAL_ENTRIES
        WHERE STATUS='ACTIVE' AND MEAL_DATE>=:1 AND MEAL_DATE<:2 GROUP BY MEMBER_ID) reg ON reg.MEMBER_ID=m.MEMBER_ID
      LEFT JOIN (SELECT HOST_MEMBER_ID MEMBER_ID, SUM(GUEST_QTY) G_QTY FROM GUEST_MEALS
        WHERE STATUS='ACTIVE' AND MEAL_DATE>=:3 AND MEAL_DATE<:4 GROUP BY HOST_MEMBER_ID) gst ON gst.MEMBER_ID=m.MEMBER_ID`,
      [ms, me, ms, me]);
    const allocRows = await q(`SELECT a.MEMBER_ID, NVL(SUM(a.ALLOCATED_AMOUNT),0) A FROM BILL_ALLOCATIONS a
      JOIN MONTHLY_BILLS b ON b.BILL_ID=a.BILL_ID
      WHERE b.STATUS='ACTIVE' AND b.BILL_MONTH=:1 AND a.IS_ELIGIBLE=1 GROUP BY a.MEMBER_ID`, [month]);
    const allocMap = new Map(allocRows.map(r => [Number(r.MEMBER_ID), Number(r.A)]));
    const chgRows = await q(`SELECT MEMBER_ID, NVL(SUM(AMOUNT),0) C FROM OTHER_CHARGES
      WHERE STATUS='ACTIVE' AND CHARGE_DATE>=:1 AND CHARGE_DATE<:2 GROUP BY MEMBER_ID`, [ms, me]);
    const chgMap = new Map(chgRows.map(r => [Number(r.MEMBER_ID), Number(r.C)]));
    const depRows = await q(`SELECT MEMBER_ID, NVL(SUM(AMOUNT),0) D FROM DEPOSITS
      WHERE STATUS IN ('ACTIVE','REVERSAL') AND DEPOSIT_DATE>=:1 AND DEPOSIT_DATE<:2 GROUP BY MEMBER_ID`, [ms, me]);
    const depMap = new Map(depRows.map(r => [Number(r.MEMBER_ID), Number(r.D)]));

    d.members = mealRows.map(r => {
      const mid = Number(r.MEMBER_ID);
      const tot = Number(r.REG) + Number(r.GQ);
      const food = r2(tot * d.mealRate);
      const alloc = r2(allocMap.get(mid) ?? 0);
      const chg = r2(chgMap.get(mid) ?? 0);
      const dep = r2(depMap.get(mid) ?? 0);
      const payable = r2(food + alloc + chg);
      return { mid, code: r.MEMBER_CODE, name: r.FULL_NAME, mstatus: r.MST,
        reg: Number(r.REG), guest: Number(r.GQ), meals: tot, food, alloc, chg, dep,
        payable, balance: r2(dep - payable) };
    });
    d.totals = d.members.reduce((a, b) => ({
      food: r2(a.food + b.food), alloc: r2(a.alloc + b.alloc), chg: r2(a.chg + b.chg),
      payable: r2(a.payable + b.payable), dep: r2(a.dep + b.dep), bal: r2(a.bal + b.balance),
      meals: a.meals + b.meals }),
      { food: 0, alloc: 0, chg: 0, payable: 0, dep: 0, bal: 0, meals: 0 });
    // rounding drift check
    d.foodDrift = r2(d.totals.food - d.foodExpense);
    d.mealsDrift = d.totals.meals - d.totalMeals;
    out.monthsDetail[month] = d;
  }

  // ---- closing snapshots / monthly accounts ----
  out.monthlyAccounts = await q(`SELECT * FROM MONTHLY_ACCOUNTS ORDER BY ACCOUNT_MONTH`);
  out.closings = await q(`SELECT ACCOUNT_MONTH, STATUS, CLOSED_AT, REOPEN_COUNT FROM MONTHLY_CLOSINGS ORDER BY ACCOUNT_MONTH`);
  out.memberSummaries = await q(`SELECT * FROM MEMBER_MONTHLY_SUMMARY ORDER BY ACCOUNT_MONTH, MEMBER_ID FETCH FIRST 60 ROWS ONLY`);

  await conn.close();
  require('fs').writeFileSync('_audit_calc_out.json', JSON.stringify(out, null, 1));
  console.log('WROTE _audit_calc_out.json');
  console.log('months:', out.months.join(', '));
  console.log('dupActiveMealEntries:', out.invariants.dupActiveMealEntries.length);
  console.log('bazarMismatchCount:', out.invariants.bazarMismatchCount);
  console.log('billAllocMismatches:', out.invariants.billAllocMismatches.length);
  console.log('paymentStatusMismatches:', out.invariants.paymentStatusMismatches.length);
  console.log('orphanReversals:', out.invariants.orphanReversals.length);
}
main().catch(e => { console.error(e); process.exit(1); });
