import { Router } from 'express';
import { q, q1, monthOf } from '../db';
import { authMiddleware, requireRole } from '../middleware';
import { monthFinancials, memberMonthBreakdown } from '../services/finance';
import { nowDhaka, dhakaDateStr } from '../util';

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware);

const M = `TO_CHAR(col + INTERVAL '6' HOUR,'YYYY-MM')`;
const D = `TRUNC(col + INTERVAL '6' HOUR)`;

// ---------- ADMIN DASHBOARD ----------
dashboardRouter.get('/admin', requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const month = String(req.query.month || monthOf(new Date()));
    const today = dhakaDateStr();
    const [y, m] = month.split('-').map(Number);
    const mStart = new Date(Date.UTC(y, m - 1, 1) - 6 * 3600 * 1000);
    const mEnd = new Date(Date.UTC(y, m, 1) - 6 * 3600 * 1000);
    const tDate = new Date(today + 'T00:00:00Z');

    const [members, todayMeals, monthFin] = await Promise.all([
      q1<any>(
        `SELECT
           SUM(CASE WHEN m.STATUS='ACTIVE' THEN 1 ELSE 0 END) ACTIVE,
           SUM(CASE WHEN m.STATUS<>'ACTIVE' THEN 1 ELSE 0 END) INACTIVE
         FROM MEMBERS m`, []),
      q1<any>(
        `SELECT
           SUM(CASE WHEN e.MEAL_TYPE='LUNCH' THEN e.REGULAR_QTY ELSE 0 END) LUNCH,
           SUM(CASE WHEN e.MEAL_TYPE='DINNER' THEN e.REGULAR_QTY ELSE 0 END) DINNER,
           SUM(e.REGULAR_QTY) REG_TOTAL
         FROM MEAL_ENTRIES e WHERE e.STATUS='ACTIVE' AND TRUNC(e.MEAL_DATE)=TRUNC(:1)`, [tDate]),
      monthFinancials(month),
    ]);

    // live outstanding balances for the month
    const breakdown = await memberMonthBreakdown(month);
    const outstanding = breakdown
      .filter(b => b.balance < 0)
      .sort((a, b) => a.balance - b.balance)
      .slice(0, 10)
      .map(b => ({ FULL_NAME: b.fullName, MEMBER_CODE: b.memberCode, BALANCE: b.balance }));

    // charts
    const mealChart = await q(
      `SELECT TO_CHAR(e.MEAL_DATE + INTERVAL '6' HOUR,'YYYY-MM-DD') DAY,
              SUM(CASE WHEN e.MEAL_TYPE='LUNCH' THEN e.REGULAR_QTY ELSE 0 END) LUNCH,
              SUM(CASE WHEN e.MEAL_TYPE='DINNER' THEN e.REGULAR_QTY ELSE 0 END) DINNER
       FROM MEAL_ENTRIES e WHERE e.STATUS='ACTIVE' AND e.MEAL_DATE>=:1 AND e.MEAL_DATE<:2
       GROUP BY TO_CHAR(e.MEAL_DATE + INTERVAL '6' HOUR,'YYYY-MM-DD')
       ORDER BY DAY`, [mStart, mEnd]);

    const guestChart = await q(
      `SELECT TO_CHAR(g.MEAL_DATE + INTERVAL '6' HOUR,'YYYY-MM-DD') DAY,
              SUM(CASE WHEN g.MEAL_TYPE='LUNCH' THEN g.GUEST_QTY ELSE 0 END) LUNCH,
              SUM(CASE WHEN g.MEAL_TYPE='DINNER' THEN g.GUEST_QTY ELSE 0 END) DINNER
       FROM GUEST_MEALS g WHERE g.STATUS='ACTIVE' AND g.MEAL_DATE>=:1 AND g.MEAL_DATE<:2
       GROUP BY TO_CHAR(g.MEAL_DATE + INTERVAL '6' HOUR,'YYYY-MM-DD')
       ORDER BY DAY`, [mStart, mEnd]);

    const expenseChart = await q(
      `SELECT e.PURCHASE_DATE, e.ITEM_NAME, e.TOTAL_PRICE, e.CATEGORY
       FROM BAZAR_EXPENSES e WHERE e.STATUS='ACTIVE' AND e.ACCOUNT_MONTH=:1
       ORDER BY e.PURCHASE_DATE`, [month]);

    const depositChart = await q(
      `SELECT TO_CHAR(d.DEPOSIT_DATE + INTERVAL '6' HOUR,'YYYY-MM-DD') DAY,
              SUM(d.AMOUNT) TOTAL, COUNT(*) CNT
       FROM DEPOSITS d WHERE d.STATUS IN ('ACTIVE','REVERSAL') AND d.DEPOSIT_DATE>=:1 AND d.DEPOSIT_DATE<:2
       GROUP BY TO_CHAR(d.DEPOSIT_DATE + INTERVAL '6' HOUR,'YYYY-MM-DD')
       ORDER BY DAY`, [mStart, mEnd]);

    const recentDeposits = await q(
      `SELECT d.DEPOSIT_ID, d.DEPOSIT_DATE, d.AMOUNT, d.PAYMENT_METHOD, m.FULL_NAME
       FROM DEPOSITS d JOIN MEMBERS m ON m.MEMBER_ID=d.MEMBER_ID
       WHERE d.STATUS IN ('ACTIVE','REVERSAL') ORDER BY d.DEPOSIT_DATE DESC, d.DEPOSIT_ID DESC FETCH FIRST 8 ROWS ONLY`);

    const recentExpenses = await q(
      `SELECT e.BAZAR_ID, e.PURCHASE_DATE, e.ITEM_NAME, e.TOTAL_PRICE, e.CATEGORY
       FROM BAZAR_EXPENSES e WHERE e.STATUS='ACTIVE' ORDER BY e.PURCHASE_DATE DESC, e.BAZAR_ID DESC FETCH FIRST 8 ROWS ONLY`);

    const guestToday = await q1<any>(
      `SELECT NVL(SUM(GUEST_QTY),0) G FROM GUEST_MEALS WHERE STATUS='ACTIVE' AND TRUNC(MEAL_DATE)=TRUNC(:1)`, [tDate]);

    // Only trust the stored rate while the month is actually CLOSED; a reopened
    // month keeps STATUS='OPEN' and must fall back to the live calculation.
    const mealRateRow = await q1<any>(
      `SELECT MEAL_RATE FROM MONTHLY_ACCOUNTS WHERE ACCOUNT_MONTH=:1 AND STATUS='CLOSED'`, [month]);

    res.json({
      month, today,
      stats: {
        totalMembers: Number(members?.ACTIVE ?? 0) + Number(members?.INACTIVE ?? 0),
        activeMembers: Number(members?.ACTIVE ?? 0),
        inactiveMembers: Number(members?.INACTIVE ?? 0),
        todayLunch: Number(todayMeals?.LUNCH ?? 0),
        todayDinner: Number(todayMeals?.DINNER ?? 0),
        todayTotal: Number(todayMeals?.REG_TOTAL ?? 0),
        todayGuests: Number(guestToday?.G ?? 0),
        monthRegularMeals: monthFin.regularMeals,
        monthGuestMeals: monthFin.guestMeals,
        monthTotalMeals: monthFin.totalMeals,
        monthFoodExpense: monthFin.foodExpense,
        monthBills: monthFin.totalBills,
        monthDeposits: monthFin.totalDeposits,
        mealRate: mealRateRow?.MEAL_RATE ?? monthFin.mealRate,
      },
      charts: { mealChart, guestChart, expenseChart, depositChart },
      outstanding,
      recent: { deposits: recentDeposits, expenses: recentExpenses },
    });
  } catch (e) { next(e); }
});

// ---------- MEMBER DASHBOARD ----------
dashboardRouter.get('/member', requireRole('MEMBER'), async (req, res, next) => {
  try {
    const memberId = req.user!.memberId;
    if (!memberId) return res.status(403).json({ error: 'NO_MEMBER_PROFILE' });
    const month = String(req.query.month || monthOf(new Date()));
    const today = dhakaDateStr();

    const [fin, breakdown] = await Promise.all([
      monthFinancials(month),
      memberMonthBreakdown(month),
    ]);
    const mine = breakdown.find(b => b.memberId === memberId) || {
      memberId, regularMeals: 0, guestMeals: 0, totalMeals: 0, foodCost: 0,
      billAllocation: 0, otherCharges: 0, totalPayable: 0, totalDeposits: 0, balance: 0,
    };

    const todayRows = await q(
      `SELECT MEAL_TYPE, REGULAR_QTY FROM MEAL_ENTRIES
       WHERE MEMBER_ID=:1 AND STATUS='ACTIVE' AND TRUNC(MEAL_DATE)=TRUNC(:2)`, [memberId, new Date(today + 'T00:00:00Z')]);
    const todayGuests = await q1<any>(
      `SELECT NVL(SUM(GUEST_QTY),0) G FROM GUEST_MEALS WHERE HOST_MEMBER_ID=:1 AND STATUS='ACTIVE' AND TRUNC(MEAL_DATE)=TRUNC(:2)`,
      [memberId, new Date(today + 'T00:00:00Z')]);

    const mealHistory = await q(
      `SELECT TO_CHAR(MEAL_DATE + INTERVAL '6' HOUR,'YYYY-MM-DD') DAY,
              SUM(REGULAR_QTY) QTY
       FROM MEAL_ENTRIES WHERE MEMBER_ID=:1 AND STATUS='ACTIVE'
         AND MEAL_DATE >= ADD_MONTHS(TRUNC(SYSDATE), -6)
       GROUP BY TO_CHAR(MEAL_DATE + INTERVAL '6' HOUR,'YYYY-MM-DD')
       ORDER BY DAY`, [memberId]);

    const deposits = await q(
      `SELECT DEPOSIT_ID, DEPOSIT_DATE, AMOUNT, PAYMENT_METHOD, STATUS
       FROM DEPOSITS WHERE MEMBER_ID=:1 AND STATUS IN ('ACTIVE','REVERSAL')
       ORDER BY DEPOSIT_DATE DESC FETCH FIRST 20 ROWS ONLY`, [memberId]);

    const charges = await q(
      `SELECT CHARGE_ID, CHARGE_DATE, AMOUNT, CATEGORY, DESCRIPTION, STATUS
       FROM OTHER_CHARGES WHERE MEMBER_ID=:1 ORDER BY CHARGE_DATE DESC FETCH FIRST 20 ROWS ONLY`, [memberId]);

    const bills = await q(
      `SELECT b.BILL_MONTH, b.AMOUNT, c.CATEGORY_NAME, a.ALLOCATED_AMOUNT, a.IS_ELIGIBLE, a.EXCLUSION_REASON
       FROM BILL_ALLOCATIONS a
       JOIN MONTHLY_BILLS b ON b.BILL_ID=a.BILL_ID
       JOIN BILL_CATEGORIES c ON c.BILL_CATEGORY_ID=b.BILL_CATEGORY_ID
       WHERE a.MEMBER_ID=:1 AND b.STATUS='ACTIVE' ORDER BY b.BILL_MONTH DESC FETCH FIRST 24 ROWS ONLY`, [memberId]);

    res.json({
      month, today,
      todayStats: {
        lunch: Number(todayRows.find(r => r.MEAL_TYPE === 'LUNCH')?.REGULAR_QTY ?? 0),
        dinner: Number(todayRows.find(r => r.MEAL_TYPE === 'DINNER')?.REGULAR_QTY ?? 0),
        guests: Number(todayGuests?.G ?? 0),
      },
      monthly: {
        regularMeals: mine.regularMeals,
        guestMeals: mine.guestMeals,
        totalMeals: mine.totalMeals,
        mealRate: fin.mealRate,
        foodCost: mine.foodCost,
        billAllocation: mine.billAllocation,
        otherCharges: mine.otherCharges,
        totalPayable: mine.totalPayable,
        totalDeposits: mine.totalDeposits,
        balance: mine.balance,
      },
      mealHistory, deposits, charges, bills,
    });
  } catch (e) { next(e); }
});
