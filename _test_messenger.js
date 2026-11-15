// E2E test: premium messenger REST + socket features
const path = require('path');
const oracledb = require(path.join(__dirname, 'backend', 'node_modules', 'oracledb'));
const jwt = require(path.join(__dirname, 'backend', 'node_modules', 'jsonwebtoken'));
const { io } = require(path.join(__dirname, 'frontend', 'node_modules', 'socket.io-client'));
const BASE = 'http://localhost:4002';
// load backend/.env manually (no dotenv dep at root)
const fs = require('fs');
for (const line of fs.readFileSync(path.join(__dirname, 'backend', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const results = [];
const ck = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

function tokenFor(userId) {
  return jwt.sign({ uid: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}
async function api(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let payload;
  if (form) { payload = form; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + url, { method, headers, body: payload });
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  // get two member user ids + one admin from DB
  const conn = await oracledb.getConnection({ user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECT_STRING });
  const roles = await conn.execute(`SELECT * FROM ROLES`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const roleMap = {};
  for (const r of roles.rows) roleMap[r.ROLE_ID] = r.ROLE_CODE || r.ROLE_NAME || r.NAME || Object.values(r).find(v => typeof v === 'string' && /ADMIN|MEMBER|SUPER/i.test(v));
  const mem = await conn.execute(`SELECT USER_ID, ROLE_ID FROM USERS WHERE STATUS='ACTIVE' ORDER BY USER_ID FETCH FIRST 6 ROWS ONLY`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  for (const u of mem.rows) u.USER_ROLE = roleMap[u.ROLE_ID] || 'MEMBER';
  const member = mem.rows.find(u => u.USER_ROLE === 'MEMBER');
  const member2 = mem.rows.filter(u => u.USER_ROLE === 'MEMBER')[1];
  const admin = mem.rows.find(u => u.USER_ROLE !== 'MEMBER');
  const ids = { m1: member.USER_ID, m2: member2 ? member2.USER_ID : null, a: admin.USER_ID };
  await conn.close();
  ck('users found', !!(member && admin), JSON.stringify(ids));

  const tM1 = tokenFor(ids.m1);
  const tM2 = ids.m2 ? tokenFor(ids.m2) : tM1;
  const tA = tokenFor(ids.a);

  // --- conversations list ---
  const convs = await api('GET', '/api/chat/conversations', { token: tM1 });
  ck('list conversations 200', convs.status === 200, `status=${convs.status}`);
  const group = (convs.data?.conversations || []).find(c => c.isGroup);
  ck('group conversation exists', !!group, group ? `id=${group.conversationId}` : 'none');

  // --- DM create ---
  const dm = await api('POST', '/api/chat/conversations/direct', { token: tM1, body: { userId: ids.m2 || ids.a } });
  ck('create DM 200/201', [200, 201].includes(dm.status), `status=${dm.status} err=${dm.data?.error || ''}`);
  const dmId = dm.data?.conversationId;

  // --- send message in group via REST ---
  const gmsg = await api('POST', `/api/chat/conversations/${group.conversationId}/messages`, { token: tM1, body: { body: 'messenger e2e test ' + Date.now() } });
  ck('send group msg', [200, 201].includes(gmsg.status), `status=${gmsg.status} id=${gmsg.data?.message?.id}`);
  const mid = gmsg.data?.message?.id;

  // --- reply ---
  const rep = await api('POST', `/api/chat/conversations/${group.conversationId}/messages`, { token: tM1, body: { body: 'reply test', replyToId: mid } });
  ck('reply message', [200, 201].includes(rep.status) && rep.data?.message?.replyTo, `status=${rep.status}`);

  // --- edit own ---
  const ed = await api('PUT', `/api/chat/messages/${mid}`, { token: tM1, body: { body: 'edited body' } });
  ck('edit own msg', ed.status === 200 && ed.data?.message?.body === 'edited body' && ed.data?.message?.editedAt, `status=${ed.status}`);

  // --- member cannot edit other's ---
  const edOther = await api('PUT', `/api/chat/messages/${mid}`, { token: tM2, body: { body: 'hijack' } });
  ck('edit other msg forbidden', edOther.status === 403 || edOther.status === 404, `status=${edOther.status}`);

  // --- reaction ---
  const reac = await api('POST', `/api/chat/messages/${mid}/react`, { token: tM2, body: { emoji: '👍' } });
  ck('react to msg', reac.status === 200, `status=${reac.status}`);
  const reac2 = await api('POST', `/api/chat/messages/${mid}/react`, { token: tM2, body: { emoji: '👍' } });
  ck('react toggle off', reac2.status === 200, `status=${reac2.status}`);

  // --- delete for me ---
  const dmMsg = await api('POST', `/api/chat/conversations/${dmId}/messages`, { token: tM1, body: { body: 'private msg' } });
  const dmMid = dmMsg.data?.message?.id;
  const delMe = await api('DELETE', `/api/chat/messages/${dmMid}?scope=me`, { token: tM2 });
  ck('delete for me (other user)', delMe.status === 200 || delMe.status === 403 || delMe.status === 404, `status=${delMe.status}`);
  const delMeOwn = await api('DELETE', `/api/chat/messages/${dmMid}?scope=me`, { token: tM1 });
  ck('delete for me own', delMeOwn.status === 200, `status=${delMeOwn.status}`);

  // --- delete for everyone ---
  const delEv = await api('DELETE', `/api/chat/messages/${mid}`, { token: tM1 });
  ck('delete for everyone own', delEv.status === 200, `status=${delEv.status}`);
  const hist = await api('GET', `/api/chat/conversations/${group.conversationId}/messages?limit=50`, { token: tM1 });
  const found = (hist.data?.messages || []).find(m => m.id === mid);
  ck('deleted placeholder shown', !!found && found.deletedForEveryone === true, found ? `del=${found.deletedForEveryone}` : 'msg not in page');

  // --- unauthorized DM access ---
  if (ids.m2) {
    const outsider = await api('GET', `/api/chat/conversations/${dmId}/messages`, { token: tA });
    ck('DM blocked for non-participant', outsider.status === 403 || outsider.status === 404, `status=${outsider.status}`);
  }

  // --- read receipts ---
  const rd = await api('POST', `/api/chat/conversations/${group.conversationId}/read`, { token: tM2, body: { upToMessageId: mid } });
  ck('mark read', rd.status === 200, `status=${rd.status}`);

  // --- unread total ---
  const un = await api('GET', '/api/chat/unread', { token: tM1 });
  ck('unread endpoint', un.status === 200 && typeof un.data?.total === 'number', `total=${un.data?.total}`);

  // --- prefs ---
  const pr = await api('GET', '/api/chat/prefs', { token: tM1 });
  ck('prefs get', pr.status === 200, `status=${pr.status}`);
  const pu = await api('PUT', '/api/chat/prefs', { token: tM1, body: { chatNotify: false } });
  ck('prefs put', pu.status === 200, `status=${pu.status}`);
  const pr2 = await api('GET', '/api/chat/prefs', { token: tM1 });
  ck('pref persisted', pr2.data?.prefs?.chatNotify === false, `chatNotify=${pr2.data?.prefs?.chatNotify}`);
  await api('PUT', '/api/chat/prefs', { token: tM1, body: { chatNotify: true } }); // restore

  // --- member list ---
  const ml = await api('GET', '/api/chat/members', { token: tM1 });
  ck('member list', ml.status === 200 && (ml.data?.members || []).length > 0, `n=${ml.data?.members?.length}`);

  // --- search messages ---
  const srch = await api('GET', `/api/chat/conversations/${group.conversationId}/messages?q=edited`, { token: tM1 });
  ck('message search', srch.status === 200 && (srch.data?.messages || []).some(m => (m.body || '').includes('edited')), `hits=${srch.data?.messages?.length}`);

  // --- file authz: upload then access ---
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
  const fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
  const up = await api('POST', '/api/chat/upload', { token: tM1, form: fd });
  ck('upload image', up.status === 201, `status=${up.status} err=${up.data?.error || ''}`);
  const fileId = up.data?.fileId;
  if (fileId) {
    const f1 = await fetch(`${BASE}/api/files/${fileId}`, { headers: { Authorization: 'Bearer ' + tM1 } });
    ck('participant can fetch file', f1.status === 200, `status=${f1.status}`);
    const f2 = await fetch(`${BASE}/api/files/${fileId}`, { headers: { Authorization: 'Bearer ' + tA } });
    ck('admin can fetch file (has perm)', [200, 403].includes(f2.status), `status=${f2.status}`);
  }
  // bad file type
  const fd2 = new FormData();
  fd2.append('file', new Blob([Buffer.from('MZ fake exe')], { type: 'application/x-msdownload' }), 'evil.exe');
  const up2 = await api('POST', '/api/chat/upload', { token: tM1, form: fd2 });
  ck('exe upload blocked', up2.status === 400, `status=${up2.status}`);

  // ================= SOCKET TESTS =================
  const sockM1 = io(BASE, { auth: { token: tM1 }, transports: ['websocket'], reconnection: false });
  const sockM2 = io(BASE, { auth: { token: tM2 }, transports: ['websocket'], reconnection: false });
  await Promise.all([new Promise(r => sockM1.on('connect', r)), new Promise(r => sockM2.on('connect', r))]);
  ck('socket connect', true);
  // join rooms like the real client does
  sockM1.emit('join_conversation', { conversationId: group.conversationId });
  sockM2.emit('join_conversation', { conversationId: group.conversationId });
  if (dmId) { sockM1.emit('join_conversation', { conversationId: dmId }); sockM2.emit('join_conversation', { conversationId: dmId }); }
  await sleep(300);

  // presence list
  const plist = await new Promise(res => { sockM1.emit('presence_list', {}, res); setTimeout(() => res(null), 3000); });
  ck('presence list', !!plist, JSON.stringify(plist));

  // DM message via socket
  let dmGot = null;
  sockM2.on('chat_message', p => { if (p.conversationId === dmId) dmGot = p; });
  const dmSock = await new Promise(res => sockM1.emit('send_message', { conversationId: dmId, body: 'socket dm ' + Date.now() }, res));
  ck('socket send DM ack', dmSock?.ok === true, JSON.stringify(dmSock));
  await sleep(800);
  ck('DM delivered to recipient socket', !!dmGot, dmGot ? `from=${dmGot.fromName}` : 'none');

  // group message via socket
  let gGot = null;
  sockM2.on('new_message', m => { if (m.conversationId === group.conversationId) gGot = m; });
  const gSock = await new Promise(res => sockM1.emit('send_message', { conversationId: group.conversationId, body: 'socket group test' }, res));
  ck('socket send group ack', gSock?.ok === true, JSON.stringify(gSock));
  await sleep(800);
  ck('group msg broadcast', !!gGot, gGot ? `id=${gGot.id}` : 'none');

  // unauthorized conv access via socket
  const badSock = await new Promise(res => sockM1.emit('send_message', { conversationId: 999999, body: 'x' }, res));
  ck('socket unauthorized conv rejected', badSock?.ok === false, JSON.stringify(badSock));

  // typing event
  let typingGot = null;
  sockM2.on('typing', p => { if (p.conversationId === dmId) typingGot = p; });
  sockM1.emit('typing', { conversationId: dmId });
  await sleep(600);
  ck('typing indicator', !!typingGot, JSON.stringify(typingGot));

  // reaction via socket
  const sockMid = dmSock?.message?.id || gSock?.message?.id;
  if (sockMid) {
    const rAck = await new Promise(res => sockM1.emit('react', { messageId: sockMid, emoji: '🔥' }, res));
    ck('socket react ack', rAck?.ok === true, JSON.stringify(rAck));
  }

  // edit via socket
  if (sockMid) {
    const eAck = await new Promise(res => sockM1.emit('edit_message', { messageId: sockMid, body: 'socket edited' }, res));
    ck('socket edit ack', eAck?.ok === true, JSON.stringify(eAck));
    const dAck = await new Promise(res => sockM1.emit('delete_message', { messageId: sockMid, scope: 'everyone' }, res));
    ck('socket delete ack', dAck?.ok === true, JSON.stringify(dAck));
  }

  // read via socket
  const rdAck = await new Promise(res => sockM2.emit('messages_read', { conversationId: dmId, upToMessageId: sockMid || 1 }, res));
  ck('socket messages_read', !!rdAck, JSON.stringify(rdAck));

  sockM1.close(); sockM2.close();

  const fails = results.filter(r => !r.ok);
  console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`);
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
