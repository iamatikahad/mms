import { Router } from 'express';
import bcrypt from 'bcryptjs';
import oracledb from 'oracledb';
import { q, q1, tx } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { audit } from '../services/audit';

export const adminsRouter = Router();
adminsRouter.use(authMiddleware);
adminsRouter.use(requirePerm('admins.manage'));

// List admin users (SUPER_ADMIN + ADMIN)
adminsRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await q(
      `SELECT u.USER_ID, u.USERNAME, u.EMAIL, u.PHONE, u.FULL_NAME, u.STATUS, u.LAST_LOGIN_AT, u.CREATED_AT,
              r.ROLE_NAME, ap.DESIGNATION
       FROM USERS u
       JOIN ROLES r ON r.ROLE_ID=u.ROLE_ID
       LEFT JOIN ADMIN_PROFILES ap ON ap.USER_ID=u.USER_ID
       WHERE r.ROLE_NAME IN ('SUPER_ADMIN','ADMIN')
       ORDER BY u.USER_ID`);
    // attach effective permissions
    const permRows = await q(
      `SELECT up.USER_ID, p.PERMISSION_KEY, up.IS_GRANT FROM USER_PERMISSIONS up
       JOIN PERMISSIONS p ON p.PERMISSION_ID=up.PERMISSION_ID`);
    const byUser = new Map<number, { key: string; grant: number }[]>();
    for (const p of permRows) {
      const arr = byUser.get(Number(p.USER_ID)) || [];
      arr.push({ key: p.PERMISSION_KEY, grant: Number(p.IS_GRANT) });
      byUser.set(Number(p.USER_ID), arr);
    }
    res.json({ rows: rows.map(r => ({ ...r, overrides: byUser.get(Number(r.USER_ID)) || [] })) });
  } catch (e) { next(e); }
});

// All permissions catalog
adminsRouter.get('/permissions', async (_req, res, next) => {
  try {
    const rows = await q(`SELECT * FROM PERMISSIONS ORDER BY PERMISSION_KEY`);
    res.json({ rows });
  } catch (e) { next(e); }
});

// Create admin account
adminsRouter.post('/', async (req, res, next) => {
  try {
    const { username, password, fullName, email, phone, role = 'ADMIN', designation } = req.body || {};
    if (!username || !password || !fullName) return res.status(400).json({ error: 'MISSING_FIELDS' });
    if (String(password).length < 8) return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) return res.status(400).json({ error: 'BAD_ROLE' });

    const dup = await q1(`SELECT USER_ID FROM USERS WHERE UPPER(USERNAME)=UPPER(:1)`, [username]);
    if (dup) return res.status(409).json({ error: 'USERNAME_TAKEN' });

    const roleRow = await q1<{ ROLE_ID: number }>(`SELECT ROLE_ID FROM ROLES WHERE ROLE_NAME=:1`, [role]);
    const hash = bcrypt.hashSync(String(password), 10);

    const userId = await tx(async (conn) => {
      const outB = [] as any[];
      await conn.execute(
        `INSERT INTO USERS (USERNAME, EMAIL, PHONE, PASSWORD_HASH, FULL_NAME, ROLE_ID, STATUS)
         VALUES (:1,:2,:3,:4,:5,:6,'ACTIVE') RETURNING USER_ID INTO :7`,
        [username, email || null, phone || null, hash, fullName, roleRow!.ROLE_ID,
         { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }], { outBinds: outB });
      const uid = Number(outB[0]);
      await conn.execute(
        `INSERT INTO ADMIN_PROFILES (USER_ID, DESIGNATION) VALUES (:1,:2)`, [uid, designation || null]);
      return uid;
    });

    await audit(req, 'CREATE', 'ADMIN_USER', userId, null, { username, role, fullName });
    res.status(201).json({ ok: true, userId });
  } catch (e) { next(e); }
});

// Update admin (status, role, profile)
adminsRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(
      `SELECT u.*, r.ROLE_NAME FROM USERS u JOIN ROLES r ON r.ROLE_ID=u.ROLE_ID WHERE u.USER_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    const b = req.body || {};

    await tx(async (conn) => {
      if (b.status && ['ACTIVE', 'DISABLED'].includes(b.status)) {
        await conn.execute(`UPDATE USERS SET STATUS=:2, UPDATED_AT=SYSTIMESTAMP WHERE USER_ID=:1`, [id, b.status]);
      }
      if (b.role && ['ADMIN', 'SUPER_ADMIN'].includes(b.role) && b.role !== before.ROLE_NAME) {
        const roleRow = await q1<{ ROLE_ID: number }>(`SELECT ROLE_ID FROM ROLES WHERE ROLE_NAME=:1`, [b.role]);
        await conn.execute(`UPDATE USERS SET ROLE_ID=:2, UPDATED_AT=SYSTIMESTAMP WHERE USER_ID=:1`, [id, roleRow!.ROLE_ID]);
      }
      if (b.password) {
        if (String(b.password).length < 8) throw Object.assign(new Error('PASSWORD_TOO_SHORT'), { status: 400 });
        await conn.execute(`UPDATE USERS SET PASSWORD_HASH=:2, UPDATED_AT=SYSTIMESTAMP WHERE USER_ID=:1`,
          [id, bcrypt.hashSync(String(b.password), 10)]);
      }
      if (b.fullName || b.email || b.phone) {
        await conn.execute(
          `UPDATE USERS SET FULL_NAME=NVL(:2,FULL_NAME), EMAIL=NVL(:3,EMAIL), PHONE=NVL(:4,PHONE), UPDATED_AT=SYSTIMESTAMP WHERE USER_ID=:1`,
          [id, b.fullName ?? null, b.email ?? null, b.phone ?? null]);
      }
      if (b.designation !== undefined) {
        await conn.execute(
          `MERGE INTO ADMIN_PROFILES ap USING (SELECT :1 U FROM DUAL)
           ON (ap.USER_ID=:1)
           WHEN MATCHED THEN UPDATE SET DESIGNATION=:2
           WHEN NOT MATCHED THEN INSERT (USER_ID, DESIGNATION) VALUES (:1,:2)`, [id, b.designation]);
      }
    });
    await audit(req, 'UPDATE', 'ADMIN_USER', id, { username: before.USERNAME, role: before.ROLE_NAME, status: before.STATUS },
      { ...b, password: b.password ? '***' : undefined });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// Grant/revoke a permission for a specific admin user
adminsRouter.put('/:id/permissions', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { permissionKey, isGrant } = req.body || {};
    if (!permissionKey || isGrant === undefined) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const perm = await q1<{ PERMISSION_ID: number }>(`SELECT PERMISSION_ID FROM PERMISSIONS WHERE PERMISSION_KEY=:1`, [permissionKey]);
    if (!perm) return res.status(404).json({ error: 'PERMISSION_NOT_FOUND' });

    await tx(async (conn) => {
      await conn.execute(
        `MERGE INTO USER_PERMISSIONS up USING (SELECT :1 U, :2 P FROM DUAL)
         ON (up.USER_ID=:1 AND up.PERMISSION_ID=:2)
         WHEN MATCHED THEN UPDATE SET IS_GRANT=:3, GRANTED_BY=:4
         WHEN NOT MATCHED THEN INSERT (USER_ID, PERMISSION_ID, GRANTED_BY, IS_GRANT) VALUES (:1,:2,:4,:3)`,
        [id, perm.PERMISSION_ID, isGrant ? 1 : 0, req.user!.userId]);
    });
    await audit(req, isGrant ? 'GRANT_PERMISSION' : 'REVOKE_PERMISSION', 'ADMIN_USER', id, null,
      { permissionKey, isGrant });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Admin activity: audit logs filtered to admin users
adminsRouter.get('/:id/activity', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await q(
      `SELECT LOG_ID, ACTION, RECORD_TYPE, RECORD_ID, CREATED_AT, USERNAME
       FROM AUDIT_LOGS WHERE USER_ID=:1 ORDER BY CREATED_AT DESC FETCH FIRST 100 ROWS ONLY`, [id]);
    res.json({ rows });
  } catch (e) { next(e); }
});
