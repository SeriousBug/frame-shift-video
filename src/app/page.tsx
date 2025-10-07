import React from 'react';
import { JobService } from '@/lib/db-service';
import { JobCard } from '@/components/job-card';
import { ThemeToggle } from '@/components/theme-toggle';

export default async function Home() {
  const jobs = JobService.getAll();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <ThemeToggle />
      
      <div className="container mx-auto px-6 py-12">
        <header className="mb-12 text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Frame Shift Video
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Self-hosted video conversion service with FFmpeg
          </p>
        </header>

        <main>
          {jobs.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 p-12 shadow-lg max-w-md mx-auto">
                <div className="text-6xl mb-6">📹</div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  No Jobs Yet
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  Upload a video to get started with your first conversion job.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Video Jobs
                </h2>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} total
                </div>
              </div>
              
              <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
