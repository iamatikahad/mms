import { q, q1, tx, clobText } from '../db';
import { nowDhaka } from '../util';

/**
 * Telegram notification service.
 * - Queue persisted in TELEGRAM_NOTIFICATIONS (dedupe via unique DEDUPE_KEY).
 * - Worker retries FAILED/PENDING rows; never blocks request handlers.
 * - Bot token lives in SYSTEM_SETTINGS.telegram.bot_token — never returned to clients.
 */

const TICK_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
let timer: NodeJS.Timeout | null = null;
let processing = false;

async function getSetting(key: string, dflt = '', messId?: number | null): Promise<string> {
  const { getSetting: gs } = await import('./settings');
  const v = await gs(key, messId);
  return v === '' ? dflt : v;
}
async function setSetting(key: string, value: string, messId?: number | null) {
  await tx(async (conn) => {
    await conn.execute(
      `MERGE INTO SYSTEM_SETTINGS s USING (SELECT :1 k, :2 v, :3 mid FROM dual) d
       ON (s.SETTING_KEY=d.k AND NVL(s.MESS_ID,-1)=NVL(d.mid,-1))
       WHEN MATCHED THEN UPDATE SET s.SETTING_VALUE=d.v, s.UPDATED_AT=SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, MESS_ID) VALUES (d.k, d.v, d.mid)`,
      [key, value, messId ?? null]);
  });
}

function cleanToken(raw: string): string {
  const t = raw.replace(/\s+/g, '');
  const m = t.match(/\d{5,}:[A-Za-z0-9_-]{30,60}/);
  return m ? m[0] : t;
}

export async function tgConfig(messId?: number | null) {
  return {
    botToken: cleanToken(await getSetting('telegram.bot_token', '', messId)),
    chatId: (await getSetting('telegram.chat_id', '', messId)).replace(/\s+/g, ''),
    notifyRequests: (await getSetting('telegram.notify_requests', '1', messId)) !== '0',
    notifyUpdates: (await getSetting('telegram.notify_updates', '1', messId)) !== '0',
    notifyCancels: (await getSetting('telegram.notify_cancels', '1', messId)) !== '0',
    notifyCutoff: (await getSetting('telegram.notify_cutoff', '1', messId)) !== '0',
  };
}

export async function tgReady(messId?: number | null): Promise<boolean> {
  const c = await tgConfig(messId);
  return !!(c.botToken && c.chatId);
}

/** Public config for admin UI — token is NEVER exposed, only a boolean. */
export async function tgPublicConfig(messId?: number | null) {
  const c = await tgConfig(messId);
  return {
    chatId: c.chatId,
    botTokenSet: !!c.botToken,
    notifyRequests: c.notifyRequests,
    notifyUpdates: c.notifyUpdates,
    notifyCancels: c.notifyCancels,
    notifyCutoff: c.notifyCutoff,
  };
}

export async function tgSaveSettings(body: any, messId?: number | null) {
  if (body.chatId !== undefined) await setSetting('telegram.chat_id', String(body.chatId).replace(/\s+/g, ''), messId);
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
}

async function sendText(text: string, messId?: number | null): Promise<{ ok: boolean; code?: number; err?: string }> {
  const c = await tgConfig(messId);
  if (!c.botToken || !c.chatId) return { ok: false, err: 'NOT_CONFIGURED' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${c.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c.chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) return { ok: true };
    const j: any = await r.json().catch(() => ({}));
    return { ok: false, code: r.status, err: String(j?.description || `HTTP ${r.status}`).slice(0, 300) };
  } catch (e: any) {
    return { ok: false, err: String(e?.message || e).slice(0, 300) };
  }
}

/** Enqueue a notification. Dedupe: returns false if key already exists. Never throws. */
export async function enqueueTelegram(opts: {
  dedupeKey: string; type: string; payload: string;
  memberId?: number | null; memberName?: string | null; preview?: string;
  messId?: number | null;
}): Promise<boolean> {
  try {
    await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO TELEGRAM_NOTIFICATIONS (DEDUPE_KEY, N_TYPE, MEMBER_ID, MEMBER_NAME, MESSAGE_PREVIEW, PAYLOAD, STATUS, MESS_ID)
         VALUES (:1,:2,:3,:4,:5,:6,'PENDING',:7)`,
        [opts.dedupeKey, opts.type, opts.memberId ?? null, opts.memberName ?? null,
         (opts.preview || opts.payload).slice(0, 1000), opts.payload, opts.messId ?? null]);
    });
    setImmediate(() => void processQueue());
    return true;
  } catch (e: any) {
    if (String(e?.errorNum) === '1' || String(e?.message || '').includes('ORA-00001')) return false; // duplicate
    console.error('telegram enqueue failed', e?.message);
    return false;
  }
}

/** Send one row's payload; update status. Used by worker and manual retry. */
async function deliverRow(row: any): Promise<void> {
  const text = await clobText(row.PAYLOAD) || '';
  const res = await sendText(text, row.MESS_ID ?? null);
  await tx(async (conn) => {
    await conn.execute(
      `UPDATE TELEGRAM_NOTIFICATIONS SET STATUS=:2, ATTEMPTS=ATTEMPTS+1,
         LAST_ERROR=:3, HTTP_CODE=:4, SENT_AT=CASE WHEN :2='SENT' THEN SYSTIMESTAMP ELSE SENT_AT END,
         UPDATED_AT=SYSTIMESTAMP WHERE NOTIF_ID=:1`,
      [row.NOTIF_ID, res.ok ? 'SENT' : 'FAILED', res.ok ? null : (res.err || 'UNKNOWN').slice(0, 500),
       res.code ?? null]);
  });
}

export async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    const rows = await q<any>(
      `SELECT NOTIF_ID, PAYLOAD, MESS_ID FROM TELEGRAM_NOTIFICATIONS
       WHERE STATUS='PENDING' OR (STATUS='FAILED' AND ATTEMPTS < :1)
       ORDER BY NOTIF_ID FETCH FIRST 20 ROWS ONLY`, [MAX_ATTEMPTS]);
    for (const r of rows) {
      try { await deliverRow(r); }
      catch (e: any) { console.error('telegram deliver error', e?.message); }
    }
  } catch (e: any) {
    console.error('telegram queue tick failed', e?.message);
  } finally { processing = false; }
}

// ---------- message builders ----------

async function memberLabel(memberId: number) {
  const m = await q1<any>(
    `SELECT m.MEMBER_CODE, m.FULL_NAME FROM MEMBERS m WHERE m.MEMBER_ID=:1`, [memberId]);
  return m ? { name: String(m.FULL_NAME || ''), code: String(m.MEMBER_CODE || '') } : { name: '?', code: '?' };
}

function fmtDate(d: Date | string) {
  const s = typeof d === 'string' ? d.slice(0, 10) : nowDhaka().toISOString().slice(0, 10);
  const [y, m, dd] = s.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${dd} ${months[(m || 1) - 1]} ${y}`;
}
function fmtTime(d?: Date) {
  const t = d || nowDhaka();
  let h = t.getUTCHours() % 12 || 12;
  const ap = t.getUTCHours() >= 12 ? 'PM' : 'AM';
  return `${h}:${String(t.getUTCMinutes()).padStart(2, '0')} ${ap}`;
}

export async function buildRequestMessage(opts: {
  memberId: number; date: Date | string; lunchQty: number; dinnerQty: number;
  lunchGuests: number; dinnerGuests: number; action: 'NEW' | 'UPDATED' | 'CANCELLED' | 'ADMIN';
  actorName?: string; reason?: string; messId?: number | null;
}) {
  const mess = (await getSetting('app.mess_name', 'The Attic 712', opts.messId)) || 'The Attic 712';
  const mb = await memberLabel(opts.memberId);
  const regular = opts.lunchQty + opts.dinnerQty;
  const guests = opts.lunchGuests + opts.dinnerGuests;
  const icon = opts.action === 'NEW' ? '🔔 NEW MEAL REQUEST' :
               opts.action === 'UPDATED' ? '✏️ MEAL REQUEST UPDATED' :
               opts.action === 'CANCELLED' ? '❌ MEAL REQUEST CANCELLED' : '🛠 ADMIN MEAL REQUEST UPDATE';
  return [
    icon,
    `🏠 ${mess}`,
    `👤 Member: ${mb.name}`,
    `🆔 Member ID: ${mb.code}`,
    `📅 Date: ${fmtDate(opts.date)}`,
    `🍱 Lunch: ${opts.lunchQty}`,
    `🍽 Dinner: ${opts.dinnerQty}`,
    `👥 Lunch Guests: ${opts.lunchGuests}`,
    `👥 Dinner Guests: ${opts.dinnerGuests}`,
    `Regular Meals: ${regular}`,
    `Guest Meals: ${guests}`,
    `Total Chargeable Meals: ${regular + guests}`,
    opts.actorName ? `👮 By: ${opts.actorName}` : null,
    opts.reason ? `📝 Reason: ${opts.reason}` : null,
    `🕒 ${opts.action === 'NEW' ? 'Submitted' : 'At'}: ${fmtTime()}`,
  ].filter(Boolean).join('\n');
}

/** Guest quantities for member+date from GUEST_MEALS (if table/cols differ, returns zeros). */
export async function guestTotals(memberId: number, date: Date | string) {
  try {
    const r = await q1<any>(
      `SELECT
         NVL(SUM(CASE WHEN MEAL_TYPE='LUNCH' THEN GUEST_QTY ELSE 0 END),0) LG,
         NVL(SUM(CASE WHEN MEAL_TYPE='DINNER' THEN GUEST_QTY ELSE 0 END),0) DG
       FROM GUEST_MEALS
       WHERE HOST_MEMBER_ID=:1 AND TRUNC(MEAL_DATE)=TRUNC(TO_DATE(:2,'YYYY-MM-DD')) AND STATUS='ACTIVE'`,
      [memberId, typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10)]);
    return { lunch: Number(r?.LG || 0), dinner: Number(r?.DG || 0) };
  } catch { return { lunch: 0, dinner: 0 }; }
}

// ---------- cutoff summaries ----------

async function cutoffSummary(mealType: 'LUNCH' | 'DINNER', messId?: number | null) {
  const c = await tgConfig(messId);
  if (!c.notifyCutoff) return;
  const today = nowDhaka().toISOString().slice(0, 10);
  const mess = (await getSetting('app.mess_name', 'The Attic 712', messId)) || 'The Attic 712';

  // all active members of this mess
  const members = await q<any>(
    `SELECT m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME FROM MEMBERS m WHERE m.STATUS='ACTIVE' AND m.MESS_ID=:1 ORDER BY m.FULL_NAME`, [messId ?? -1]);
  // latest submitted/locked/overridden request per member for today+type
  const reqs = await q<any>(
    `SELECT r.MEMBER_ID, r.REGULAR_QTY FROM MEAL_REQUESTS r
     WHERE TRUNC(r.MEAL_DATE)=TRUNC(TO_DATE(:1,'YYYY-MM-DD')) AND r.MEAL_TYPE=:2
       AND r.REVISION_NO=(SELECT MAX(r2.REVISION_NO) FROM MEAL_REQUESTS r2
                          WHERE r2.MEMBER_ID=r.MEMBER_ID AND TRUNC(r2.MEAL_DATE)=TRUNC(r.MEAL_DATE)
                            AND r2.MEAL_TYPE=r.MEAL_TYPE)
       AND r.STATUS IN ('SUBMITTED','LOCKED','OVERRIDDEN') AND r.MESS_ID=:3`, [today, mealType, messId ?? -1]);
  const byMember = new Map<number, number>();
  for (const r of reqs) byMember.set(Number(r.MEMBER_ID), Number(r.REGULAR_QTY || 0));

  const label = mealType === 'LUNCH' ? 'Lunch' : 'Dinner';
  const lines: (string | null)[] = [
    `📊 ${label.toUpperCase()} CUTOFF SUMMARY`,
    `🏠 ${mess}`,
    `📅 Date: ${fmtDate(today)}`,
    `🕒 Cutoff: ${mealType === 'LUNCH' ? await getSetting('meal.lunch_cutoff', '10:00', messId) : await getSetting('meal.dinner_cutoff', '19:30', messId)} (Asia/Dhaka)`,
    '',
  ];
  let submitted = 0, totalReg = 0, totalGuest = 0;
  const missing: string[] = [];
  for (const m of members) {
    const mid = Number(m.MEMBER_ID);
    if (byMember.has(mid)) {
      submitted++;
      const qty = byMember.get(mid)!;
      totalReg += qty;
      const g = await guestTotals(mid, today);
      const gq = mealType === 'LUNCH' ? g.lunch : g.dinner;
      totalGuest += gq;
      lines.push(`🍱 ${m.FULL_NAME} (${m.MEMBER_CODE}): ${qty}${gq ? ` + ${gq} guest` : ''}`);
    } else {
      missing.push(`${m.FULL_NAME} (${m.MEMBER_CODE})`);
    }
  }
  lines.push('', `✅ Submitted: ${submitted} / ${members.length} members`);
  if (missing.length) lines.push(`⬜ No request: ${missing.join(', ')}`);
  lines.push(`Regular Meals: ${totalReg}`, `Guest Meals: ${totalGuest}`, `Total Chargeable: ${totalReg + totalGuest}`);

  const text = lines.filter((l) => l !== null).join('\n');
  const dedupe = `cutoff:${messId ?? 0}:${mealType}:${today}`;
  const ins = await enqueueTelegram({
    dedupeKey: dedupe, type: 'CUTOFF_SUMMARY',
    payload: text, preview: text.split('\n').slice(0, 3).join(' | '),
    messId: messId ?? null,
  });
  return ins;
}

function parseHM(hm: string) { const [h, m] = String(hm).split(':').map(Number); return (h || 0) * 60 + (m || 0); }

async function cutoffTick() {
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
}

export function startTelegramWorker() {
  if (timer) return;
  timer = setInterval(() => { void processQueue(); void cutoffTick(); }, TICK_MS);
  timer.unref?.();
  setTimeout(() => { void processQueue(); void cutoffTick(); }, 15_000);
  startTelegramBot();
}

// ---------- bot command poller (getUpdates long-poll) ----------
const botOffsets = new Map<number | null, number>();
let botPolling = false;

async function botApi(method: string, body?: any, messId?: number | null) {
  const c = await tgConfig(messId);
  if (!c.botToken) return null;
  const r = await fetch(`https://api.telegram.org/bot${c.botToken}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(35_000),
  });
  return r.json().catch(() => null);
}

async function botPoll() {
  if (botPolling) return;
  botPolling = true;
  try {
    // poll every mess that has a bot token configured (plus global fallback)
    const configured = await q<{ MESS_ID: number | null }>(
      `SELECT DISTINCT MESS_ID FROM SYSTEM_SETTINGS WHERE SETTING_KEY='telegram.bot_token' AND SETTING_VALUE IS NOT NULL`);
    const messIds: (number | null)[] = [...new Set(configured.map(r => r.MESS_ID == null ? null : Number(r.MESS_ID)))];
    if (!messIds.length) messIds.push(null);
    for (const mid of messIds) {
      const offset = botOffsets.get(mid) ?? 0;
      const j: any = await botApi(`getUpdates?offset=${offset}&timeout=25&allowed_updates=["message"]`, undefined, mid);
      if (!j?.ok || !Array.isArray(j.result)) continue;
      for (const u of j.result) {
        botOffsets.set(mid, Math.max(offset, Number(u.update_id) + 1));
        const m = u.message;
        if (!m?.chat?.id) continue;
        const text = String(m.text || '').trim();
        if (/^\/start(@\w+)?$/i.test(text)) {
          const mess = (await getSetting('app.mess_name', 'The Attic 712', mid)) || 'The Attic 712';
          await botApi('sendMessage', {
            chat_id: m.chat.id,
            text: `Welcome to ${mess}! Your Telegram account is ready for notifications.\n\nYour Chat ID: ${m.chat.id}\n(Save this ID in Admin → Settings → Telegram Notifications if it is not already set.)`,
          }, mid);
        }
      }
    }
  } catch { /* poll again next tick */ }
  finally { botPolling = false; }
}

function startTelegramBot() {
  setInterval(() => void botPoll(), 30_000);
  setTimeout(() => void botPoll(), 5_000);
}

function friendlyTgError(status: number, desc?: string): string {
  const d = String(desc || '');
  if (status === 401 || /unauthorized/i.test(d))
    return 'Invalid or revoked bot token — generate a fresh one via @BotFather /revoke.';
  if (/bot was blocked|bot can.t send messages|forbidden/i.test(d))
    return 'Bot is blocked or cannot message this chat — open the bot and press /start, or check the Chat ID.';
  if (/chat not found/i.test(d)) return 'Chat not found — verify the Chat ID (private ID or -100... group ID).';
  if (/not enough rights|administrator|group chat was upgraded/i.test(d))
    return 'Bot lacks permission in this group — check privacy mode or make it an admin.';
  if (/too many requests|flood/i.test(d)) return 'Telegram rate limit — will retry automatically.';
  if (!d) return `Telegram API connection failure (HTTP ${status}).`;
  return `Telegram error: ${d}`;
}

export async function tgTest(messId?: number | null) {
  const c = await tgConfig(messId);
  if (!c.botToken || !c.chatId) return { ok: false as const, stage: 'config', err: 'Bot token or Chat ID is not configured.' };
  // Stage 0: format sanity — BotFather tokens are "<digits>:<letters>"
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,80}$/.test(c.botToken)) {
    return { ok: false as const, stage: 'format', err: 'Saved token is not a valid BotFather format — re-copy the full API Token from @BotFather.' };
  }
  const api = `https://api.telegram.org/bot${c.botToken}`;
  // Stage 1: getMe — validates token, reveals bot identity (never the token)
  let botName = '';
  try {
    const gm = await fetch(`${api}/getMe`, { signal: AbortSignal.timeout(15_000) });
    const gj: any = await gm.json().catch(() => ({}));
    if (!gm.ok || !gj?.ok) {
      return { ok: false as const, stage: 'getMe', code: gm.status, err: friendlyTgError(gm.status, gj?.description) };
    }
    botName = `@${gj.result?.username || '?'}`;
  } catch (e: any) {
    return { ok: false as const, stage: 'getMe', err: `Cannot reach Telegram: ${e?.message || e}` };
  }
  // Stage 2: getChat — validates the Chat ID belongs to a reachable chat
  try {
    const gc = await fetch(`${api}/getChat?chat_id=${encodeURIComponent(c.chatId)}`, { signal: AbortSignal.timeout(15_000) });
    const gcj: any = await gc.json().catch(() => ({}));
    if (!gc.ok || !gcj?.ok) {
      return { ok: false as const, stage: 'getChat', code: gc.status, err: friendlyTgError(gc.status, gcj?.description) };
    }
  } catch (e: any) {
    return { ok: false as const, stage: 'getChat', err: `Cannot reach Telegram: ${e?.message || e}` };
  }
  // Stage 3: real sendMessage
  const mess = (await getSetting('app.mess_name', 'The Attic 712', messId)) || 'The Attic 712';
  const text = `✅ TELEGRAM CONNECTION TEST\n🏠 ${mess}\n🤖 Bot: ${botName}\nTest message delivered successfully.\n🕒 ${fmtTime()}`;
  const res = await sendText(text, messId);
  // also log the test in history (not deduped — each click is a distinct test)
  await tx(async (conn) => {
    await conn.execute(
      `INSERT INTO TELEGRAM_NOTIFICATIONS (DEDUPE_KEY, N_TYPE, MESSAGE_PREVIEW, PAYLOAD, STATUS, ATTEMPTS, LAST_ERROR, HTTP_CODE, SENT_AT, CREATED_AT, UPDATED_AT, MESS_ID)
       VALUES (:1,'TEST',:2,:3,:4,1,:5,:6,CASE WHEN :4='SENT' THEN SYSTIMESTAMP END,SYSTIMESTAMP,SYSTIMESTAMP,:7)`,
      [`test:${messId ?? 0}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, text.slice(0, 1000), text,
       res.ok ? 'SENT' : 'FAILED', res.ok ? null : (res.err || 'UNKNOWN').slice(0, 500), res.code ?? null, messId ?? null]);
  });
  if (!res.ok) return { ...res, stage: 'sendMessage', err: friendlyTgError(res.code ?? 0, res.err) };
  return res;
}
