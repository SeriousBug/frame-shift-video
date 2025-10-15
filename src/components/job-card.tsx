import React, { useState, useEffect } from 'react';
import { Job } from '@/types/database';
import { formatDistanceToNow } from 'date-fns';

interface JobCardProps {
  job: Job & { currentFrame?: number; currentFps?: number };
  onRetry?: (jobId: number) => void;
  onCancel?: (jobId: number) => void;
}

const statusColors = {
  pending:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  completed:
    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const statusIcons = {
  pending: '⏳',
  processing: '⚡',
  completed: '✅',
  failed: '❌',
  cancelled: '⏹️',
};

export function JobCard({ job, onRetry, onCancel }: JobCardProps) {
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every second for ETA calculation
  useEffect(() => {
    if (job.status === 'processing' && job.start_time) {
      const interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [job.status, job.start_time]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Unknown time';
    }
  };

  const formatDuration = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours} h ${minutes % 60} m`;
    } else if (minutes > 0) {
      return `${minutes} m ${seconds % 60} s`;
    } else {
      return `${seconds} s`;
    }
  };

  const calculateETA = () => {
    if (!job.start_time || job.progress <= 0 || job.progress >= 100) {
      return null;
    }

    const startTime = new Date(job.start_time).getTime();
    const elapsed = currentTime - startTime;
    const estimatedTotal = (elapsed / job.progress) * 100;
    const remaining = estimatedTotal - elapsed;

    return remaining > 0 ? remaining : 0;
  };

  const getElapsedTime = () => {
    if (!job.start_time) return null;
    const startTime = new Date(job.start_time).getTime();
    const endTime = job.end_time
      ? new Date(job.end_time).getTime()
      : currentTime;
    return endTime - startTime;
  };

  const getAverageFps = () => {
    if (!job.total_frames || !job.start_time || !job.end_time) return null;
    const startTime = new Date(job.start_time).getTime();
    const endTime = new Date(job.end_time).getTime();
    const durationSeconds = (endTime - startTime) / 1000;
    return durationSeconds > 0 ? job.total_frames / durationSeconds : 0;
  };

  const getDisplayStatus = () => {
    if (job.status === 'failed' && job.retried) {
      return 'Failed, Retried';
    }
    return job.status.charAt(0).toUpperCase() + job.status.slice(1);
  };

  const handleRetry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry(job.id);
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    if (!onCancel) return;
    setCancelling(true);
    try {
      await onCancel(job.id);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 p-6 shadow-lg hover:shadow-xl transition-all duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {job.name}
          </h3>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[job.status]}`}
            >
              <span className="mr-1">{statusIcons[job.status]}</span>
              {getDisplayStatus()}
            </span>
            {job.queue_position !== null && job.status === 'pending' && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Queue position: {job.queue_position}
              </span>
            )}
            {(job.status === 'failed' || job.status === 'cancelled') &&
              !job.retried &&
              onRetry && (
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                  {retrying ? 'Retrying...' : 'Retry'}
                </button>
              )}
            {(job.status === 'pending' || job.status === 'processing') &&
              onCancel && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel'}
                </button>
              )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">
            File
          </label>
          <p className="text-gray-900 dark:text-white font-mono text-sm break-all">
            {job.input_file}
          </p>
        </div>

        {(job.status === 'processing' || job.status === 'completed') && (
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {job.status === 'completed' ? 'Conversion Stats:' : 'Progress:'}
            </label>
            {job.progress < 0 ? (
              <div className="mt-1 text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-2 rounded">
                Unable to calculate progress (video duration unavailable)
              </div>
            ) : (
              <div className="mt-1">
                {/* Show ETA and FPS for processing jobs */}
                {job.status === 'processing' && (
                  <div className="flex gap-4 mb-2 text-sm">
                    {calculateETA() !== null && (
                      <div className="text-gray-700 dark:text-gray-300">
                        <span className="font-medium">ETA:</span>{' '}
                        {formatDuration(calculateETA()!)}
                      </div>
                    )}
                    {job.currentFps !== undefined && job.currentFps > 0 && (
                      <div className="text-gray-700 dark:text-gray-300">
                        <span className="font-medium">Processing:</span>{' '}
                        {job.currentFps.toFixed(1)} fps
                      </div>
                    )}
                  </div>
                )}

                {/* Show elapsed time and average FPS for completed jobs */}
                {job.status === 'completed' && (
                  <div className="flex gap-4 mb-2 text-sm">
                    {getElapsedTime() !== null && (
                      <div className="text-gray-700 dark:text-gray-300">
                        <span className="font-medium">Time:</span>{' '}
                        {formatDuration(getElapsedTime()!)}
                      </div>
                    )}
                    {getAverageFps() !== null && (
                      <div className="text-gray-700 dark:text-gray-300">
                        <span className="font-medium">Average:</span>{' '}
                        {getAverageFps()!.toFixed(1)} fps
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400 mt-1 block">
                  {job.status === 'completed'
                    ? 'Completed'
                    : `${job.progress.toFixed(1)}%`}
                </span>
              </div>
            )}
          </div>
        )}

        {job.error_message && (
          <div>
            <label className="text-sm font-medium text-red-600 dark:text-red-400">
              Error:
            </label>
            <p className="text-red-700 dark:text-red-300 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">
              {job.error_message}
            </p>
          </div>
        )}

        <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-600">
          <span>Created {formatDate(job.created_at)}</span>
          <span>Updated {formatDate(job.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}
