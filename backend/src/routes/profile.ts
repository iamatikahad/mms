import { Router } from 'express';
import bcrypt from 'bcryptjs';
import oracledb from 'oracledb';
import { q, q1, tx } from '../db';
import { authMiddleware } from '../middleware';
import { audit } from '../services/audit';

export const profileRouter = Router();
profileRouter.use(authMiddleware);

profileRouter.get('/', async (req, res, next) => {
  try {
    const row = await q1<any>(
      `SELECT u.USER_ID, u.USERNAME, u.EMAIL, u.PHONE, u.FULL_NAME, r.ROLE_NAME,
              m.MEMBER_ID, m.MEMBER_CODE, m.JOINING_DATE, m.LEAVING_DATE, m.EMERGENCY_CONTACT, m.STATUS
       FROM USERS u JOIN ROLES r ON r.ROLE_ID=u.ROLE_ID
       LEFT JOIN MEMBERS m ON m.USER_ID=u.USER_ID
       WHERE u.USER_ID=:1`, [req.user!.userId]);
    res.json({ profile: row });
  } catch (e) { next(e); }
});

profileRouter.put('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const uid = req.user!.userId;
    await tx(async (conn) => {
      await conn.execute(
        `UPDATE USERS SET FULL_NAME=NVL(:2,FULL_NAME), EMAIL=NVL(:3,EMAIL), PHONE=NVL(:4,PHONE),
           UPDATED_AT=SYSTIMESTAMP WHERE USER_ID=:1`,
        [uid, b.fullName ?? null, b.email ?? null, b.phone ?? null]);
      if (req.user!.memberId) {
        await conn.execute(
          `UPDATE MEMBERS SET FULL_NAME=NVL(:2,FULL_NAME), PHONE=NVL(:3,PHONE), EMAIL=NVL(:4,EMAIL),
             EMERGENCY_CONTACT=NVL(:5,EMERGENCY_CONTACT), UPDATED_AT=SYSTIMESTAMP WHERE MEMBER_ID=:1`,
          [req.user!.memberId, b.fullName ?? null, b.phone ?? null, b.email ?? null, b.emergencyContact ?? null]);
      }
      if (b.newPassword) {
        if (String(b.newPassword).length < 8) throw Object.assign(new Error('PASSWORD_TOO_SHORT'), { status: 400 });
        const row = await conn.execute(
          `SELECT PASSWORD_HASH FROM USERS WHERE USER_ID=:1`, [uid], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const hash = row.rows?.[0]?.PASSWORD_HASH;
        if (!bcrypt.compareSync(String(b.currentPassword || ''), hash)) {
          throw Object.assign(new Error('CURRENT_PASSWORD_WRONG'), { status: 400 });
        }
        await conn.execute(`UPDATE USERS SET PASSWORD_HASH=:2 WHERE USER_ID=:1`,
          [uid, bcrypt.hashSync(String(b.newPassword), 10)]);
      }
    });
    await audit(req, 'UPDATE', 'PROFILE', uid, null, { ...b, newPassword: b.newPassword ? '***' : undefined });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});
