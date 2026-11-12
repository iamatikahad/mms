require('./backend/node_modules/dotenv').config({ path: 'backend/.env' });
const oracledb = require('./backend/node_modules/oracledb');
(async () => {
  const c = await oracledb.getConnection({ user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECT_STRING });
  const q = async (s, b = []) => { const r = await c.execute(s, b, { outFormat: oracledb.OUT_FORMAT_OBJECT }); return r.rows || []; };
  console.log('ACCOUNTS'); (await q('SELECT ACCOUNT_MONTH,MEAL_RATE,STATUS,CREATED_AT,UPDATED_AT FROM MONTHLY_ACCOUNTS')).forEach(r => console.log(JSON.stringify(r)));
  console.log('CLOSINGS'); (await q('SELECT CLOSING_ID,ACCOUNT_MONTH,STATUS,CLOSED_AT,REOPENED_AT,REOPEN_COUNT,REOPEN_REASON FROM MONTHLY_CLOSINGS')).forEach(r => console.log(JSON.stringify(r)));
  console.log('SUMMARIES'); (await q('SELECT ACCOUNT_MONTH,MEMBER_ID,REGULAR_MEALS,GUEST_MEALS,FOOD_COST,BILL_ALLOCATION,OTHER_CHARGES,TOTAL_PAYABLE,TOTAL_DEPOSITS,BALANCE FROM MEMBER_MONTHLY_SUMMARY ORDER BY MEMBER_ID')).forEach(r => console.log(JSON.stringify(r)));
  for (const [t, s] of [
    ['GUEST_MEALS', 'SELECT STATUS,COUNT(*) C FROM GUEST_MEALS GROUP BY STATUS'],
    ['BAZAR', 'SELECT STATUS,COUNT(*) C FROM BAZAR_EXPENSES GROUP BY STATUS'],
    ['CHARGES', 'SELECT STATUS,COUNT(*) C FROM OTHER_CHARGES GROUP BY STATUS'],
    ['MEAL_ENTRIES', 'SELECT STATUS,COUNT(*) C FROM MEAL_ENTRIES GROUP BY STATUS'],
    ['BILLS', 'SELECT STATUS,COUNT(*) C FROM MONTHLY_BILLS GROUP BY STATUS'],
    ['DEPOSITS', 'SELECT STATUS,COUNT(*) C,SUM(AMOUNT) T FROM DEPOSITS GROUP BY STATUS'],
    ['MEAL_REQUESTS', 'SELECT STATUS,COUNT(*) C FROM MEAL_REQUESTS GROUP BY STATUS'],
  ]) console.log(t, JSON.stringify(await q(s)));
  await c.close();
})().catch(e => { console.error(e); process.exit(1); });
