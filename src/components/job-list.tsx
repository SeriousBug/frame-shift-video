import React, { useEffect, useRef, useCallback } from 'react';
import { Job } from '@/types/database';
import { JobCard } from './job-card';
import { useJobs, useRetryJob } from '@/lib/api-hooks';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api-hooks';

export function JobList() {
  const { data, isLoading: loading, error: queryError } = useJobs();
  const retryJobMutation = useRetryJob();
  const queryClient = useQueryClient();

  const jobs = data?.jobs || [];
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
      setError(null);
      // Reset reconnect attempts on successful connection
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Received message:', message);

        if (message.type === 'job:updated' || message.type === 'job:created') {
          // Update the specific job in the query cache
          const job = message.data;
          queryClient.setQueryData(
            queryKeys.jobs,
            (oldData: { jobs: Job[] } | undefined) => {
              if (!oldData) return { jobs: [job] };

              const jobIndex = oldData.jobs.findIndex((j) => j.id === job.id);
              if (jobIndex >= 0) {
                // Update existing job
                const newJobs = [...oldData.jobs];
                newJobs[jobIndex] = job;
                return { jobs: newJobs };
              } else {
                // New job, add it to the list
                return { jobs: [job, ...oldData.jobs] };
              }
            },
          );
        } else if (message.type === 'job:progress') {
          // Update job progress in the query cache
          const { jobId, progress, frame, fps } = message.data;
          queryClient.setQueryData(
            queryKeys.jobs,
            (oldData: { jobs: Job[] } | undefined) => {
              if (!oldData) return oldData;

              const jobIndex = oldData.jobs.findIndex((j) => j.id === jobId);
              if (jobIndex >= 0) {
                const newJobs = [...oldData.jobs];
                newJobs[jobIndex] = {
                  ...newJobs[jobIndex],
                  progress,
                  // Store current frame and fps temporarily for UI display
                  currentFrame: frame,
                  currentFps: fps,
                };
                return { jobs: newJobs };
              }
              return oldData;
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
      // No need to fetch jobs - mutation will invalidate the cache and WebSocket will update the UI
    } catch (err) {
      console.error('Error retrying job:', err);
      alert(err instanceof Error ? err.message : 'Failed to retry job');
    }
  };

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
    <div>
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
            {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} total
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} onRetry={handleRetry} />
        ))}
      </div>
    </div>
  );
}
