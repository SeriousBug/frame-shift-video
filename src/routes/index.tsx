import { createFileRoute, Link } from '@tanstack/react-router';
import { JobList } from '@/components/job-list';
import { sendTestNotification } from '@/lib/api';
import { useState } from 'react';
import { AppErrorBoundary } from '@/components/app-error-boundary';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  const [testNotificationStatus, setTestNotificationStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [testNotificationMessage, setTestNotificationMessage] = useState('');

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
              search={{}}
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Start Conversions
            </Link>
          </div>
        </div>

        <div className="mt-16">
          <AppErrorBoundary>
            <JobList />
          </AppErrorBoundary>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={handleTestNotification}
            disabled={testNotificationStatus === 'loading'}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors text-sm"
          >
            {testNotificationStatus === 'loading' ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              'Test Notification'
            )}
          </button>
          {testNotificationMessage && (
            <p
              className={`mt-2 text-sm ${
                testNotificationStatus === 'success'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {testNotificationMessage}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
