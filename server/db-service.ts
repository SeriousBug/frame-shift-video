/**
 * Database service layer with common database operations
 */

import { query, queryOne, execute, transaction } from './database';
import {
  Job,
  CreateJobInput,
  UpdateJobInput,
  MetaRecord,
} from '../src/types/database';

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
      'INSERT INTO jobs (name, input_file, output_file, ffmpeg_command, queue_position) VALUES (?, ?, ?, ?, ?)',
      [
        input.name,
        input.input_file,
        input.output_file || null,
        input.ffmpeg_command || null,
        input.queue_position || null,
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
    if (input.ffmpeg_command !== undefined) {
      updates.push('ffmpeg_command = ?');
      params.push(input.ffmpeg_command);
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
};
