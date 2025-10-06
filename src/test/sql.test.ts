/**
 * SQL template utility tests
 */

import { describe, it, expect } from 'vitest';
import { SQL, SQLNAMED } from '../lib/sql';

describe('SQL Template Utilities', () => {
  describe('SQL function', () => {
    it('should create parameterized queries', () => {
      const userId = 123;
      const name = 'John Doe';
      
      const result = SQL`SELECT * FROM users WHERE id = ${userId} AND name = ${name}`;
      
      expect(result.query).toBe('SELECT * FROM users WHERE id = ? AND name = ?');
      expect(result.params).toEqual([123, 'John Doe']);
    });

    it('should handle queries without parameters', () => {
      const result = SQL`SELECT * FROM users`;
      
      expect(result.query).toBe('SELECT * FROM users');
      expect(result.params).toEqual([]);
    });

    it('should handle null and undefined values', () => {
      const nullValue = null;
      const undefinedValue = undefined;
      
      const result = SQL`SELECT * FROM users WHERE deleted_at = ${nullValue} AND optional_field = ${undefinedValue}`;
      
      expect(result.query).toBe('SELECT * FROM users WHERE deleted_at = ? AND optional_field = ?');
      expect(result.params).toEqual([null, undefined]);
    });

    it('should handle complex data types', () => {
      const data = { key: 'value' };
      const array = [1, 2, 3];
      
      const result = SQL`INSERT INTO logs (data, numbers) VALUES (${JSON.stringify(data)}, ${JSON.stringify(array)})`;
      
      expect(result.query).toBe('INSERT INTO logs (data, numbers) VALUES (?, ?)');
      expect(result.params).toEqual(['{"key":"value"}', '[1,2,3]']);
    });
  });

  describe('SQLNAMED function', () => {
    it('should create named parameter queries', () => {
      const userId = 123;
      const name = 'John Doe';
      
      const result = SQLNAMED`SELECT * FROM users WHERE id = ${userId} AND name = ${name}`;
      
      expect(result.query).toBe('SELECT * FROM users WHERE id = :param0 AND name = :param1');
      expect(result.params).toEqual({ param0: 123, param1: 'John Doe' });
    });

    it('should handle queries without parameters', () => {
      const result = SQLNAMED`SELECT * FROM users`;
      
      expect(result.query).toBe('SELECT * FROM users');
      expect(result.params).toEqual({});
    });

    it('should handle single parameter', () => {
      const id = 42;
      
      const result = SQLNAMED`SELECT * FROM users WHERE id = ${id}`;
      
      expect(result.query).toBe('SELECT * FROM users WHERE id = :param0');
      expect(result.params).toEqual({ param0: 42 });
    });
  });
});