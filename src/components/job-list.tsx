import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { Job } from '@/types/database';
import { JobCard } from './job-card';
import { useJobsInfinite, useRetryJob } from '@/lib/api-hooks';
import { useQueryClient } from '@tanstack/react-query';
import { Virtuoso } from 'react-virtuoso';

export function JobList() {
  const {
    data,
    isLoading: loading,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useJobsInfinite(20);
  const retryJobMutation = useRetryJob();
  const queryClient = useQueryClient();

  // Flatten all pages into a single array of jobs
  const jobs = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.jobs);
  }, [data]);

  const error = queryError ? 'Failed to fetch jobs' : null;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [wsConnected, setWsConnected] = React.useState(false);

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
          queryClient.setQueryData(['jobs', 'infinite', 20], (oldData: any) => {
            if (!oldData?.pages) return oldData;

            // Create a new pages array with the updated job
            const newPages = oldData.pages.map((page: any) => {
              const jobIndex = page.jobs.findIndex((j: Job) => j.id === job.id);
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
          });
        } else if (message.type === 'job:progress') {
          // Update job progress in the infinite query cache
          const { jobId, progress, frame, fps } = message.data;
          queryClient.setQueryData(['jobs', 'infinite', 20], (oldData: any) => {
            if (!oldData?.pages) return oldData;

            const newPages = oldData.pages.map((page: any) => {
              const jobIndex = page.jobs.findIndex((j: Job) => j.id === jobId);
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
          });
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
  }, [queryClient]);

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
      await retryJobMutation.mutateAsync(jobId);
      // Mutation will invalidate the cache and trigger refetch
    } catch (err) {
      console.error('Error retrying job:', err);
      alert(err instanceof Error ? err.message : 'Failed to retry job');
    }
  };

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (loading) {
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

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📭</div>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          No jobs yet. Start a conversion to see jobs here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          Video Jobs
        </h2>
        <div className="flex items-center gap-4">
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
            {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} loaded
          </div>
        </div>
      </div>

      <div style={{ height: 'calc(100vh - 200px)' }}>
        <Virtuoso
          data={jobs}
          endReached={loadMore}
          itemContent={(index, job) => (
            <div className="mb-6">
              <JobCard key={job.id} job={job} onRetry={handleRetry} />
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
                    No more jobs to load
                  </div>
                );
              }
              return null;
            },
          }}
        />
      </div>
    </div>
  );
}
