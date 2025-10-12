import { createFileRoute, Link } from '@tanstack/react-router';
import { JobList } from '@/components/job-list';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  return (
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
        <div className="text-center py-16">
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 p-12 shadow-lg max-w-md mx-auto">
            <div className="text-6xl mb-6">📹</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Start Video Conversion
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Select files from your server to begin converting videos.
            </p>
            <Link
              to="/convert"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Start Conversions
            </Link>
          </div>
        </div>

        <div className="mt-16">
          <JobList />
        </div>
      </main>
    </div>
  );
}
