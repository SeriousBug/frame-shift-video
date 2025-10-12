/**
 * API client functions for the Frame Shift Video app
 */

import { FileSystemItem } from '@/types/files';
import { Job } from '@/types/database';
import { ConversionOptions } from '@/types/conversion';

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
 * Fetch all jobs
 */
export async function fetchJobs(): Promise<{ jobs: Job[] }> {
  const response = await fetch(`${API_BASE}/jobs`);

  if (!response.ok) {
    throw new Error('Failed to fetch jobs');
  }

  return response.json();
}

/**
 * Create new jobs
 */
export async function createJobs(
  options: ConversionOptions,
): Promise<{ jobs: Job[] }> {
  const response = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create jobs');
  }

  return response.json();
}

/**
 * Retry a failed job
 */
export async function retryJob(jobId: number): Promise<Job> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'retry' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to retry job');
  }

  return response.json();
}

/**
 * Save file selections
 */
export async function saveFileSelections(files: string[]): Promise<{
  key: string;
}> {
  const response = await fetch(`${API_BASE}/file-selections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files }),
  });

  if (!response.ok) {
    throw new Error('Failed to save file selections');
  }

  return response.json();
}

/**
 * Load file selections by key
 */
export async function loadFileSelections(key: string): Promise<{
  files: string[];
}> {
  const response = await fetch(`${API_BASE}/file-selections/${key}`);

  if (!response.ok) {
    throw new Error('Failed to load file selections');
  }

  return response.json();
}
