import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { q, q1 } from '../db';
import { signToken, authMiddleware } from '../middleware';
import { auditLogin } from '../services/audit';
import { config } from '../config';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS' },
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });

    const user = await q1<any>(
      `SELECT u.USER_ID, u.USERNAME, u.EMAIL, u.PHONE, u.PASSWORD_HASH, u.STATUS, u.FULL_NAME,
              r.ROLE_NAME, r.ROLE_ID
       FROM USERS u JOIN ROLES r ON r.ROLE_ID = u.ROLE_ID
       WHERE UPPER(u.USERNAME) = UPPER(:1)
          OR UPPER(u.EMAIL) = UPPER(:2)
          OR u.PHONE = :3`,
      [String(identifier), String(identifier), String(identifier)]
    );

    const ok = user && user.STATUS === 'ACTIVE' && bcrypt.compareSync(String(password), user.PASSWORD_HASH);
    await auditLogin(String(identifier), !!ok, req);
    if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

    await q(`UPDATE USERS SET LAST_LOGIN_AT = SYSTIMESTAMP WHERE USER_ID = :1`, [user.USER_ID]);
    const token = signToken(user.USER_ID);
    res.cookie(config.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure || req.get('x-forwarded-proto') === 'https', // HTTPS in production, HTTP on localhost
      maxAge: config.jwtExpiresHours * 3600 * 1000,
    });

    // member id if applicable
    let memberId: number | null = null;
    if (user.ROLE_NAME === 'MEMBER') {
      const m = await q1<{ MEMBER_ID: number }>(
        `SELECT MEMBER_ID FROM MEMBERS WHERE USER_ID = :1 AND STATUS='ACTIVE'`, [user.USER_ID]);
      memberId = m ? Number(m.MEMBER_ID) : null;
    }

    res.json({
      user: {
        userId: user.USER_ID, username: user.USERNAME, fullName: user.FULL_NAME,
        email: user.EMAIL, role: user.ROLE_NAME, memberId,
      },
    });
  } catch (e) { next(e); }
});

authRouter.post('/logout', authMiddleware, async (req, res) => {
  res.clearCookie(config.cookieName);
  res.json({ ok: true });
});

authRouter.get('/me', authMiddleware, async (req, res) => {
  const u = req.user!;
  const profile = await q1<any>(
    `SELECT u.USER_ID, u.USERNAME, u.EMAIL, u.PHONE, u.FULL_NAME, r.ROLE_NAME,
            m.MEMBER_ID, m.MEMBER_CODE, m.JOINING_DATE, m.LEAVING_DATE, m.STATUS MSTATUS
     FROM USERS u JOIN ROLES r ON r.ROLE_ID=u.ROLE_ID
     LEFT JOIN MEMBERS m ON m.USER_ID = u.USER_ID
     WHERE u.USER_ID = :1`, [u.userId]);
  res.json({
    user: {
      ...profile,
      permissions: [...u.permissions],
      role: u.roleName,
    },
  });
});

authRouter.post('/change-password', authMiddleware, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
    }
    const row = await q1<{ PASSWORD_HASH: string }>(
      `SELECT PASSWORD_HASH FROM USERS WHERE USER_ID = :1`, [req.user!.userId]);
    if (!row || !bcrypt.compareSync(String(currentPassword || ''), row.PASSWORD_HASH)) {
      return res.status(400).json({ error: 'CURRENT_PASSWORD_WRONG' });
    }
    const hash = bcrypt.hashSync(String(newPassword), 10);
    await q(`UPDATE USERS SET PASSWORD_HASH=:2, UPDATED_AT=SYSTIMESTAMP WHERE USER_ID=:1`,
      [req.user!.userId, hash]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
