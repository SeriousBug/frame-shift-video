/**
 * SQL template utility for safer SQL query construction
 * Provides a template literal function for SQL queries with parameter escaping
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SQLParams {
  [key: string]: any;
}

/**
 * SQL template literal function
 * Usage: SQL`SELECT * FROM users WHERE id = ${userId}`
 */
export function SQL(
  strings: TemplateStringsArray,
  ...values: any[]
): { query: string; params: any[] } {
  let query = '';
  const params: any[] = [];

  for (let i = 0; i < strings.length; i++) {
    query += strings[i];

    if (i < values.length) {
      query += '?';
      params.push(values[i]);
    }
  }

  return { query, params };
}

/**
 * Alternative SQL template for named parameters
 * Usage: SQLNAMED`SELECT * FROM users WHERE id = $id AND name = $name`
 */
export function SQLNAMED(
  strings: TemplateStringsArray,
  ...values: any[]
): { query: string; params: SQLParams } {
  let query = strings[0];
  const params: SQLParams = {};

  for (let i = 0; i < values.length; i++) {
    const paramName = `param${i}`;
    query += `:${paramName}` + strings[i + 1];
    params[paramName] = values[i];
  }

  return { query, params };
}
