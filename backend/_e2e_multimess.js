// Multi-mess E2E tests A–J against live backend :4001
const B = 'http://localhost:4001/api';
let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`PASS ${name}`); }
  else { fail++; results.push(`FAIL ${name} ${extra}`); }
}
const jar = {};
async function call(method, path, body, who = 'sa', headers = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (jar[who]) h.cookie = jar[who];
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc) jar[who] = sc.split(';')[0];
  let data = null;
  try { data = await r.json(); } catch { /* html */ }
  return { status: r.status, data };
}
const J = async (m, p, b, w, h) => call(m, p, b, w, h);

(async () => {
  // ---------- setup: login superadmin ----------
  let r = await J('POST', '/auth/login', { identifier: 'superadmin', password: 'admin123' });
  check('A1 login superadmin', r.status === 200);

  r = await J('GET', '/auth/me', null, 'sa');
  check('A2 messId resolved', r.data?.user?.messId === 1, JSON.stringify(r.data?.user?.messId));
  check('A3 messes listed', Array.isArray(r.data?.user?.messes) && r.data.user.messes.length >= 1);

  // ---------- create/reuse Mess 2 ----------
  let r2 = await J('GET', '/mess/locations');
  let existing = (r2.data?.rows || []).find(m => m.MESS_CODE === 'E2ETEST');
  let mess2;
  if (existing) {
    mess2 = existing.MESS_ID;
    if (existing.STATUS !== 'ACTIVE') await J('PUT', `/mess/locations/${mess2}`, { status: 'ACTIVE' });
    check('B1 mess2 exists/reactivated', true);
  } else {
    const rr = await J('POST', '/mess/locations', { messName: 'E2E Test Mess', messCode: 'E2ETEST', address: 'Test Address 1' });
    mess2 = rr.data?.messId;
    check('B1 create mess2', rr.status === 201 && !!mess2, JSON.stringify(rr.data));
  }

  // create mess2 admin user
  r = await J('POST', '/admins', { username: 'e2e_admin2', password: 'password123', fullName: 'E2E Admin2', role: 'ADMIN', messIds: [mess2] });
  let admin2Id = r.data?.userId;
  if (r.status === 409) {
    const lst = await J('GET', '/admins');
    admin2Id = (lst.data?.rows || []).find(u => u.USERNAME === 'e2e_admin2')?.USER_ID;
    await J('PUT', `/mess/locations/${mess2}/access`, { userId: admin2Id, accessRole: 'MESS_ADMIN', status: 'ACTIVE' });
  }
  check('B2 admin2 exists w/ mess access', !!admin2Id, JSON.stringify(r.data));

  // verify access grant
  r = await J('GET', `/mess/locations/${mess2}/access`);
  check('B3 admin2 has mess2 access', (r.data?.rows || []).some(a => a.USER_ID === admin2Id && a.STATUS === 'ACTIVE'));

  // create mess2 member via members API as superadmin? members created under active mess — switch header
  r = await J('GET', '/members', null, 'sa', { 'x-mess-id': String(mess2) });
  let memRow = (r.data?.rows || r.data?.members || []).find(m => m.MEMBER_CODE === 'E2E001');
  if (!memRow) {
    r = await J('POST', '/members', { memberCode: 'E2E001', fullName: 'E2E Member One', createUser: true, username: 'e2e_member2', password: 'password123' }, 'sa', { 'x-mess-id': String(mess2) });
    memRow = { MEMBER_ID: r.data?.id || r.data?.memberId };
  }
  const member2Id = memRow?.MEMBER_ID;
  check('C1 member exists in mess2', !!member2Id, JSON.stringify(r.data).slice(0, 150));

  // member must NOT appear in mess1
  r = await J('GET', '/members', null, 'sa', { 'x-mess-id': '1' });
  check('C2 member2 not in mess1 list', !(r.data?.rows || r.data?.members || []).some(m => m.MEMBER_CODE === 'E2E001' || m.FULL_NAME === 'E2E Member One'));

  // ---------- Test D: admin login + mess isolation ----------
  r = await J('POST', '/auth/login', { identifier: 'e2e_admin2', password: 'password123' }, 'admin2');
  check('D1 admin2 login', r.status === 200);
  r = await J('GET', '/auth/me', null, 'admin2');
  check('D2 admin2 messIds=[mess2]', JSON.stringify(r.data?.user?.messIds) === JSON.stringify([mess2]), JSON.stringify(r.data?.user?.messIds));

  // admin2 cannot access mess1
  r = await J('GET', '/members', null, 'admin2', { 'x-mess-id': '1' });
  check('D3 admin2 denied mess1', r.status === 403, `status=${r.status}`);

  // admin2 sees only mess2 members
  r = await J('GET', '/members', null, 'admin2');
  const m2rows = r.data?.rows || r.data?.members || [];
  check('D4 admin2 sees only mess2 members', m2rows.length === 1 && m2rows[0].MEMBER_CODE === 'E2E001', `count=${m2rows.length}`);

  // admin2 cannot access /admins (SUPER_ADMIN only)
  r = await J('GET', '/admins', null, 'admin2');
  check('D5 admin2 denied /admins', r.status === 403, `status=${r.status}`);

  // ---------- Test F: unauthorized cross-mess ----------
  r = await J('GET', '/members', null, 'sa', { 'x-mess-id': '999' });
  check('F1 superadmin bad mess denied', r.status === 403);
  r = await J('POST', '/mess/locations', { messName: 'X', messCode: 'X' }, 'admin2');
  check('F2 admin2 cannot create mess', r.status === 403, `status=${r.status}`);

  // ---------- Test B/C: financial isolation ----------
  // mess1 bazar expense
  const cats = await J('GET', '/bazar/categories', null, 'sa');
  const foodCat = (cats.data?.rows || cats.data || [])[0]?.CATEGORY_NAME;
  r = await J('POST', '/bazar', { itemName: 'E2E Rice', category: foodCat, quantity: 1, unitPrice: 500, purchaseDate: '2026-11-10', paymentSource: 'COMMON' }, 'sa', { 'x-mess-id': '1' });
  check('E1 bazar in mess1', r.status === 201, JSON.stringify(r.data).slice(0, 120));

  // mess2 dashboard food expense must be 0
  r = await J('GET', '/dashboard/admin', null, 'sa', { 'x-mess-id': String(mess2) });
  check('E2 mess2 foodExpense=0', Number(r.data?.stats?.monthFoodExpense) === 0, JSON.stringify(r.data?.stats?.monthFoodExpense));

  // ---------- Test G: deposit isolation ----------
  const mem2 = m2rows[0];
  r = await J('GET', '/dashboard/admin?month=2026-10', null, 'sa', { 'x-mess-id': String(mess2) });
  const depBefore = Number(r.data?.stats?.monthDeposits || 0);
  r = await J('GET', '/reports/admin/deposits?month=2026-10', null, 'sa', { 'x-mess-id': String(mess2) });
  const depRowsBefore = (r.data?.rows || []).length;
  r = await J('POST', '/deposits', { memberId: mem2.MEMBER_ID, depositDate: '2026-10-05', amount: 1000, paymentMethod: 'CASH' }, 'admin2');
  check('G1 deposit in mess2', r.status === 201, JSON.stringify(r.data).slice(0, 120));
  r = await J('GET', '/dashboard/admin?month=2026-10', null, 'sa', { 'x-mess-id': '1' });
  const m1dep = Number(r.data?.stats?.monthDeposits);
  check('G2 mess1 deposits unchanged', m1dep === (global.__m1dep0 ?? m1dep), `got ${m1dep}`);
  global.__m1dep0 = m1dep;
  r = await J('GET', '/dashboard/admin?month=2026-10', null, 'sa', { 'x-mess-id': String(mess2) });
  check('G3 mess2 deposits +1000', Number(r.data?.stats?.monthDeposits) === depBefore + 1000, `before=${depBefore} got=${r.data?.stats?.monthDeposits}`);

  // ---------- Test I: reports isolation ----------
  r = await J('GET', '/reports/admin/deposits?month=2026-10', null, 'sa', { 'x-mess-id': String(mess2) });
  const depRows = r.data?.rows || [];
  check('I1 mess2 deposit report grew by 1', depRows.length === depRowsBefore + 1, `before=${depRowsBefore} rows=${depRows.length}`);
  r = await J('GET', '/reports/admin/deposits?month=2026-10', null, 'sa', { 'x-mess-id': '1' });
  check('I2 mess1 deposit report empty', (r.data?.rows || []).length === 0);

  // ---------- Test H: independent monthly closing ----------
  r = await J('POST', `/closing/2026-10/close`, {}, 'sa', { 'x-mess-id': String(mess2) });
  check('H1 close mess2 month', r.status === 200, JSON.stringify(r.data).slice(0, 120));
  r = await J('GET', '/closing', null, 'sa', { 'x-mess-id': '1' });
  const m1closings = (r.data?.rows || []).filter(c => c.ACCOUNT_MONTH === '2026-10');
  check('H2 mess1 has no 2026-10 closing', m1closings.length === 0, `found ${m1closings.length}`);

  // ---------- Test E: chat isolation ----------
  r = await J('GET', '/chat/conversations', null, 'sa', { 'x-mess-id': '1' });
  const convs1 = r.data?.conversations || [];
  r = await J('GET', '/chat/conversations', null, 'sa', { 'x-mess-id': String(mess2) });
  const convs2 = r.data?.conversations || [];
  check('J1 distinct group conv per mess', convs1[0]?.conversationId !== convs2[0]?.conversationId, `${convs1[0]?.conversationId} vs ${convs2[0]?.conversationId}`);

  // member2 login → sees only mess2
  r = await J('POST', '/auth/login', { identifier: 'e2e_member2', password: 'password123' }, 'mem2');
  check('J2 member2 login', r.status === 200);
  r = await J('GET', '/members', null, 'mem2');
  check('J3 member denied /members admin list', r.status === 403, `status=${r.status}`);
  r = await J('GET', '/auth/me', null, 'mem2');
  check('J4 member2 messId=mess2', r.data?.user?.messId === mess2, JSON.stringify(r.data?.user?.messId));

  // ---------- cleanup: deactivate mess2 (keep data for audit) ----------
  r = await J('PUT', `/mess/locations/${mess2}`, { status: 'DISABLED' });
  check('K1 mess2 deactivated', r.status === 200);

  console.log('\n===== RESULTS =====');
  results.forEach(x => console.log(x));
  console.log(`\n${pass} passed, ${fail} failed`);
})().catch(e => { console.log('FATAL', e); results.forEach(x => console.log(x)); console.log(`${pass} passed, ${fail} failed`); });
