import oracledb, { Connection } from 'oracledb';
import { config } from './config';

// Thin mode is the default in node-oracledb 6.x and supports Oracle 12.1+.
const poolPromise = oracledb.createPool({
  user: config.db.user,
  password: config.db.password,
  connectString: config.db.connectString,
  poolMin: config.db.poolMin,
  poolMax: config.db.poolMax,
  poolIncrement: config.db.poolIncrement,
});

export async function getPool() { return poolPromise; }
export async function pingDb() {
  const pool = await poolPromise;
  const conn = await pool.getConnection();
  await conn.close();
}

export type Bind = string | number | Date | null;

/**
 * node-oracledb thin binds POSITIONALLY BY OCCURRENCE ORDER (the :N numbers
 * are cosmetic). Our SQL uses :N for readability, so we expand binds arrays
 * into occurrence order here: binds[i] is treated as the value for :i+1.
 */
function expandBinds(sql: string, binds: Bind[] = []): any[] {
  const map: Record<string, any> = {};
  (binds as any[]).forEach((v, i) => { map[String(i + 1)] = v; });
  const out: any[] = [];
  const re = /:([0-9]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const v = map[m[1]];
    out.push(v === undefined ? null : v);
  }
  return out;
}

export async function q<T = any>(sql: string, binds: Bind[] = []): Promise<T[]> {
  const pool = await poolPromise;
  const conn = await pool.getConnection();
  try {
    const res = await conn.execute(sql, expandBinds(sql, binds), {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    return (res.rows || []) as T[];
  } finally {
    await conn.close();
  }
}

/** Fill options.outBinds from result.outBinds (driver returns them on the result). */
function fillOutBinds(res: any, options?: any) {
  if (options?.outBinds && res?.outBinds) {
    res.outBinds.forEach((v: any, i: number) => { options.outBinds[i] = v; });
  }
  return res;
}

export async function q1<T = any>(sql: string, binds: Bind[] = []): Promise<T | null> {
  const rows = await q<T>(sql, binds);
  return rows[0] || null;
}

/** Run fn inside a transaction: all executes use autoCommit=false, then commit/rollback. */
export async function tx<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  const pool = await poolPromise;
  const conn = await pool.getConnection();
  const wrapped: Connection = {
    execute: async (sql, binds, options) => {
      const res: any = await conn.execute(sql, expandBinds(sql, binds as Bind[]), { ...options, autoCommit: false });
      return fillOutBinds(res, options);
    },
    commit: () => conn.commit(),
    rollback: () => conn.rollback(),
    close: () => conn.close(),
  };
  try {
    const out = await fn(wrapped);
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    await conn.close();
  }
}

export async function exec(conn: Connection, sql: string, binds: Bind[] = []) {
  return conn.execute(sql, binds);
}

export function n(v: any): number {
  if (v === null || v === undefined) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/** Oracle CLOB values come back as Lob objects in thin mode — extract text. */
export async function clobText(v: any): Promise<string | null> {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v.getData === 'function') return String(await v.getData());
  return String(v);
}

/** 'YYYY-MM' for a Date, in Asia/Dhaka. */
const dhakaFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit',
});
export function monthOf(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const parts = dhakaFmt.formatToParts(dt);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  return `${y}-${m}`;
}

export function currentMonthDhaka(): string {
  return monthOf(new Date());
}

export function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  // Dhaka is UTC+6 year-round (no DST). Return UTC instants of Dhaka month bounds.
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - 6 * 3600 * 1000);
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0) - 6 * 3600 * 1000);
  return { start, end };
}
