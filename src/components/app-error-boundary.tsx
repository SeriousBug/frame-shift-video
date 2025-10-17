import { ErrorBoundary } from 'react-error-boundary';
import { ReactNode } from 'react';
import { captureException } from '@/lib/sentry';
import { ErrorFallback, PageErrorFallback } from './error-fallback';

interface AppErrorBoundaryProps {
  children: ReactNode;
  variant?: 'inline' | 'page';
}

function handleError(error: Error, info: { componentStack: string | null }) {
  // Log to console for development
  console.error('Error caught by boundary:', error, info);

  // Send to Sentry
  captureException(error);
}

export function AppErrorBoundary({
  children,
  variant = 'inline',
}: AppErrorBoundaryProps) {
  const FallbackComponent =
    variant === 'page' ? PageErrorFallback : ErrorFallback;

  return (
    <ErrorBoundary FallbackComponent={FallbackComponent} onError={handleError}>
      {children}
    </ErrorBoundary>
  );
}
