'use client';

import React from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { FileBrowserModal } from '@/components/file-browser-modal';
import { useUrlState } from '@/hooks/use-url-state';

export default function Home() {
  const {
    state,
    openModal,
    closeModal,
    setSelectedFiles,
    goToNextStep,
    goToPreviousStep,
  } = useUrlState();

  // For now, we'll use empty jobs array since we can't use async in client component
  // In real app, you'd fetch this data differently (useEffect, SWR, etc.)
  const jobs: unknown[] = [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <ThemeToggle />

      <div className="container mx-auto px-6 py-12">
        <header className="mb-12 text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Frame Shift Video
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Self-hosted video conversion service with FFmpeg
          </p>
        </header>

        <main>
          <div className="text-center py-16">
            <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 p-12 shadow-lg max-w-md mx-auto">
              <div className="text-6xl mb-6">📹</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Start Video Conversion
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Select files from your server to begin converting videos.
              </p>
              <button
                onClick={openModal}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                Start Conversions
              </button>
            </div>
          </div>

          {jobs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Video Jobs
                </h2>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} total
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {/* Jobs will be displayed here when available */}
              </div>
            </div>
          )}
        </main>
      </div>

      <FileBrowserModal
        isOpen={state.isOpen}
        selectedFiles={state.selectedFiles}
        currentStep={state.currentStep}
        onClose={closeModal}
        onContinue={(files) => {
          setSelectedFiles(files);
          if (state.currentStep === 'select') {
            goToNextStep();
          }
        }}
        onGoBack={goToPreviousStep}
      />
    </div>
  );
}
