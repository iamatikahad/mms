import { q } from '../db';

export async function notify(userId: number | null, title: string, message: string, type = 'INFO') {
  try {
    await q(
      `INSERT INTO NOTIFICATIONS (USER_ID, TITLE, MESSAGE, NOTIF_TYPE) VALUES (:1,:2,:3,:4)`,
      [userId, title, message, type]
    );
  } catch (e) {
    console.error('notify failed', e);
  }
}

/** Notify a specific member's login user. */
export async function notifyMember(memberId: number, title: string, message: string, type = 'INFO') {
  try {
    const rows = await q<{ USER_ID: number }>(
      `SELECT USER_ID FROM MEMBERS WHERE MEMBER_ID = :1`, [memberId]);
    if (rows[0]) await notify(rows[0].USER_ID, title, message, type);
  } catch { /* ignore */ }
}

/** Notify all active members' users (e.g. new monthly bill). */
export async function notifyAllMembers(title: string, message: string, type = 'INFO') {
  try {
    const rows = await q<{ USER_ID: number }>(
      `SELECT m.USER_ID FROM MEMBERS m JOIN USERS u ON u.USER_ID=m.USER_ID
       WHERE m.STATUS='ACTIVE' AND u.STATUS='ACTIVE'`);
    for (const r of rows) await notify(r.USER_ID, title, message, type);
  } catch { /* ignore */ }
}

/** Notify every active user account (e.g. new poll published). */
export async function notifyAllUsers(title: string, message: string, type = 'INFO') {
  try {
    const rows = await q<{ USER_ID: number }>(
      `SELECT USER_ID FROM USERS WHERE STATUS='ACTIVE'`);
    for (const r of rows) await notify(r.USER_ID, title, message, type);
  } catch { /* ignore */ }
}
