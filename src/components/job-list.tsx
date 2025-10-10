'use client';

import React, { useEffect, useState } from 'react';
import { Job } from '@/types/database';
import { JobCard } from './job-card';

export function JobList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/jobs');
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data = await response.json();
      setJobs(data.jobs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();

    // Poll for job updates every 5 seconds
    const interval = setInterval(fetchJobs, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (jobId: number) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'retry' }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to retry job');
      }

      // Refresh jobs list immediately
      fetchJobs();
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
        <button
          onClick={fetchJobs}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
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
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} total
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
