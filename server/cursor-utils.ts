/**
 * Cursor utilities for pagination
 *
 * Cursors are opaque tokens that encode pagination state.
 * We use base64url encoding to make them URL-safe.
 */

export interface JobsCursor {
  id: number;
  created_at: string;
}

/**
 * Encode cursor data to a base64url string
 */
export function encodeCursor(data: JobsCursor): string {
  const json = JSON.stringify(data);
  return Buffer.from(json).toString('base64url');
}

/**
 * Decode a base64url cursor string to cursor data
 */
export function decodeCursor(cursor: string): JobsCursor | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    return JSON.parse(json);
  } catch (error) {
    console.error('Failed to decode cursor:', error);
    return null;
  }
}
