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
  fetchJobsByStatus,
  createJobs,
  startJobs,
  getJobBatchStatus,
  markJobAsRetried,
  cancelJob,
  cancelAllJobs,
  markAllFailedAsRetried,
  clearFinishedJobs,
  saveFileSelections,
  loadFileSelections,
  getPickerState,
  performPickerAction,
  fetchFollowersStatus,
  retryFollowers,
  fetchNotificationStatus,
  fetchSystemStatus,
  fetchSettings,
  type PickerAction,
  type StartJobsResponse,
} from './api';
import { ConversionOptions } from '@/types/conversion';
import { Job } from '@/types/database';

/**
 * Query keys for caching
 */
export const queryKeys = {
  jobs: ['jobs'] as const,
  files: (path: string) => ['files', path] as const,
  fileSelections: (key: string) => ['file-selections', key] as const,
  pickerState: (key: string) => ['picker-state', key] as const,
  followersStatus: ['followers-status'] as const,
  notificationStatus: ['notification-status'] as const,
  systemStatus: ['system-status'] as const,
  settings: ['settings'] as const,
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
export function useJobsInfinite(
  limit: number = 100,
  includeCleared: boolean = false,
) {
  return useInfiniteQuery({
    queryKey: ['jobs', 'infinite', limit, includeCleared],
    queryFn: ({ pageParam }) =>
      fetchJobsPaginated(pageParam, limit, includeCleared),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
  });
}

/**
 * Hook to fetch jobs by status
 */
export function useJobsByStatus(status: Job['status']) {
  return useQuery({
    queryKey: ['jobs', 'status', status],
    queryFn: () => fetchJobsByStatus(status),
  });
}

/**
 * Hook to create new jobs (legacy sync)
 */
export function useCreateJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options: ConversionOptions) => {
      console.log('[API Hook] Creating jobs mutation started');
      return createJobs(options);
    },
    onSuccess: (data) => {
      console.log('[API Hook] Creating jobs mutation succeeded:', data);
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
    onError: (error) => {
      console.error('[API Hook] Creating jobs mutation failed:', error);
    },
  });
}

/**
 * Hook to start async job creation
 * Returns immediately - progress is tracked via WebSocket
 */
export function useStartJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options: ConversionOptions) => {
      console.log('[API Hook] Starting async job creation');
      return startJobs(options);
    },
    onSuccess: (data: StartJobsResponse) => {
      console.log('[API Hook] Async job creation started:', data);
      // Jobs will be created in background, query will be invalidated
      // when job-creation:complete event is received
    },
    onError: (error) => {
      console.error('[API Hook] Starting async job creation failed:', error);
    },
  });
}

/**
 * Hook to fetch job creation batch status
 */
export function useJobBatchStatus(batchId: number | null) {
  return useQuery({
    queryKey: ['job-batch', batchId],
    queryFn: () => getJobBatchStatus(batchId!),
    enabled: batchId !== null,
    refetchInterval: (query) => {
      // Poll while in progress
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'in_progress') {
        return 2000; // Poll every 2 seconds
      }
      return false; // Stop polling when complete
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
 * Hook to clear all finished jobs
 */
export function useClearFinishedJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clearFinishedJobs(),
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

/**
 * Hook to clear all picker state from cache
 */
export function useClearPickerState() {
  const queryClient = useQueryClient();

  return () => {
    // Remove all picker-state queries from cache
    queryClient.removeQueries({ queryKey: ['picker-state'] });
  };
}

/**
 * Hook to fetch followers status
 */
export function useFollowersStatus() {
  return useQuery({
    queryKey: queryKeys.followersStatus,
    queryFn: fetchFollowersStatus,
    // Fallback polling every 30 seconds (WebSocket provides real-time updates)
    refetchInterval: 30000,
  });
}

/**
 * Hook to retry syncing with dead followers
 */
export function useRetryFollowers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retryFollowers,
    onSuccess: () => {
      // Invalidate followers status to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.followersStatus });
    },
  });
}

/**
 * Hook to fetch notification status
 */
export function useNotificationStatus() {
  return useQuery({
    queryKey: queryKeys.notificationStatus,
    queryFn: fetchNotificationStatus,
  });
}

/**
 * Hook to fetch system status
 */
export function useSystemStatus() {
  return useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: fetchSystemStatus,
    // Fallback polling every 30 seconds (WebSocket provides real-time updates)
    refetchInterval: 30000,
  });
}

/**
 * Hook to fetch server settings including FFmpeg capabilities
 * This is cached indefinitely since capabilities don't change at runtime
 */
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: fetchSettings,
    staleTime: Infinity, // Never refetch - capabilities don't change at runtime
    gcTime: Infinity, // Keep in cache forever
  });
}
