import { Router } from 'express';
import { q, q1, clobText } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { audit } from '../services/audit';

export const settingsRouter = Router();
settingsRouter.use(authMiddleware);

// All settings (any authenticated user can read non-sensitive ones)
settingsRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await q(`SELECT SETTING_KEY, SETTING_VALUE, DESCRIPTION, UPDATED_AT FROM SYSTEM_SETTINGS ORDER BY SETTING_KEY`);
    for (const r of rows) r.SETTING_VALUE = await clobText(r.SETTING_VALUE);
    res.json({ rows });
  } catch (e) { next(e); }
});

settingsRouter.get('/:key', async (req, res, next) => {
  try {
    const row = await q1(`SELECT * FROM SYSTEM_SETTINGS WHERE SETTING_KEY=:1`, [req.params.key]);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    row.SETTING_VALUE = await clobText(row.SETTING_VALUE);
    res.json({ setting: row });
  } catch (e) { next(e); }
});

settingsRouter.put('/:key', requirePerm('settings.manage'), async (req, res, next) => {
  try {
    const key = String(req.params.key);
    // Meal schedule/cutoff settings are Super Admin only
    if (key.startsWith('meal.') && req.user!.roleName !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'SUPER_ADMIN_ONLY' });
    }
    const value = req.body?.value;
    if (value === undefined) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const before = await q1(`SELECT * FROM SYSTEM_SETTINGS WHERE SETTING_KEY=:1`, [key]);
    await q(
      `MERGE INTO SYSTEM_SETTINGS s USING (SELECT :1 K FROM DUAL)
       ON (s.SETTING_KEY=:1)
       WHEN MATCHED THEN UPDATE SET SETTING_VALUE=:2, UPDATED_BY=:3, UPDATED_AT=SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, UPDATED_BY) VALUES (:1,:2,:3)`,
      [key, String(value), req.user!.userId]);
    await audit(req, 'UPDATE', 'SETTING', key, before?.SETTING_VALUE, value);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
