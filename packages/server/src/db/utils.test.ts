import { describe, it, expect } from 'vitest';
import { safeJsonParse, queryAll, queryOne, safeCount, buildUpdateSet } from './utils.js';

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('returns fallback on invalid JSON', () => {
    expect(safeJsonParse('{invalid}', { fallback: true })).toEqual({ fallback: true });
  });

  it('returns fallback for null/undefined', () => {
    expect(safeJsonParse(null, [])).toEqual([]);
    expect(safeJsonParse(undefined, [])).toEqual([]);
  });

  it('returns non-string values as-is', () => {
    expect(safeJsonParse(42, 0)).toBe(42);
  });
});

describe('queryAll / queryOne', () => {
  const fakeDb = {
    exec: (sql: string, params?: any[]) => {
      if (sql.includes('empty')) return [];
      return [{
        columns: ['id', 'name'],
        values: [
          ['1', 'Alice'],
          ['2', 'Bob']
        ]
      }];
    }
  };

  it('returns all rows', () => {
    const rows = queryAll(fakeDb, 'SELECT * FROM users');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: '1', name: 'Alice' });
  });

  it('returns first row', () => {
    const row = queryOne(fakeDb, 'SELECT * FROM users');
    expect(row).toEqual({ id: '1', name: 'Alice' });
  });

  it('returns empty array when no results', () => {
    const rows = queryAll(fakeDb, 'SELECT * FROM empty');
    expect(rows).toEqual([]);
  });

  it('returns null when no rows', () => {
    const row = queryOne(fakeDb, 'SELECT * FROM empty');
    expect(row).toBeNull();
  });
});

describe('safeCount', () => {
  const fakeDb = {
    exec: () => [{
      columns: ['count'],
      values: [[42]]
    }]
  };

  it('returns numeric count', () => {
    expect(safeCount(fakeDb, 'SELECT COUNT(*) FROM t')).toBe(42);
  });
});

describe('buildUpdateSet', () => {
  it('builds allowed columns only', () => {
    const result = buildUpdateSet(
      { name: 'X', systemPrompt: 'Y', injected: 'Z' },
      { name: 'name', systemPrompt: 'system_prompt' },
      { updated_at: 123 }
    );
    expect(result).not.toBeNull();
    expect(result!.sql).toBe('name = ?, system_prompt = ?, updated_at = ?');
    expect(result!.params).toEqual(['X', 'Y', 123]);
  });

  it('returns null when nothing to update', () => {
    const result = buildUpdateSet({ injected: 'Z' }, { name: 'name' });
    expect(result).toBeNull();
  });
});
