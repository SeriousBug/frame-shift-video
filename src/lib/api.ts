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
export async function fetchFiles(
  path: string,
  searchQuery?: string,
): Promise<{
  items: FileSystemItem[];
  searchQuery?: string;
}> {
  const params = new URLSearchParams({ path });
  if (searchQuery) {
    params.append('search', searchQuery);
  }

  const response = await fetch(`${API_BASE}/files?${params.toString()}`);

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
  limit: number = 100,
  includeCleared: boolean = false,
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
  if (includeCleared) {
    params.append('includeCleared', 'true');
  }

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
 * Clear all finished jobs (completed, failed, cancelled)
 */
export async function clearFinishedJobs(): Promise<{ count: number }> {
  const response = await fetch(`${API_BASE}/jobs`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'clear-finished' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to clear finished jobs');
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
  | { type: 'update-config'; config: any }
  | { type: 'search'; query: string }
  | { type: 'update-show-hidden'; showHidden: boolean };

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

/**
 * Response for notification status endpoint
 */
export interface NotificationStatusResponse {
  enabled: boolean;
  methods: string[];
}

/**
 * Get notification configuration status
 */
export async function fetchNotificationStatus(): Promise<NotificationStatusResponse> {
  const response = await fetch(`${API_BASE}/notifications/status`);

  if (!response.ok) {
    throw new Error('Failed to fetch notification status');
  }

  return response.json();
}

/**
 * Send a test notification
 */
export async function sendTestNotification(): Promise<{
  success: boolean;
  message: string;
  completedCount: number;
  failedCount: number;
}> {
  const response = await fetch(`${API_BASE}/notifications/test`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send test notification');
  }

  return response.json();
}

/**
 * Follower status with job info
 */
export interface FollowerStatus {
  id: string;
  url: string;
  busy: boolean;
  dead: boolean;
  currentJob: {
    id: number;
    name: string;
    progress: number;
  } | null;
}

/**
 * Response for followers status endpoint
 */
export interface FollowersStatusResponse {
  enabled: boolean;
  followers: FollowerStatus[];
  hasDeadFollowers: boolean;
}

/**
 * Fetch followers status (leader mode only)
 */
export async function fetchFollowersStatus(): Promise<FollowersStatusResponse> {
  const response = await fetch(`${API_BASE}/settings/followers`);

  if (!response.ok) {
    throw new Error('Failed to fetch followers status');
  }

  return response.json();
}

/**
 * Trigger retry sync for dead followers
 */
export async function retryFollowers(): Promise<{
  success: boolean;
  message: string;
  hasDeadFollowers: boolean;
}> {
  const response = await fetch(`${API_BASE}/settings/followers/retry`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to retry followers');
  }

  return response.json();
}

/**
 * System status for a single node
 */
export interface NodeSystemStatus {
  /** Node identifier (e.g., "standalone", "leader", "follower-0") */
  nodeId: string;
  /** CPU usage percentage (0-100) */
  cpuUsagePercent: number;
  /** Number of CPU cores */
  cpuCores: number;
  /** Memory used in bytes */
  memoryUsedBytes: number;
  /** Total memory in bytes */
  memoryTotalBytes: number;
  /** Memory usage percentage (0-100) */
  memoryUsagePercent: number;
  /** Timestamp when this status was collected */
  timestamp: number;
}

/**
 * System status response
 */
export interface SystemStatusResponse {
  /** Instance type: standalone, leader, or follower */
  instanceType: 'standalone' | 'leader' | 'follower';
  /** Status of all nodes */
  nodes: NodeSystemStatus[];
}

/**
 * Fetch system status for all nodes
 */
export async function fetchSystemStatus(): Promise<SystemStatusResponse> {
  const response = await fetch(`${API_BASE}/settings/system-status`);

  if (!response.ok) {
    throw new Error('Failed to fetch system status');
  }

  return response.json();
}
