import { useState, useEffect } from 'react';
import { Job } from '@/types/database';
import { ConversionOptions } from '@/types/conversion';
import { formatDistanceToNow } from 'date-fns';
import Highlighter from 'react-highlight-words';

interface JobCardProps {
  job: Job & { currentFrame?: number; currentFps?: number };
  onRetry?: (jobId: number) => void;
  onCancel?: (jobId: number) => void;
  /** Search words to highlight */
  searchWords?: string[];
  /** Whether this job is the active search match */
  isActiveMatch?: boolean;
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

export function JobCard({
  job,
  onRetry,
  onCancel,
  searchWords = [],
  isActiveMatch = false,
}: JobCardProps) {
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showStats, setShowStats] = useState(false);
  const [showError, setShowError] = useState(false);

  // Parse config if available
  const config: ConversionOptions | null = job.config_json
    ? (() => {
        try {
          return JSON.parse(job.config_json);
        } catch {
          return null;
        }
      })()
    : null;

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
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border ${
        isActiveMatch
          ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-900/50'
          : 'border-gray-200 dark:border-gray-700'
      } p-4 shadow hover:shadow-md transition-all duration-200`}
    >
      {/* Header: Status, File Path, and Config */}
      <div className="flex items-start gap-3 mb-2">
        <span
          className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${statusColors[job.status]} flex-shrink-0`}
        >
          <span className="mr-1">{statusIcons[job.status]}</span>
          {getDisplayStatus()}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
            {searchWords.length > 0 ? (
              <Highlighter
                searchWords={searchWords}
                autoEscape={true}
                textToHighlight={job.input_file}
                highlightClassName={
                  isActiveMatch
                    ? 'bg-blue-400 dark:bg-blue-600 text-white'
                    : 'bg-yellow-200 dark:bg-yellow-700'
                }
              />
            ) : (
              job.input_file
            )}
          </p>

          {/* Configuration display */}
          {config && (
            <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">Codec:</span>
                {config.basic.videoCodec}
              </span>
              <span className="text-gray-400 dark:text-gray-600">•</span>
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">Quality:</span>
                {config.basic.quality}
              </span>
              <span className="text-gray-400 dark:text-gray-600">•</span>
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">Format:</span>
                {config.basic.outputFormat}
              </span>
              <span className="text-gray-400 dark:text-gray-600">•</span>
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">Preset:</span>
                {config.advanced.preset}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {job.queue_position !== null && job.status === 'pending' && (
            <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
              #{job.queue_position}
            </span>
          )}
          {(job.status === 'failed' || job.status === 'cancelled') &&
            !job.retried &&
            onRetry && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-xs font-medium transition-colors"
              >
                {retrying ? 'Retrying...' : 'Retry'}
              </button>
            )}
          {(job.status === 'pending' || job.status === 'processing') &&
            onCancel && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-xs font-medium transition-colors"
              >
                {cancelling ? 'Cancelling...' : 'Cancel'}
              </button>
            )}
        </div>
      </div>

      {/* Progress bar for processing jobs */}
      {job.status === 'processing' && (
        <div className="mb-2">
          {job.progress < 0 ? (
            <div className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-2 rounded">
              Unable to calculate progress
            </div>
          ) : (
            <div>
              <div className="flex gap-3 mb-1 text-xs text-gray-600 dark:text-gray-400">
                <span>{job.progress.toFixed(1)}%</span>
                {calculateETA() !== null && (
                  <span>ETA: {formatDuration(calculateETA()!)}</span>
                )}
                {job.currentFps !== undefined && job.currentFps > 0 && (
                  <span>{job.currentFps.toFixed(1)} fps</span>
                )}
              </div>
              <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsible stats for completed jobs */}
      {job.status === 'completed' && job.progress >= 0 && (
        <div className="mb-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1"
          >
            <span>{showStats ? '▼' : '▶'}</span>
            <span>Conversion Stats</span>
          </button>
          {showStats && (
            <div className="flex gap-3 mt-1 text-xs text-gray-600 dark:text-gray-400 pl-4">
              {getElapsedTime() !== null && (
                <span>
                  <span className="font-medium">Time:</span>{' '}
                  {formatDuration(getElapsedTime()!)}
                </span>
              )}
              {getAverageFps() !== null && (
                <span>
                  <span className="font-medium">Avg:</span>{' '}
                  {getAverageFps()!.toFixed(1)} fps
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Collapsible error for failed jobs */}
      {job.error_message && (
        <div className="mb-2">
          <button
            onClick={() => setShowError(!showError)}
            className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1"
          >
            <span>{showError ? '▼' : '▶'}</span>
            <span>Error Details</span>
          </button>
          {showError && (
            <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-2 rounded mt-1">
              {job.error_message}
            </p>
          )}
        </div>
      )}

      {/* Footer: timestamps */}
      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
        <span>{formatDate(job.created_at)}</span>
        <span>{formatDate(job.updated_at)}</span>
      </div>
    </div>
  );
}
