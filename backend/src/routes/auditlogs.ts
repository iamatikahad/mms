import { Router } from 'express';
import { q, Bind, clobText } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { toDateOnly } from '../util';

export const auditRouter = Router();
auditRouter.use(authMiddleware);
auditRouter.use(requirePerm('audit.view'));

// Audit logs — read-only
auditRouter.get('/', async (req, res, next) => {
  try {
    const { userId = '', action = '', recordType = '', from = '', to = '', search = '', page = '1', pageSize = '50' } = req.query as any;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 50));
    const binds: Bind[] = [];
    let where = '1=1';
    if (userId) { binds.push(Number(userId)); where += ` AND l.USER_ID=:${binds.length}`; }
    if (action) { binds.push(`%${action}%`); where += ` AND UPPER(l.ACTION) LIKE UPPER(:${binds.length})`; }
    if (recordType) { binds.push(recordType); where += ` AND l.RECORD_TYPE=:${binds.length}`; }
    if (from) { binds.push(toDateOnly(from)); where += ` AND TRUNC(l.CREATED_AT)>=:${binds.length}`; }
    if (to) { binds.push(toDateOnly(to)); where += ` AND TRUNC(l.CREATED_AT)<=:${binds.length}`; }
    if (search) {
      binds.push(`%${search}%`, `%${search}%`);
      const b = binds.length - 1;
      where += ` AND (UPPER(l.USERNAME) LIKE UPPER(:${b}) OR UPPER(l.RECORD_ID) LIKE UPPER(:${b + 1}))`;
    }

    const count = await q<{ C: number }>(`SELECT COUNT(*) C FROM AUDIT_LOGS l WHERE ${where}`, binds);
    binds.push((p - 1) * ps, ps);
    const rows = await q(
      `SELECT l.LOG_ID, l.USER_ID, l.USERNAME, l.ROLE_NAME, l.ACTION, l.RECORD_TYPE, l.RECORD_ID,
              l.PREVIOUS_VALUE, l.NEW_VALUE, l.REASON, l.CREATED_AT
       FROM AUDIT_LOGS l WHERE ${where} ORDER BY l.CREATED_AT DESC, l.LOG_ID DESC
       OFFSET :${binds.length - 1} ROWS FETCH NEXT :${binds.length} ROWS ONLY`, binds);
    for (const r of rows) {
      r.PREVIOUS_VALUE = await clobText(r.PREVIOUS_VALUE);
      r.NEW_VALUE = await clobText(r.NEW_VALUE);
    }
    res.json({ rows, total: Number(count[0]?.C ?? 0), page: p, pageSize: ps });
  } catch (e) { next(e); }
});
