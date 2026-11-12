import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { q, q1 } from './db';

export interface AuthUser {
  userId: number;
  username: string;
  roleName: 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';
  memberId: number | null;
  permissions: Set<string>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export function signToken(userId: number) {
  return jwt.sign({ uid: userId }, config.jwtSecret, {
    expiresIn: `${config.jwtExpiresHours}h`,
  });
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    let token = req.cookies?.[config.cookieName] as string | undefined;
    const auth = req.headers.authorization;
    if (!token && auth?.startsWith('Bearer ')) token = auth.slice(7);
    if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    let uid: number;
    try {
      uid = (jwt.verify(token, config.jwtSecret) as any).uid;
    } catch {
      return res.status(401).json({ error: 'TOKEN_INVALID' });
    }

    const row = await q1<any>(
      `SELECT u.USER_ID, u.USERNAME, r.ROLE_NAME, u.STATUS,
              (SELECT MEMBER_ID FROM MEMBERS m WHERE m.USER_ID = u.USER_ID AND m.STATUS='ACTIVE') MEMBER_ID
       FROM USERS u JOIN ROLES r ON r.ROLE_ID = u.ROLE_ID
       WHERE u.USER_ID = :1`,
      [uid]
    );
    if (!row || row.STATUS !== 'ACTIVE') return res.status(401).json({ error: 'ACCOUNT_DISABLED' });

    // Effective permissions = (role permissions - revokes) + grants
    const [rp, up] = await Promise.all([
      q<{ PERMISSION_KEY: string }>(
        `SELECT p.PERMISSION_KEY FROM ROLE_PERMISSIONS rp
           JOIN ROLES r ON r.ROLE_ID = rp.ROLE_ID
           JOIN PERMISSIONS p ON p.PERMISSION_ID = rp.PERMISSION_ID
         WHERE r.ROLE_NAME = :1`, [row.ROLE_NAME]),
      q<{ PERMISSION_KEY: string; IS_GRANT: number }>(
        `SELECT p.PERMISSION_KEY, up.IS_GRANT FROM USER_PERMISSIONS up
           JOIN PERMISSIONS p ON p.PERMISSION_ID = up.PERMISSION_ID
         WHERE up.USER_ID = :1`, [uid]),
    ]);
    const permSet = new Set(rp.map(p => p.PERMISSION_KEY));
    for (const p of up) {
      if (Number(p.IS_GRANT) === 1) permSet.add(p.PERMISSION_KEY);
      else permSet.delete(p.PERMISSION_KEY);
    }
    const permissionKeys = [...permSet];

    req.user = {
      userId: row.USER_ID,
      username: row.USERNAME,
      roleName: row.ROLE_NAME,
      memberId: row.MEMBER_ID ?? null,
      permissions: new Set(permissionKeys),
    };
    next();
  } catch (e) {
    next(e);
  }
}

export function requirePerm(...keys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (req.user.roleName === 'SUPER_ADMIN') return next();
    const ok = keys.some(k => req.user!.permissions.has(k));
    if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (!roles.includes(req.user.roleName)) return res.status(403).json({ error: 'FORBIDDEN' });
    next();
  };
}

/** Resolve member_id for the current user; members can only see their own. */
export async function memberScope(req: Request): Promise<number | null> {
  if (!req.user) return null;
  if (req.user.roleName === 'MEMBER') return req.user.memberId;
  return null;
}
