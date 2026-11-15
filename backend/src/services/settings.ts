import { q1, clobText } from '../db';

/**
 * Mess-aware setting lookup: mess-scoped row wins, else global (MESS_ID NULL).
 * Pass messId=undefined to read global-only.
 */
export async function getSetting(key: string, messId?: number | null): Promise<string> {
  const row = await q1<{ SETTING_VALUE: any }>(
    `SELECT SETTING_VALUE FROM SYSTEM_SETTINGS
     WHERE SETTING_KEY=:1 AND (MESS_ID IS NULL OR MESS_ID=:2)
     ORDER BY MESS_ID DESC NULLS LAST FETCH FIRST 1 ROWS ONLY`,
    [key, messId ?? -1]);
  if (!row) return '';
  const v = await clobText(row.SETTING_VALUE);
  return String(v ?? '').replace(/^"|"$/g, '').trim();
}
