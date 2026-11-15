declare module 'oracledb' {
  export const OUT_FORMAT_OBJECT: number;
  export const BIND_OUT: number;
  export const NUMBER: number;
  export const STRING: number;
  export const DATE: number;

  export interface BindDef { dir?: number; type?: number; maxSize?: number; }
  export interface ExecuteOptions {
    outFormat?: number;
    outBinds?: any[];
    autoCommit?: boolean;
  }
  export interface ExecuteResult<T = any> { rows?: T[]; rowsAffected?: number; }

  export interface Connection {
    execute(sql: string, binds?: any[], options?: ExecuteOptions): Promise<ExecuteResult>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    close(): Promise<void>;
  }

  export interface Pool {
    getConnection(): Promise<Connection>;
    close(): Promise<void>;
  }

  export function createPool(opts: {
    user: string; password: string; connectString: string;
    poolMin?: number; poolMax?: number; poolIncrement?: number;
  }): Pool;

  const oracledb: {
    OUT_FORMAT_OBJECT: number; BIND_OUT: number; NUMBER: number; STRING: number; DATE: number;
    createPool: typeof createPool;
  };
  export default oracledb;
}
