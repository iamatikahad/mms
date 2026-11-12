import { q, q1, clobText } from '../db';
import { getIo } from '../socket';
import { notify } from './notify';

/**
 * Meal-request deadline reminders.
 * Reminder fires 30 minutes before each meal's configured cutoff
 * (meal.lunch_cutoff / meal.dinner_cutoff in SYSTEM_SETTINGS, Asia/Dhaka).
 * Dedupe is persisted in MEAL_REMINDER_LOG so restarts never resend.
 */

const TICK_MS = 30 * 1000;
let timer: NodeJS.Timeout | null = null;

async function getSetting(key: string, dflt: string): Promise<string> {
  const r = await q1<{ SETTING_VALUE: any }>(
    `SELECT SETTING_VALUE FROM SYSTEM_SETTINGS WHERE SETTING_KEY=:1`, [key]);
  const v = await clobText(r?.SETTING_VALUE);
  return v == null ? dflt : v.replace(/^"|"$/g, '');
}

function parseHM(hm: string): number {
  const [h, m] = String(hm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Dhaka wall-clock expressed as a UTC Date (UTC+6, no DST). */
function dhakaNow(): Date {
  return new Date(Date.now() + 6 * 3600 * 1000);
}
function dhakaTodayStr(): string {
  return dhakaNow().toISOString().slice(0, 10);
}

const MEALS = [
  { type: 'LUNCH', label: 'Lunch', cutoffKey: 'meal.lunch_cutoff', defaultCutoff: '10:00' },
  { type: 'DINNER', label: 'Dinner', cutoffKey: 'meal.dinner_cutoff', defaultCutoff: '19:30' },
];

/** Did this member already submit a request for date+mealType? (latest revision wins) */
async function hasSubmitted(memberId: number, dateStr: string, mealType: string): Promise<boolean> {
  const r = await q1<{ STATUS: string }>(
    `SELECT r.STATUS FROM MEAL_REQUESTS r
     WHERE r.MEMBER_ID=:1 AND TRUNC(r.MEAL_DATE)=TRUNC(TO_DATE(:2,'YYYY-MM-DD')) AND r.MEAL_TYPE=:3
       AND r.REVISION_NO=(SELECT MAX(r2.REVISION_NO) FROM MEAL_REQUESTS r2
                          WHERE r2.MEMBER_ID=r.MEMBER_ID AND TRUNC(r2.MEAL_DATE)=TRUNC(r.MEAL_DATE)
                            AND r2.MEAL_TYPE=r.MEAL_TYPE)
     FETCH FIRST 1 ROWS ONLY`, [memberId, dateStr, mealType]);
  return !!r && ['SUBMITTED', 'LOCKED', 'OVERRIDDEN'].includes(r.STATUS);
}

async function tick() {
  try {
    const now = dhakaNow();
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const today = dhakaTodayStr();

    for (const meal of MEALS) {
      const cutoffStr = await getSetting(meal.cutoffKey, meal.defaultCutoff);
      const cutoffMin = parseHM(cutoffStr);
      const remindAt = cutoffMin - 30;
      if (nowMin < remindAt || nowMin >= cutoffMin) continue; // outside window

      const key = `${meal.type}:${today}`;
      // claim the slot atomically — ORA-00001 means already sent
      try {
        await q(`INSERT INTO MEAL_REMINDER_LOG (REMINDER_KEY) VALUES (:1)`, [key]);
      } catch (e: any) {
        if (String(e?.errorNum) === '1' || String(e?.message || '').includes('ORA-00001')) continue;
        throw e;
      }

      const minsLeft = Math.max(1, cutoffMin - nowMin);
      const title = 'Meal Request Reminder';
      const message = `Reminder: ${meal.label} meal request closes in ${minsLeft} minute${minsLeft === 1 ? '' : 's'} (${cutoffStr} BDST). Please submit your meal request.`;

      // recipients: active members' users with meal-reminder pref on and no submitted request
      const members = await q<{ MEMBER_ID: number; USER_ID: number }>(
        `SELECT m.MEMBER_ID, m.USER_ID FROM MEMBERS m JOIN USERS u ON u.USER_ID=m.USER_ID
         WHERE m.STATUS='ACTIVE' AND u.STATUS='ACTIVE'`);
      for (const mb of members) {
        const prefs = await q1<{ MEAL_REMINDER: number }>(
          `SELECT MEAL_REMINDER FROM USER_NOTIFICATION_PREFS WHERE USER_ID=:1`, [mb.USER_ID]);
        if (prefs && Number(prefs.MEAL_REMINDER) === 0) continue;
        if (await hasSubmitted(Number(mb.MEMBER_ID), today, meal.type)) continue;

        await notify(Number(mb.USER_ID), title, message, 'MEAL_REMINDER');
        getIo()?.to(`user:${mb.USER_ID}`).emit('app_notify', { title, message, type: 'MEAL_REMINDER' });
      }
    }
  } catch (e) {
    console.error('meal reminder tick failed', e);
  }
}

export function startReminderScheduler() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  setTimeout(tick, 10_000); // first run shortly after boot
}
