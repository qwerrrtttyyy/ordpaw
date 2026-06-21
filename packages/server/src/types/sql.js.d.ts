declare module 'sql.js' {
  export type SqlValue = string | number | null | Uint8Array;

  export interface QueryResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface Statement {
    run(params?: SqlValue[]): void;
    free(): void;
  }

  export class Database {
    constructor(data?: Buffer | Uint8Array | number[]);
    run(sql: string, params?: SqlValue[]): void;
    exec(sql: string, params?: SqlValue[]): QueryResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  interface SqlJsStatic {
    Database: typeof Database;
  }

  export default function initSqlJs(): Promise<SqlJsStatic>;
}
