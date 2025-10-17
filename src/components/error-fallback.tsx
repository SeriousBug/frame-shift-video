import { FallbackProps } from 'react-error-boundary';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div
      role="alert"
      className="p-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg"
    >
      <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
        Something went wrong
      </h2>
      <pre className="text-sm text-red-800 dark:text-red-200 mb-4 overflow-auto max-h-40 bg-red-100 dark:bg-red-900/20 p-3 rounded">
        {error.message}
      </pre>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

export function PageErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <ErrorFallback error={error} resetErrorBoundary={resetErrorBoundary} />
      </div>
    </div>
  );
}
