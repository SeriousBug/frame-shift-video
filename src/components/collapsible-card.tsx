import { useEffect, useState, type ReactNode } from 'react';

const CARD =
  'bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 p-6 shadow-sm';

/** The event the "Expand all" and "Collapse all" buttons send to every card. */
export const SET_ALL_EVENT = 'discs-set-all-sections';
const SHOW_EVENT = 'discs-show-section';

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

/** The id of a card's element, which the status banner's "Show me" buttons scroll to. */
export function sectionId(title: string): string {
  return `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Opens the card with this title if it is folded, and scrolls it into view. */
export function showSection(title: string) {
  window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: title }));
  // After the card has opened, so it is scrolled to where it ends up.
  setTimeout(() => {
    document
      .getElementById(sectionId(title))
      ?.scrollIntoView({ block: 'start' });
  }, 50);
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
  badge,
  urgent,
  children,
}: {
  title: string;
  hint?: string;
  /** A plain-words explanation, shown when the "?" is pressed */
  help?: string;
  /** A short count or word beside the title, visible even when the card is folded */
  badge?: string;
  /** Something here needs the person: a folded card opens itself when this turns true */
  urgent?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(title));
  const [helping, setHelping] = useState(false);
  const toggle = () => {
    setOpen(!open);
    saveOpen(title, !open);
  };

  useEffect(() => {
    if (urgent) setOpen(true);
  }, [urgent]);

  useEffect(() => {
    const listener = (event: Event) => {
      const wanted = (event as CustomEvent<boolean>).detail === true;
      setOpen(wanted);
      saveOpen(title, wanted);
    };
    const show = (event: Event) => {
      if ((event as CustomEvent<string>).detail === title) setOpen(true);
    };
    window.addEventListener(SET_ALL_EVENT, listener);
    window.addEventListener(SHOW_EVENT, show);
    return () => {
      window.removeEventListener(SET_ALL_EVENT, listener);
      window.removeEventListener(SHOW_EVENT, show);
    };
  }, [title]);

  return (
    <section id={sectionId(title)} className={`${CARD} scroll-mt-4`}>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xl font-bold text-gray-900 dark:text-white">
          <button
            type="button"
            aria-expanded={open}
            onClick={toggle}
            className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
          >
            <span>
              {title}
              {badge && (
                <span className="ml-3 rounded-full bg-amber-100 px-3 py-0.5 align-middle text-sm font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  {badge}
                </span>
              )}
            </span>
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
