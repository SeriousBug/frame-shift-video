import { Link } from '@tanstack/react-router';

const TAB = 'px-4 py-3 text-sm font-medium border-b-2 transition-colors';
// The colours are set per state, not in TAB, so the active ones are not overridden.
const ACTIVE = {
  className: 'border-blue-600 text-blue-600 dark:text-blue-400',
};
const INACTIVE = {
  className:
    'border-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white',
};

/**
 * The tabs along the top of every page: jobs, the DVD ripper, and settings.
 */
export function NavTabs() {
  return (
    <nav
      aria-label="Main"
      className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      <div className="container mx-auto px-6 flex gap-2">
        <Link
          to="/"
          className={TAB}
          activeProps={ACTIVE}
          inactiveProps={INACTIVE}
          activeOptions={{ exact: true }}
        >
          Jobs
        </Link>
        <Link
          to="/discs"
          className={TAB}
          activeProps={ACTIVE}
          inactiveProps={INACTIVE}
        >
          Discs
        </Link>
        <Link
          to="/settings"
          className={TAB}
          activeProps={ACTIVE}
          inactiveProps={INACTIVE}
        >
          Settings
        </Link>
      </div>
    </nav>
  );
}
