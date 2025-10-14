import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { Job } from '@/types/database';
import { JobCard } from './job-card';
import { ConfirmationModal } from './confirmation-modal';
import {
  useJobsInfinite,
  useJobsByStatus,
  useMarkJobAsRetried,
  useCancelJob,
  useCancelAllJobs,
  useMarkAllFailedAsRetried,
  useClearFinishedJobs,
  useSaveFileSelections,
} from '@/lib/api-hooks';
import { useQueryClient } from '@tanstack/react-query';
import { Virtuoso } from 'react-virtuoso';
import { useNavigate } from '@tanstack/react-router';

export function JobList() {
  const [showCleared, setShowCleared] = React.useState(false);
  const {
    data,
    isLoading: loading,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useJobsInfinite(20, showCleared);
  const { data: processingJobsData, isLoading: loadingProcessingJobs } =
    useJobsByStatus('processing');
  const navigate = useNavigate();
  const markJobAsRetriedMutation = useMarkJobAsRetried();
  const cancelJobMutation = useCancelJob();
  const cancelAllJobsMutation = useCancelAllJobs();
  const markAllFailedAsRetriedMutation = useMarkAllFailedAsRetried();
  const clearFinishedJobsMutation = useClearFinishedJobs();
  const saveFileSelectionsMutation = useSaveFileSelections();
  const queryClient = useQueryClient();

  // Get processing jobs
  const processingJobs = useMemo(() => {
    return processingJobsData?.jobs || [];
  }, [processingJobsData]);

  // Get processing job IDs for filtering
  const processingJobIds = useMemo(() => {
    return new Set(processingJobs.map((job) => job.id));
  }, [processingJobs]);

  // Flatten all pages into a single array of jobs, excluding processing jobs
  const otherJobs = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages
      .flatMap((page) => page.jobs)
      .filter((job) => !processingJobIds.has(job.id));
  }, [data, processingJobIds]);

  // Combine processing jobs at the top with other jobs
  const jobs = useMemo(() => {
    return [...processingJobs, ...otherJobs];
  }, [processingJobs, otherJobs]);

  // Extract status counts from the first page (they're the same for all pages)
  const statusCounts = useMemo(() => {
    return (
      data?.pages?.[0]?.statusCounts || {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      }
    );
  }, [data]);

  const failedNotRetriedCount = useMemo(() => {
    return data?.pages?.[0]?.failedNotRetriedCount || 0;
  }, [data]);

  const error = queryError ? 'Failed to fetch jobs' : null;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [wsConnected, setWsConnected] = React.useState(false);
  const [showCancelAllModal, setShowCancelAllModal] = React.useState(false);
  const [showRetryAllFailedModal, setShowRetryAllFailedModal] =
    React.useState(false);
  const [showClearFinishedModal, setShowClearFinishedModal] =
    React.useState(false);

  const connectWebSocket = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    console.log('[WebSocket] Connecting to', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Connected');
      setWsConnected(true);
      // Reset reconnect attempts on successful connection
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Received message:', message);

        if (message.type === 'job:updated' || message.type === 'job:created') {
          // Update the job in the infinite query cache
          const job = message.data;
          queryClient.setQueryData(
            ['jobs', 'infinite', 20, showCleared],
            (oldData: any) => {
              if (!oldData?.pages) return oldData;

              // Create a new pages array with the updated job
              const newPages = oldData.pages.map((page: any) => {
                const jobIndex = page.jobs.findIndex(
                  (j: Job) => j.id === job.id,
                );
                if (jobIndex >= 0) {
                  // Update existing job in this page
                  const newJobs = [...page.jobs];
                  newJobs[jobIndex] = job;
                  return { ...page, jobs: newJobs };
                }
                return page;
              });

              // If job not found in any page, add it to the first page
              const jobExists = newPages.some((page: any) =>
                page.jobs.some((j: Job) => j.id === job.id),
              );

              if (!jobExists && newPages.length > 0) {
                newPages[0] = {
                  ...newPages[0],
                  jobs: [job, ...newPages[0].jobs],
                };
              }

              return { ...oldData, pages: newPages };
            },
          );

          // Update the processing jobs cache
          queryClient.setQueryData(
            ['jobs', 'status', 'processing'],
            (oldData: any) => {
              if (!oldData?.jobs) return oldData;

              const jobIndex = oldData.jobs.findIndex(
                (j: Job) => j.id === job.id,
              );

              // If the job is processing, update it or add it
              if (job.status === 'processing') {
                if (jobIndex >= 0) {
                  // Update existing processing job
                  const newJobs = [...oldData.jobs];
                  newJobs[jobIndex] = job;
                  return { ...oldData, jobs: newJobs };
                } else {
                  // Add new processing job
                  return { ...oldData, jobs: [job, ...oldData.jobs] };
                }
              } else {
                // Job is no longer processing, remove it
                if (jobIndex >= 0) {
                  const newJobs = oldData.jobs.filter(
                    (j: Job) => j.id !== job.id,
                  );
                  return { ...oldData, jobs: newJobs };
                }
              }

              return oldData;
            },
          );
        } else if (message.type === 'job:progress') {
          // Update job progress in the infinite query cache
          const { jobId, progress, frame, fps } = message.data;
          queryClient.setQueryData(
            ['jobs', 'infinite', 20, showCleared],
            (oldData: any) => {
              if (!oldData?.pages) return oldData;

              const newPages = oldData.pages.map((page: any) => {
                const jobIndex = page.jobs.findIndex(
                  (j: Job) => j.id === jobId,
                );
                if (jobIndex >= 0) {
                  const newJobs = [...page.jobs];
                  newJobs[jobIndex] = {
                    ...newJobs[jobIndex],
                    progress,
                    // Store current frame and fps temporarily for UI display
                    currentFrame: frame,
                    currentFps: fps,
                  };
                  return { ...page, jobs: newJobs };
                }
                return page;
              });

              return { ...oldData, pages: newPages };
            },
          );

          // Update job progress in the processing jobs cache
          queryClient.setQueryData(
            ['jobs', 'status', 'processing'],
            (oldData: any) => {
              if (!oldData?.jobs) return oldData;

              const jobIndex = oldData.jobs.findIndex(
                (j: Job) => j.id === jobId,
              );
              if (jobIndex >= 0) {
                const newJobs = [...oldData.jobs];
                newJobs[jobIndex] = {
                  ...newJobs[jobIndex],
                  progress,
                  // Store current frame and fps temporarily for UI display
                  currentFrame: frame,
                  currentFps: fps,
                };
                return { ...oldData, jobs: newJobs };
              }

              return oldData;
            },
          );
        } else if (message.type === 'status-counts') {
          // Update status counts in all pages of the infinite query cache
          const statusCounts = message.data;
          queryClient.setQueryData(
            ['jobs', 'infinite', 20, showCleared],
            (oldData: any) => {
              if (!oldData?.pages) return oldData;

              // Update statusCounts in all pages
              const newPages = oldData.pages.map((page: any) => ({
                ...page,
                statusCounts,
              }));

              return { ...oldData, pages: newPages };
            },
          );
        }
      } catch (err) {
        console.error('[WebSocket] Error parsing message:', err);
      }
    };

    ws.onerror = (event) => {
      console.error('[WebSocket] Error:', event);
      setWsConnected(false);
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
      setWsConnected(false);
      wsRef.current = null;

      // Calculate exponential backoff delay: 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s...
      // Max out at 60 seconds (1 minute)
      reconnectAttemptsRef.current += 1;
      const baseDelay = 1000; // 1 second
      const maxDelay = 60000; // 1 minute
      const delay = Math.min(
        baseDelay * Math.pow(2, reconnectAttemptsRef.current - 1),
        maxDelay,
      );

      console.log(
        `[WebSocket] Will attempt to reconnect in ${delay / 1000}s (attempt ${reconnectAttemptsRef.current})`,
      );

      // Attempt to reconnect with exponential backoff
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[WebSocket] Attempting to reconnect...');
        connectWebSocket();
      }, delay);
    };

    wsRef.current = ws;
  }, [queryClient, showCleared]);

  useEffect(() => {
    // Connect WebSocket
    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const handleRetry = async (jobId: number) => {
    try {
      // Mark job as retried and get config key
      const { configKey } = await markJobAsRetriedMutation.mutateAsync(jobId);

      // Navigate to configure page with the config key
      if (configKey) {
        navigate({ to: '/convert/configure', search: { key: configKey } });
      } else {
        alert('Failed to load job configuration');
      }
    } catch (err) {
      console.error('Error retrying job:', err);
      alert(err instanceof Error ? err.message : 'Failed to retry job');
    }
  };

  const handleCancel = async (jobId: number) => {
    try {
      await cancelJobMutation.mutateAsync(jobId);
      // Mutation will invalidate the cache and trigger refetch
    } catch (err) {
      console.error('Error cancelling job:', err);
      alert(err instanceof Error ? err.message : 'Failed to cancel job');
    }
  };

  const handleCancelAll = async () => {
    try {
      await cancelAllJobsMutation.mutateAsync();
      // Mutation will invalidate the cache and trigger refetch
    } catch (err) {
      console.error('Error cancelling all jobs:', err);
      alert(err instanceof Error ? err.message : 'Failed to cancel all jobs');
    }
  };

  // Calculate total cancellable jobs from status counts
  const cancellableJobsCount = statusCounts.pending + statusCounts.processing;

  // Calculate total clearable jobs (completed, failed, cancelled)
  const clearableJobsCount =
    statusCounts.completed + statusCounts.failed + statusCounts.cancelled;

  const handleRetryAllFailed = async () => {
    try {
      // Mark all failed jobs as retried and get config key
      const { configKey, count } =
        await markAllFailedAsRetriedMutation.mutateAsync();

      if (count === 0) {
        return;
      }

      // Navigate to configure page with the config key
      if (configKey) {
        navigate({ to: '/convert/configure', search: { key: configKey } });
      } else {
        alert('Failed to load job configuration');
      }
    } catch (err) {
      console.error('Error retrying all failed jobs:', err);
      alert(
        err instanceof Error ? err.message : 'Failed to retry all failed jobs',
      );
    }
  };

  const handleClearFinished = async () => {
    try {
      await clearFinishedJobsMutation.mutateAsync();
      // Mutation will invalidate the cache and trigger refetch
    } catch (err) {
      console.error('Error clearing finished jobs:', err);
      alert(
        err instanceof Error ? err.message : 'Failed to clear finished jobs',
      );
    }
  };

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (loading || loadingProcessingJobs) {
    return (
      <div className="text-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading jobs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 dark:text-red-400 text-lg">
          Error loading jobs: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ConfirmationModal
        isOpen={showCancelAllModal}
        onClose={() => setShowCancelAllModal(false)}
        onConfirm={handleCancelAll}
        title="Cancel All Jobs"
        message={`Are you sure you want to cancel ${cancellableJobsCount} ${cancellableJobsCount === 1 ? 'job' : 'jobs'}? This action cannot be undone.`}
        confirmText="Cancel All Jobs"
        cancelText="Keep Jobs"
      />
      <ConfirmationModal
        isOpen={showRetryAllFailedModal}
        onClose={() => setShowRetryAllFailedModal(false)}
        onConfirm={handleRetryAllFailed}
        title="Retry All Failed Jobs"
        message={`Are you sure you want to retry ${failedNotRetriedCount} failed ${failedNotRetriedCount === 1 ? 'job' : 'jobs'}?`}
        confirmText="Retry All"
        cancelText="Cancel"
        confirmClassName="bg-blue-600 hover:bg-blue-700"
      />
      <ConfirmationModal
        isOpen={showClearFinishedModal}
        onClose={() => setShowClearFinishedModal(false)}
        onConfirm={handleClearFinished}
        title="Clear Finished Jobs"
        message={`Are you sure you want to clear ${clearableJobsCount} finished ${clearableJobsCount === 1 ? 'job' : 'jobs'}? They will be hidden from the job list.`}
        confirmText="Clear Finished Jobs"
        cancelText="Cancel"
        confirmClassName="bg-orange-600 hover:bg-orange-700"
      />
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          Video Jobs
        </h2>
        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-2 text-sm"
            title={
              wsConnected
                ? 'Connected - live updates enabled'
                : 'Disconnected - attempting to reconnect'
            }
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
            ></span>
            <span className="text-gray-600 dark:text-gray-400">
              {wsConnected ? 'Live' : 'Connecting...'}
            </span>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {statusCounts.processing > 0 && (
              <span>
                processing {statusCounts.processing}{' '}
                {statusCounts.processing === 1 ? 'job' : 'jobs'}
                {statusCounts.pending > 0 && ', '}
              </span>
            )}
            {statusCounts.pending > 0 && (
              <span>
                {statusCounts.pending}{' '}
                {statusCounts.pending === 1 ? 'job' : 'jobs'} pending
              </span>
            )}
            {statusCounts.processing === 0 && statusCounts.pending === 0 && (
              <span>no active jobs</span>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showCleared}
              onChange={(e) => setShowCleared(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-700 dark:text-gray-300">
              Show cleared jobs
            </span>
          </label>
          <button
            onClick={() => setShowClearFinishedModal(true)}
            disabled={
              clearFinishedJobsMutation.isPending || clearableJobsCount === 0
            }
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              clearFinishedJobsMutation.isPending || clearableJobsCount === 0
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            }`}
            title={
              clearableJobsCount === 0
                ? 'No finished jobs to clear'
                : 'Clear all completed, failed, and cancelled jobs'
            }
          >
            {clearFinishedJobsMutation.isPending
              ? 'Clearing...'
              : 'Clear Queue'}
          </button>
          <button
            onClick={() => setShowRetryAllFailedModal(true)}
            disabled={
              markAllFailedAsRetriedMutation.isPending ||
              failedNotRetriedCount === 0
            }
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              markAllFailedAsRetriedMutation.isPending ||
              failedNotRetriedCount === 0
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title={
              failedNotRetriedCount === 0
                ? 'No failed jobs to retry'
                : 'Retry all failed jobs that have not been retried'
            }
          >
            {markAllFailedAsRetriedMutation.isPending
              ? 'Retrying...'
              : 'Retry All Failed'}
          </button>
          <button
            onClick={() => setShowCancelAllModal(true)}
            disabled={
              cancelAllJobsMutation.isPending || cancellableJobsCount === 0
            }
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              cancelAllJobsMutation.isPending || cancellableJobsCount === 0
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
            title={
              cancellableJobsCount === 0
                ? 'No jobs to cancel'
                : 'Cancel all pending and processing jobs'
            }
          >
            {cancelAllJobsMutation.isPending ? 'Cancelling...' : 'Cancel All'}
          </button>
        </div>
      </div>

      <div
        className="bg-slate-100 dark:bg-slate-900 rounded-xl py-6 border-2 border-slate-300 dark:border-slate-700"
        style={{ height: 'calc(100vh - 200px)' }}
      >
        {jobs.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              {showCleared
                ? 'No jobs found.'
                : 'No jobs yet. Start a conversion to see jobs here.'}
            </p>
            {!showCleared && (
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
                (Toggle "Show cleared jobs" to see cleared jobs)
              </p>
            )}
          </div>
        ) : (
          <Virtuoso
            data={jobs}
            endReached={loadMore}
            itemContent={(index, job) => (
              <div className="mb-6 mx-6">
                <JobCard
                  key={job.id}
                  job={job}
                  onRetry={handleRetry}
                  onCancel={handleCancel}
                />
              </div>
            )}
            components={{
              Footer: () => {
                if (isFetchingNextPage) {
                  return (
                    <div className="text-center py-8">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        Loading more jobs...
                      </p>
                    </div>
                  );
                }
                if (!hasNextPage && jobs.length > 0) {
                  return (
                    <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                      That's all!
                    </div>
                  );
                }
                return null;
              },
            }}
          />
        )}
      </div>
    </div>
  );
}
