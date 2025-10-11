import React from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { FileBrowserModal } from '@/components/file-browser-modal';
import { JobList } from '@/components/job-list';
import { useUrlState } from '@/hooks/use-url-state';
import { ConversionOptions } from '@/types/conversion';

export default function App() {
  const {
    state,
    openModal,
    closeModal,
    setSelectedFiles,
    goToNextStep,
    goToPreviousStep,
  } = useUrlState();

  const handleStartConversion = async (options: ConversionOptions) => {
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to create jobs:', error);
        alert(
          `Failed to create conversion jobs: ${error.error || 'Unknown error'}`,
        );
        return;
      }

      const result = await response.json();
      console.log('Jobs created successfully:', result);

      // Close modal on success
      closeModal();
    } catch (error) {
      console.error('Error starting conversion:', error);
      alert('Failed to start conversion. Please try again.');
    }
  };

  return (
    <ThemeProvider>
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

            <div className="mt-16">
              <JobList />
            </div>
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
          onStartConversion={handleStartConversion}
          onFilesChange={setSelectedFiles}
        />
      </div>
    </ThemeProvider>
  );
}
