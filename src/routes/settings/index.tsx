import { createFileRoute, Link } from '@tanstack/react-router';
import {
  useFollowersStatus,
  useRetryFollowers,
  useNotificationStatus,
  useSystemStatus,
  queryKeys,
} from '@/lib/api-hooks';
import { sendTestNotification } from '@/lib/api';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FollowerStatus, NodeSystemStatus } from '@/lib/api';
import { useSystemStatusStore } from '@/lib/system-status-store';

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
});

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format seconds ago for display
 */
function formatSecondsAgo(timestamp: number): string {
  if (timestamp === 0) return '';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 1) return 'just now';
  if (seconds === 1) return '1 second ago';
  return `${seconds} seconds ago`;
}

function SettingsPage() {
  const { data: followersStatus, isLoading, error } = useFollowersStatus();
  const {
    data: notificationStatus,
    isLoading: notificationLoading,
    error: notificationError,
  } = useNotificationStatus();
  const {
    data: systemStatus,
    isLoading: systemStatusLoading,
    error: systemStatusError,
  } = useSystemStatus();
  const retryFollowers = useRetryFollowers();
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [testNotificationStatus, setTestNotificationStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [testNotificationMessage, setTestNotificationMessage] = useState('');
  const {
    lastUpdate: lastSystemStatusUpdate,
    setLastUpdate: setLastSystemStatusUpdate,
  } = useSystemStatusStore();
  const [, setTick] = useState(0); // Force re-render for "seconds ago" display
  const queryClient = useQueryClient();

  // Update tick every second to refresh "seconds ago" display
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Set initial lastUpdate from the first node's timestamp when data loads
  useEffect(() => {
    if (systemStatus?.nodes?.[0]?.timestamp && lastSystemStatusUpdate === 0) {
      setLastSystemStatusUpdate(systemStatus.nodes[0].timestamp);
    }
  }, [systemStatus, lastSystemStatusUpdate, setLastSystemStatusUpdate]);

  const handleTestNotification = async () => {
    setTestNotificationStatus('loading');
    setTestNotificationMessage('');

    try {
      const result = await sendTestNotification();
      setTestNotificationStatus('success');
      setTestNotificationMessage(result.message);

      // Reset status after 3 seconds
      setTimeout(() => {
        setTestNotificationStatus('idle');
        setTestNotificationMessage('');
      }, 3000);
    } catch (error) {
      setTestNotificationStatus('error');
      setTestNotificationMessage(
        error instanceof Error
          ? error.message
          : 'Failed to send test notification',
      );

      // Reset status after 5 seconds
      setTimeout(() => {
        setTestNotificationStatus('idle');
        setTestNotificationMessage('');
      }, 5000);
    }
  };

  // WebSocket for real-time updates
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [wsConnected, setWsConnected] = useState(false);

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

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'followers:status') {
          // Update followers status in the query cache
          const followers: FollowerStatus[] = message.data.followers;
          const hasDeadFollowers = followers.some((f) => f.dead);

          queryClient.setQueryData(
            queryKeys.followersStatus,
            (oldData: any) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                followers,
                hasDeadFollowers,
              };
            },
          );
        } else if (message.type === 'system:status') {
          // Update system status in the query cache
          const { instanceType, nodes } = message.data;

          queryClient.setQueryData(queryKeys.systemStatus, {
            instanceType,
            nodes,
          });

          // Track when we received this update
          setLastSystemStatusUpdate(Date.now());
        }
      } catch (err) {
        console.error('[WebSocket] Error parsing message:', err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;

      // Exponential backoff for reconnection
      const delay = Math.min(
        1000 * Math.pow(2, reconnectAttemptsRef.current),
        30000,
      );
      reconnectAttemptsRef.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [queryClient, setLastSystemStatusUpdate]);

  // Connect WebSocket on mount
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const handleRetryFollowers = async () => {
    setRetryMessage(null);
    try {
      const result = await retryFollowers.mutateAsync();
      setRetryMessage(result.message);
      // Clear message after 5 seconds
      setTimeout(() => setRetryMessage(null), 5000);
    } catch (err) {
      setRetryMessage(
        err instanceof Error ? err.message : 'Failed to retry followers',
      );
      setTimeout(() => setRetryMessage(null), 5000);
    }
  };

  return (
    <div className="container mx-auto px-6 py-12">
      <header className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link
            to="/"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &larr; Back to Home
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
      </header>

      <main>
        {/* System Status Section */}
        <AppErrorBoundary>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-8">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    System Status
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    CPU and memory usage for all nodes
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {lastSystemStatusUpdate > 0 && (
                    <span className="text-gray-400 dark:text-gray-500">
                      Updated {formatSecondsAgo(lastSystemStatusUpdate)}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        wsConnected ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                    />
                    <span className="text-gray-500 dark:text-gray-400">
                      {wsConnected ? 'Live' : 'Connecting...'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              {systemStatusLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-3 text-gray-600 dark:text-gray-400">
                    Loading system status...
                  </span>
                </div>
              ) : systemStatusError ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
                  {systemStatusError instanceof Error
                    ? systemStatusError.message
                    : 'Failed to load system status'}
                </div>
              ) : systemStatus?.nodes.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No system status available
                </div>
              ) : (
                <div className="space-y-4">
                  {systemStatus?.nodes.map((node) => (
                    <div
                      key={node.nodeId}
                      className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {node.nodeId === 'standalone'
                            ? 'Server'
                            : node.nodeId === 'leader'
                              ? 'Leader'
                              : node.nodeId.replace('follower-', 'Follower ')}
                        </h3>
                        {node.timestamp > 0 && (
                          <span className="text-xs text-gray-400">
                            {node.cpuCores} cores
                          </span>
                        )}
                      </div>

                      {node.timestamp === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Waiting for status update...
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {/* CPU Usage */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                CPU
                              </span>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.cpuUsagePercent.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all duration-300 ${
                                  node.cpuUsagePercent > 80
                                    ? 'bg-red-500'
                                    : node.cpuUsagePercent > 60
                                      ? 'bg-yellow-500'
                                      : 'bg-green-500'
                                }`}
                                style={{
                                  width: `${Math.min(node.cpuUsagePercent, 100)}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* Memory Usage */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                Memory
                              </span>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {formatBytes(node.memoryUsedBytes)} /{' '}
                                {formatBytes(node.memoryTotalBytes)}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all duration-300 ${
                                  node.memoryUsagePercent > 80
                                    ? 'bg-red-500'
                                    : node.memoryUsagePercent > 60
                                      ? 'bg-yellow-500'
                                      : 'bg-green-500'
                                }`}
                                style={{
                                  width: `${Math.min(node.memoryUsagePercent, 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </AppErrorBoundary>

        {/* Follower Status Section */}
        <AppErrorBoundary>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Follower Status
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Status of connected follower instances in leader mode
                  </p>
                </div>
                {followersStatus?.enabled && (
                  <div className="flex items-center gap-2 text-sm">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        wsConnected ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                    />
                    <span className="text-gray-500 dark:text-gray-400">
                      {wsConnected ? 'Live' : 'Connecting...'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-3 text-gray-600 dark:text-gray-400">
                    Loading status...
                  </span>
                </div>
              ) : error ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
                  {error instanceof Error
                    ? error.message
                    : 'Failed to load follower status'}
                </div>
              ) : !followersStatus?.enabled ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p className="text-lg mb-2">Leader mode is not enabled</p>
                  <p className="text-sm">
                    Follower status is only available when running in leader
                    mode.
                  </p>
                </div>
              ) : followersStatus.followers.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No followers configured
                </div>
              ) : (
                <>
                  {/* Retry button */}
                  <div className="mb-6 flex items-center gap-4">
                    <button
                      onClick={handleRetryFollowers}
                      disabled={
                        !followersStatus.hasDeadFollowers ||
                        retryFollowers.isPending
                      }
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
                    >
                      {retryFollowers.isPending ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        'Retry Followers'
                      )}
                    </button>
                    {!followersStatus.hasDeadFollowers && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        All followers are healthy
                      </span>
                    )}
                    {retryMessage && (
                      <span
                        className={`text-sm ${
                          retryFollowers.isError
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}
                      >
                        {retryMessage}
                      </span>
                    )}
                  </div>

                  {/* Followers list */}
                  <div className="space-y-4">
                    {followersStatus.followers.map((follower) => (
                      <div
                        key={follower.id}
                        className={`p-4 rounded-lg border ${
                          follower.dead
                            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Status indicator */}
                            <div
                              className={`w-3 h-3 rounded-full ${
                                follower.dead
                                  ? 'bg-red-500'
                                  : follower.busy
                                    ? 'bg-yellow-500'
                                    : 'bg-green-500'
                              }`}
                              title={
                                follower.dead
                                  ? 'Offline'
                                  : follower.busy
                                    ? 'Busy'
                                    : 'Idle'
                              }
                            />
                            <div>
                              <h3 className="font-medium text-gray-900 dark:text-white">
                                {follower.id}
                              </h3>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {follower.url}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                                follower.dead
                                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                  : follower.busy
                                    ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400'
                                    : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                              }`}
                            >
                              {follower.dead
                                ? 'Offline'
                                : follower.busy
                                  ? 'Processing'
                                  : 'Idle'}
                            </span>
                          </div>
                        </div>

                        {/* Current job info */}
                        {follower.currentJob && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              <span className="font-medium">Current job:</span>{' '}
                              {follower.currentJob.name}
                            </p>
                            <div className="mt-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{
                                      width: `${follower.currentJob.progress}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-sm text-gray-600 dark:text-gray-400 w-12 text-right">
                                  {Math.round(follower.currentJob.progress)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </AppErrorBoundary>

        {/* Notifications Section */}
        <AppErrorBoundary>
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Notifications
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Get notified when all queued jobs have completed
              </p>
            </div>

            <div className="p-6">
              {notificationLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-3 text-gray-600 dark:text-gray-400">
                    Loading notification status...
                  </span>
                </div>
              ) : notificationError ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
                  {notificationError instanceof Error
                    ? notificationError.message
                    : 'Failed to load notification status'}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Configuration Status */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Configured Methods
                    </h3>
                    {notificationStatus?.enabled ? (
                      <div className="flex flex-wrap gap-2">
                        {notificationStatus.methods.map((method) => (
                          <span
                            key={method}
                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                          >
                            {method}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 dark:text-gray-400">
                        No notification methods configured
                      </p>
                    )}
                  </div>

                  {/* Configuration Instructions */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      How to Configure
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      Notifications are sent when the job queue is completely
                      empty with no pending jobs remaining. Configure
                      notifications using environment variables:
                    </p>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                      <li>
                        <span className="font-medium">Discord:</span> Set{' '}
                        <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">
                          DISCORD_WEBHOOK_URL
                        </code>
                      </li>
                      <li>
                        <span className="font-medium">Pushover:</span> Set{' '}
                        <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">
                          PUSHOVER_API_TOKEN
                        </code>{' '}
                        and{' '}
                        <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">
                          PUSHOVER_USER_KEY
                        </code>
                      </li>
                    </ul>
                  </div>

                  {/* Test Button */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleTestNotification}
                      disabled={
                        !notificationStatus?.enabled ||
                        testNotificationStatus === 'loading'
                      }
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
                    >
                      {testNotificationStatus === 'loading' ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send Test Notification'
                      )}
                    </button>
                    {!notificationStatus?.enabled && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Configure at least one notification method to test
                      </span>
                    )}
                  </div>
                  {testNotificationMessage && (
                    <p
                      className={`text-sm ${
                        testNotificationStatus === 'success'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {testNotificationMessage}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </AppErrorBoundary>
      </main>
    </div>
  );
}
