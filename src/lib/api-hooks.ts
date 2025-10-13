/**
 * TanStack Query hooks for API operations
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import {
  fetchFiles,
  fetchJobs,
  fetchJobsPaginated,
  createJobs,
  markJobAsRetried,
  cancelJob,
  cancelAllJobs,
  markAllFailedAsRetried,
  saveFileSelections,
  loadFileSelections,
  getPickerState,
  performPickerAction,
  type PickerAction,
} from './api';
import { ConversionOptions } from '@/types/conversion';

/**
 * Query keys for caching
 */
export const queryKeys = {
  jobs: ['jobs'] as const,
  files: (path: string) => ['files', path] as const,
  fileSelections: (key: string) => ['file-selections', key] as const,
  pickerState: (key: string) => ['picker-state', key] as const,
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
 * Hook to fetch all jobs (legacy)
 */
export function useJobs() {
  return useQuery({
    queryKey: queryKeys.jobs,
    queryFn: fetchJobs,
  });
}

/**
 * Hook to fetch jobs with infinite scroll pagination
 */
export function useJobsInfinite(limit: number = 20) {
  return useInfiniteQuery({
    queryKey: ['jobs', 'infinite', limit],
    queryFn: ({ pageParam }) => fetchJobsPaginated(pageParam, limit),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
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
 * Hook to mark a job as retried and get its input file
 */
export function useMarkJobAsRetried() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) => markJobAsRetried(jobId),
    onSuccess: () => {
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

/**
 * Hook to cancel a job
 */
export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) => cancelJob(jobId),
    onSuccess: () => {
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

/**
 * Hook to cancel all jobs
 */
export function useCancelAllJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cancelAllJobs(),
    onSuccess: () => {
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

/**
 * Hook to mark all failed jobs as retried and get their input files
 */
export function useMarkAllFailedAsRetried() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markAllFailedAsRetried(),
    onSuccess: () => {
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

/**
 * Hook to save file selections with optional config
 */
export function useSaveFileSelections() {
  return useMutation({
    mutationFn: ({
      files,
      config,
    }: {
      files: string[];
      config?: ConversionOptions;
    }) => saveFileSelections(files, config),
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

/**
 * Hook to get picker state
 * Automatically creates new empty state if no key is provided
 */
export function usePickerState(key: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pickerState(key || 'new'),
    queryFn: () => getPickerState(key),
    staleTime: 0, // Always fetch fresh state
    gcTime: 0, // Don't cache old states
  });
}

/**
 * Hook to perform picker actions
 * Returns a mutation that updates the picker state
 */
export function usePickerAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ action, key }: { action: PickerAction; key?: string }) =>
      performPickerAction(action, key),
    onSuccess: (newState, variables) => {
      // Set the new state in cache for the new key
      queryClient.setQueryData(queryKeys.pickerState(newState.key), newState);
      // Also update the query for the old key to prevent refetching
      if (variables.key) {
        queryClient.setQueryData(
          queryKeys.pickerState(variables.key),
          newState,
        );
      }
      // Update the 'new' key as well (for when there's no key)
      queryClient.setQueryData(queryKeys.pickerState('new'), newState);
    },
  });
}
