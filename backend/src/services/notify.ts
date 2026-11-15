import { q } from '../db';

export async function notify(userId: number | null, title: string, message: string, type = 'INFO', messId?: number | null) {
  try {
    await q(
      `INSERT INTO NOTIFICATIONS (USER_ID, TITLE, MESSAGE, NOTIF_TYPE, MESS_ID) VALUES (:1,:2,:3,:4,:5)`,
      [userId, title, message, type, messId ?? null]
    );
  } catch (e) {
    console.error('notify failed', e);
  }
}

/** Notify a specific member's login user. */
export async function notifyMember(memberId: number, title: string, message: string, type = 'INFO', messId?: number | null) {
  try {
    const cond = messId ? ' AND MESS_ID=:2' : '';
    const rows = await q<{ USER_ID: number }>(
      `SELECT USER_ID FROM MEMBERS WHERE MEMBER_ID = :1${cond}`, messId ? [memberId, messId] : [memberId]);
    if (rows[0]) await notify(rows[0].USER_ID, title, message, type, messId);
  } catch { /* ignore */ }
}

/** Notify all active members' users of a mess (e.g. new monthly bill). */
export async function notifyAllMembers(title: string, message: string, type = 'INFO', messId?: number | null) {
  try {
    const cond = messId ? ' AND m.MESS_ID=:2' : '';
    const binds: any[] = ['ACTIVE', 'ACTIVE'];
    if (messId) binds.push(messId);
    const rows = await q<{ USER_ID: number }>(
      `SELECT m.USER_ID FROM MEMBERS m JOIN USERS u ON u.USER_ID=m.USER_ID
       WHERE m.STATUS='ACTIVE' AND u.STATUS='ACTIVE'${cond}`,
      binds);
    for (const r of rows) await notify(r.USER_ID, title, message, type, messId);
  } catch { /* ignore */ }
}

/** Notify every active user account with access to the mess (e.g. new poll). */
export async function notifyAllUsers(title: string, message: string, type = 'INFO', messId?: number | null) {
  try {
    const cond = messId ? ' AND a.MESS_ID=:1' : '';
    const binds: any[] = ['ACTIVE'];
    if (messId) binds.push(messId);
    const sql = messId
      ? `SELECT DISTINCT a.USER_ID FROM MESS_USER_ACCESS a JOIN USERS u ON u.USER_ID=a.USER_ID
         WHERE a.MESS_ID=:2 AND a.STATUS='ACTIVE' AND u.STATUS='ACTIVE'`
      : `SELECT USER_ID FROM USERS WHERE STATUS='ACTIVE'`;
    const rows = await q<{ USER_ID: number }>(sql, binds);
    for (const r of rows) await notify(r.USER_ID, title, message, type, messId);
  } catch { /* ignore */ }
}
