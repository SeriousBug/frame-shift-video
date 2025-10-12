import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ConversionConfig } from '@/components/conversion-config';
import { ConversionOptions } from '@/types/conversion';
import {
  useFileSelections,
  useCreateJobs,
  useSaveFileSelections,
} from '@/lib/api-hooks';

export const Route = createFileRoute('/convert/configure')({
  component: ConfigurePage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      key: (search.key as string) || undefined,
    };
  },
});

function ConfigurePage() {
  const navigate = useNavigate();
  const { key: urlKey } = Route.useSearch();
  const [currentOptions, setCurrentOptions] =
    useState<ConversionOptions | null>(null);

  // Load file selections using TanStack Query
  const {
    data: fileSelectionsData,
    isLoading,
    error: fileSelectionsError,
  } = useFileSelections(urlKey);

  const files = fileSelectionsData?.files || [];
  const savedConfig = fileSelectionsData?.config;
  const createJobsMutation = useCreateJobs();
  const saveFileSelectionsMutation = useSaveFileSelections();

  const handleStartConversion = async (options: ConversionOptions) => {
    try {
      const result = await createJobsMutation.mutateAsync(options);
      console.log('Jobs created successfully:', result);

      // Navigate back to home on success
      navigate({ to: '/' });
    } catch (error) {
      console.error('Error starting conversion:', error);
      alert(
        `Failed to create conversion jobs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  };

  const handleFilesChange = async (newFiles: string[]) => {
    // Save to server with current config and update URL
    try {
      const data = await saveFileSelectionsMutation.mutateAsync({
        files: newFiles,
        config: currentOptions || undefined,
      });
      navigate({
        to: '/convert/configure',
        search: { key: data.key },
        replace: true,
      });
    } catch (error) {
      console.error('Error saving file selections:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl mx-auto p-12">
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">
              Loading file selections...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl mx-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Configure Conversion
          </h1>
          <button
            onClick={() => navigate({ to: '/' })}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
          <ConversionConfig
            selectedFiles={files}
            initialConfig={savedConfig}
            onOptionsChange={setCurrentOptions}
            onStartConversion={handleStartConversion}
            onFilesChange={handleFilesChange}
          />
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between">
            <button
              onClick={() =>
                navigate({
                  to: '/convert',
                  search: urlKey ? { key: urlKey } : {},
                })
              }
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              ← Back to File Selection
            </button>

            <div className="flex gap-3">
              <button
                onClick={() => navigate({ to: '/' })}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  currentOptions && handleStartConversion(currentOptions)
                }
                disabled={
                  !currentOptions ||
                  files.length === 0 ||
                  createJobsMutation.isPending
                }
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {createJobsMutation.isPending
                  ? 'Creating Jobs...'
                  : 'Start Conversion'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
