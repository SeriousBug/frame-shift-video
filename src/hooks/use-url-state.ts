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

  // Parse hash fragment to state
  const parseHashToState = useCallback((hash: string): FileBrowserState => {
    if (!hash || hash === '#') {
      return defaultState;
    }

    try {
      // Remove # prefix
      const hashContent = hash.slice(1);
      const params = new URLSearchParams(hashContent);

      const isOpen = params.get('modal') === 'file-browser';
      const selectedFiles = params.get('files')
        ? JSON.parse(decodeURIComponent(params.get('files')!))
        : [];
      const currentStep =
        (params.get('step') as 'select' | 'configure') || 'select';

      return {
        isOpen,
        selectedFiles,
        currentStep,
      };
    } catch (error) {
      console.error('Error parsing hash state:', error);
      return defaultState;
    }
  }, []);

  // Convert state to hash fragment
  const stateToHash = useCallback((state: FileBrowserState): string => {
    if (!state.isOpen) {
      return '';
    }

    const params = new URLSearchParams();
    params.set('modal', 'file-browser');

    if (state.selectedFiles.length > 0) {
      params.set(
        'files',
        encodeURIComponent(JSON.stringify(state.selectedFiles)),
      );
    }

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

  // Initialize state from URL on mount
  useEffect(() => {
    const initialState = parseHashToState(window.location.hash);
    setState(initialState);
  }, [parseHashToState]);

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const newState = parseHashToState(window.location.hash);
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
      const newState = { ...state, selectedFiles: files };
      setState(newState);
      updateUrl(newState);
    },
    [state, updateUrl],
  );

  const setCurrentStep = useCallback(
    (step: 'select' | 'configure') => {
      const newState = { ...state, currentStep: step };
      setState(newState);
      updateUrl(newState);
    },
    [state, updateUrl],
  );

  const goToNextStep = useCallback(() => {
    if (state.currentStep === 'select') {
      setCurrentStep('configure');
    }
  }, [state.currentStep, setCurrentStep]);

  const goToPreviousStep = useCallback(() => {
    if (state.currentStep === 'configure') {
      setCurrentStep('select');
    }
  }, [state.currentStep, setCurrentStep]);

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
