/**
 * TanStack Query hooks for API operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFiles,
  fetchJobs,
  createJobs,
  retryJob,
  saveFileSelections,
  loadFileSelections,
} from './api';
import { ConversionOptions } from '@/types/conversion';

/**
 * Query keys for caching
 */
export const queryKeys = {
  jobs: ['jobs'] as const,
  files: (path: string) => ['files', path] as const,
  fileSelections: (key: string) => ['file-selections', key] as const,
};

/**
 * Hook to fetch files in a directory
 */
export function useFiles(path: string) {
  return useQuery({
    queryKey: queryKeys.files(path),
    queryFn: () => fetchFiles(path),
  });
}

/**
 * Hook to fetch all jobs
 */
export function useJobs() {
  return useQuery({
    queryKey: queryKeys.jobs,
    queryFn: fetchJobs,
  });
}

/**
 * Hook to create new jobs
 */
export function useCreateJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options: ConversionOptions) => createJobs(options),
    onSuccess: () => {
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

/**
 * Hook to retry a failed job
 */
export function useRetryJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) => retryJob(jobId),
    onSuccess: () => {
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

/**
 * Hook to save file selections
 */
export function useSaveFileSelections() {
  return useMutation({
    mutationFn: (files: string[]) => saveFileSelections(files),
  });
}

/**
 * Hook to load file selections
 */
export function useFileSelections(key: string | undefined) {
  return useQuery({
    queryKey: queryKeys.fileSelections(key || ''),
    queryFn: () => loadFileSelections(key!),
    enabled: !!key, // Only fetch if key is provided
  });
}
