import { Router } from 'express';
import bcrypt from 'bcryptjs';
import oracledb, { Connection } from 'oracledb';
import { q, q1, tx, Bind } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { audit } from '../services/audit';
import { toDateOnly } from '../util';

export const membersRouter = Router();
membersRouter.use(authMiddleware);

const MEMBER_SELECT = `
  SELECT m.MEMBER_ID, m.MEMBER_CODE, m.FULL_NAME, m.PHONE, m.EMAIL,
         m.JOINING_DATE, m.LEAVING_DATE, m.EMERGENCY_CONTACT, m.STATUS,
         m.CREATED_AT, m.UPDATED_AT,
         u.USERNAME, u.USER_ID, u.STATUS USER_STATUS
  FROM MEMBERS m JOIN USERS u ON u.USER_ID = m.USER_ID`;

function likeBind(search: string) { return `%${search}%`; }

// List members — search/filter/paginate
membersRouter.get('/', requirePerm('members.view'), async (req, res, next) => {
  try {
    const { search = '', status = '', page = '1', pageSize = '20' } = req.query as any;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const binds: Bind[] = [];
    let where = '1=1';
    if (search) {
      // one bind per LIKE occurrence (driver counts each :n occurrence)
      for (let i = 0; i < 4; i++) binds.push(likeBind(search));
      const b = binds.length - 4;
      where += ` AND (UPPER(m.FULL_NAME) LIKE UPPER(:${b + 1}) OR m.MEMBER_CODE LIKE :${b + 2} OR m.PHONE LIKE :${b + 3} OR u.USERNAME LIKE :${b + 4})`;
    }
    if (status) { binds.push(status); where += ` AND m.STATUS = :${binds.length}`; }

    const total = await q1<{ C: number }>(
      `SELECT COUNT(*) C FROM MEMBERS m JOIN USERS u ON u.USER_ID=m.USER_ID WHERE ${where}`, binds);
    binds.push((p - 1) * ps, ps);
    const rows = await q(
      `${MEMBER_SELECT} WHERE ${where} ORDER BY m.MEMBER_ID
       OFFSET :${binds.length - 1} ROWS FETCH NEXT :${binds.length} ROWS ONLY`, binds);
    res.json({ rows, total: Number(total?.C ?? 0), page: p, pageSize: ps });
  } catch (e) { next(e); }
});

// Single member
membersRouter.get('/:id', requirePerm('members.view'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const member = await q1(`${MEMBER_SELECT} WHERE m.MEMBER_ID = :1`, [id]);
    if (!member) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ member });
  } catch (e) { next(e); }
});

async function insertUser(conn: Connection, fields: {
  username: string; email?: string; phone?: string; passwordHash: string;
  fullName: string; roleId: number; status?: string;
}): Promise<number> {
  const outBinds: any[] = [];
  await conn.execute(
    `INSERT INTO USERS (USERNAME, EMAIL, PHONE, PASSWORD_HASH, FULL_NAME, ROLE_ID, STATUS)
     VALUES (:1,:2,:3,:4,:5,:6,:7) RETURNING USER_ID INTO :8`,
    [fields.username, fields.email || null, fields.phone || null, fields.passwordHash,
     fields.fullName, fields.roleId, fields.status || 'ACTIVE',
     { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }],
    { outBinds }
  );
  return Number(outBinds[0]);
}

// Create member (admin): USERS + MEMBERS atomically
membersRouter.post('/', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { fullName, username, password, phone, email, memberCode, joiningDate, emergencyContact } = b;
    if (!fullName || !username || !password) return res.status(400).json({ error: 'MISSING_FIELDS' });
    if (String(password).length < 8) return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });

    const dup = await q1(`SELECT USER_ID FROM USERS WHERE UPPER(USERNAME)=UPPER(:1)`, [username]);
    if (dup) return res.status(409).json({ error: 'USERNAME_TAKEN' });

    const memberRole = await q1<{ ROLE_ID: number }>(`SELECT ROLE_ID FROM ROLES WHERE ROLE_NAME='MEMBER'`);
    const hash = bcrypt.hashSync(String(password), 10);
    const code = memberCode || `M-${Date.now().toString(36).toUpperCase()}`;

    const ids = await tx(async (conn) => {
      const userId = await insertUser(conn, {
        username, email, phone, passwordHash: hash, fullName, roleId: memberRole!.ROLE_ID,
      });
      const outBinds: any[] = [];
      await conn.execute(
        `INSERT INTO MEMBERS (USER_ID, MEMBER_CODE, FULL_NAME, PHONE, EMAIL, JOINING_DATE, EMERGENCY_CONTACT, STATUS)
         VALUES (:1,:2,:3,:4,:5,:6,:7,'ACTIVE') RETURNING MEMBER_ID INTO :8`,
        [userId, code, fullName, phone || null, email || null,
         joiningDate ? toDateOnly(joiningDate) : null, emergencyContact || null,
         { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }],
        { outBinds });
      return { userId, memberId: Number(outBinds[0]) };
    });

    await audit(req, 'CREATE', 'MEMBER', ids.memberId, null, { ...b, password: '***' });
    res.status(201).json({ ok: true, ...ids });
  } catch (e: any) {
    if (String(e?.message).includes('UQ_MEMBERS_CODE') || String(e?.code) === '23000') {
      return res.status(409).json({ error: 'MEMBER_CODE_TAKEN' });
    }
    next(e);
  }
});

// Update member profile
membersRouter.put('/:id', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await q1(`${MEMBER_SELECT} WHERE m.MEMBER_ID = :1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    const b = req.body || {};

    await tx(async (conn) => {
      await conn.execute(
        `UPDATE MEMBERS SET FULL_NAME=:2, PHONE=:3, EMAIL=:4, JOINING_DATE=:5,
           LEAVING_DATE=:6, EMERGENCY_CONTACT=:7, MEMBER_CODE=:8, UPDATED_AT=SYSTIMESTAMP
         WHERE MEMBER_ID=:1`,
        [id, b.fullName ?? before.FULL_NAME, b.phone ?? before.PHONE, b.email ?? before.EMAIL,
         b.joiningDate ? toDateOnly(b.joiningDate) : before.JOINING_DATE,
         b.leavingDate ? toDateOnly(b.leavingDate) : before.LEAVING_DATE,
         b.emergencyContact ?? before.EMERGENCY_CONTACT, b.memberCode ?? before.MEMBER_CODE]);
      if (b.username || b.fullName) {
        await conn.execute(
          `UPDATE USERS SET USERNAME=NVL(:2,USERNAME), FULL_NAME=NVL(:3,FULL_NAME),
             EMAIL=NVL(:4,EMAIL), PHONE=NVL(:5,PHONE), UPDATED_AT=SYSTIMESTAMP
           WHERE USER_ID=(SELECT USER_ID FROM MEMBERS WHERE MEMBER_ID=:1)`,
          [id, b.username ?? null, b.fullName ?? null, b.email ?? null, b.phone ?? null]);
      }
      if (b.password) {
        if (String(b.password).length < 8) throw Object.assign(new Error('PASSWORD_TOO_SHORT'), { status: 400 });
        await conn.execute(
          `UPDATE USERS SET PASSWORD_HASH=:2 WHERE USER_ID=(SELECT USER_ID FROM MEMBERS WHERE MEMBER_ID=:1)`,
          [id, bcrypt.hashSync(String(b.password), 10)]);
      }
      if (b.status) {
        const mstatus = b.status === 'ACTIVE' ? 'ACTIVE' : b.status === 'LEFT' ? 'LEFT' : 'INACTIVE';
        await conn.execute(`UPDATE MEMBERS SET STATUS=:2, UPDATED_AT=SYSTIMESTAMP WHERE MEMBER_ID=:1`, [id, mstatus]);
        await conn.execute(
          `UPDATE USERS SET STATUS=CASE WHEN :2='ACTIVE' THEN 'ACTIVE' ELSE 'DISABLED' END, UPDATED_AT=SYSTIMESTAMP
           WHERE USER_ID=(SELECT USER_ID FROM MEMBERS WHERE MEMBER_ID=:1)`, [id, mstatus]);
      }
    });

    await audit(req, 'UPDATE', 'MEMBER', id, before, b.password ? { ...b, password: '***' } : b);
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// Activate / deactivate (keeps all history)
membersRouter.post('/:id/status', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status, reason } = req.body || {};
    if (!['ACTIVE', 'INACTIVE', 'LEFT'].includes(status)) return res.status(400).json({ error: 'BAD_STATUS' });
    const before = await q1(`${MEMBER_SELECT} WHERE m.MEMBER_ID = :1`, [id]);
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });

    await tx(async (conn) => {
      await conn.execute(
        `UPDATE MEMBERS SET STATUS=:2, LEAVING_DATE=CASE WHEN :2='LEFT' THEN TRUNC(SYSDATE) ELSE LEAVING_DATE END,
           UPDATED_AT=SYSTIMESTAMP WHERE MEMBER_ID=:1`, [id, status]);
      await conn.execute(
        `UPDATE USERS SET STATUS=CASE WHEN :2='ACTIVE' THEN 'ACTIVE' ELSE 'DISABLED' END, UPDATED_AT=SYSTIMESTAMP
         WHERE USER_ID=(SELECT USER_ID FROM MEMBERS WHERE MEMBER_ID=:1)`, [id, status]);
    });
    await audit(req, 'STATUS_CHANGE', 'MEMBER', id, { status: before.STATUS }, { status }, reason);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
