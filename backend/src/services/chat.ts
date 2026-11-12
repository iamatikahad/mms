import oracledb from 'oracledb';
import { q, q1, tx, clobText } from '../db';
import { getIo, isUserOnline } from '../socket';

export interface ChatUser {
  userId: number;
  username: string;
  roleName: string;
  memberId: number | null;
}

const MAX_BODY = 2000;
const ALLOWED_REACTIONS = new Set(['👍','❤️','😂','😮','😢','🙏','🔥','🎉','👎','💯']);
const FILE_OK_MIME = /^(image\/|application\/pdf|text\/)/;

async function getSetting(key: string, dflt: string): Promise<string> {
  const r = await q1<{ SETTING_VALUE: any }>(
    `SELECT SETTING_VALUE FROM SYSTEM_SETTINGS WHERE SETTING_KEY=:1`, [key]);
  const v = await clobText(r?.SETTING_VALUE);
  return v == null ? dflt : v.replace(/^"|"$/g, '');
}

export async function editWindowMinutes(): Promise<number> {
  const m = Number(await getSetting('chat.edit_window_minutes', '15'));
  return Number.isFinite(m) && m > 0 ? m : 15;
}

// ---------- conversation access ----------

export async function getConversation(id: number) {
  return q1<any>(`SELECT * FROM CONVERSATIONS WHERE CONVERSATION_ID=:1`, [id]);
}

export async function isParticipant(convId: number, userId: number): Promise<boolean> {
  const r = await q1<{ C: number }>(
    `SELECT COUNT(*) C FROM CONVERSATION_PARTICIPANTS WHERE CONVERSATION_ID=:1 AND USER_ID=:2`,
    [convId, userId]);
  return Number(r?.C ?? 0) > 0;
}

/** GROUP convs are open to all active users; DIRECT convs need participation (admins may moderate). */
export async function canAccessConversation(conv: any, user: ChatUser): Promise<boolean> {
  if (conv.CONVERSATION_TYPE === 'GROUP') return true;
  if (user.roleName === 'SUPER_ADMIN' || user.roleName === 'ADMIN') return true;
  return isParticipant(Number(conv.CONVERSATION_ID), user.userId);
}

export async function groupConversationId(): Promise<number> {
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
}

export async function ensureParticipant(convId: number, userId: number) {
  await tx(async conn => {
    await conn.execute(
      `MERGE INTO CONVERSATION_PARTICIPANTS p USING (SELECT :1 C, :2 U FROM DUAL)
       ON (p.CONVERSATION_ID=:1 AND p.USER_ID=:2)
       WHEN NOT MATCHED THEN INSERT (CONVERSATION_ID, USER_ID) VALUES (:1,:2)`,
      [convId, userId]);
  });
}

// ---------- conversations list ----------

export async function listConversations(user: ChatUser) {
  const uid = user.userId;
  const gid = await groupConversationId();

  const directs = await q<any>(
    `SELECT c.CONVERSATION_ID, c.CONVERSATION_TYPE, c.TITLE, c.UPDATED_AT,
            p2.USER_ID OTHER_USER_ID, p2.LAST_READ_MESSAGE_ID, p2.LAST_READ_AT,
            u.USERNAME OTHER_USERNAME, u.FULL_NAME OTHER_FULL_NAME, m.MEMBER_CODE OTHER_MEMBER_CODE
     FROM CONVERSATIONS c
     JOIN CONVERSATION_PARTICIPANTS p1 ON p1.CONVERSATION_ID=c.CONVERSATION_ID AND p1.USER_ID=:1
     JOIN CONVERSATION_PARTICIPANTS p2 ON p2.CONVERSATION_ID=c.CONVERSATION_ID AND p2.USER_ID<>:1
     LEFT JOIN USERS u ON u.USER_ID=p2.USER_ID
     LEFT JOIN MEMBERS m ON m.USER_ID=p2.USER_ID AND m.STATUS='ACTIVE'
     WHERE c.CONVERSATION_TYPE='DIRECT'
     ORDER BY c.UPDATED_AT DESC NULLS LAST`, [uid]);

  // group stats for this user
  const gp = await q1<any>(
    `SELECT LAST_READ_MESSAGE_ID, LAST_READ_AT FROM CONVERSATION_PARTICIPANTS
     WHERE CONVERSATION_ID=:1 AND USER_ID=:2`, [gid, uid]);
  const gUnread = await unreadCount(gid, uid, gp?.LAST_READ_MESSAGE_ID ?? null, gp?.LAST_READ_AT ?? null);
  const gLast = await lastMessageOf(gid);

  // per-user mute flags
  const muteRows = await q<{ CONVERSATION_ID: number }>(
    `SELECT CONVERSATION_ID FROM CHAT_MUTES WHERE USER_ID=:1 AND MUTED=1`, [uid]);
  const mutedSet = new Set(muteRows.map(r => Number(r.CONVERSATION_ID)));

  const out: any[] = [{
    conversationId: gid,
    type: 'GROUP',
    title: 'Community Chat',
    isGroup: true,
    otherUserId: null,
    lastMessage: gLast,
    unread: gUnread,
    muted: mutedSet.has(gid),
    online: null,
  }];

  for (const d of directs) {
    const cid = Number(d.CONVERSATION_ID);
    const unread = await unreadCount(cid, uid, d.LAST_READ_MESSAGE_ID, d.LAST_READ_AT);
    out.push({
      conversationId: cid,
      type: 'DIRECT',
      title: d.TITLE || d.OTHER_FULL_NAME || d.OTHER_USERNAME,
      isGroup: false,
      otherUserId: Number(d.OTHER_USER_ID),
      otherName: d.OTHER_FULL_NAME || d.OTHER_USERNAME,
      otherUsername: d.OTHER_USERNAME,
      otherMemberCode: d.OTHER_MEMBER_CODE,
      otherOnline: isUserOnline(Number(d.OTHER_USER_ID)),
      lastMessage: await lastMessageOf(cid),
      unread,
      muted: mutedSet.has(cid),
      online: null,
    });
  }
  return out;
}

async function lastMessageOf(convId: number) {
  const r = await q1<any>(
    `SELECT m.MESSAGE_ID, DBMS_LOB.SUBSTR(m.BODY, 4000, 1) AS BODY, m.FILE_ID, m.CREATED_AT, m.SENDER_ID, m.DELETED_AT,
            COALESCE(mm.FULL_NAME, uu.FULL_NAME, uu.USERNAME) SENDER_NAME
     FROM MESSAGES m
     JOIN USERS uu ON uu.USER_ID=m.SENDER_ID
     LEFT JOIN MEMBERS mm ON mm.USER_ID=m.SENDER_ID AND mm.STATUS='ACTIVE'
     WHERE m.CONVERSATION_ID=:1 AND m.DELETED_AT IS NULL
     ORDER BY m.MESSAGE_ID DESC FETCH FIRST 1 ROWS ONLY`, [convId]);
  if (!r) return null;
  return {
    id: Number(r.MESSAGE_ID), senderName: r.SENDER_NAME,
    preview: r.DELETED_AT ? '🚫' : (r.BODY ? String(r.BODY).slice(0, 80) : (r.FILE_ID ? '📎 file' : '')),
    at: r.CREATED_AT,
  };
}

async function unreadCount(convId: number, userId: number, lastReadId: number | null, lastReadAt: any): Promise<number> {
  const binds: any[] = [convId, userId];
  let since = '';
  if (lastReadId) { binds.push(lastReadId); since = ` AND m.MESSAGE_ID > :${binds.length}`; }
  else if (lastReadAt) { binds.push(lastReadAt); since = ` AND m.CREATED_AT > :${binds.length}`; }
  const r = await q1<{ C: number }>(
    `SELECT COUNT(*) C FROM MESSAGES m
     WHERE m.CONVERSATION_ID=:1 AND m.SENDER_ID<>:2 AND m.DELETED_AT IS NULL ${since}
       AND NOT EXISTS (SELECT 1 FROM MESSAGE_DELETED_FOR d WHERE d.MESSAGE_ID=m.MESSAGE_ID AND d.USER_ID=:2)`,
    binds);
  return Number(r?.C ?? 0);
}

export async function unreadTotal(userId: number): Promise<number> {
  const convs = await listConversations({ userId, username: '', roleName: '', memberId: null });
  return convs.reduce((a, c) => a + (c.unread || 0), 0);
}

// ---------- members for DM picker ----------

export async function chatMembers() {
  return q<any>(
    `SELECT u.USER_ID, u.USERNAME, u.FULL_NAME USER_FULL_NAME, m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME
     FROM MEMBERS m JOIN USERS u ON u.USER_ID=m.USER_ID
     WHERE m.STATUS='ACTIVE' AND u.STATUS='ACTIVE'
     ORDER BY m.FULL_NAME`);
}

// ---------- direct conversation ----------

export async function getOrCreateDirect(user: ChatUser, targetUserId: number) {
  const target = await q1<any>(`SELECT USER_ID, STATUS FROM USERS WHERE USER_ID=:1`, [targetUserId]);
  if (!target || target.STATUS !== 'ACTIVE') throw new Error('USER_NOT_FOUND');
  if (targetUserId === user.userId) throw new Error('CANNOT_MESSAGE_SELF');

  const existing = await q1<{ CONVERSATION_ID: number }>(
    `SELECT c.CONVERSATION_ID FROM CONVERSATIONS c
     WHERE c.CONVERSATION_TYPE='DIRECT'
       AND (SELECT COUNT(*) FROM CONVERSATION_PARTICIPANTS p WHERE p.CONVERSATION_ID=c.CONVERSATION_ID)=2
       AND EXISTS (SELECT 1 FROM CONVERSATION_PARTICIPANTS p WHERE p.CONVERSATION_ID=c.CONVERSATION_ID AND p.USER_ID=:1)
       AND EXISTS (SELECT 1 FROM CONVERSATION_PARTICIPANTS p WHERE p.CONVERSATION_ID=c.CONVERSATION_ID AND p.USER_ID=:2)
     FETCH FIRST 1 ROWS ONLY`, [user.userId, targetUserId]);
  if (existing) return Number(existing.CONVERSATION_ID);

  return tx(async conn => {
    const ob = [] as any[];
    await conn.execute(
      `INSERT INTO CONVERSATIONS (CONVERSATION_TYPE, CREATED_BY) VALUES ('DIRECT',:1) RETURNING CONVERSATION_ID INTO :2`,
      [user.userId, { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: ob });
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

// ---------- messages ----------

function msgSelect(extra = '') {
  return `SELECT m.MESSAGE_ID, m.CONVERSATION_ID, m.SENDER_ID, m.REPLY_TO_ID, DBMS_LOB.SUBSTR(m.BODY, 4000, 1) AS BODY,
            m.FILE_ID, m.FILE_NAME, m.FILE_MIME, m.CREATED_AT, m.EDITED_AT, m.DELETED_AT, m.DELETED_BY,
            COALESCE(mm.FULL_NAME, uu.FULL_NAME, uu.USERNAME) SENDER_NAME,
            ru.USERNAME DELETED_BY_NAME ${extra}
     FROM MESSAGES m
     JOIN USERS uu ON uu.USER_ID=m.SENDER_ID
     LEFT JOIN MEMBERS mm ON mm.USER_ID=m.SENDER_ID AND mm.STATUS='ACTIVE'
     LEFT JOIN USERS ru ON ru.USER_ID=m.DELETED_BY`;
}

async function reactionsFor(ids: number[]) {
  if (!ids.length) return new Map<number, any[]>();
  const binds: any[] = ids;
  const ph = ids.map((_, i) => `:${i + 1}`).join(',');
  const rows = await q<any>(
    `SELECT MESSAGE_ID, EMOJI, COUNT(*) CNT, LISTAGG(USER_ID, ',') WITHIN GROUP (ORDER BY USER_ID) UIDS
     FROM MESSAGE_REACTIONS WHERE MESSAGE_ID IN (${ph}) GROUP BY MESSAGE_ID, EMOJI`, binds);
  const map = new Map<number, any[]>();
  for (const r of rows) {
    const arr = map.get(Number(r.MESSAGE_ID)) || [];
    arr.push({ emoji: r.EMOJI, count: Number(r.CNT), userIds: String(r.UIDS).split(',').map(Number) });
    map.set(Number(r.MESSAGE_ID), arr);
  }
  return map;
}

async function repliesFor(rows: any[]) {
  const ids = rows.map(r => Number(r.REPLY_TO_ID)).filter(Boolean);
  if (!ids.length) return new Map<number, any>();
  const binds: any[] = ids;
  const ph = ids.map((_, i) => `:${i + 1}`).join(',');
  const rr = await q<any>(
    `SELECT m.MESSAGE_ID, COALESCE(mm.FULL_NAME, uu.FULL_NAME, uu.USERNAME) SENDER_NAME, DBMS_LOB.SUBSTR(m.BODY, 4000, 1) AS BODY, m.DELETED_AT
     FROM MESSAGES m JOIN USERS uu ON uu.USER_ID=m.SENDER_ID
     LEFT JOIN MEMBERS mm ON mm.USER_ID=m.SENDER_ID AND mm.STATUS='ACTIVE'
     WHERE m.MESSAGE_ID IN (${ph})`, binds);
  const map = new Map<number, any>();
  for (const r of rr) {
    map.set(Number(r.MESSAGE_ID), {
      id: Number(r.MESSAGE_ID), senderName: r.SENDER_NAME,
      preview: r.DELETED_AT ? '🚫' : String(r.BODY ?? '').slice(0, 120),
    });
  }
  return map;
}

async function deletedForMeSet(convId: number, userId: number): Promise<Set<number>> {
  const rows = await q<{ MESSAGE_ID: number }>(
    `SELECT d.MESSAGE_ID FROM MESSAGE_DELETED_FOR d
     JOIN MESSAGES m ON m.MESSAGE_ID=d.MESSAGE_ID
     WHERE m.CONVERSATION_ID=:1 AND d.USER_ID=:2`, [convId, userId]);
  return new Set(rows.map(r => Number(r.MESSAGE_ID)));
}

/** Shape a DB row into the API/socket payload. */
function shape(r: any, user: ChatUser, reactions: Map<number, any[]>, replies: Map<number, any>, convType: string, receipts?: Map<number, any>) {
  const id = Number(r.MESSAGE_ID);
  const deletedEveryone = !!r.DELETED_AT;
  const reactionsArr = (reactions.get(id) || []).map(x => ({ ...x, mine: x.userIds.includes(user.userId) }));
  const rcpt = receipts?.get(id);
  return {
    id,
    conversationId: Number(r.CONVERSATION_ID),
    senderId: Number(r.SENDER_ID),
    senderName: r.SENDER_NAME,
    replyTo: r.REPLY_TO_ID ? replies.get(Number(r.REPLY_TO_ID)) || null : null,
    body: deletedEveryone ? null : (r.BODY ?? null),
    file: (!deletedEveryone && r.FILE_ID) ? {
      id: Number(r.FILE_ID), name: r.FILE_NAME, mime: r.FILE_MIME,
      url: `/api/files/${r.FILE_ID}`,
    } : null,
    reactions: reactionsArr,
    createdAt: r.CREATED_AT,
    editedAt: r.EDITED_AT ?? null,
    deletedForEveryone: deletedEveryone,
    deletedByName: deletedEveryone ? (r.DELETED_BY_NAME || null) : null,
    mine: Number(r.SENDER_ID) === user.userId,
    isGroup: convType === 'GROUP',
    // delivery/read for own messages in DIRECT convs
    deliveredAt: rcpt?.DELIVERED_AT ?? null,
    readAt: rcpt?.READ_AT ?? null,
  };
}

export async function listMessages(user: ChatUser, conv: any, opts: { before?: number; since?: number; limit?: number; q?: string }) {
  const convId = Number(conv.CONVERSATION_ID);
  const limit = Math.min(100, Math.max(1, Number(opts.limit || 50)));
  const binds: any[] = [convId];
  let where = 'm.CONVERSATION_ID=:1';
  if (opts.before) { binds.push(Number(opts.before)); where += ` AND m.MESSAGE_ID < :${binds.length}`; }
  if (opts.since) { binds.push(Number(opts.since)); where += ` AND m.MESSAGE_ID > :${binds.length}`; }
  if (opts.q) {
    const term = String(opts.q).slice(0, 100);
    binds.push(term, `%${term}%`);
    where += ` AND (DBMS_LOB.INSTR(m.BODY, :${binds.length - 1}) > 0 OR m.FILE_NAME LIKE :${binds.length})`;
  }
  binds.push(limit);
  const rows = await q<any>(
    `${msgSelect()} WHERE ${where}
     ORDER BY m.MESSAGE_ID DESC FETCH FIRST :${binds.length} ROWS ONLY`, binds);

  const ordered = rows.reverse();
  const hidden = await deletedForMeSet(convId, user.userId);
  const visible = ordered.filter(r => !hidden.has(Number(r.MESSAGE_ID)));

  const ids = visible.map(r => Number(r.MESSAGE_ID));
  const [reactions, replies] = await Promise.all([reactionsFor(ids), repliesFor(visible)]);

  // receipts for my own messages in DIRECT convs
  let receipts = new Map<number, any>();
  if (conv.CONVERSATION_TYPE === 'DIRECT') {
    const myIds = visible.filter(r => Number(r.SENDER_ID) === user.userId).map(r => Number(r.MESSAGE_ID));
    if (myIds.length) {
      const ph = myIds.map((_, i) => `:${i + 1}`).join(',');
      const rr = await q<any>(
        `SELECT MESSAGE_ID, DELIVERED_AT, READ_AT FROM MESSAGE_RECEIPTS WHERE MESSAGE_ID IN (${ph})`, myIds);
      receipts = new Map(rr.map(x => [Number(x.MESSAGE_ID), x]));
    }
  }

  return {
    messages: visible.map(r => shape(r, user, reactions, replies, conv.CONVERSATION_TYPE, receipts)),
    latestId: ids.length ? Math.max(...ids) : 0,
  };
}

export async function createMessage(user: ChatUser, conv: any, opts: { body?: string; fileId?: number | null; replyToId?: number | null }) {
  const convId = Number(conv.CONVERSATION_ID);
  const text = String(opts.body ?? '').trim().slice(0, MAX_BODY) || null;
  const fileId = opts.fileId ? Number(opts.fileId) : null;
  const replyToId = opts.replyToId ? Number(opts.replyToId) : null;
  if (!text && !fileId) throw new Error('EMPTY_MESSAGE');

  let fileMeta: any = null;
  if (fileId) {
    fileMeta = await q1<any>(`SELECT FILE_ID, ORIGINAL_NAME, MIME_TYPE, UPLOADED_BY FROM UPLOADED_FILES WHERE FILE_ID=:1`, [fileId]);
    if (!fileMeta) throw new Error('FILE_NOT_FOUND');
    if (fileMeta.UPLOADED_BY !== user.userId && user.roleName !== 'SUPER_ADMIN' && user.roleName !== 'ADMIN')
      throw new Error('FILE_NOT_OWNED');
    if (fileMeta.MIME_TYPE && !FILE_OK_MIME.test(fileMeta.MIME_TYPE)) throw new Error('FILE_TYPE_NOT_ALLOWED');
  }
  if (replyToId) {
    const rt = await q1<any>(
      `SELECT CONVERSATION_ID, DELETED_AT FROM MESSAGES WHERE MESSAGE_ID=:1`, [replyToId]);
    if (!rt || Number(rt.CONVERSATION_ID) !== convId) throw new Error('BAD_REPLY_TARGET');
  }

  const id = await tx(async conn => {
    const ob = [] as any[];
    await conn.execute(
      `INSERT INTO MESSAGES (CONVERSATION_ID, SENDER_ID, REPLY_TO_ID, BODY, FILE_ID, FILE_NAME, FILE_MIME)
       VALUES (:1,:2,:3,:4,:5,:6,:7) RETURNING MESSAGE_ID INTO :8`,
      [convId, user.userId, replyToId, text, fileId, fileMeta?.ORIGINAL_NAME ?? null, fileMeta?.MIME_TYPE ?? null,
       { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: ob });
    return Number(ob[0]);
  });

  const row = await q1<any>(`${msgSelect()} WHERE m.MESSAGE_ID=:1`, [id]);
  const [reactions, replies] = await Promise.all([reactionsFor([id]), repliesFor([row])]);
  const payload = shape(row, user, reactions, replies, conv.CONVERSATION_TYPE);

  // bump conversation activity
  await tx(async conn => {
    await conn.execute(`UPDATE CONVERSATIONS SET UPDATED_AT=SYSTIMESTAMP WHERE CONVERSATION_ID=:1`, [convId]);
  });
  // ensure sender participant row exists (for read tracking)
  await ensureParticipant(convId, user.userId);
  return { id, payload };
}

export async function editMessage(user: ChatUser, messageId: number, body: string) {
  const row = await q1<any>(
    `SELECT MESSAGE_ID, CONVERSATION_ID, SENDER_ID, DELETED_AT, CREATED_AT FROM MESSAGES WHERE MESSAGE_ID=:1`, [messageId]);
  if (!row) throw new Error('NOT_FOUND');
  if (Number(row.SENDER_ID) !== user.userId) throw new Error('NOT_YOUR_MESSAGE');
  if (row.DELETED_AT) throw new Error('MESSAGE_DELETED');
  const conv = await getConversation(Number(row.CONVERSATION_ID));
  if (!(await canAccessConversation(conv, user))) throw new Error('FORBIDDEN');

  const windowMin = await editWindowMinutes();
  const ageMs = Date.now() - new Date(row.CREATED_AT).getTime();
  if (ageMs > windowMin * 60 * 1000) throw new Error('EDIT_WINDOW_EXPIRED');

  const text = String(body ?? '').trim().slice(0, MAX_BODY);
  if (!text) throw new Error('EMPTY_MESSAGE');
  await tx(async conn => {
    await conn.execute(
      `UPDATE MESSAGES m SET m.BODY = :2, m.EDITED_AT = SYSTIMESTAMP WHERE m.MESSAGE_ID = :1`,
      [messageId, text]);
  });
  return fetchShaped(user, conv, messageId);
}

export async function deleteMessage(user: ChatUser, messageId: number, scope: 'me' | 'everyone') {
  const row = await q1<any>(
    `SELECT MESSAGE_ID, CONVERSATION_ID, SENDER_ID, DELETED_AT FROM MESSAGES WHERE MESSAGE_ID=:1`, [messageId]);
  if (!row) throw new Error('NOT_FOUND');
  const conv = await getConversation(Number(row.CONVERSATION_ID));
  if (!(await canAccessConversation(conv, user))) throw new Error('FORBIDDEN');
  const isSender = Number(row.SENDER_ID) === user.userId;
  const isMod = user.roleName === 'SUPER_ADMIN' || user.roleName === 'ADMIN';

  if (scope === 'me') {
    await tx(async conn => {
      await conn.execute(
        `MERGE INTO MESSAGE_DELETED_FOR d USING (SELECT :1 M, :2 U FROM DUAL)
         ON (d.MESSAGE_ID=:1 AND d.USER_ID=:2)
         WHEN NOT MATCHED THEN INSERT (MESSAGE_ID, USER_ID) VALUES (:1,:2)`,
        [messageId, user.userId]);
    });
    return { scope: 'me' as const };
  }
  if (scope !== 'everyone') throw new Error('BAD_SCOPE');
  if (!isSender && !isMod) throw new Error('FORBIDDEN');
  if (row.DELETED_AT) throw new Error('ALREADY_DELETED');
  await tx(async conn => {
    await conn.execute(
      `UPDATE MESSAGES SET DELETED_AT=SYSTIMESTAMP, DELETED_BY=:2 WHERE MESSAGE_ID=:1`,
      [messageId, user.userId]);
  });
  return { scope: 'everyone' as const };
}

async function fetchShaped(user: ChatUser, conv: any, messageId: number) {
  const row = await q1<any>(`${msgSelect()} WHERE m.MESSAGE_ID=:1`, [messageId]);
  const [reactions, replies] = await Promise.all([reactionsFor([messageId]), repliesFor([row])]);
  return shape(row, user, reactions, replies, conv.CONVERSATION_TYPE);
}

export async function toggleReaction(user: ChatUser, conv: any, messageId: number, emoji: string) {
  const e = String(emoji).slice(0, 16);
  if (!ALLOWED_REACTIONS.has(e)) throw new Error('BAD_EMOJI');
  const row = await q1<any>(`SELECT MESSAGE_ID, DELETED_AT FROM MESSAGES WHERE MESSAGE_ID=:1 AND CONVERSATION_ID=:2`, [messageId, conv.CONVERSATION_ID]);
  if (!row) throw new Error('NOT_FOUND');
  if (row.DELETED_AT) throw new Error('MESSAGE_DELETED');
  const existing = await q1<{ C: number }>(
    `SELECT COUNT(*) C FROM MESSAGE_REACTIONS WHERE MESSAGE_ID=:1 AND USER_ID=:2 AND EMOJI=:3`,
    [messageId, user.userId, e]);
  if (Number(existing?.C ?? 0) > 0) {
    await tx(async conn => {
      await conn.execute(`DELETE FROM MESSAGE_REACTIONS WHERE MESSAGE_ID=:1 AND USER_ID=:2 AND EMOJI=:3`, [messageId, user.userId, e]);
    });
  } else {
    await tx(async conn => {
      await conn.execute(`INSERT INTO MESSAGE_REACTIONS (MESSAGE_ID, USER_ID, EMOJI) VALUES (:1,:2,:3)`, [messageId, user.userId, e]);
    });
  }
  return fetchShaped(user, conv, messageId);
}

// ---------- read / delivered ----------

export async function markDelivered(userId: number, messageId: number) {
  const msg = await q1<any>(`SELECT CONVERSATION_ID FROM MESSAGES WHERE MESSAGE_ID=:1`, [messageId]);
  if (!msg) return;
  await tx(async conn => {
    await conn.execute(
      `MERGE INTO MESSAGE_RECEIPTS r USING (SELECT :1 M, :2 U FROM DUAL)
       ON (r.MESSAGE_ID=:1 AND r.USER_ID=:2)
       WHEN NOT MATCHED THEN INSERT (MESSAGE_ID, USER_ID, DELIVERED_AT) VALUES (:1,:2,SYSTIMESTAMP)
       WHEN MATCHED THEN UPDATE SET DELIVERED_AT=NVL(r.DELIVERED_AT,SYSTIMESTAMP)`,
      [messageId, userId]);
  });
}

export async function markRead(user: ChatUser, conv: any, upToMessageId: number) {
  const convId = Number(conv.CONVERSATION_ID);
  await tx(async conn => {
    await conn.execute(
      `MERGE INTO CONVERSATION_PARTICIPANTS p USING (SELECT :1 C, :2 U FROM DUAL)
       ON (p.CONVERSATION_ID=:1 AND p.USER_ID=:2)
       WHEN MATCHED THEN UPDATE SET LAST_READ_MESSAGE_ID=:3, LAST_READ_AT=SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (CONVERSATION_ID, USER_ID, LAST_READ_MESSAGE_ID, LAST_READ_AT)
         VALUES (:1,:2,:3,SYSTIMESTAMP)`,
      [convId, user.userId, upToMessageId]);
    // mark receipts read for others' messages up to this id
    await conn.execute(
      `MERGE INTO MESSAGE_RECEIPTS r
       USING (SELECT m.MESSAGE_ID, :2 U FROM MESSAGES m
              WHERE m.CONVERSATION_ID=:1 AND m.MESSAGE_ID<=:3 AND m.SENDER_ID<>:2) s
       ON (r.MESSAGE_ID=s.MESSAGE_ID AND r.USER_ID=s.U)
       WHEN NOT MATCHED THEN INSERT (MESSAGE_ID, USER_ID, READ_AT) VALUES (s.MESSAGE_ID, s.U, SYSTIMESTAMP)
       WHEN MATCHED THEN UPDATE SET READ_AT=NVL(r.READ_AT,SYSTIMESTAMP)`,
      [convId, user.userId, upToMessageId]);
  });
  return { ok: true };
}

// ---------- search ----------

export async function searchMessages(user: ChatUser, term: string) {
  const t = String(term || '').trim().slice(0, 100);
  if (t.length < 2) return [];
  const convs = await listConversations(user);
  const out: any[] = [];
  for (const c of convs) {
    const conv = await getConversation(c.conversationId);
    if (!(await canAccessConversation(conv, user))) continue;
    const res = await listMessages(user, conv, { q: t, limit: 20 });
    for (const m of res.messages) out.push({ ...m, conversationTitle: c.title, isGroup: c.isGroup });
  }
  return out.slice(0, 50);
}

// ---------- notification preferences ----------

export interface NotifPrefs { chatNotify: boolean; messageSound: boolean; mealReminder: boolean; loginSound: boolean }

export async function getPrefs(userId: number): Promise<NotifPrefs> {
  const r = await q1<any>(
    `SELECT CHAT_NOTIFY, MESSAGE_SOUND, MEAL_REMINDER, LOGIN_SOUND FROM USER_NOTIFICATION_PREFS WHERE USER_ID=:1`, [userId]);
  return {
    chatNotify: r ? Number(r.CHAT_NOTIFY) === 1 : true,
    messageSound: r ? Number(r.MESSAGE_SOUND) === 1 : true,
    mealReminder: r ? Number(r.MEAL_REMINDER) === 1 : true,
    loginSound: r ? Number(r.LOGIN_SOUND) === 1 : true,
  };
}

export async function setPrefs(userId: number, p: Partial<NotifPrefs>) {
  const v = (x: any, d: number) => (x === undefined ? d : (x ? 1 : 0));
  const cur = await getPrefs(userId);
  await tx(async conn => {
    await conn.execute(
      `MERGE INTO USER_NOTIFICATION_PREFS p USING (SELECT :1 U FROM DUAL)
       ON (p.USER_ID=:1)
       WHEN MATCHED THEN UPDATE SET CHAT_NOTIFY=:2, MESSAGE_SOUND=:3, MEAL_REMINDER=:4, LOGIN_SOUND=:5, UPDATED_AT=SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (USER_ID, CHAT_NOTIFY, MESSAGE_SOUND, MEAL_REMINDER, LOGIN_SOUND)
         VALUES (:1,:2,:3,:4,:5)`,
      [userId,
       v(p.chatNotify, cur.chatNotify ? 1 : 0), v(p.messageSound, cur.messageSound ? 1 : 0),
       v(p.mealReminder, cur.mealReminder ? 1 : 0), v(p.loginSound, cur.loginSound ? 1 : 0)]);
  });
  return getPrefs(userId);
}

// keep getIo import used for emit helpers elsewhere
export { getIo };

// ---------- chat theme + mutes (per user) ----------

export interface ChatTheme { themeKey?: string; custom?: any; overrides?: Record<string, string> }

function parseClobJson(v: any): any {
  if (v == null) return null;
  if (typeof v === 'object' && typeof v.getData === 'function') return null; // Lob - should not happen w/ SUBSTR
  try { return JSON.parse(String(v)); } catch { return null; }
}

export async function getTheme(userId: number): Promise<ChatTheme> {
  const r = await q1<any>(
    `SELECT THEME_KEY, DBMS_LOB.SUBSTR(CUSTOM_JSON, 8000, 1) CUSTOM_JSON, DBMS_LOB.SUBSTR(CONV_OVERRIDES, 8000, 1) CONV_OVERRIDES
     FROM CHAT_THEME_PREFS WHERE USER_ID=:1`, [userId]);
  return {
    themeKey: r?.THEME_KEY || 'whatsapp',
    custom: parseClobJson(r?.CUSTOM_JSON),
    overrides: parseClobJson(r?.CONV_OVERRIDES) || {},
  };
}

export async function setTheme(userId: number, p: ChatTheme) {
  const themeKey = String(p.themeKey || 'whatsapp').slice(0, 40);
  const custom = p.custom && typeof p.custom === 'object' ? JSON.stringify(p.custom).slice(0, 7900) : null;
  const overrides = p.overrides && typeof p.overrides === 'object' ? JSON.stringify(p.overrides).slice(0, 7900) : '{}';
  await tx(async conn => {
    await conn.execute(
      `MERGE INTO CHAT_THEME_PREFS t USING (SELECT :1 U FROM DUAL)
       ON (t.USER_ID=:1)
       WHEN MATCHED THEN UPDATE SET THEME_KEY=:2, CUSTOM_JSON=:3, CONV_OVERRIDES=:4, UPDATED_AT=SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (USER_ID, THEME_KEY, CUSTOM_JSON, CONV_OVERRIDES)
         VALUES (:1,:2,:3,:4)`,
      [userId, themeKey, custom, overrides]);
  });
  return getTheme(userId);
}

export async function setMute(userId: number, convId: number, muted: boolean) {
  await tx(async conn => {
    if (muted) {
      await conn.execute(
        `MERGE INTO CHAT_MUTES m USING (SELECT :1 U, :2 C FROM DUAL)
         ON (m.USER_ID=:1 AND m.CONVERSATION_ID=:2)
         WHEN MATCHED THEN UPDATE SET MUTED=1, UPDATED_AT=SYSTIMESTAMP
         WHEN NOT MATCHED THEN INSERT (USER_ID, CONVERSATION_ID, MUTED) VALUES (:1,:2,1)`,
        [userId, convId]);
    } else {
      await conn.execute(`DELETE FROM CHAT_MUTES WHERE USER_ID=:1 AND CONVERSATION_ID=:2`, [userId, convId]);
    }
  });
  return { muted };
}

export async function isMuted(userId: number, convId: number): Promise<boolean> {
  const r = await q1<{ C: number }>(
    `SELECT COUNT(*) C FROM CHAT_MUTES WHERE USER_ID=:1 AND CONVERSATION_ID=:2 AND MUTED=1`, [userId, convId]);
  return Number(r?.C ?? 0) > 0;
}
