import { Router } from 'express';
import { q, q1 } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { monthFinancials, memberMonthBreakdown } from '../services/finance';
import { monthOf } from '../db';

export const flowchartRouter = Router();
flowchartRouter.use(authMiddleware);
flowchartRouter.use(requirePerm('flowchart.view'));

// Interactive calculation flowchart data — REAL values for selected month
flowchartRouter.get('/data', async (req, res, next) => {
  try {
    const month = String(req.query.month || monthOf(new Date()));
    const [fin, breakdown] = await Promise.all([monthFinancials(month), memberMonthBreakdown(month)]);

    // top members by food cost for display
    const topFood = [...breakdown].sort((a, b) => b.foodCost - a.foodCost).slice(0, 5)
      .map(b => ({ name: b.fullName, meals: b.totalMeals, foodCost: b.foodCost }));

    res.json({
      month,
      flow1: {
        title: 'Meal Calculation',
        steps: [
          { label: 'Regular Meals', value: fin.regularMeals, formula: 'SUM(MEAL_ENTRIES.REGULAR_QTY)' },
          { label: 'Guest Meals', value: fin.guestMeals, formula: 'SUM(GUEST_MEALS.GUEST_QTY)' },
          { label: 'Total Chargeable Meals', value: fin.totalMeals, formula: 'Regular + Guest' },
          { label: 'Eligible Food Expenses', value: fin.foodExpense, formula: 'SUM(BAZAR_EXPENSES food-eligible)' },
          { label: 'Meal Rate', value: fin.mealRate, formula: 'Food Expenses ÷ Total Meals', precision: 4 },
        ],
        memberFoodCostExample: topFood,
      },
      flow2: {
        title: 'Monthly Bills',
        steps: [
          { label: 'Monthly Bills Total', value: fin.totalBills, formula: 'SUM(MONTHLY_BILLS.AMOUNT)' },
          { label: 'Bill Categories', value: null, formula: 'EQUAL allocation per category' },
          { label: 'Eligible Members', value: breakdown.length, formula: 'Members overlapping the month' },
          { label: 'Allocation Method', value: 'EQUAL', formula: 'Largest-remainder reconciliation' },
        ],
        allocations: breakdown.filter(b => b.billAllocation > 0)
          .sort((a, b) => b.billAllocation - a.billAllocation).slice(0, 5)
          .map(b => ({ name: b.fullName, share: b.billAllocation })),
      },
      flow3: {
        title: 'Final Member Balance',
        steps: [
          { label: 'Member Food Cost', value: null, formula: '(Regular + Guest meals) × Meal Rate' },
          { label: '+ Bill Allocation', value: null, formula: 'Member share of monthly bills' },
          { label: '+ Other Charges', value: null, formula: 'Additional charges / adjustments' },
          { label: '= Total Payable', value: null, formula: 'Food + Bills + Charges' },
          { label: '- Total Deposits', value: null, formula: 'Deposits & payments received' },
          { label: '= Final Balance', value: null, formula: 'Deposits − Payable (+=advance, −=due)' },
        ],
        example: topFood[0] ? breakdown.find(b => b.fullName === topFood[0].name) : null,
        totals: breakdown.reduce((a, b) => ({
          food: a.food + b.foodCost,
          payable: a.payable + b.totalPayable,
          deposits: a.deposits + b.totalDeposits,
          balance: a.balance + b.balance,
        }), { food: 0, payable: 0, deposits: 0, balance: 0 }),
      },
    });
  } catch (e) { next(e); }
});
