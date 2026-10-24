import { useState, type ReactNode } from 'react';

const CARD =
  'bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 p-6 shadow-sm';

function readOpen(id: string): boolean {
  try {
    return localStorage.getItem(`discs-section-${id}`) !== 'closed';
  } catch {
    return true;
  }
}

function saveOpen(id: string, open: boolean) {
  try {
    localStorage.setItem(`discs-section-${id}`, open ? 'open' : 'closed');
  } catch {
    // Remembering is a convenience only.
  }
}

/**
 * A card with a title that folds the rest away. Whether it is open is remembered in this
 * browser, per title.
 */
export function CollapsibleCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(title));
  const toggle = () => {
    setOpen(!open);
    saveOpen(title, !open);
  };
  return (
    <section className={CARD}>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>{title}</span>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {open ? 'Collapse ▲' : 'Expand ▼'}
          </span>
        </button>
      </h2>
      {open && hint && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{hint}</p>
      )}
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}
