/**
 * Database service layer with common database operations
 */

import { query, queryOne, execute, transaction } from './database';
import {
  Job,
  CreateJobInput,
  UpdateJobInput,
  MetaRecord,
  FileSelection,
} from '../src/types/database';
import crypto from 'crypto';

/**
 * Meta table operations (key-value store)
 */
export const MetaService = {
  get(key: string): string | undefined {
    const result = queryOne<MetaRecord>(
      'SELECT value FROM meta WHERE key = ?',
      [key],
    );
    return result?.value;
  },

  set(key: string, value: string): void {
    execute('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
      key,
      value,
    ]);
  },

  delete(key: string): void {
    execute('DELETE FROM meta WHERE key = ?', [key]);
  },

  getAll(): MetaRecord[] {
    return query<MetaRecord>('SELECT key, value FROM meta ORDER BY key');
  },
};

/**
 * Job table operations
 */
export const JobService = {
  create(input: CreateJobInput): number {
    const result = execute(
      'INSERT INTO jobs (name, input_file, output_file, ffmpeg_command_json, queue_position, config_key) VALUES (?, ?, ?, ?, ?, ?)',
      [
        input.name,
        input.input_file,
        input.output_file || null,
        input.ffmpeg_command_json || null,
        input.queue_position || null,
        input.config_key || null,
      ],
    );
    return Number(result.lastInsertRowid);
  },

  getById(id: number): Job | undefined {
    const result = queryOne<Job>('SELECT * FROM jobs WHERE id = ?', [id]);
    return result || undefined;
  },

  getAll(): Job[] {
    return query<Job>('SELECT * FROM jobs ORDER BY created_at DESC');
  },

  /**
   * Get jobs with cursor-based pagination
   * @param limit Number of jobs to return
   * @param cursor Optional cursor for pagination (encoded job id and created_at)
   * @returns Jobs and optional next cursor
   */
  getPaginated(
    limit: number = 20,
    cursorId?: number,
    cursorCreatedAt?: string,
  ): { jobs: Job[]; nextCursor?: string; hasMore: boolean } {
    let jobs: Job[];

    if (cursorId !== undefined && cursorCreatedAt !== undefined) {
      // Fetch jobs after the cursor
      // We use created_at and id for stable sorting
      jobs = query<Job>(
        `SELECT * FROM jobs
         WHERE (created_at, id) < (?, ?)
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
        [cursorCreatedAt, cursorId, limit + 1],
      );
    } else {
      // First page
      jobs = query<Job>(
        `SELECT * FROM jobs
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
        [limit + 1],
      );
    }

    const hasMore = jobs.length > limit;
    const result = hasMore ? jobs.slice(0, limit) : jobs;

    // Generate next cursor if there are more results
    let nextCursor: string | undefined;
    if (hasMore && result.length > 0) {
      const lastJob = result[result.length - 1];
      const cursorData = {
        id: lastJob.id,
        created_at: lastJob.created_at,
      };
      // Inline encoding to avoid circular dependency
      nextCursor = Buffer.from(JSON.stringify(cursorData)).toString(
        'base64url',
      );
    }

    return { jobs: result, nextCursor, hasMore };
  },

  getByStatus(status: Job['status']): Job[] {
    return query<Job>(
      'SELECT * FROM jobs WHERE status = ? ORDER BY queue_position ASC, created_at ASC',
      [status],
    );
  },

  getQueue(): Job[] {
    return query<Job>(
      `SELECT * FROM jobs
       WHERE status IN ('pending', 'processing')
       ORDER BY queue_position ASC, created_at ASC`,
    );
  },

  getStatusCounts(): Record<string, number> {
    const results = query<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM jobs GROUP BY status',
    );
    const counts: Record<string, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const row of results) {
      counts[row.status] = row.count;
    }
    return counts;
  },

  getFailedNotRetriedCount(): number {
    const result = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM jobs WHERE status = ? AND retried = 0',
      ['failed'],
    );
    return result?.count || 0;
  },

  update(id: number, input: UpdateJobInput): void {
    const updates: string[] = [];
    const params: any[] = [];

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }
    if (input.output_file !== undefined) {
      updates.push('output_file = ?');
      params.push(input.output_file);
    }
    if (input.ffmpeg_command_json !== undefined) {
      updates.push('ffmpeg_command_json = ?');
      params.push(input.ffmpeg_command_json);
    }
    if (input.progress !== undefined) {
      updates.push('progress = ?');
      params.push(input.progress);
    }
    if (input.error_message !== undefined) {
      updates.push('error_message = ?');
      params.push(input.error_message);
    }
    if (input.queue_position !== undefined) {
      updates.push('queue_position = ?');
      params.push(input.queue_position);
    }
    if (input.start_time !== undefined) {
      updates.push('start_time = ?');
      params.push(input.start_time);
    }
    if (input.end_time !== undefined) {
      updates.push('end_time = ?');
      params.push(input.end_time);
    }
    if (input.total_frames !== undefined) {
      updates.push('total_frames = ?');
      params.push(input.total_frames);
    }
    if (input.retried !== undefined) {
      updates.push('retried = ?');
      params.push(input.retried);
    }
    if (input.config_key !== undefined) {
      updates.push('config_key = ?');
      params.push(input.config_key);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const queryStr = `UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`;
    execute(queryStr, params);
  },

  delete(id: number): void {
    execute('DELETE FROM jobs WHERE id = ?', [id]);
  },

  updateProgress(id: number, progress: number): void {
    execute(
      'UPDATE jobs SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [progress, id],
    );
  },

  setError(id: number, errorMessage: string): void {
    execute(
      `UPDATE jobs
       SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [errorMessage, id],
    );
  },

  complete(id: number, outputFile: string): void {
    execute(
      `UPDATE jobs
       SET status = 'completed', output_file = ?, progress = 100, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [outputFile, id],
    );
  },

  reorderQueue(jobIds: number[]): void {
    transaction(() => {
      jobIds.forEach((jobId, index) => {
        execute(
          'UPDATE jobs SET queue_position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [index, jobId],
        );
      });
    });
  },

  getNextPendingJob(): Job | undefined {
    const result = queryOne<Job>(
      `SELECT * FROM jobs
       WHERE status = 'pending'
       ORDER BY queue_position ASC, created_at ASC
       LIMIT 1`,
    );
    return result || undefined;
  },

  /**
   * Reset all processing jobs to pending state
   * This should be called on server startup to recover from crashes
   */
  resetProcessingJobs(): number {
    const result = execute(
      `UPDATE jobs
       SET status = 'pending', progress = 0, updated_at = CURRENT_TIMESTAMP
       WHERE status = 'processing'`,
    );
    return result.changes;
  },
};

/**
 * File selection table operations
 */
export const FileSelectionService = {
  /**
   * Generate a SHA1 hash of the data and encode as base64url
   */
  generateKey(data: string[]): string {
    const json = JSON.stringify(data);
    const hash = crypto.createHash('sha1').update(json).digest('base64url');
    return hash;
  },

  /**
   * Save file selections with optional config and return the key
   */
  save(files: string[], config?: string): string {
    const json = JSON.stringify(files);
    const key = this.generateKey(files);

    execute(
      'INSERT OR REPLACE INTO file_selections (id, data, config) VALUES (?, ?, ?)',
      [key, json, config || null],
    );

    return key;
  },

  /**
   * Get file selections and config by key
   */
  get(key: string): { files: string[]; config?: any } | undefined {
    const result = queryOne<FileSelection>(
      'SELECT data, config FROM file_selections WHERE id = ?',
      [key],
    );

    if (!result) return undefined;

    try {
      const files = JSON.parse(result.data);
      const config = result.config ? JSON.parse(result.config) : undefined;
      return { files, config };
    } catch (error) {
      console.error('Failed to parse file selections data:', error);
      return undefined;
    }
  },

  /**
   * Delete old file selections (older than 30 days)
   */
  cleanup(): void {
    execute(
      "DELETE FROM file_selections WHERE created_at < datetime('now', '-30 days')",
    );
  },
};
