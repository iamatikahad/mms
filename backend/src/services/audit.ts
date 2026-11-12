import { Request } from 'express';
import { q, q1 } from '../db';
import { AuthUser } from '../middleware';

export async function audit(
  req: Request,
  action: string,
  recordType: string,
  recordId: string | number | null,
  previousValue: any,
  newValue: any,
  reason?: string
) {
  const u: AuthUser | undefined = req.user;
  try {
    await q(
      `INSERT INTO AUDIT_LOGS (USER_ID, USERNAME, ROLE_NAME, ACTION, RECORD_TYPE, RECORD_ID, PREVIOUS_VALUE, NEW_VALUE, REASON)
       VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9)`,
      [
        u?.userId ?? null,
        u?.username ?? 'system',
        u?.roleName ?? 'SYSTEM',
        action,
        recordType,
        recordId === null ? null : String(recordId),
        previousValue == null ? null : JSON.stringify(previousValue),
        newValue == null ? null : JSON.stringify(newValue),
        reason ?? null,
      ]
    );
  } catch (e) {
    console.error('audit write failed', e);
  }
}

export async function auditLogin(identifier: string, success: boolean, req: Request) {
  try {
    await q(
      `INSERT INTO AUDIT_LOGS (USERNAME, ROLE_NAME, ACTION, RECORD_TYPE, NEW_VALUE)
       VALUES (:1,'SYSTEM',:2,'AUTH',:3)`,
      [identifier, success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED', JSON.stringify({ ip: req.ip })]
    );
  } catch { /* ignore */ }
}
