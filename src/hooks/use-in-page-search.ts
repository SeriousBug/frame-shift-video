import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseInPageSearchOptions {
  /** Callback when search is opened */
  onOpen?: () => void;
  /** Callback when search is closed */
  onClose?: () => void;
  /** Ref to the search input element */
  inputRef?: React.RefObject<HTMLInputElement>;
}

export interface UseInPageSearchReturn {
  /** Whether the search is currently open */
  isOpen: boolean;
  /** The current search query */
  query: string;
  /** The current match index (0-based) */
  currentMatchIndex: number;
  /** Total number of matches found */
  totalMatches: number;
  /** Whether to show the native search warning */
  showNativeWarning: boolean;
  /** Open the search */
  openSearch: () => void;
  /** Close the search */
  closeSearch: () => void;
  /** Set the search query */
  setQuery: (query: string) => void;
  /** Set the total matches count */
  setTotalMatches: (count: number) => void;
  /** Go to the next match */
  nextMatch: () => void;
  /** Go to the previous match */
  previousMatch: () => void;
  /** Set the current match index */
  setCurrentMatchIndex: (index: number) => void;
}

/**
 * Hook for managing in-page search functionality with keyboard shortcuts.
 * Handles Ctrl+F/Cmd+F and / shortcuts to open search.
 * Second press of Ctrl+F/Cmd+F while search is open shows native search.
 */
export function useInPageSearch(
  options: UseInPageSearchOptions = {},
): UseInPageSearchReturn {
  const { onOpen, onClose, inputRef } = options;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [showNativeWarning, setShowNativeWarning] = useState(false);
  const lastPreventTimeRef = useRef<number>(0);

  const openSearch = useCallback(() => {
    setIsOpen(true);
    setShowNativeWarning(false);
    onOpen?.();
  }, [onOpen]);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setCurrentMatchIndex(0);
    setTotalMatches(0);
    setShowNativeWarning(false);
    onClose?.();
  }, [onClose]);

  const nextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % totalMatches);
  }, [totalMatches]);

  const previousMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches);
  }, [totalMatches]);

  // Reset current match index when query changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [query]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+F or Cmd+F
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (isOpen) {
          // Search is already open, check if input is focused
          const isInputFocused =
            inputRef?.current && document.activeElement === inputRef.current;

          if (isInputFocused) {
            // Input is focused, allow native search to show
            setShowNativeWarning(true);
            // Don't prevent default - let native search show
            return;
          } else {
            // Input is not focused, focus it
            e.preventDefault();
            inputRef?.current?.focus();
          }
        } else {
          // Search is closed, open our custom search
          e.preventDefault();
          openSearch();
          lastPreventTimeRef.current = Date.now();
        }
      }
      // Check for / key (when not in an input)
      else if (
        e.key === '/' &&
        !isOpen &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        openSearch();
      }
      // Check for Escape to close
      else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closeSearch();
      }
      // Check for Ctrl+G or Cmd+G for next match (common in browsers)
      else if ((e.ctrlKey || e.metaKey) && e.key === 'g' && isOpen) {
        e.preventDefault();
        if (e.shiftKey) {
          previousMatch();
        } else {
          nextMatch();
        }
      }
      // Check for Enter for next match
      else if (e.key === 'Enter' && isOpen) {
        e.preventDefault();
        if (e.shiftKey) {
          previousMatch();
        } else {
          nextMatch();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openSearch, closeSearch, nextMatch, previousMatch, inputRef]);

  // Hide native warning after a delay
  useEffect(() => {
    if (showNativeWarning) {
      const timer = setTimeout(() => {
        setShowNativeWarning(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showNativeWarning]);

  return {
    isOpen,
    query,
    currentMatchIndex,
    totalMatches,
    showNativeWarning,
    openSearch,
    closeSearch,
    setQuery,
    setTotalMatches,
    nextMatch,
    previousMatch,
    setCurrentMatchIndex,
  };
}
