import { Link, useLocation } from '@tanstack/react-router';
import { useDiscs } from '@/lib/api-hooks';

/**
 * A button fixed in the top-right corner of every page, so the DVD ripper is one click away
 * however long the job list gets. On the Discs page it takes you back to the jobs. A dot on
 * it says the ripper is working (green) or that a note needs you (amber).
 */
export function DiscsCornerButton() {
  const { pathname } = useLocation();
  const { data: state } = useDiscs();
  const onDiscs = pathname.startsWith('/discs');
  const needsYou = (state?.attention.length ?? 0) > 0;
  const working = state?.run?.state === 'running';

  return (
    <Link
      to={onDiscs ? '/' : '/discs'}
      className="fixed top-4 right-4 z-50 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-blue-600 text-white font-medium shadow-lg hover:bg-blue-700 transition-colors"
    >
      <span aria-hidden="true">{onDiscs ? '📹' : '📀'}</span>
      {onDiscs ? 'Jobs' : 'Discs'}
      {!onDiscs && (needsYou || working) && (
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${needsYou ? 'bg-amber-300' : 'bg-green-300 animate-pulse'}`}
          title={needsYou ? 'A note needs you' : 'The ripper is working'}
        />
      )}
    </Link>
  );
}
