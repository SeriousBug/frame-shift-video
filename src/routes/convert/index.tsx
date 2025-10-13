import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { usePickerState, usePickerAction } from '@/lib/api-hooks';
import { FilePickerItem } from '@/types/files';
import { useEffect } from 'react';

export const Route = createFileRoute('/convert/')({
  component: ConvertPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      key: (search.key as string) || undefined,
    };
  },
});

function ConvertPage() {
  const navigate = useNavigate();
  const { key: urlKey } = Route.useSearch();

  // Fetch picker state from server
  const { data: pickerState, isLoading, error } = usePickerState(urlKey);

  console.log('[CLIENT] usePickerState result:', {
    pickerState,
    isLoading,
    error,
    urlKey,
  });

  // Mutation for performing actions
  const pickerAction = usePickerAction();

  // Update URL when picker state key changes
  useEffect(() => {
    if (pickerState && pickerState.key !== urlKey) {
      navigate({
        to: '/convert',
        search: { key: pickerState.key },
        replace: true,
      });
    }
  }, [pickerState, urlKey, navigate]);

  const handleToggleFolder = async (folderPath: string) => {
    console.log('[CLIENT] handleToggleFolder called', {
      folderPath,
      isPending: pickerAction.isPending,
      currentKey: pickerState?.key,
    });
    if (pickerAction.isPending) return;

    const result = await pickerAction.mutateAsync({
      action: { type: 'toggle-folder', path: folderPath },
      key: pickerState?.key,
    });
    console.log('[CLIENT] handleToggleFolder result', result);
  };

  const handleToggleFile = async (filePath: string) => {
    console.log('[CLIENT] handleToggleFile called', {
      filePath,
      isPending: pickerAction.isPending,
      currentKey: pickerState?.key,
    });
    if (pickerAction.isPending) return;

    const result = await pickerAction.mutateAsync({
      action: { type: 'toggle-file', path: filePath },
      key: pickerState?.key,
    });
    console.log('[CLIENT] handleToggleFile result', result);
  };

  const handleToggleFolderSelection = async (folderPath: string) => {
    console.log('[CLIENT] handleToggleFolderSelection called', {
      folderPath,
      isPending: pickerAction.isPending,
      currentKey: pickerState?.key,
    });
    if (pickerAction.isPending) return;

    const result = await pickerAction.mutateAsync({
      action: { type: 'toggle-folder-selection', path: folderPath },
      key: pickerState?.key,
    });
    console.log('[CLIENT] handleToggleFolderSelection result', result);
  };

  const handleContinue = () => {
    if (!pickerState) return;

    navigate({
      to: '/convert/configure',
      search: { key: pickerState.key },
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const renderItem = (item: FilePickerItem) => {
    const isSelected = item.selectionState === 'full';
    const isIndeterminate = item.selectionState === 'partial';
    const isTopLevelFolder = item.isDirectory && item.depth === 0;
    const canInteract = !pickerAction.isPending && !isTopLevelFolder;
    const isExpanding = pickerAction.isPending;

    const extraFileIndent = item.isDirectory ? 0 : 20;
    const paddingLeft = item.depth * 20 + 12 + extraFileIndent;

    return (
      <div key={item.path}>
        <div
          className={`flex items-center py-2 px-3 hover:bg-gray-100 dark:hover:bg-gray-700 ${
            isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
          }`}
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          <div className="flex items-center flex-1 min-w-0">
            {item.isDirectory && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFolder(item.path);
                }}
                disabled={isExpanding}
                className={`mr-2 w-4 h-4 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:hover:bg-transparent ${isExpanding ? 'cursor-default' : ''}`}
              >
                <span className="text-gray-500 text-xs">
                  {item.isExpanded ? '▼' : '▶'}
                </span>
              </button>
            )}

            {/* Custom checkbox */}
            <button
              onClick={() => {
                if (!canInteract) return;
                if (item.isDirectory) {
                  handleToggleFolderSelection(item.path);
                } else {
                  handleToggleFile(item.path);
                }
              }}
              disabled={isTopLevelFolder}
              className={`mr-3 w-4 h-4 flex items-center justify-center border-2 rounded ${
                isSelected
                  ? 'bg-blue-600 border-blue-600'
                  : isIndeterminate
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-gray-300 dark:border-gray-600'
              } ${isTopLevelFolder ? 'opacity-50 cursor-not-allowed' : isExpanding ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {isSelected && (
                <svg
                  className="w-3 h-3 text-white"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <path
                    d="M10 3L4.5 8.5L2 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {isIndeterminate && (
                <div className="w-2 h-0.5 bg-white rounded"></div>
              )}
            </button>

            <div
              className={`flex items-center flex-1 min-w-0 ${isExpanding ? 'cursor-default' : 'cursor-pointer'}`}
              onClick={() => {
                if (isExpanding) return;
                if (item.isDirectory) {
                  handleToggleFolder(item.path);
                } else {
                  handleToggleFile(item.path);
                }
              }}
            >
              <span className="mr-2">{item.isDirectory ? '📁' : '📄'}</span>

              <span className="text-gray-900 dark:text-white truncate">
                {item.name}
              </span>

              {!item.isDirectory && item.size && (
                <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                  {formatFileSize(item.size)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl mx-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Select Files for Conversion
            </h1>
            {pickerAction.isPending && (
              <div className="flex items-center text-blue-600 dark:text-blue-400">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <button
            onClick={() => navigate({ to: '/' })}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        <div className="flex flex-col" style={{ height: '70vh' }}>
          {error && (
            <div className="m-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error instanceof Error
                ? error.message
                : 'Failed to load picker state'}
            </div>
          )}

          <div className="flex-1 overflow-y-auto border-b border-gray-200 dark:border-gray-600">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-gray-600 dark:text-gray-400">
                  Loading files...
                </span>
              </div>
            ) : pickerState ? (
              <div>
                {pickerState.items.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    No files found in this directory
                  </div>
                ) : (
                  pickerState.items.map((item) => renderItem(item))
                )}
              </div>
            ) : null}
          </div>

          <div className="p-6 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {pickerState?.selectedCount || 0} file
                {pickerState?.selectedCount !== 1 ? 's' : ''} selected
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate({ to: '/' })}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>

                <button
                  onClick={handleContinue}
                  disabled={
                    !pickerState ||
                    pickerState.selectedCount === 0 ||
                    pickerAction.isPending
                  }
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <div
                    className={`w-4 h-4 border-2 border-white border-t-transparent rounded-full ${pickerAction.isPending ? 'animate-spin' : 'invisible'}`}
                  />
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
