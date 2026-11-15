require('./backend/node_modules/dotenv').config({ path: 'backend/.env' });
const jwt = require('./backend/node_modules/jsonwebtoken');
const http = require('http');
const audit = require('./_audit_calc_out.json');
const BASE = 'http://localhost:4002';
const MONTH = '2026-11';
const d = audit.monthsDetail[MONTH];

const tok = uid => jwt.sign({ uid }, process.env.JWT_SECRET, { expiresIn: '1h' });
const get = (path, token) => new Promise((res, rej) => {
  http.get(BASE + path, { headers: { Authorization: 'Bearer ' + token } }, r => {
    let b = ''; r.on('data', c => b += c); r.on('end', () => {
      try { res({ status: r.statusCode, body: JSON.parse(b) }); } catch { res({ status: r.statusCode, body: b }); }
    });
  }).on('error', rej);
});
const close = (a, b, tol = 0.005) => Math.abs(Number(a) - Number(b)) <= tol;
const results = [];
const chk = (name, expected, actual, tol) => {
  const ok = typeof expected === 'number' ? close(expected, actual, tol ?? 0.005) : JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ name, expected, actual, pass: ok });
};

(async () => {
  const admin = tok(1);      // superadmin
  const member = tok(3);     // testmember -> MEMBER_ID 1

  // 1. admin dashboard
  const dash = await get(`/api/dashboard/admin?month=${MONTH}`, admin);
  const s = dash.body.stats || {};
  chk('dash.monthRegularMeals', d.regularMeals, s.monthRegularMeals, 0);
  chk('dash.monthGuestMeals', d.guestMeals, s.monthGuestMeals, 0);
  chk('dash.monthTotalMeals', d.totalMeals, s.monthTotalMeals, 0);
  chk('dash.monthFoodExpense', d.foodExpense, s.monthFoodExpense);
  chk('dash.mealRate', d.mealRateOracle, s.mealRate, 0.0001);
  chk('dash.monthBills', d.totalBills, s.monthBills);
  chk('dash.monthDeposits', d.totalDeposits, s.monthDeposits);

  // 2. monthly summary report
  const sum = await get(`/api/reports/admin/monthly-summary?month=${MONTH}`, admin);
  const f = sum.body.financials || {};
  chk('summary.regularMeals', d.regularMeals, f.regularMeals, 0);
  chk('summary.guestMeals', d.guestMeals, f.guestMeals, 0);
  chk('summary.totalMeals', d.totalMeals, f.totalMeals, 0);
  chk('summary.foodExpense', d.foodExpense, f.foodExpense);
  chk('summary.mealRate', d.mealRateOracle, f.mealRate, 0.0001);
  chk('summary.totalBills', d.totalBills, f.totalBills);
  chk('summary.totalDeposits', d.totalDeposits, f.totalDeposits);
  chk('summary.totalOtherCharges', d.totalCharges, f.totalOtherCharges);
  const t = sum.body.totals || {};
  chk('summary.totals.foodCost', d.totals.food, t.foodCost);
  chk('summary.totals.billAllocation', d.totals.alloc, t.billAllocation);
  chk('summary.totals.otherCharges', d.totals.chg, t.otherCharges);
  chk('summary.totals.totalPayable', d.totals.payable, t.totalPayable);
  chk('summary.totals.totalDeposits', d.totals.dep, t.totalDeposits);
  chk('summary.totals.balance', d.totals.bal, t.balance);
  chk('summary.members count', d.members.length, sum.body.members, 0);

  // 3. member-balances report vs independent per-member
  const bal = await get(`/api/reports/admin/member-balances?month=${MONTH}`, admin);
  const brows = bal.body.rows || [];
  for (const m of d.members) {
    const r = brows.find(x => Number(x.memberId) === m.mid);
    if (!r) { results.push({ name: `balance ${m.code} present`, expected: 'row', actual: 'missing', pass: false }); continue; }
    chk(`${m.code}.meals`, m.meals, r.totalMeals, 0);
    chk(`${m.code}.foodCost`, m.food, r.foodCost);
    chk(`${m.code}.billAlloc`, m.alloc, r.billAllocation);
    chk(`${m.code}.charges`, m.chg, r.otherCharges);
    chk(`${m.code}.payable`, m.payable, r.totalPayable);
    chk(`${m.code}.deposits`, m.dep, r.totalDeposits);
    chk(`${m.code}.balance`, m.balance, r.balance);
  }

  // 4. member dashboard (M001 = memberId 1 via user 3)
  const mdash = await get(`/api/dashboard/member?month=${MONTH}`, member);
  const mm = d.members.find(x => x.mid === 1);
  const mo = mdash.body.monthly || {};
  chk('memberDash.regularMeals', mm.reg, mo.regularMeals, 0);
  chk('memberDash.guestMeals', mm.guest, mo.guestMeals, 0);
  chk('memberDash.totalMeals', mm.meals, mo.totalMeals, 0);
  chk('memberDash.foodCost', mm.food, mo.foodCost);
  chk('memberDash.billAllocation', mm.alloc, mo.billAllocation);
  chk('memberDash.otherCharges', mm.chg, mo.otherCharges);
  chk('memberDash.totalPayable', mm.payable, mo.totalPayable);
  chk('memberDash.totalDeposits', mm.dep, mo.totalDeposits);
  chk('memberDash.balance', mm.balance, mo.balance);
  chk('memberDash.mealRate', d.mealRateOracle, mo.mealRate, 0.0001);

  // 5. member summary report
  const ms = await get(`/api/reports/my/summary?month=${MONTH}`, member);
  chk('memberReport.meals', mm.meals, ms.body.member?.totalMeals, 0);
  chk('memberReport.payable', mm.payable, ms.body.member?.totalPayable);
  chk('memberReport.balance', mm.balance, ms.body.member?.balance);
  chk('memberReport.mealRate', d.mealRateOracle, ms.body.mealRate, 0.0001);

  // 6. member-meals admin report totals
  const mmrep = await get(`/api/reports/admin/member-meals?month=${MONTH}`, admin);
  const repTotals = (mmrep.body.rows || []).reduce((a, r) => ({
    lunch: a.lunch + Number(r.LUNCH || 0), dinner: a.dinner + Number(r.DINNER || 0), total: a.total + Number(r.TOTAL || 0)
  }), { lunch: 0, dinner: 0, total: 0 });
  // independent lunch/dinner split
  const splits = await (async () => {
    require('./backend/node_modules/dotenv').config({ path: 'backend/.env' });
    const oracledb = require('./backend/node_modules/oracledb');
    const c = await oracledb.getConnection({ user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECT_STRING });
    const [y, m] = MONTH.split('-').map(Number);
    const ms2 = new Date(Date.UTC(y, m - 1, 1) - 6 * 3600e3), me2 = new Date(Date.UTC(y, m, 1) - 6 * 3600e3);
    const r = await c.execute(`SELECT MEAL_TYPE, SUM(REGULAR_QTY) T FROM MEAL_ENTRIES WHERE STATUS='ACTIVE' AND MEAL_DATE>=:1 AND MEAL_DATE<:2 GROUP BY MEAL_TYPE`, [ms2, me2], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    await c.close();
    const o = { LUNCH: 0, DINNER: 0 }; (r.rows || []).forEach(x => o[x.MEAL_TYPE] = Number(x.T)); return o;
  })();
  chk('report.memberMeals.lunch', splits.LUNCH, repTotals.lunch, 0);
  chk('report.memberMeals.dinner', splits.DINNER, repTotals.dinner, 0);
  chk('report.memberMeals.total', d.regularMeals, repTotals.total, 0);

  console.log('\n===== API vs INDEPENDENT AUDIT =====');
  let fails = 0;
  for (const r of results) {
    if (!r.pass) fails++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  expected=${JSON.stringify(r.expected)} actual=${JSON.stringify(r.actual)}`);
  }
  console.log(`\n${results.length - fails}/${results.length} passed`);
})().catch(e => { console.error(e); process.exit(1); });
