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
 * Normalize SQLite datetime strings to ISO 8601 UTC format
 * SQLite CURRENT_TIMESTAMP returns UTC time but without timezone indicator,
 * which JavaScript interprets as local time. We convert to proper ISO format.
 */
function normalizeJobTimestamps(job: Job): Job {
  const normalizeDate = (dateStr: string | undefined): string | undefined => {
    if (!dateStr) return undefined;

    // If already in ISO format with 'Z', return as is
    if (dateStr.endsWith('Z')) {
      return dateStr;
    }

    // SQLite datetime format: "2025-10-13 12:00:00" (UTC but lacks 'Z')
    // Replace space with 'T' and append 'Z' to make proper ISO 8601 UTC
    return new Date(dateStr.replace(' ', 'T') + 'Z').toISOString();
  };

  return {
    ...job,
    created_at: normalizeDate(job.created_at)!,
    updated_at: normalizeDate(job.updated_at)!,
    start_time: normalizeDate(job.start_time),
    end_time: normalizeDate(job.end_time),
  };
}

/**
 * Job table operations
 */
export const JobService = {
  create(input: CreateJobInput): number {
    const result = execute(
      'INSERT INTO jobs (name, input_file, output_file, ffmpeg_command_json, queue_position, config_key, config_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        input.name,
        input.input_file,
        input.output_file || null,
        input.ffmpeg_command_json || null,
        input.queue_position || null,
        input.config_key || null,
        input.config_json || null,
      ],
    );
    return Number(result.lastInsertRowid);
  },

  getById(id: number): Job | undefined {
    const result = queryOne<Job>('SELECT * FROM jobs WHERE id = ?', [id]);
    return result ? normalizeJobTimestamps(result) : undefined;
  },

  getAll(): Job[] {
    const jobs = query<Job>('SELECT * FROM jobs ORDER BY created_at DESC');
    return jobs.map(normalizeJobTimestamps);
  },

  /**
   * Get jobs with cursor-based pagination
   * Jobs are returned in this order:
   * 1. Pending jobs (oldest first: queue_position ASC, created_at ASC)
   * 2. Finished jobs (newest first: updated_at DESC, id DESC)
   *
   * @param limit Number of jobs to return per page
   * @param cursor Optional cursor from previous page
   * @param includeCleared Whether to include cleared jobs (default: false)
   * @returns Jobs and optional next cursor
   */
  getPaginated(
    limit: number = 20,
    cursor?: any, // Can be new format or legacy format
    includeCleared: boolean = false,
  ): { jobs: Job[]; nextCursor?: string; hasMore: boolean } {
    const clearedFilter = includeCleared ? '' : 'AND cleared = 0';
    let jobs: Job[] = [];
    let hasMore = false;
    let nextCursor: string | undefined;

    // Determine which section we're paginating
    const isLegacyCursor = cursor && !cursor.section;
    const section = cursor?.section || 'pending';

    if (!cursor || isLegacyCursor) {
      // First page or legacy cursor: start with pending jobs
      jobs = query<Job>(
        `SELECT * FROM jobs
         WHERE status = 'pending' ${clearedFilter}
         ORDER BY queue_position ASC, created_at ASC, id ASC
         LIMIT ?`,
        [limit + 1],
      );

      if (jobs.length > limit) {
        // More pending jobs exist
        hasMore = true;
        const result = jobs.slice(0, limit);
        const lastJob = result[result.length - 1];
        nextCursor = Buffer.from(
          JSON.stringify({
            section: 'pending',
            queue_position: lastJob.queue_position,
            created_at: lastJob.created_at,
            id: lastJob.id,
          }),
        ).toString('base64url');
        return {
          jobs: result.map(normalizeJobTimestamps),
          nextCursor,
          hasMore,
        };
      }

      // Not enough pending jobs to fill the page, fetch finished jobs too
      const remainingLimit = limit - jobs.length + 1; // +1 to check for more
      const finishedJobs = query<Job>(
        `SELECT * FROM jobs
         WHERE status IN ('completed', 'failed', 'cancelled') ${clearedFilter}
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`,
        [remainingLimit],
      );

      jobs = [...jobs, ...finishedJobs];

      if (jobs.length > limit) {
        hasMore = true;
        const result = jobs.slice(0, limit);
        const lastJob = result[result.length - 1];
        nextCursor = Buffer.from(
          JSON.stringify({
            section: 'finished',
            updated_at: lastJob.updated_at,
            id: lastJob.id,
          }),
        ).toString('base64url');
        return {
          jobs: result.map(normalizeJobTimestamps),
          nextCursor,
          hasMore,
        };
      }

      return {
        jobs: jobs.map(normalizeJobTimestamps),
        nextCursor: undefined,
        hasMore: false,
      };
    }

    if (section === 'pending') {
      // Continue paginating pending jobs
      jobs = query<Job>(
        `SELECT * FROM jobs
         WHERE status = 'pending'
           AND (queue_position, created_at, id) > (?, ?, ?)
           ${clearedFilter}
         ORDER BY queue_position ASC, created_at ASC, id ASC
         LIMIT ?`,
        [cursor.queue_position, cursor.created_at, cursor.id, limit + 1],
      );

      if (jobs.length > limit) {
        // More pending jobs exist
        hasMore = true;
        const result = jobs.slice(0, limit);
        const lastJob = result[result.length - 1];
        nextCursor = Buffer.from(
          JSON.stringify({
            section: 'pending',
            queue_position: lastJob.queue_position,
            created_at: lastJob.created_at,
            id: lastJob.id,
          }),
        ).toString('base64url');
        return {
          jobs: result.map(normalizeJobTimestamps),
          nextCursor,
          hasMore,
        };
      }

      // Pending jobs exhausted, switch to finished jobs
      const remainingLimit = limit - jobs.length + 1;
      const finishedJobs = query<Job>(
        `SELECT * FROM jobs
         WHERE status IN ('completed', 'failed', 'cancelled') ${clearedFilter}
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`,
        [remainingLimit],
      );

      jobs = [...jobs, ...finishedJobs];

      if (jobs.length > limit) {
        hasMore = true;
        const result = jobs.slice(0, limit);
        const lastJob = result[result.length - 1];
        nextCursor = Buffer.from(
          JSON.stringify({
            section: 'finished',
            updated_at: lastJob.updated_at,
            id: lastJob.id,
          }),
        ).toString('base64url');
        return {
          jobs: result.map(normalizeJobTimestamps),
          nextCursor,
          hasMore,
        };
      }

      return {
        jobs: jobs.map(normalizeJobTimestamps),
        nextCursor: undefined,
        hasMore: false,
      };
    }

    if (section === 'finished') {
      // Continue paginating finished jobs
      jobs = query<Job>(
        `SELECT * FROM jobs
         WHERE status IN ('completed', 'failed', 'cancelled')
           AND (updated_at, id) < (?, ?)
           ${clearedFilter}
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`,
        [cursor.updated_at, cursor.id, limit + 1],
      );

      if (jobs.length > limit) {
        hasMore = true;
        const result = jobs.slice(0, limit);
        const lastJob = result[result.length - 1];
        nextCursor = Buffer.from(
          JSON.stringify({
            section: 'finished',
            updated_at: lastJob.updated_at,
            id: lastJob.id,
          }),
        ).toString('base64url');
        return {
          jobs: result.map(normalizeJobTimestamps),
          nextCursor,
          hasMore,
        };
      }

      return {
        jobs: jobs.map(normalizeJobTimestamps),
        nextCursor: undefined,
        hasMore: false,
      };
    }

    // Shouldn't reach here, but return empty result as fallback
    return {
      jobs: [],
      nextCursor: undefined,
      hasMore: false,
    };
  },

  getByStatus(status: Job['status']): Job[] {
    const jobs = query<Job>(
      'SELECT * FROM jobs WHERE status = ? ORDER BY queue_position ASC, created_at ASC',
      [status],
    );
    return jobs.map(normalizeJobTimestamps);
  },

  getQueue(): Job[] {
    const jobs = query<Job>(
      `SELECT * FROM jobs
       WHERE status IN ('pending', 'processing')
       ORDER BY queue_position ASC, created_at ASC`,
    );
    return jobs.map(normalizeJobTimestamps);
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
      'SELECT COUNT(*) as count FROM jobs WHERE status = ? AND retried = 0 AND cleared = 0',
      ['failed'],
    );
    return result?.count || 0;
  },

  getClearableJobsCount(): number {
    const result = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM jobs WHERE status IN (?, ?, ?) AND cleared = 0',
      ['completed', 'failed', 'cancelled'],
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
    if (input.cleared !== undefined) {
      updates.push('cleared = ?');
      params.push(input.cleared);
    }
    if (input.config_json !== undefined) {
      updates.push('config_json = ?');
      params.push(input.config_json);
    }
    if (input.assigned_worker !== undefined) {
      updates.push('assigned_worker = ?');
      params.push(input.assigned_worker);
    }
    if (input.worker_last_seen !== undefined) {
      updates.push('worker_last_seen = ?');
      params.push(input.worker_last_seen);
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
    return result ? normalizeJobTimestamps(result) : undefined;
  },

  /**
   * Get the maximum queue_position value across all jobs
   * Returns null if no jobs exist
   */
  getMaxQueuePosition(): number | null {
    const result = queryOne<{ max_position: number | null }>(
      'SELECT MAX(queue_position) as max_position FROM jobs',
    );
    return result?.max_position ?? null;
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

  /**
   * Clear all successful jobs (mark as cleared = 1)
   */
  clearSuccessfulJobs(): number {
    const result = execute(
      `UPDATE jobs
       SET cleared = 1, updated_at = CURRENT_TIMESTAMP
       WHERE status = 'completed' AND cleared = 0`,
    );
    return result.changes;
  },

  /**
   * Clear all jobs that are not pending or processing
   * (i.e., completed, failed, cancelled jobs)
   */
  clearAllFinishedJobs(): number {
    const result = execute(
      `UPDATE jobs
       SET cleared = 1, updated_at = CURRENT_TIMESTAMP
       WHERE status NOT IN ('pending', 'processing') AND cleared = 0`,
    );
    return result.changes;
  },

  /**
   * Claim the next pending job for a worker (atomic operation)
   * Returns the job if successfully claimed, undefined otherwise
   */
  claimNextJob(workerId: string): Job | undefined {
    let claimedJob: Job | undefined;

    transaction(() => {
      // Find next pending job
      const nextJob = queryOne<Job>(
        `SELECT * FROM jobs
         WHERE status = 'pending' AND assigned_worker IS NULL
         ORDER BY queue_position ASC, created_at ASC
         LIMIT 1`,
      );

      if (!nextJob) {
        return;
      }

      // Atomically claim it
      const result = execute(
        `UPDATE jobs
         SET assigned_worker = ?,
             worker_last_seen = CURRENT_TIMESTAMP,
             status = 'processing',
             start_time = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending' AND assigned_worker IS NULL`,
        [workerId, nextJob.id],
      );

      // Only return the job if we successfully claimed it
      if (result.changes > 0) {
        claimedJob = this.getById(nextJob.id);
      }
    });

    return claimedJob;
  },

  /**
   * Update the worker heartbeat timestamp for a job
   */
  updateWorkerHeartbeat(jobId: number, workerId: string): void {
    execute(
      `UPDATE jobs
       SET worker_last_seen = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND assigned_worker = ?`,
      [jobId, workerId],
    );
  },

  /**
   * Get all jobs assigned to a specific worker
   */
  getJobsByWorker(workerId: string): Job[] {
    const jobs = query<Job>(
      'SELECT * FROM jobs WHERE assigned_worker = ? ORDER BY created_at DESC',
      [workerId],
    );
    return jobs.map(normalizeJobTimestamps);
  },

  /**
   * Release jobs that have stale worker heartbeats (worker hasn't checked in)
   * @param timeoutMinutes Number of minutes since last heartbeat before considering job stale
   * @returns Number of jobs released
   */
  releaseStaleJobs(timeoutMinutes: number = 5): number {
    const result = execute(
      `UPDATE jobs
       SET status = 'failed',
           error_message = 'Worker became unresponsive',
           assigned_worker = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'processing'
         AND assigned_worker IS NOT NULL
         AND worker_last_seen < datetime('now', '-' || ? || ' minutes')`,
      [timeoutMinutes],
    );
    return result.changes;
  },

  /**
   * Update job fields for a worker (progress, error, etc.)
   * Only allows updates if the job is assigned to the specified worker
   */
  updateJobAsWorker(
    jobId: number,
    workerId: string,
    input: UpdateJobInput,
  ): boolean {
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
    if (input.progress !== undefined) {
      updates.push('progress = ?');
      params.push(input.progress);
    }
    if (input.error_message !== undefined) {
      updates.push('error_message = ?');
      params.push(input.error_message);
    }
    if (input.end_time !== undefined) {
      updates.push('end_time = ?');
      params.push(input.end_time);
    }

    if (updates.length === 0) return false;

    updates.push('worker_last_seen = CURRENT_TIMESTAMP');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(jobId);
    params.push(workerId);

    const queryStr = `UPDATE jobs SET ${updates.join(', ')} WHERE id = ? AND assigned_worker = ?`;
    const result = execute(queryStr, params);

    return result.changes > 0;
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
   * Delete old file selections (older than 7 days or NULL created_at)
   */
  cleanup(): number {
    const result = execute(
      "DELETE FROM file_selections WHERE created_at IS NULL OR created_at < datetime('now', '-7 days')",
    );
    return Number(result.changes) || 0;
  },
};

/**
 * Job creation batch record from database
 */
export interface JobCreationBatch {
  id: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  total_files: number;
  created_count: number;
  picker_state_key: string | null;
  config_json: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * Job creation batch table operations
 */
export const JobCreationBatchService = {
  /**
   * Create a new job creation batch
   */
  create(input: {
    total_files: number;
    picker_state_key?: string;
    config_json?: string;
  }): number {
    const result = execute(
      'INSERT INTO job_creation_batches (total_files, picker_state_key, config_json) VALUES (?, ?, ?)',
      [
        input.total_files,
        input.picker_state_key || null,
        input.config_json || null,
      ],
    );
    return Number(result.lastInsertRowid);
  },

  /**
   * Get a batch by ID
   */
  getById(id: number): JobCreationBatch | undefined {
    return (
      queryOne<JobCreationBatch>(
        'SELECT * FROM job_creation_batches WHERE id = ?',
        [id],
      ) || undefined
    );
  },

  /**
   * Update batch status
   */
  updateStatus(
    id: number,
    status: JobCreationBatch['status'],
    errorMessage?: string,
  ): void {
    if (status === 'completed' || status === 'failed') {
      execute(
        'UPDATE job_creation_batches SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, errorMessage || null, id],
      );
    } else {
      execute(
        'UPDATE job_creation_batches SET status = ?, error_message = ? WHERE id = ?',
        [status, errorMessage || null, id],
      );
    }
  },

  /**
   * Increment the created count
   */
  incrementCreatedCount(id: number): void {
    execute(
      'UPDATE job_creation_batches SET created_count = created_count + 1 WHERE id = ?',
      [id],
    );
  },

  /**
   * Get all in-progress batches (for recovery on server restart)
   */
  getInProgressBatches(): JobCreationBatch[] {
    return query<JobCreationBatch>(
      "SELECT * FROM job_creation_batches WHERE status = 'in_progress' ORDER BY created_at ASC",
    );
  },

  /**
   * Get recent batches for a picker state key
   */
  getRecentByPickerKey(pickerStateKey: string): JobCreationBatch | undefined {
    return (
      queryOne<JobCreationBatch>(
        "SELECT * FROM job_creation_batches WHERE picker_state_key = ? AND status IN ('pending', 'in_progress') ORDER BY created_at DESC LIMIT 1",
        [pickerStateKey],
      ) || undefined
    );
  },
};
