/**
 * Cursor utilities for pagination
 *
 * Cursors are opaque tokens that encode pagination state.
 * We use base64url encoding to make them URL-safe.
 *
 * The pagination displays jobs in this order:
 * 1. Processing jobs (queried separately, not paginated)
 * 2. Pending jobs (oldest first: queue_position ASC, created_at ASC)
 * 3. Finished jobs (newest first: updated_at DESC, id DESC)
 */

/**
 * Cursor for pending jobs section
 */
export interface PendingJobsCursor {
  section: 'pending';
  queue_position: number | null;
  created_at: string;
  id: number;
}

/**
 * Cursor for finished jobs section (completed, failed, cancelled)
 */
export interface FinishedJobsCursor {
  section: 'finished';
  updated_at: string;
  id: number;
}

/**
 * Union type for all cursor variants
 */
export type JobsCursor = PendingJobsCursor | FinishedJobsCursor;

/**
 * Legacy cursor format for backwards compatibility
 */
export interface LegacyJobsCursor {
  id: number;
  created_at: string;
  section?: never; // Distinguishes from new format
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
 * Supports both new and legacy cursor formats
 */
export function decodeCursor(
  cursor: string,
): JobsCursor | LegacyJobsCursor | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    return JSON.parse(json);
  } catch (error) {
    console.error('Failed to decode cursor:', error);
    return null;
  }
}
