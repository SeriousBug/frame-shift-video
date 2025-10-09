'use client';

import { useState, useEffect, useCallback } from 'react';

interface FileBrowserState {
  isOpen: boolean;
  selectedFiles: string[];
  currentStep: 'select' | 'configure';
}

const defaultState: FileBrowserState = {
  isOpen: false,
  selectedFiles: [],
  currentStep: 'select',
};

export function useUrlState() {
  const [state, setState] = useState<FileBrowserState>(defaultState);

  // Parse hash fragment to state (files are stored in localStorage, not URL)
  const parseHashToState = useCallback((hash: string): FileBrowserState => {
    if (!hash || hash === '#') {
      return defaultState;
    }

    try {
      // Remove # prefix
      const hashContent = hash.slice(1);
      const params = new URLSearchParams(hashContent);

      const isOpen = params.get('modal') === 'file-browser';
      const currentStep =
        (params.get('step') as 'select' | 'configure') || 'select';

      // Files are not stored in URL, will be loaded from localStorage separately
      return {
        isOpen,
        selectedFiles: [],
        currentStep,
      };
    } catch (error) {
      console.error('Error parsing hash state:', error);
      return defaultState;
    }
  }, []);

  // Convert state to hash fragment (files are stored in localStorage, not URL)
  const stateToHash = useCallback((state: FileBrowserState): string => {
    if (!state.isOpen) {
      return '';
    }

    const params = new URLSearchParams();
    params.set('modal', 'file-browser');

    if (state.currentStep !== 'select') {
      params.set('step', state.currentStep);
    }

    return `#${params.toString()}`;
  }, []);

  // Update URL when state changes
  const updateUrl = useCallback(
    (newState: FileBrowserState) => {
      const hash = stateToHash(newState);

      if (hash) {
        window.history.pushState(null, '', hash);
      } else {
        // Remove hash if modal is closed
        window.history.pushState(null, '', window.location.pathname);
      }
    },
    [stateToHash],
  );

  // Initialize state from URL on mount, and restore files from localStorage
  useEffect(() => {
    let initialState = parseHashToState(window.location.hash);

    // Always restore files from localStorage when modal is open
    if (initialState.isOpen) {
      try {
        const savedFiles = localStorage.getItem('frame-shift-selected-files');
        if (savedFiles) {
          const files = JSON.parse(savedFiles);
          initialState = { ...initialState, selectedFiles: files };
        }
      } catch (error) {
        console.error(
          'Failed to restore selected files from localStorage:',
          error,
        );
      }
    }

    setState(initialState);
  }, [parseHashToState]);

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      let newState = parseHashToState(window.location.hash);

      // Restore files from localStorage when navigating back/forward
      if (newState.isOpen) {
        try {
          const savedFiles = localStorage.getItem('frame-shift-selected-files');
          if (savedFiles) {
            const files = JSON.parse(savedFiles);
            newState = { ...newState, selectedFiles: files };
          }
        } catch (error) {
          console.error(
            'Failed to restore selected files from localStorage:',
            error,
          );
        }
      }

      setState(newState);
    };

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [parseHashToState]);

  // Actions
  const openModal = useCallback(() => {
    const newState = { ...defaultState, isOpen: true };
    setState(newState);
    updateUrl(newState);
  }, [updateUrl]);

  const closeModal = useCallback(() => {
    const newState = defaultState;
    setState(newState);
    updateUrl(newState);
  }, [updateUrl]);

  const setSelectedFiles = useCallback(
    (files: string[]) => {
      setState((prevState) => {
        const newState = { ...prevState, selectedFiles: files };
        updateUrl(newState);
        // Persist to localStorage
        try {
          localStorage.setItem(
            'frame-shift-selected-files',
            JSON.stringify(files),
          );
        } catch (error) {
          console.error(
            'Failed to save selected files to localStorage:',
            error,
          );
        }
        return newState;
      });
    },
    [updateUrl],
  );

  const setCurrentStep = useCallback(
    (step: 'select' | 'configure') => {
      setState((prevState) => {
        const newState = { ...prevState, currentStep: step };
        updateUrl(newState);
        return newState;
      });
    },
    [updateUrl],
  );

  const goToNextStep = useCallback(() => {
    setState((prevState) => {
      if (prevState.currentStep === 'select') {
        const newState = { ...prevState, currentStep: 'configure' as const };
        updateUrl(newState);
        return newState;
      }
      return prevState;
    });
  }, [updateUrl]);

  const goToPreviousStep = useCallback(() => {
    // Use browser's back button instead of manually changing state
    window.history.back();
  }, []);

  return {
    state,
    openModal,
    closeModal,
    setSelectedFiles,
    setCurrentStep,
    goToNextStep,
    goToPreviousStep,
  };
}
