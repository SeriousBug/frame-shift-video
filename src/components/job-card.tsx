import React from 'react';
import { Job } from '@/types/database';
import { formatDistanceToNow } from 'date-fns';

interface JobCardProps {
  job: Job;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
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

export function JobCard({ job }: JobCardProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Unknown time';
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
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[job.status]}`}>
              <span className="mr-1">{statusIcons[job.status]}</span>
              {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </span>
            {job.queue_position !== null && job.status === 'pending' && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Queue position: {job.queue_position}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Input File:</label>
          <p className="text-gray-900 dark:text-white font-mono text-sm bg-gray-50 dark:bg-gray-700 p-2 rounded">
            {job.input_file}
          </p>
        </div>

        {job.output_file && (
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Output File:</label>
            <p className="text-gray-900 dark:text-white font-mono text-sm bg-gray-50 dark:bg-gray-700 p-2 rounded">
              {job.output_file}
            </p>
          </div>
        )}

        {job.ffmpeg_command && (
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">FFmpeg Command:</label>
            <p className="text-gray-900 dark:text-white font-mono text-sm bg-gray-50 dark:bg-gray-700 p-2 rounded">
              {job.ffmpeg_command}
            </p>
          </div>
        )}

        {(job.status === 'processing' || job.status === 'completed') && (
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Progress:</label>
            <div className="mt-1">
              <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400 mt-1 block">
                {job.progress.toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        {job.error_message && (
          <div>
            <label className="text-sm font-medium text-red-600 dark:text-red-400">Error:</label>
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