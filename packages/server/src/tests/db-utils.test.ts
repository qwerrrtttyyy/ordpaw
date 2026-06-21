import { describe, it, expect, vi } from 'vitest';
import { safeJsonParse, rowToObject, queryAll, queryOne, safeCount } from '../db/utils.js';

describe('db/utils', () => {
  describe('safeJsonParse', () => {
    it('parses a valid JSON string', () => {
      expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
    });

    it('returns fallback for invalid JSON', () => {
      expect(safeJsonParse('{invalid}', { fallback: true })).toEqual({ fallback: true });
    });

    it('returns fallback for null and undefined', () => {
      expect(safeJsonParse(null, [])).toEqual([]);
      expect(safeJsonParse(undefined, [])).toEqual([]);
    });

    it('returns non-string values as-is', () => {
      expect(safeJsonParse(42, 0)).toBe(42);
      expect(safeJsonParse({ x: 1 }, {})).toEqual({ x: 1 });
      expect(safeJsonParse([1, 2], [])).toEqual([1, 2]);
    });
  });

  describe('rowToObject', () => {
    it('maps columns to row values', () => {
      expect(rowToObject(['id', 'name'], ['1', 'Alice'])).toEqual({ id: '1', name: 'Alice' });
    });

    it('handles empty columns', () => {
      expect(rowToObject([], [])).toEqual({});
    });
  });

  describe('queryAll', () => {
    it('returns mapped rows for non-empty result', () => {
      const db = {
        exec: vi.fn(() => [
          {
            columns: ['id', 'name'],
            values: [
              ['1', 'Alice'],
              ['2', 'Bob'],
            ],
          },
        ]),
      };
      const rows = queryAll(db, 'SELECT * FROM users');
      expect(rows).toEqual([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ]);
      expect(db.exec).toHaveBeenCalledWith('SELECT * FROM users', []);
    });

    it('returns empty array when no result set', () => {
      const db = { exec: vi.fn(() => []) };
      expect(queryAll(db, 'SELECT * FROM users')).toEqual([]);
    });

    it('returns empty array when result has no values', () => {
      const db = { exec: vi.fn(() => [{ columns: ['id'], values: [] }]) };
      expect(queryAll(db, 'SELECT * FROM users')).toEqual([]);
    });

    it('passes params to exec', () => {
      const db = {
        exec: vi.fn(() => [
          {
            columns: ['id'],
            values: [['1']],
          },
        ]),
      };
      queryAll(db, 'SELECT * FROM users WHERE id = ?', ['1']);
      expect(db.exec).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', ['1']);
    });
  });

  describe('queryOne', () => {
    it('returns first row when present', () => {
      const db = {
        exec: vi.fn(() => [
          {
            columns: ['id', 'name'],
            values: [
              ['1', 'Alice'],
              ['2', 'Bob'],
            ],
          },
        ]),
      };
      expect(queryOne(db, 'SELECT * FROM users')).toEqual({ id: '1', name: 'Alice' });
    });

    it('returns null when no rows', () => {
      const db = { exec: vi.fn(() => [{ columns: ['id'], values: [] }]) };
      expect(queryOne(db, 'SELECT * FROM users')).toBeNull();
    });
  });

  describe('safeCount', () => {
    it('returns numeric count', () => {
      const db = { exec: vi.fn(() => [{ columns: ['count'], values: [[42]] }]) };
      expect(safeCount(db, 'SELECT COUNT(*) FROM users')).toBe(42);
    });

    it('coerces string count to number', () => {
      const db = { exec: vi.fn(() => [{ columns: ['count'], values: [['7']] }]) };
      expect(safeCount(db, 'SELECT COUNT(*) FROM users')).toBe(7);
    });

    it('returns 0 for empty result', () => {
      const db = { exec: vi.fn(() => []) };
      expect(safeCount(db, 'SELECT COUNT(*) FROM users')).toBe(0);
    });

    it('returns 0 for non-numeric value', () => {
      const db = { exec: vi.fn(() => [{ columns: ['count'], values: [['abc']] }]) };
      expect(safeCount(db, 'SELECT COUNT(*) FROM users')).toBe(0);
    });
  });
});
