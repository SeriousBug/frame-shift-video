import { useEffect, useState, type ReactNode } from 'react';

const CARD =
  'bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 p-6 shadow-sm';

/** The event the "Expand all" and "Collapse all" buttons send to every card. */
export const SET_ALL_EVENT = 'discs-set-all-sections';

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

/** Opens or closes every card on the page at once. */
export function setAllSections(open: boolean) {
  window.dispatchEvent(new CustomEvent(SET_ALL_EVENT, { detail: open }));
}

/**
 * A card with a title that folds the rest away. Whether it is open is remembered in this
 * browser, per title. A "?" button explains the card in plain words.
 */
export function CollapsibleCard({
  title,
  hint,
  help,
  children,
}: {
  title: string;
  hint?: string;
  /** A plain-words explanation, shown when the "?" is pressed */
  help?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(title));
  const [helping, setHelping] = useState(false);
  const toggle = () => {
    setOpen(!open);
    saveOpen(title, !open);
  };

  useEffect(() => {
    const listener = (event: Event) => {
      const wanted = (event as CustomEvent<boolean>).detail === true;
      setOpen(wanted);
      saveOpen(title, wanted);
    };
    window.addEventListener(SET_ALL_EVENT, listener);
    return () => window.removeEventListener(SET_ALL_EVENT, listener);
  }, [title]);

  return (
    <section className={CARD}>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xl font-bold text-gray-900 dark:text-white">
          <button
            type="button"
            aria-expanded={open}
            onClick={toggle}
            className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
          >
            <span>{title}</span>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {open ? 'Collapse ▲' : 'Expand ▼'}
            </span>
          </button>
        </h2>
        {help && (
          <button
            type="button"
            aria-label={`What is “${title}”?`}
            aria-expanded={helping}
            title="What is this?"
            onClick={() => setHelping(!helping)}
            className="h-11 w-11 shrink-0 rounded-full bg-blue-100 text-blue-800 font-bold hover:bg-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-blue-900/50 dark:text-blue-200"
          >
            ?
          </button>
        )}
      </div>
      {helping && help && (
        <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-gray-800 dark:bg-blue-900/20 dark:text-gray-200">
          {help}
        </p>
      )}
      {open && hint && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{hint}</p>
      )}
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}
