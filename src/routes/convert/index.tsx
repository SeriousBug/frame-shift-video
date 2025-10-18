import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  usePickerState,
  usePickerAction,
  useClearPickerState,
} from '@/lib/api-hooks';
import { FilePickerItem } from '@/types/files';
import { useEffect, useState, useRef, useMemo } from 'react';
import { SearchHelpModal } from '@/components/search-help-modal';
import { Menu } from '@ark-ui/react/menu';
import { useInPageSearch } from '@/hooks/use-in-page-search';
import { InPageSearch } from '@/components/in-page-search';
import Highlighter from 'react-highlight-words';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import {
  Folder,
  FolderCheck,
  FileVideo,
  FileCheck,
  HelpCircle,
  File,
} from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchHelpOpen, setIsSearchHelpOpen] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [videosOnly, setVideosOnly] = useState<boolean | undefined>(undefined);
  const [showHidden, setShowHidden] = useState<boolean | undefined>(undefined);
  const [hideConverted, setHideConverted] = useState<boolean | undefined>(
    undefined,
  );
  const [lastClickedFilePath, setLastClickedFilePath] = useState<string | null>(
    null,
  );

  // In-page search
  const searchInputRef = useRef<HTMLInputElement>(null);
  const inPageSearch = useInPageSearch({ inputRef: searchInputRef });
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  // Helper to clear picker state
  const clearPickerState = useClearPickerState();

  const handleCancel = () => {
    clearPickerState();
    navigate({ to: '/', search: {} });
  };

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

  // Sync all filter states from picker state when loaded
  useEffect(() => {
    if (!pickerState) return;

    // Sync search query
    if (pickerState.searchQuery !== undefined) {
      const query = pickerState.searchQuery;

      // Check if advanced mode based on wildcards
      if (query.startsWith('*') && query.endsWith('*') && query.length > 2) {
        setSearchQuery(query.slice(1, -1));
        setAdvancedMode(false);
      } else if (query.trim()) {
        setSearchQuery(query);
        setAdvancedMode(true);
      } else {
        setSearchQuery('');
        setAdvancedMode(false);
      }
    }

    // Sync filter states from server
    if (pickerState.videosOnly !== undefined) {
      setVideosOnly(pickerState.videosOnly);
    }
    if (pickerState.showHidden !== undefined) {
      setShowHidden(pickerState.showHidden);
    }
    if (pickerState.hideConverted !== undefined) {
      setHideConverted(pickerState.hideConverted);
    }
  }, [pickerState?.key]); // Only run when state key changes (new state loaded)

  // Transform search query based on mode settings
  const transformSearchQuery = (query: string): string => {
    if (!query.trim()) return '';

    // Advanced mode: use query as-is
    if (advancedMode) return query;

    // Simple mode: wrap with wildcards
    return `*${query}*`;
  };

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (pickerAction.isPending) return;

      const transformedQuery = transformSearchQuery(searchQuery);
      pickerAction.mutate({
        action: { type: 'search', query: transformedQuery },
        key: pickerState?.key,
      });
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery, advancedMode]); // Run when search query or advanced mode changes

  // Update showHidden setting immediately
  useEffect(() => {
    if (pickerAction.isPending || !pickerState || showHidden === undefined)
      return;

    pickerAction.mutate({
      action: { type: 'update-show-hidden', showHidden },
      key: pickerState.key,
    });
  }, [showHidden]); // Run when showHidden changes

  // Update hideConverted setting immediately
  useEffect(() => {
    if (pickerAction.isPending || !pickerState || hideConverted === undefined)
      return;

    pickerAction.mutate({
      action: { type: 'update-hide-converted', hideConverted },
      key: pickerState.key,
    });
  }, [hideConverted]); // Run when hideConverted changes

  // Update videosOnly setting immediately
  useEffect(() => {
    if (pickerAction.isPending || !pickerState || videosOnly === undefined)
      return;

    pickerAction.mutate({
      action: { type: 'update-videos-only', videosOnly },
      key: pickerState.key,
    });
  }, [videosOnly]); // Run when videosOnly changes

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

  const handleToggleFile = async (
    filePath: string,
    shiftKey: boolean = false,
  ) => {
    console.log('[CLIENT] handleToggleFile called', {
      filePath,
      shiftKey,
      lastClickedFilePath,
      isPending: pickerAction.isPending,
      currentKey: pickerState?.key,
    });
    if (pickerAction.isPending) return;

    // If shift is held and we have a previous click, do range selection
    if (shiftKey && lastClickedFilePath && lastClickedFilePath !== filePath) {
      const result = await pickerAction.mutateAsync({
        action: {
          type: 'select-range',
          startPath: lastClickedFilePath,
          endPath: filePath,
        },
        key: pickerState?.key,
      });
      console.log('[CLIENT] handleToggleFile (range) result', result);
    } else {
      // Normal toggle behavior
      const result = await pickerAction.mutateAsync({
        action: { type: 'toggle-file', path: filePath },
        key: pickerState?.key,
      });
      console.log('[CLIENT] handleToggleFile result', result);
    }

    // Update last clicked file path (for future shift-clicks)
    setLastClickedFilePath(filePath);
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

  // Find matched items based on in-page search query
  const matchedItems = useMemo(() => {
    if (!inPageSearch.query.trim() || !pickerState?.items) {
      return [];
    }

    const matched: FilePickerItem[] = [];
    pickerState.items.forEach((item) => {
      if (item.name.toLowerCase().includes(inPageSearch.query.toLowerCase())) {
        matched.push(item);
      }
    });

    return matched;
  }, [inPageSearch.query, pickerState?.items]);

  // Update total matches when matched items change
  useEffect(() => {
    inPageSearch.setTotalMatches(matchedItems.length);
  }, [matchedItems.length, inPageSearch]);

  // Scroll to the current match when it changes
  useEffect(() => {
    if (
      inPageSearch.isOpen &&
      inPageSearch.query.trim() &&
      matchedItems.length > 0
    ) {
      const currentMatch = matchedItems[inPageSearch.currentMatchIndex];
      if (currentMatch) {
        const element = itemRefs.current.get(currentMatch.path);
        if (element) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }
    }
  }, [
    inPageSearch.currentMatchIndex,
    inPageSearch.isOpen,
    inPageSearch.query,
    matchedItems,
  ]);

  // Check if a file is a converted video (ends with _converted.ext)
  const isConvertedFile = (name: string): boolean => {
    const nameWithoutExt = name.replace(/\.[^.]+$/, '');
    return nameWithoutExt.endsWith('_converted');
  };

  // Check if a file is a video file based on extension
  const isVideoFile = (name: string): boolean => {
    const videoExtensions = [
      '.mp4',
      '.mkv',
      '.avi',
      '.mov',
      '.wmv',
      '.flv',
      '.webm',
      '.m4v',
      '.mpg',
      '.mpeg',
      '.3gp',
      '.ogv',
      '.ts',
      '.m2ts',
    ];
    const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0];
    return ext ? videoExtensions.includes(ext) : false;
  };

  // Get the icon for a file/folder
  const getItemIcon = (item: FilePickerItem): React.ReactNode => {
    if (item.isDirectory) {
      if (item.allConverted)
        return (
          <FolderCheck
            size={16}
            className="text-green-600 dark:text-green-400"
          />
        ); // Fully converted folders
      return <Folder size={16} className="text-gray-600 dark:text-gray-400" />;
    }
    if (isConvertedFile(item.name))
      return (
        <FileCheck size={16} className="text-green-600 dark:text-green-400" />
      ); // Converted files
    if (item.hasConvertedVersion)
      return (
        <FileCheck size={16} className="text-green-600 dark:text-green-400" />
      ); // Server computed this
    if (isVideoFile(item.name))
      return (
        <FileVideo size={16} className="text-gray-600 dark:text-gray-400" />
      ); // Video files
    return <File size={16} className="text-gray-600 dark:text-gray-400" />; // Other files
  };

  const renderItem = (item: FilePickerItem) => {
    const isSelected = item.selectionState === 'full';
    const isIndeterminate = item.selectionState === 'partial';
    const isTopLevelFolder = item.isDirectory && item.depth === 0;
    const canInteract = !pickerAction.isPending && !isTopLevelFolder;
    const isExpanding = pickerAction.isPending;
    const isSearching = transformSearchQuery(searchQuery).trim() !== '';

    // Check if this item is the active match in the in-page search
    const isActiveMatch =
      inPageSearch.isOpen &&
      inPageSearch.query.trim() &&
      matchedItems.length > 0 &&
      matchedItems[inPageSearch.currentMatchIndex]?.path === item.path;

    const extraFileIndent = item.isDirectory ? 0 : 20;
    const paddingLeft = item.depth * 20 + 12 + extraFileIndent;

    return (
      <div key={item.path}>
        <div
          ref={(el) => {
            if (el) {
              itemRefs.current.set(item.path, el);
            } else {
              itemRefs.current.delete(item.path);
            }
          }}
          className={`flex items-center py-2 px-3 hover:bg-gray-100 dark:hover:bg-gray-700 ${
            isSelected
              ? 'bg-blue-50 dark:bg-blue-900/20'
              : isActiveMatch
                ? 'bg-blue-100 dark:bg-blue-800/40 ring-2 ring-blue-500 dark:ring-blue-400'
                : ''
          }`}
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          <div className="flex items-center flex-1 min-w-0">
            {item.isDirectory && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isSearching) {
                    handleToggleFolder(item.path);
                  }
                }}
                disabled={isExpanding || isSearching}
                className={`mr-2 w-4 h-4 flex items-center justify-center rounded ${
                  isSearching
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-600'
                } disabled:hover:bg-transparent ${isExpanding ? 'cursor-default' : ''}`}
                title={
                  isSearching
                    ? 'Cannot collapse folders while searching'
                    : undefined
                }
              >
                <span className="text-gray-500 text-xs">
                  {isSearching || item.isExpanded ? '▼' : '▶'}
                </span>
              </button>
            )}

            {/* Custom checkbox */}
            <button
              onClick={(e) => {
                if (!canInteract) return;
                // Prevent text selection when shift-clicking
                if (e.shiftKey) {
                  e.preventDefault();
                }
                if (item.isDirectory) {
                  handleToggleFolderSelection(item.path);
                } else {
                  handleToggleFile(item.path, e.shiftKey);
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
              onClick={(e) => {
                if (isExpanding) return;
                // Prevent text selection when shift-clicking
                if (e.shiftKey) {
                  e.preventDefault();
                }
                if (item.isDirectory) {
                  handleToggleFolder(item.path);
                } else {
                  handleToggleFile(item.path, e.shiftKey);
                }
              }}
            >
              <span className="mr-2">{getItemIcon(item)}</span>

              <span className="text-gray-900 dark:text-white truncate">
                {inPageSearch.query.trim() ? (
                  <Highlighter
                    searchWords={[inPageSearch.query]}
                    autoEscape={true}
                    textToHighlight={item.name}
                    highlightClassName={
                      isActiveMatch
                        ? 'bg-blue-400 dark:bg-blue-600 text-white'
                        : 'bg-yellow-200 dark:bg-yellow-700'
                    }
                  />
                ) : (
                  item.name
                )}
              </span>

              {!item.isDirectory && item.size !== undefined && (
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
      {/* In-page search */}
      {inPageSearch.isOpen && (
        <InPageSearch
          query={inPageSearch.query}
          onQueryChange={inPageSearch.setQuery}
          currentMatchIndex={inPageSearch.currentMatchIndex}
          totalMatches={inPageSearch.totalMatches}
          onNext={inPageSearch.nextMatch}
          onPrevious={inPageSearch.previousMatch}
          onClose={inPageSearch.closeSearch}
          showNativeWarning={inPageSearch.showNativeWarning}
          inputRef={searchInputRef}
        />
      )}

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
            onClick={handleCancel}
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

          {/* Search bar */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-600">
            <div className="flex gap-2 items-center">
              {/* Filter Menu */}
              <Menu.Root>
                <Menu.Trigger className="px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2">
                  Filters
                  <span className="text-xs">▼</span>
                </Menu.Trigger>
                <Menu.Positioner>
                  <Menu.Content className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-1 min-w-[200px] z-50">
                    <Menu.CheckboxItem
                      value="advanced-mode"
                      checked={advancedMode}
                      onCheckedChange={() => setAdvancedMode(!advancedMode)}
                      className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer flex items-center gap-3"
                    >
                      <div
                        className={`w-4 h-4 flex items-center justify-center border-2 rounded ${
                          advancedMode
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {advancedMode && (
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
                      </div>
                      <Menu.ItemText className="text-sm text-gray-900 dark:text-white">
                        Advanced Mode
                      </Menu.ItemText>
                    </Menu.CheckboxItem>
                    <Menu.CheckboxItem
                      value="videos-only"
                      checked={videosOnly && !advancedMode}
                      onCheckedChange={() => {
                        if (!advancedMode) {
                          setVideosOnly(!videosOnly);
                        }
                      }}
                      className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer flex items-center gap-3 ${advancedMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div
                        className={`w-4 h-4 flex items-center justify-center border-2 rounded ${
                          videosOnly && !advancedMode
                            ? 'bg-green-600 border-green-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {videosOnly && !advancedMode && (
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
                      </div>
                      <Menu.ItemText className="text-sm text-gray-900 dark:text-white">
                        Videos Only
                      </Menu.ItemText>
                    </Menu.CheckboxItem>
                    <Menu.CheckboxItem
                      value="show-hidden"
                      checked={showHidden}
                      onCheckedChange={() => setShowHidden(!showHidden)}
                      className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer flex items-center gap-3"
                    >
                      <div
                        className={`w-4 h-4 flex items-center justify-center border-2 rounded ${
                          showHidden
                            ? 'bg-purple-600 border-purple-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {showHidden && (
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
                      </div>
                      <Menu.ItemText className="text-sm text-gray-900 dark:text-white">
                        Show Hidden Files
                      </Menu.ItemText>
                    </Menu.CheckboxItem>
                    <Menu.CheckboxItem
                      value="hide-converted"
                      checked={hideConverted}
                      onCheckedChange={() => setHideConverted(!hideConverted)}
                      className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer flex items-center gap-3"
                    >
                      <div
                        className={`w-4 h-4 flex items-center justify-center border-2 rounded ${
                          hideConverted
                            ? 'bg-orange-600 border-orange-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {hideConverted && (
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
                      </div>
                      <Menu.ItemText className="text-sm text-gray-900 dark:text-white">
                        Hide Converted Videos
                      </Menu.ItemText>
                    </Menu.CheckboxItem>
                  </Menu.Content>
                </Menu.Positioner>
              </Menu.Root>

              {/* Search input */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={pickerAction.isPending}
                placeholder={
                  advancedMode
                    ? 'Search files (e.g., *.mp4, 2024-*.{mp4,mkv})'
                    : videosOnly
                      ? 'Search video files (e.g., charlie, 2024-)'
                      : 'Search files (e.g., charlie, 2024-)'
                }
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => setIsSearchHelpOpen(true)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                title="Search pattern help"
              >
                <HelpCircle size={18} />
                <span className="hidden sm:inline">Help</span>
              </button>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border-b border-gray-200 dark:border-gray-600 select-none">
            <AppErrorBoundary>
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
            </AppErrorBoundary>
          </div>

          <div className="p-6 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {pickerState?.selectedCount || 0} file
                {pickerState?.selectedCount !== 1 ? 's' : ''} selected
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
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
                  className="w-24 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {pickerAction.isPending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Continue'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SearchHelpModal
        isOpen={isSearchHelpOpen}
        onClose={() => setIsSearchHelpOpen(false)}
      />
    </div>
  );
}
