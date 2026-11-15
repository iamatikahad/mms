import io
p = r'C:\Users\Atik\Music\New folder\backend\src\services\telegram.ts'
s = io.open(p, encoding='utf8').read()

def rep(a, b):
    global s
    if a not in s:
        print('MISS:', a[:80].replace('\n', ' '))
    else:
        s = s.replace(a, b)

# 1. setSetting mess-aware
rep("""async function setSetting(key: string, value: string) {
  await tx(async (conn) => {
    await conn.execute(
      `MERGE INTO SYSTEM_SETTINGS s USING (SELECT :1 k, :2 v FROM dual) d
       ON (s.SETTING_KEY=d.k)
       WHEN MATCHED THEN UPDATE SET s.SETTING_VALUE=d.v, s.UPDATED_AT=SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE) VALUES (d.k, d.v)`,
      [key, value]);
  });
}""", """async function setSetting(key: string, value: string, messId?: number | null) {
  await tx(async (conn) => {
    await conn.execute(
      `MERGE INTO SYSTEM_SETTINGS s USING (SELECT :1 k, :2 v, :3 mid FROM dual) d
       ON (s.SETTING_KEY=d.k AND NVL(s.MESS_ID,-1)=NVL(d.mid,-1))
       WHEN MATCHED THEN UPDATE SET s.SETTING_VALUE=d.v, s.UPDATED_AT=SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, MESS_ID) VALUES (d.k, d.v, d.mid)`,
      [key, value, messId ?? null]);
  });
}""")

# 2. tgConfig mess-aware
rep("""export async function tgConfig() {
  return {
    botToken: cleanToken(await getSetting('telegram.bot_token')),
    chatId: (await getSetting('telegram.chat_id')).replace(/\\s+/g, ''),
    notifyRequests: (await getSetting('telegram.notify_requests', '1')) !== '0',
    notifyUpdates: (await getSetting('telegram.notify_updates', '1')) !== '0',
    notifyCancels: (await getSetting('telegram.notify_cancels', '1')) !== '0',
    notifyCutoff: (await getSetting('telegram.notify_cutoff', '1')) !== '0',
  };
}""", """export async function tgConfig(messId?: number | null) {
  return {
    botToken: cleanToken(await getSetting('telegram.bot_token', '', messId)),
    chatId: (await getSetting('telegram.chat_id', '', messId)).replace(/\\s+/g, ''),
    notifyRequests: (await getSetting('telegram.notify_requests', '1', messId)) !== '0',
    notifyUpdates: (await getSetting('telegram.notify_updates', '1', messId)) !== '0',
    notifyCancels: (await getSetting('telegram.notify_cancels', '1', messId)) !== '0',
    notifyCutoff: (await getSetting('telegram.notify_cutoff', '1', messId)) !== '0',
  };
}""")

rep("""export async function tgReady(): Promise<boolean> {
  const c = await tgConfig();""", """export async function tgReady(messId?: number | null): Promise<boolean> {
  const c = await tgConfig(messId);""")

rep("""export async function tgPublicConfig() {
  const c = await tgConfig();""", """export async function tgPublicConfig(messId?: number | null) {
  const c = await tgConfig(messId);""")

rep("""export async function tgSaveSettings(body: any) {
  if (body.chatId !== undefined) await setSetting('telegram.chat_id', String(body.chatId).replace(/\\s+/g, ''));
  // token is write-only: empty string keeps the existing one; strip ALL whitespace.
  // If extra text was pasted around the token, extract the BotFather pattern "<digits>:<secret>".
  if (body.botToken) await setSetting('telegram.bot_token', cleanToken(String(body.botToken)));
  for (const [k, v] of Object.entries({
    notifyRequests: 'telegram.notify_requests',
    notifyUpdates: 'telegram.notify_updates',
    notifyCancels: 'telegram.notify_cancels',
    notifyCutoff: 'telegram.notify_cutoff',
  })) {
    if (body[k] !== undefined) await setSetting(v, body[k] ? '1' : '0');
  }
}""", """export async function tgSaveSettings(body: any, messId?: number | null) {
  if (body.chatId !== undefined) await setSetting('telegram.chat_id', String(body.chatId).replace(/\\s+/g, ''), messId);
  // token is write-only: empty string keeps the existing one; strip ALL whitespace.
  // If extra text was pasted around the token, extract the BotFather pattern "<digits>:<secret>".
  if (body.botToken) await setSetting('telegram.bot_token', cleanToken(String(body.botToken)), messId);
  for (const [k, v] of Object.entries({
    notifyRequests: 'telegram.notify_requests',
    notifyUpdates: 'telegram.notify_updates',
    notifyCancels: 'telegram.notify_cancels',
    notifyCutoff: 'telegram.notify_cutoff',
  })) {
    if (body[k] !== undefined) await setSetting(v, body[k] ? '1' : '0', messId);
  }
}""")

# 3. sendText mess-aware
rep("""async function sendText(text: string): Promise<{ ok: boolean; code?: number; err?: string }> {
  const c = await tgConfig();""", """async function sendText(text: string, messId?: number | null): Promise<{ ok: boolean; code?: number; err?: string }> {
  const c = await tgConfig(messId);""")

# 4. enqueueTelegram messId
rep("""export async function enqueueTelegram(opts: {
  dedupeKey: string; type: string; payload: string;
  memberId?: number | null; memberName?: string | null; preview?: string;
}): Promise<boolean> {""", """export async function enqueueTelegram(opts: {
  dedupeKey: string; type: string; payload: string;
  memberId?: number | null; memberName?: string | null; preview?: string;
  messId?: number | null;
}): Promise<boolean> {""")
rep("""        `INSERT INTO TELEGRAM_NOTIFICATIONS (DEDUPE_KEY, N_TYPE, MEMBER_ID, MEMBER_NAME, MESSAGE_PREVIEW, PAYLOAD, STATUS)
         VALUES (:1,:2,:3,:4,:5,:6,'PENDING')`,
        [opts.dedupeKey, opts.type, opts.memberId ?? null, opts.memberName ?? null,
         (opts.preview || opts.payload).slice(0, 1000), opts.payload]);""", """        `INSERT INTO TELEGRAM_NOTIFICATIONS (DEDUPE_KEY, N_TYPE, MEMBER_ID, MEMBER_NAME, MESSAGE_PREVIEW, PAYLOAD, STATUS, MESS_ID)
         VALUES (:1,:2,:3,:4,:5,:6,'PENDING',:7)`,
        [opts.dedupeKey, opts.type, opts.memberId ?? null, opts.memberName ?? null,
         (opts.preview || opts.payload).slice(0, 1000), opts.payload, opts.messId ?? null]);""")

# 5. deliverRow + processQueue mess-aware
rep("""async function deliverRow(row: any): Promise<void> {
  const text = await clobText(row.PAYLOAD) || '';
  const res = await sendText(text);""", """async function deliverRow(row: any): Promise<void> {
  const text = await clobText(row.PAYLOAD) || '';
  const res = await sendText(text, row.MESS_ID ?? null);""")
rep("""      `SELECT NOTIF_ID, PAYLOAD FROM TELEGRAM_NOTIFICATIONS""", """      `SELECT NOTIF_ID, PAYLOAD, MESS_ID FROM TELEGRAM_NOTIFICATIONS""")

# 6. buildRequestMessage messId
rep("""export async function buildRequestMessage(opts: {
  memberId: number; date: Date | string; lunchQty: number; dinnerQty: number;
  lunchGuests: number; dinnerGuests: number; action: 'NEW' | 'UPDATED' | 'CANCELLED' | 'ADMIN';
  actorName?: string; reason?: string;
}) {
  const mess = (await getSetting('app.mess_name', 'The Attic 712')) || 'The Attic 712';""", """export async function buildRequestMessage(opts: {
  memberId: number; date: Date | string; lunchQty: number; dinnerQty: number;
  lunchGuests: number; dinnerGuests: number; action: 'NEW' | 'UPDATED' | 'CANCELLED' | 'ADMIN';
  actorName?: string; reason?: string; messId?: number | null;
}) {
  const mess = (await getSetting('app.mess_name', 'The Attic 712', opts.messId)) || 'The Attic 712';""")

# 7. cutoffSummary + cutoffTick per-mess
rep("""async function cutoffSummary(mealType: 'LUNCH' | 'DINNER') {
  const c = await tgConfig();
  if (!c.notifyCutoff) return;
  const today = nowDhaka().toISOString().slice(0, 10);
  const mess = (await getSetting('app.mess_name', 'The Attic 712')) || 'The Attic 712';

  // all active members
  const members = await q<any>(
    `SELECT m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME FROM MEMBERS m WHERE m.STATUS='ACTIVE' ORDER BY m.FULL_NAME`);""", """async function cutoffSummary(mealType: 'LUNCH' | 'DINNER', messId?: number | null) {
  const c = await tgConfig(messId);
  if (!c.notifyCutoff) return;
  const today = nowDhaka().toISOString().slice(0, 10);
  const mess = (await getSetting('app.mess_name', 'The Attic 712', messId)) || 'The Attic 712';

  // all active members of this mess
  const members = await q<any>(
    `SELECT m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME FROM MEMBERS m WHERE m.STATUS='ACTIVE' AND m.MESS_ID=:1 ORDER BY m.FULL_NAME`, [messId ?? -1]);""")

rep("""       AND r.STATUS IN ('SUBMITTED','LOCKED','OVERRIDDEN')`, [today, mealType]);""", """       AND r.STATUS IN ('SUBMITTED','LOCKED','OVERRIDDEN') AND r.MESS_ID=:3`, [today, mealType, messId ?? -1]);""")

rep("""    `🕒 Cutoff: ${mealType === 'LUNCH' ? await getSetting('meal.lunch_cutoff', '10:00') : await getSetting('meal.dinner_cutoff', '19:30')} (Asia/Dhaka)`,""", """    `🕒 Cutoff: ${mealType === 'LUNCH' ? await getSetting('meal.lunch_cutoff', '10:00', messId) : await getSetting('meal.dinner_cutoff', '19:30', messId)} (Asia/Dhaka)`,""")

rep("""  const dedupe = `cutoff:${mealType}:${today}`;
  const ins = await enqueueTelegram({
    dedupeKey: dedupe, type: 'CUTOFF_SUMMARY',
    payload: text, preview: text.split('\\n').slice(0, 3).join(' | '),
  });""", """  const dedupe = `cutoff:${messId ?? 0}:${mealType}:${today}`;
  const ins = await enqueueTelegram({
    dedupeKey: dedupe, type: 'CUTOFF_SUMMARY',
    payload: text, preview: text.split('\\n').slice(0, 3).join(' | '),
    messId: messId ?? null,
  });""")

rep("""async function cutoffTick() {
  const now = nowDhaka();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const today = now.toISOString().slice(0, 10);
  for (const [type, key, dflt] of [['LUNCH', 'meal.lunch_cutoff', '10:00'], ['DINNER', 'meal.dinner_cutoff', '19:30']] as const) {
    const cutoff = parseHM(await getSetting(key, dflt));
    // fire once, in the 30-min window after cutoff (worker ticks every 30s; dedupe key prevents repeats)
    if (nowMin >= cutoff && nowMin < cutoff + 30) {
      try { await cutoffSummary(type); } catch (e: any) { console.error('cutoff summary failed', e?.message); }
    }
  }
}""", """async function cutoffTick() {
  const now = nowDhaka();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const messes = await q<{ MESS_ID: number }>(`SELECT MESS_ID FROM MESS_LOCATIONS WHERE STATUS='ACTIVE'`);
  for (const m of messes) {
    const mid = Number(m.MESS_ID);
    for (const [type, key, dflt] of [['LUNCH', 'meal.lunch_cutoff', '10:00'], ['DINNER', 'meal.dinner_cutoff', '19:30']] as const) {
      const cutoff = parseHM(await getSetting(key, dflt, mid));
      // fire once, in the 30-min window after cutoff (worker ticks every 30s; dedupe key prevents repeats)
      if (nowMin >= cutoff && nowMin < cutoff + 30) {
        try { await cutoffSummary(type, mid); } catch (e: any) { console.error('cutoff summary failed', e?.message); }
      }
    }
  }
}""")

# 8. tgTest mess-aware
rep("""export async function tgTest() {
  const c = await tgConfig();""", """export async function tgTest(messId?: number | null) {
  const c = await tgConfig(messId);""")
rep("""  const mess = (await getSetting('app.mess_name', 'The Attic 712')) || 'The Attic 712';
  const text = `✅ TELEGRAM CONNECTION TEST""", """  const mess = (await getSetting('app.mess_name', 'The Attic 712', messId)) || 'The Attic 712';
  const text = `✅ TELEGRAM CONNECTION TEST""")
rep("""  const res = await sendText(text);
  // also log the test in history""", """  const res = await sendText(text, messId);
  // also log the test in history""")
rep("""       [`test:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, text.slice(0, 1000), text,""", """       [`test:${messId ?? 0}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, text.slice(0, 1000), text,""")

io.open(p, 'w', encoding='utf8').write(s)
print('telegram service done')
