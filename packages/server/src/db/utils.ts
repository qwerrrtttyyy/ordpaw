/**
 * Shared database helpers — extracted to deduplicate the 8+ copies of
 * safeJsonParse / rowToObject that previously lived across core modules.
 */

/**
 * Parse a JSON string safely, returning a fallback on any error.
 * Non-string values are returned as-is (allows transparent pass-through
 * for already-parsed values).
 */
export function safeJsonParse<T>(value: any, fallback: T): T {
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
export function rowToObject(columns: string[], row: any[]): Record<string, any> {
  const obj: Record<string, any> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = row[i];
  }
  return obj;
}

/**
 * Run a SELECT and return all rows as objects. Returns [] when no rows.
 */
export function queryAll<T = Record<string, any>>(
  db: { exec: (sql: string, params?: any[]) => Array<{ columns: string[]; values: any[][] }> },
  sql: string,
  params: any[] = []
): T[] {
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row => rowToObject(columns, row) as T);
}

/**
 * Run a SELECT and return the first row as an object, or null when no rows.
 */
export function queryOne<T = Record<string, any>>(
  db: { exec: (sql: string, params?: any[]) => Array<{ columns: string[]; values: any[][] }> },
  sql: string,
  params: any[] = []
): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Count rows for a query. Returns 0 on any error or empty result.
 */
export function safeCount(
  db: { exec: (sql: string, params?: any[]) => Array<{ columns: string[]; values: any[][] }> },
  sql: string,
  params: any[] = []
): number {
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) return 0;
  const v = result[0].values[0][0];
  return typeof v === 'number' ? v : Number(v) || 0;
}

/**
 * Build a safe UPDATE SET clause from an allowed column map.
 * Only columns explicitly listed in `allowed` are included in the generated SQL.
 * Returns { sql: string, params: any[] } or null when there is nothing to update.
 */
export function buildUpdateSet(
  updates: Record<string, any>,
  allowed: Record<string, string>,
  extra: Record<string, any> = {}
): { sql: string; params: any[] } | null {
  const setParts: string[] = [];
  const params: any[] = [];
  for (const [key, value] of Object.entries(updates)) {
    const col = allowed[key];
    if (col === undefined) continue;
    setParts.push(`${col} = ?`);
    params.push(value);
  }
  for (const [col, value] of Object.entries(extra)) {
    setParts.push(`${col} = ?`);
    params.push(value);
  }
  if (setParts.length === 0) return null;
  return { sql: setParts.join(', '), params };
}
