import type { BindParams, QueryExecResult } from 'sql.js';

/**
 * Shared database helpers — extracted to deduplicate the 8+ copies of
 * safeJsonParse / rowToObject that previously lived across core modules.
 */

/**
 * Parse a JSON string safely, returning a fallback on any error.
 * Non-string values are returned as-is (allows transparent pass-through
 * for already-parsed values).
 */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Convert a sql.js row (array of values) into an object keyed by column name.
 */
export function rowToObject(columns: string[], row: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = row[i];
  }
  return obj;
}

/**
 * Run a SELECT and return all rows as objects. Returns [] when no rows.
 */
export function queryAll<T = Record<string, unknown>>(
  db: { exec: (sql: string, params?: BindParams) => QueryExecResult[] },
  sql: string,
  params: BindParams = []
): T[] {
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => rowToObject(columns, row) as T);
}

/**
 * Run a SELECT and return the first row as an object, or null when no rows.
 */
export function queryOne<T = Record<string, unknown>>(
  db: { exec: (sql: string, params?: BindParams) => QueryExecResult[] },
  sql: string,
  params: BindParams = []
): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Count rows for a query. Returns 0 on any error or empty result.
 */
export function safeCount(
  db: { exec: (sql: string, params?: BindParams) => QueryExecResult[] },
  sql: string,
  params: BindParams = []
): number {
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return 0;
  const v = result[0].values[0][0];
  return typeof v === 'number' ? v : Number(v) || 0;
}
