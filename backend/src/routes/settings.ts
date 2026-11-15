import { Router } from 'express';
import { q, q1, tx, clobText } from '../db';
import { authMiddleware, requirePerm } from '../middleware';
import { audit } from '../services/audit';

export const settingsRouter = Router();
settingsRouter.use(authMiddleware);

// Keys that are mess-specific (stored with MESS_ID); everything else is global (MESS_ID NULL)
const MESS_KEYS = ['app.mess_name', 'meal.lunch_time', 'meal.lunch_cutoff', 'meal.dinner_time',
  'meal.dinner_cutoff', 'meal.max_regular_per_meal', 'meal.max_guests_per_meal',
  'telegram.bot_token', 'telegram.chat_id', 'telegram.notify_requests', 'telegram.notify_updates',
  'telegram.notify_cancels', 'telegram.notify_cutoff', 'calc.system', 'bill.allocation_method'];
const isMessKey = (k: string) => MESS_KEYS.includes(k);

// Effective value: mess override wins, else global row.
async function effectiveRows(messId: number | undefined) {
  const rows = await q(
    `SELECT SETTING_KEY, SETTING_VALUE, DESCRIPTION, UPDATED_AT, MESS_ID FROM SYSTEM_SETTINGS
     WHERE SETTING_KEY NOT LIKE 'telegram.%'
       AND (MESS_ID IS NULL OR MESS_ID = :1)
     ORDER BY SETTING_KEY`, [messId ?? -1]);
  const byKey = new Map<string, any>();
  for (const r of rows) {
    const k = String(r.SETTING_KEY);
    const existing = byKey.get(k);
    // prefer mess-scoped (non-null MESS_ID) over global
    if (!existing || (existing.MESS_ID == null && r.MESS_ID != null)) byKey.set(k, r);
  }
  for (const r of byKey.values()) r.SETTING_VALUE = await clobText(r.SETTING_VALUE);
  return [...byKey.values()];
}

settingsRouter.get('/', async (req, res, next) => {
  try {
    res.json({ rows: await effectiveRows(req.messId), messId: req.messId ?? null });
  } catch (e) { next(e); }
});

settingsRouter.get('/:key', async (req, res, next) => {
  try {
    if (String(req.params.key).startsWith('telegram.')) return res.status(404).json({ error: 'NOT_FOUND' });
    const key = String(req.params.key);
    const messId = isMessKey(key) ? req.messId : null;
    let row = await q1(
      `SELECT * FROM SYSTEM_SETTINGS WHERE SETTING_KEY=:1 AND (MESS_ID IS NULL OR MESS_ID=:2) ORDER BY MESS_ID DESC FETCH FIRST 1 ROWS ONLY`,
      [key, messId ?? -1]);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    row.SETTING_VALUE = await clobText(row.SETTING_VALUE);
    res.json({ setting: row });
  } catch (e) { next(e); }
});

settingsRouter.put('/:key', requirePerm('settings.manage'), async (req, res, next) => {
  try {
    const key = String(req.params.key);
    if (key.startsWith('telegram.')) {
      return res.status(403).json({ error: 'USE_TELEGRAM_SETTINGS_API' });
    }
    if ((key.startsWith('meal.') || key.startsWith('calc.')) && req.user!.roleName !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'SUPER_ADMIN_ONLY' });
    }
    const value = req.body?.value;
    if (value === undefined) return res.status(400).json({ error: 'MISSING_FIELDS' });
    const messId = isMessKey(key) ? (req.messId ?? null) : null;
    // global keys editable only by SUPER_ADMIN
    if (messId === null && req.user!.roleName !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'SUPER_ADMIN_ONLY' });
    }
    const before = await q1(
      `SELECT * FROM SYSTEM_SETTINGS WHERE SETTING_KEY=:1 AND MESS_ID IS NOT DISTINCT FROM :2`,
      [key, messId]);
    await tx(async (conn) => {
      await conn.execute(
        `MERGE INTO SYSTEM_SETTINGS s
         USING (SELECT :1 K, :2 M FROM DUAL)
         ON (s.SETTING_KEY=:1 AND s.MESS_ID IS NOT DISTINCT FROM :2)
         WHEN MATCHED THEN UPDATE SET SETTING_VALUE=:3, UPDATED_BY=:4, UPDATED_AT=SYSTIMESTAMP
         WHEN NOT MATCHED THEN INSERT (SETTING_KEY, SETTING_VALUE, MESS_ID, UPDATED_BY) VALUES (:1,:3,:2,:4)`,
        [key, messId, String(value), req.user!.userId]);
    });
    await audit(req, 'UPDATE', 'SETTING', `${key}@mess${messId ?? 'global'}`, before?.SETTING_VALUE, value);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
