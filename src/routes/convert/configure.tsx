import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ConversionConfig } from '@/components/conversion-config';
import { ConversionOptions } from '@/types/conversion';
import {
  useFileSelections,
  useStartJobs,
  useJobBatchStatus,
  useSaveFileSelections,
  useClearPickerState,
} from '@/lib/api-hooks';
import { useInPageSearch } from '@/hooks/use-in-page-search';
import { InPageSearch } from '@/components/in-page-search';
import { AppErrorBoundary } from '@/components/app-error-boundary';

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
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);

  // In-page search
  const searchInputRef = useRef<HTMLInputElement>(null);
  const search = useInPageSearch({ inputRef: searchInputRef });

  // Load file selections using TanStack Query
  const {
    data: fileSelectionsData,
    isLoading,
    error: fileSelectionsError,
  } = useFileSelections(urlKey);

  const files = fileSelectionsData?.files || [];
  const savedConfig = fileSelectionsData?.config;
  const startJobsMutation = useStartJobs();
  const { data: batchStatus } = useJobBatchStatus(activeBatchId);
  const saveFileSelectionsMutation = useSaveFileSelections();
  const clearPickerState = useClearPickerState();

  // Navigate home when batch completes
  useEffect(() => {
    if (batchStatus?.status === 'completed') {
      console.log('[Configure Page] Batch completed, navigating home');
      clearPickerState();
      navigate({ to: '/', search: {} });
    } else if (batchStatus?.status === 'failed') {
      console.error('[Configure Page] Batch failed:', batchStatus.errorMessage);
      setActiveBatchId(null);
      alert(
        `Failed to create conversion jobs: ${batchStatus.errorMessage || 'Unknown error'}`,
      );
    }
  }, [
    batchStatus?.status,
    batchStatus?.errorMessage,
    clearPickerState,
    navigate,
  ]);

  const handleCancel = useCallback(() => {
    clearPickerState();
    navigate({ to: '/', search: {} });
  }, [clearPickerState, navigate]);

  const handleStartConversion = async (options: ConversionOptions) => {
    console.log('[Configure Page] Starting conversion with options:', {
      fileCount: options.selectedFiles?.length || 0,
      outputDir: options.outputDirectory,
      format: options.format,
      videoCodec: options.videoCodec,
      audioCodec: options.audioCodec,
      quality: options.quality,
    });
    console.log('[Configure Page] Selected files:', options.selectedFiles);

    try {
      const result = await startJobsMutation.mutateAsync(options);
      console.log('[Configure Page] Job creation started:', result);

      // Set the batch ID to start tracking progress
      setActiveBatchId(result.batchId);
    } catch (error) {
      console.error('[Configure Page] ERROR: Failed to start job creation');
      console.error('[Configure Page] Error details:', error);
      console.error(
        '[Configure Page] Error message:',
        error instanceof Error ? error.message : String(error),
      );

      alert(
        `Failed to start job creation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  };

  // Determine if we're in "creating jobs" mode
  const isCreatingJobs =
    activeBatchId !== null && batchStatus?.status !== 'failed';

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
      {/* In-page search */}
      {search.isOpen && (
        <InPageSearch
          query={search.query}
          onQueryChange={search.setQuery}
          currentMatchIndex={search.currentMatchIndex}
          totalMatches={search.totalMatches}
          onNext={search.nextMatch}
          onPrevious={search.previousMatch}
          onClose={search.closeSearch}
          showNativeWarning={search.showNativeWarning}
          inputRef={searchInputRef}
        />
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl mx-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Configure Conversion
          </h1>
          <button
            type="button"
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-500 rounded"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
          <AppErrorBoundary>
            <ConversionConfig
              selectedFiles={files}
              initialConfig={savedConfig}
              onOptionsChange={setCurrentOptions}
              onStartConversion={handleStartConversion}
              onFilesChange={handleFilesChange}
              searchQuery={search.query}
              searchCurrentMatch={search.currentMatchIndex}
              onSearchMatchesFound={search.setTotalMatches}
            />
          </AppErrorBoundary>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-600">
          {/* Job creation progress indicator */}
          {isCreatingJobs && batchStatus && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <div className="flex-1">
                  <p className="text-blue-800 dark:text-blue-200 font-medium">
                    Creating conversion jobs...
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    {batchStatus.createdCount} of {batchStatus.totalFiles} jobs
                    created
                  </p>
                </div>
              </div>
              {batchStatus.totalFiles > 0 && (
                <div className="mt-3 h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{
                      width: `${Math.round((batchStatus.createdCount / batchStatus.totalFiles) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: '/convert',
                  search: { key: urlKey },
                })
              }
              disabled={isCreatingJobs}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-500 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Back to File Selection
            </button>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCreatingJobs}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-500 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  currentOptions && handleStartConversion(currentOptions)
                }
                disabled={
                  !currentOptions ||
                  files.length === 0 ||
                  startJobsMutation.isPending ||
                  isCreatingJobs
                }
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {startJobsMutation.isPending
                  ? 'Starting...'
                  : isCreatingJobs
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
