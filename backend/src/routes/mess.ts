import { Router } from 'express';
import { q, q1, tx } from '../db';
import { authMiddleware, requireRole } from '../middleware';
import { audit } from '../services/audit';

export const messRouter = Router();
messRouter.use(authMiddleware);

// Messes the current user may access (for switcher)
messRouter.get('/mine', async (req, res, next) => {
  try {
    const ids = req.messIds || [];
    if (!ids.length) return res.json({ rows: [], active: null });
    const list = await q(
      `SELECT MESS_ID, MESS_NAME, MESS_CODE, ADDRESS, CONTACT_NUMBER, STATUS
       FROM MESS_LOCATIONS WHERE MESS_ID IN (${ids.map((_, i) => ':' + (i + 1)).join(',')})
       ORDER BY MESS_ID`, ids);
    res.json({ rows: list, active: req.messId ?? null });
  } catch (e) { next(e); }
});

// ---- Super Admin: full mess management ----
messRouter.get('/locations', requireRole('SUPER_ADMIN'), async (_req, res, next) => {
  try {
    const rows = await q(`SELECT * FROM MESS_LOCATIONS ORDER BY MESS_ID`);
    res.json({ rows });
  } catch (e) { next(e); }
});

messRouter.post('/locations', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { messName, messCode, address, contactNumber } = req.body || {};
    if (!messName || !messCode) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const dup = await q1(`SELECT MESS_ID FROM MESS_LOCATIONS WHERE UPPER(MESS_CODE)=UPPER(:1)`, [messCode]);
    if (dup) return res.status(409).json({ error: 'CODE_TAKEN' });
    const out = [] as any[];
    const id = await tx(async (conn) => {
      await conn.execute(
        `INSERT INTO MESS_LOCATIONS (MESS_NAME, MESS_CODE, ADDRESS, CONTACT_NUMBER, STATUS)
         VALUES (:1,:2,:3,:4,'ACTIVE') RETURNING MESS_ID INTO :5`,
        [messName, messCode, address || null, contactNumber || null,
         { dir: (await import('oracledb')).default.BIND_OUT, type: (await import('oracledb')).default.NUMBER }],
        { outBinds: out });
      return Number(out[0]);
    });
    await audit(req, 'CREATE', 'MESS_LOCATION', id, null, req.body);
    res.status(201).json({ ok: true, messId: id });
  } catch (e) { next(e); }
});

messRouter.put('/locations/:id', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1<any>(`SELECT * FROM MESS_LOCATIONS WHERE MESS_ID=:1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    const b = req.body || {};
    await tx(async (conn) => {
      if (b.messName !== undefined) await conn.execute(`UPDATE MESS_LOCATIONS SET MESS_NAME=:2, UPDATED_AT=SYSTIMESTAMP WHERE MESS_ID=:1`, [id, b.messName]);
      if (b.address !== undefined) await conn.execute(`UPDATE MESS_LOCATIONS SET ADDRESS=:2, UPDATED_AT=SYSTIMESTAMP WHERE MESS_ID=:1`, [id, b.address]);
      if (b.contactNumber !== undefined) await conn.execute(`UPDATE MESS_LOCATIONS SET CONTACT_NUMBER=:2, UPDATED_AT=SYSTIMESTAMP WHERE MESS_ID=:1`, [id, b.contactNumber]);
      if (b.status && ['ACTIVE', 'DISABLED'].includes(b.status))
        await conn.execute(`UPDATE MESS_LOCATIONS SET STATUS=:2, UPDATED_AT=SYSTIMESTAMP WHERE MESS_ID=:1`, [id, b.status]);
    });
    await audit(req, 'UPDATE', 'MESS_LOCATION', id, before, b);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Grant/revoke a user's access to a mess (Super Admin only)
messRouter.put('/locations/:id/access', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const messId = Number(req.params.id);
    const { userId, accessRole = 'MESS_ADMIN', status = 'ACTIVE' } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const oracledb = (await import('oracledb')).default;
    await tx(async (conn) => {
      await conn.execute(
        `MERGE INTO MESS_USER_ACCESS a USING (SELECT :1 M, :2 U FROM DUAL)
         ON (a.MESS_ID=:1 AND a.USER_ID=:2)
         WHEN MATCHED THEN UPDATE SET ACCESS_ROLE=:3, STATUS=:4
         WHEN NOT MATCHED THEN INSERT (MESS_ID, USER_ID, ACCESS_ROLE, STATUS) VALUES (:1,:2,:3,:4)`,
        [messId, Number(userId), accessRole, status]);
    });
    await audit(req, 'SET_MESS_ACCESS', 'MESS_LOCATION', messId, null, { userId, accessRole, status });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Admin/super-admin users eligible for mess access assignment
messRouter.get('/assignable-users', requireRole('SUPER_ADMIN'), async (_req, res, next) => {
  try {
    const rows = await q(
      `SELECT u.USER_ID, u.USERNAME, u.FULL_NAME, r.ROLE_NAME
       FROM USERS u JOIN ROLES r ON r.ROLE_ID=u.ROLE_ID
       WHERE r.ROLE_NAME IN ('SUPER_ADMIN','ADMIN') AND u.STATUS='ACTIVE'
       ORDER BY u.USERNAME`);
    res.json({ rows });
  } catch (e) { next(e); }
});

messRouter.get('/locations/:id/access', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT a.ACCESS_ID, a.USER_ID, a.ACCESS_ROLE, a.STATUS, u.USERNAME, u.FULL_NAME
       FROM MESS_USER_ACCESS a JOIN USERS u ON u.USER_ID=a.USER_ID
       WHERE a.MESS_ID=:1 ORDER BY u.USERNAME`, [Number(req.params.id)]);
    res.json({ rows });
  } catch (e) { next(e); }
});
