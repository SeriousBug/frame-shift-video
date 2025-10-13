/**
 * API client functions for the Frame Shift Video app
 */

import { FileSystemItem, FilePickerState } from '@/types/files';
import { Job } from '@/types/database';
import type { ConversionOptions } from '@/types/conversion';

// Base API URL
const API_BASE = '/api';

/**
 * Fetch files in a directory
 */
export async function fetchFiles(path: string): Promise<{
  items: FileSystemItem[];
}> {
  const response = await fetch(
    `${API_BASE}/files?path=${encodeURIComponent(path)}`,
  );

  if (!response.ok) {
    throw new Error('Failed to load directory');
  }

  return response.json();
}

/**
 * Fetch all jobs (legacy - used for WebSocket updates)
 */
export async function fetchJobs(): Promise<{ jobs: Job[] }> {
  const response = await fetch(`${API_BASE}/jobs`);

  if (!response.ok) {
    throw new Error('Failed to fetch jobs');
  }

  return response.json();
}

/**
 * Fetch jobs with cursor-based pagination
 */
export async function fetchJobsPaginated(
  cursor?: string,
  limit: number = 20,
): Promise<{
  jobs: Job[];
  nextCursor?: string;
  hasMore: boolean;
  statusCounts: Record<string, number>;
  failedNotRetriedCount: number;
}> {
  const params = new URLSearchParams();
  if (cursor) {
    params.append('cursor', cursor);
  }
  params.append('limit', limit.toString());

  const response = await fetch(`${API_BASE}/jobs?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch jobs');
  }

  return response.json();
}

/**
 * Fetch jobs by status (non-paginated)
 */
export async function fetchJobsByStatus(
  status: Job['status'],
): Promise<{ jobs: Job[] }> {
  const params = new URLSearchParams({ status });
  const response = await fetch(`${API_BASE}/jobs?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch jobs by status');
  }

  return response.json();
}

/**
 * Create new jobs
 */
export async function createJobs(
  options: ConversionOptions,
): Promise<{ jobs: Job[] }> {
  console.log('[API Client] Creating jobs with options:', options);

  const response = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options),
  });

  console.log('[API Client] Create jobs response status:', response.status);

  if (!response.ok) {
    const error = await response.json();
    console.error('[API Client] Create jobs error:', error);
    throw new Error(error.error || 'Failed to create jobs');
  }

  const result = await response.json();
  console.log('[API Client] Create jobs result:', result);
  return result;
}

/**
 * Mark a failed or cancelled job as retried (returns config key for navigation)
 */
export async function markJobAsRetried(
  jobId: number,
): Promise<{ configKey: string | null }> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'retry' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to mark job as retried');
  }

  return response.json();
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'cancel' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cancel job');
  }
}

/**
 * Cancel all pending and processing jobs
 */
export async function cancelAllJobs(): Promise<{ count: number }> {
  const response = await fetch(`${API_BASE}/jobs`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cancel all jobs');
  }

  return response.json();
}

/**
 * Mark all failed jobs as retried and return config key
 */
export async function markAllFailedAsRetried(): Promise<{
  count: number;
  configKey: string | null;
}> {
  const response = await fetch(`${API_BASE}/jobs`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'retry-all-failed' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to mark all failed jobs as retried');
  }

  return response.json();
}

/**
 * Save file selections with optional config
 */
export async function saveFileSelections(
  files: string[],
  config?: ConversionOptions,
): Promise<{
  key: string;
}> {
  const response = await fetch(`${API_BASE}/file-selections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files, config }),
  });

  if (!response.ok) {
    throw new Error('Failed to save file selections');
  }

  return response.json();
}

/**
 * Load file selections and config by key
 */
export async function loadFileSelections(key: string): Promise<{
  files: string[];
  config?: ConversionOptions;
}> {
  const response = await fetch(`${API_BASE}/file-selections/${key}`);

  if (!response.ok) {
    throw new Error('Failed to load file selections');
  }

  return response.json();
}

/**
 * Picker action types
 */
export type PickerAction =
  | { type: 'toggle-folder'; path: string }
  | { type: 'toggle-file'; path: string }
  | { type: 'toggle-folder-selection'; path: string }
  | { type: 'navigate'; path: string }
  | { type: 'update-config'; config: any };

/**
 * Get picker state by key (creates new empty state if no key provided)
 */
export async function getPickerState(key?: string): Promise<FilePickerState> {
  const url = key
    ? `${API_BASE}/picker-state?key=${encodeURIComponent(key)}`
    : `${API_BASE}/picker-state`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to get picker state');
  }

  return response.json();
}

/**
 * Perform an action on picker state and get new state
 */
export async function performPickerAction(
  action: PickerAction,
  key?: string,
): Promise<FilePickerState> {
  console.log('[API] performPickerAction called:', { action, key });

  const response = await fetch(`${API_BASE}/picker-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key, action }),
  });

  console.log('[API] performPickerAction response status:', response.status);

  if (!response.ok) {
    const error = await response.json();
    console.error('[API] performPickerAction error:', error);
    throw new Error(error.error || 'Failed to perform picker action');
  }

  const result = await response.json();
  console.log('[API] performPickerAction result:', result);
  return result;
}

/**
 * Fetch server version
 */
export async function fetchServerVersion(): Promise<{
  version: string | null;
}> {
  const response = await fetch(`${API_BASE}/version`);

  if (!response.ok) {
    throw new Error('Failed to fetch server version');
  }

  return response.json();
}
