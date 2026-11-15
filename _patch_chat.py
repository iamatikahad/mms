import io
p = r'C:\Users\Atik\Music\New folder\backend\src\services\chat.ts'
s = io.open(p, encoding='utf8').read()

def rep(a, b):
    global s
    if a not in s:
        print('MISS:', a[:80].replace('\n', ' '))
    else:
        s = s.replace(a, b)

rep("""export interface ChatUser {
  userId: number;
  username: string;
  roleName: string;
  memberId: number | null;
}""", """export interface ChatUser {
  userId: number;
  username: string;
  roleName: string;
  memberId: number | null;
  messId?: number | null;
  messIds?: number[];
}""")

rep("""export async function canAccessConversation(conv: any, user: ChatUser): Promise<boolean> {
  if (conv.CONVERSATION_TYPE === 'GROUP') return true;""",
"""export async function canAccessConversation(conv: any, user: ChatUser): Promise<boolean> {
  // tenant isolation: conversation must belong to a mess the user can access
  if (conv.MESS_ID != null && user.messIds && !user.messIds.includes(Number(conv.MESS_ID))) return false;
  if (conv.CONVERSATION_TYPE === 'GROUP') return true;""")

rep("""export async function groupConversationId(): Promise<number> {
  const r = await q1<{ CONVERSATION_ID: number }>(
    `SELECT CONVERSATION_ID FROM CONVERSATIONS WHERE CONVERSATION_TYPE='GROUP' ORDER BY CONVERSATION_ID FETCH FIRST 1 ROWS ONLY`);
  if (r) return Number(r.CONVERSATION_ID);
  // self-heal if migration data missing
  const out = await tx(async conn => {
    const ob = [] as any[];
    await conn.execute(
      `INSERT INTO CONVERSATIONS (CONVERSATION_TYPE, TITLE) VALUES ('GROUP','Community Chat') RETURNING CONVERSATION_ID INTO :1`,
      [{ dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: ob });
    return Number(ob[0]);
  });
  return out;
}""", """export async function groupConversationId(messId?: number | null): Promise<number> {
  const mid = messId ?? null;
  const r = mid != null
    ? await q1<{ CONVERSATION_ID: number }>(
        `SELECT CONVERSATION_ID FROM CONVERSATIONS WHERE CONVERSATION_TYPE='GROUP' AND MESS_ID=:1 ORDER BY CONVERSATION_ID FETCH FIRST 1 ROWS ONLY`, [mid])
    : await q1<{ CONVERSATION_ID: number }>(
        `SELECT CONVERSATION_ID FROM CONVERSATIONS WHERE CONVERSATION_TYPE='GROUP' ORDER BY CONVERSATION_ID FETCH FIRST 1 ROWS ONLY`);
  if (r) return Number(r.CONVERSATION_ID);
  // self-heal: one GROUP conversation per mess
  const out = await tx(async conn => {
    const ob = [] as any[];
    await conn.execute(
      `INSERT INTO CONVERSATIONS (CONVERSATION_TYPE, TITLE, MESS_ID) VALUES ('GROUP','Community Chat',:2) RETURNING CONVERSATION_ID INTO :1`,
      [{ dir: oracledb.BIND_OUT, type: oracledb.NUMBER }, mid], { outBinds: ob });
    return Number(ob[0]);
  });
  return out;
}""")

rep("""export async function listConversations(user: ChatUser) {
  const uid = user.userId;
  const gid = await groupConversationId();""",
"""export async function listConversations(user: ChatUser, messId?: number | null) {
  const uid = user.userId;
  const activeMess = messId ?? user.messId ?? null;
  const gid = await groupConversationId(activeMess);""")

rep("""     WHERE c.CONVERSATION_TYPE='DIRECT'
     ORDER BY c.UPDATED_AT DESC NULLS LAST`, [uid]);""",
"""     WHERE c.CONVERSATION_TYPE='DIRECT'
       AND (${activeMess != null ? 'c.MESS_ID=:2' : '1=1'})
     ORDER BY c.UPDATED_AT DESC NULLS LAST`,
    activeMess != null ? [uid, activeMess] : [uid]);""")

rep("""export async function unreadTotal(userId: number): Promise<number> {
  const convs = await listConversations({ userId, username: '', roleName: '', memberId: null });""",
"""export async function unreadTotal(userId: number, messId?: number | null): Promise<number> {
  const convs = await listConversations({ userId, username: '', roleName: '', memberId: null, messId: messId ?? null });""")

rep("""export async function chatMembers() {
  return q<any>(
    `SELECT u.USER_ID, u.USERNAME, u.FULL_NAME USER_FULL_NAME, m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME
     FROM MEMBERS m JOIN USERS u ON u.USER_ID=m.USER_ID
     WHERE m.STATUS='ACTIVE' AND u.STATUS='ACTIVE'
     ORDER BY m.FULL_NAME`);
}""",
"""export async function chatMembers(messId?: number | null) {
  const cond = messId ? ' AND m.MESS_ID=:1' : '';
  return q<any>(
    `SELECT u.USER_ID, u.USERNAME, u.FULL_NAME USER_FULL_NAME, m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME
     FROM MEMBERS m JOIN USERS u ON u.USER_ID=m.USER_ID
     WHERE m.STATUS='ACTIVE' AND u.STATUS='ACTIVE'${cond}
     ORDER BY m.FULL_NAME`, messId ? [messId] : []);
}""")

# getOrCreateDirect — replace whole function header through the INSERT
old_direct = s[s.index('export async function getOrCreateDirect'):s.index('// ---------- messages ----------')]
new_direct = """export async function getOrCreateDirect(user: ChatUser, targetUserId: number, messId?: number | null) {
  const target = await q1<any>(`SELECT USER_ID, STATUS FROM USERS WHERE USER_ID=:1`, [targetUserId]);
  if (!target || target.STATUS !== 'ACTIVE') throw new Error('USER_NOT_FOUND');
  if (targetUserId === user.userId) throw new Error('CANNOT_MESSAGE_SELF');
  const mid = messId ?? user.messId ?? null;

  // tenant isolation: target must also have access to this mess
  if (mid != null && user.roleName !== 'SUPER_ADMIN') {
    const tgt = await q1<{ C: number }>(
      `SELECT COUNT(*) C FROM (
         SELECT MESS_ID FROM MEMBERS WHERE USER_ID=:1 AND STATUS='ACTIVE'
         UNION
         SELECT MESS_ID FROM MESS_USER_ACCESS WHERE USER_ID=:1 AND STATUS='ACTIVE')
       WHERE MESS_ID=:2`, [targetUserId, mid]);
    if (!tgt || Number(tgt.C) === 0) throw new Error('CROSS_MESS_DM_DENIED');
  }

  const existing = await q1<{ CONVERSATION_ID: number }>(
    `SELECT c.CONVERSATION_ID FROM CONVERSATIONS c
     WHERE c.CONVERSATION_TYPE='DIRECT'
       AND (${mid != null ? 'c.MESS_ID=:3 AND' : ''} 1=1)
       AND (SELECT COUNT(*) FROM CONVERSATION_PARTICIPANTS p WHERE p.CONVERSATION_ID=c.CONVERSATION_ID)=2
       AND EXISTS (SELECT 1 FROM CONVERSATION_PARTICIPANTS p WHERE p.CONVERSATION_ID=c.CONVERSATION_ID AND p.USER_ID=:1)
       AND EXISTS (SELECT 1 FROM CONVERSATION_PARTICIPANTS p WHERE p.CONVERSATION_ID=c.CONVERSATION_ID AND p.USER_ID=:2)
     FETCH FIRST 1 ROWS ONLY`, mid != null ? [user.userId, targetUserId, mid] : [user.userId, targetUserId]);
  if (existing) return Number(existing.CONVERSATION_ID);

  return tx(async conn => {
    const ob = [] as any[];
    await conn.execute(
      `INSERT INTO CONVERSATIONS (CONVERSATION_TYPE, CREATED_BY, MESS_ID) VALUES ('DIRECT',:1,:3) RETURNING CONVERSATION_ID INTO :2`,
      [user.userId, { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }, mid], { outBinds: ob });
    const cid = Number(ob[0]);
    await conn.execute(
      `INSERT INTO CONVERSATION_PARTICIPANTS (CONVERSATION_ID, USER_ID) VALUES (:1,:2)`,
      [cid, user.userId]);
    await conn.execute(
      `INSERT INTO CONVERSATION_PARTICIPANTS (CONVERSATION_ID, USER_ID) VALUES (:1,:2)`,
      [cid, targetUserId]);
    return cid;
  });
}

"""
s = s.replace(old_direct, new_direct)

rep("""      `INSERT INTO MESSAGES (CONVERSATION_ID, SENDER_ID, REPLY_TO_ID, BODY, FILE_ID, FILE_NAME, FILE_MIME)
       VALUES (:1,:2,:3,:4,:5,:6,:7) RETURNING MESSAGE_ID INTO :8`,
      [convId, user.userId, replyToId, text, fileId, fileMeta?.ORIGINAL_NAME ?? null, fileMeta?.MIME_TYPE ?? null,
       { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: ob });""",
"""      `INSERT INTO MESSAGES (CONVERSATION_ID, SENDER_ID, REPLY_TO_ID, BODY, FILE_ID, FILE_NAME, FILE_MIME, MESS_ID)
       VALUES (:1,:2,:3,:4,:5,:6,:7,:9) RETURNING MESSAGE_ID INTO :8`,
      [convId, user.userId, replyToId, text, fileId, fileMeta?.ORIGINAL_NAME ?? null, fileMeta?.MIME_TYPE ?? null,
       { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }, conv.MESS_ID ?? null], { outBinds: ob });""")

io.open(p, 'w', encoding='utf8').write(s)
print('done')
