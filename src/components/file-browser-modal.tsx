import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FileSystemItem } from '@/types/files';
import { ConversionConfig } from './conversion-config';
import { ConversionOptions } from '@/types/conversion';
import { fetchFiles } from '@/lib/api';
import { Virtuoso } from 'react-virtuoso';

interface FileBrowserModalProps {
  isOpen: boolean;
  selectedFiles: string[];
  currentStep: 'select' | 'configure';
  onClose: () => void;
  onContinue: (selectedFiles: string[]) => void;
  onGoBack: () => void;
  onStartConversion?: (options: ConversionOptions) => void;
  onFilesChange?: (files: string[]) => void;
}

interface TreeNode extends FileSystemItem {
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
}

const updateTreeWithChildren = (
  tree: TreeNode[],
  targetPath: string,
  children: FileSystemItem[],
): TreeNode[] => {
  return tree.map((node) => {
    if (node.path === targetPath && node.isDirectory) {
      return {
        ...node,
        children: children.map((child) => ({
          ...child,
          isExpanded: false,
          isLoading: false,
        })),
        isLoading: false,
      };
    }
    if (node.children) {
      return {
        ...node,
        children: updateTreeWithChildren(node.children, targetPath, children),
      };
    }
    return node;
  });
};

const markNodeAsLoading = (
  tree: TreeNode[],
  targetPath: string,
  loading: boolean,
): TreeNode[] => {
  return tree.map((node) => {
    if (node.path === targetPath) {
      return { ...node, isLoading: loading };
    }
    if (node.children) {
      return {
        ...node,
        children: markNodeAsLoading(node.children, targetPath, loading),
      };
    }
    return node;
  });
};

const toggleNodeExpanded = (
  tree: TreeNode[],
  targetPath: string,
): TreeNode[] => {
  return tree.map((node) => {
    if (node.path === targetPath) {
      return { ...node, isExpanded: !node.isExpanded };
    }
    if (node.children) {
      return {
        ...node,
        children: toggleNodeExpanded(node.children, targetPath),
      };
    }
    return node;
  });
};

export function FileBrowserModal({
  isOpen,
  selectedFiles,
  currentStep,
  onClose,
  onContinue,
  onGoBack,
  onStartConversion,
  onFilesChange,
}: FileBrowserModalProps) {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedFilesSet, setSelectedFilesSet] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [loadingFolderPath, setLoadingFolderPath] = useState<string | null>(
    null,
  );
  const [conversionOptions, setConversionOptions] =
    useState<ConversionOptions | null>(null);

  // Sync selectedFiles prop with internal state
  useEffect(() => {
    setSelectedFilesSet(new Set(selectedFiles));
  }, [selectedFiles]);

  const loadDirectory = useCallback(async (path: string) => {
    try {
      setIsLoading(true);
      setError('');
      const data = await fetchFiles(path);

      if (path === '') {
        // Initial load
        setTreeData(
          data.items.map((item: FileSystemItem) => ({
            ...item,
            isExpanded: false,
            isLoading: false,
          })),
        );
      } else {
        // Update existing tree with children
        setTreeData((prev) => updateTreeWithChildren(prev, path, data.items));
      }
    } catch (err) {
      setError('Failed to load directory contents');
      console.error('Error loading directory:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load initial directory
  useEffect(() => {
    if (isOpen && currentStep === 'select') {
      loadDirectory('');
    }
  }, [isOpen, currentStep, loadDirectory]);

  // Eagerly load folders containing pre-selected files
  useEffect(() => {
    if (!isOpen || currentStep !== 'select' || selectedFiles.length === 0) {
      return;
    }

    // Extract unique parent directories from selected files
    const parentDirs = new Set<string>();
    selectedFiles.forEach((file) => {
      const parts = file.split('/');
      // Build all parent paths
      for (let i = 1; i < parts.length; i++) {
        const parentPath = parts.slice(0, i).join('/');
        if (parentPath) {
          parentDirs.add(parentPath);
        }
      }
    });

    // Load and expand each parent directory
    const loadParents = async () => {
      for (const dir of Array.from(parentDirs).sort()) {
        await loadDirectory(dir);
        setTreeData((prev) => {
          // Find and expand the directory
          const expandNode = (nodes: TreeNode[]): TreeNode[] => {
            return nodes.map((node) => {
              if (node.path === dir) {
                return { ...node, isExpanded: true };
              }
              if (node.children) {
                return { ...node, children: expandNode(node.children) };
              }
              return node;
            });
          };
          return expandNode(prev);
        });
      }
    };

    loadParents();
  }, [isOpen, currentStep, selectedFiles, loadDirectory]);

  const findNode = useCallback(
    (tree: TreeNode[], targetPath: string): TreeNode | null => {
      for (const node of tree) {
        if (node.path === targetPath) {
          return node;
        }
        if (node.children) {
          const found = findNode(node.children, targetPath);
          if (found) return found;
        }
      }
      return null;
    },
    [],
  );

  const recursivelyLoadFolder = useCallback(
    async (
      folderPath: string,
    ): Promise<{ files: string[]; tree: TreeNode[] }> => {
      const files: string[] = [];

      try {
        const data = await fetchFiles(folderPath);
        const treeNodes: TreeNode[] = [];

        for (const item of data.items) {
          if (item.isDirectory) {
            // Recursively load subdirectory
            const subResult = await recursivelyLoadFolder(item.path);
            files.push(...subResult.files);
            treeNodes.push({
              ...item,
              isExpanded: true,
              isLoading: false,
              children: subResult.tree,
            });
          } else {
            files.push(item.path);
            treeNodes.push({
              ...item,
              isExpanded: false,
              isLoading: false,
            });
          }
        }

        return { files, tree: treeNodes };
      } catch (err) {
        console.error('Error loading folder:', err);
        return { files: [], tree: [] };
      }
    },
    [],
  );

  const toggleDirectory = useCallback(
    async (node: TreeNode) => {
      if (!node.isDirectory) return;

      if (!node.isExpanded) {
        // Mark as loading
        setTreeData((prev) => markNodeAsLoading(prev, node.path, true));
        await loadDirectory(node.path);
      }

      // Toggle expanded state
      setTreeData((prev) => toggleNodeExpanded(prev, node.path));
    },
    [loadDirectory],
  );

  const handleFileSelect = useCallback(
    async (filePath: string, isDirectory: boolean) => {
      if (isDirectory) {
        // Handle folder selection
        let allFilesInFolder = getAllFilesInFolder(treeData, filePath);

        // If folder has no children loaded or is not expanded, recursively fetch all files
        const node = findNode(treeData, filePath);
        if (node && (!node.children || node.children.length === 0)) {
          setLoadingFolderPath(filePath);
          const result = await recursivelyLoadFolder(filePath);
          allFilesInFolder = result.files;

          // Update tree with loaded children and mark as expanded
          setTreeData((prev) => {
            const updateNode = (nodes: TreeNode[]): TreeNode[] => {
              return nodes.map((n) => {
                if (n.path === filePath) {
                  return {
                    ...n,
                    children: result.tree,
                    isExpanded: true,
                    isLoading: false,
                  };
                }
                if (n.children) {
                  return { ...n, children: updateNode(n.children) };
                }
                return n;
              });
            };
            return updateNode(prev);
          });

          setLoadingFolderPath(null);
        }

        setSelectedFilesSet((prev) => {
          const newSelected = new Set(prev);

          // Calculate folder state
          const selectedCount = allFilesInFolder.filter((file) =>
            prev.has(file),
          ).length;
          const allSelected =
            allFilesInFolder.length > 0 &&
            selectedCount === allFilesInFolder.length;

          if (allSelected) {
            // All files selected - deselect all
            allFilesInFolder.forEach((file) => newSelected.delete(file));
          } else {
            // None or some files selected - select all
            allFilesInFolder.forEach((file) => newSelected.add(file));
          }

          return newSelected;
        });
      } else {
        // Handle individual file selection
        setSelectedFilesSet((prev) => {
          const newSelected = new Set(prev);
          if (newSelected.has(filePath)) {
            newSelected.delete(filePath);
          } else {
            newSelected.add(filePath);
          }

          return newSelected;
        });
      }
    },
    [treeData, findNode, recursivelyLoadFolder],
  );

  const getAllFilesInFolder = (
    tree: TreeNode[],
    folderPath: string,
  ): string[] => {
    const files: string[] = [];

    const searchNode = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.path === folderPath && node.children) {
          const collectFiles = (children: TreeNode[]) => {
            for (const child of children) {
              if (!child.isDirectory) {
                files.push(child.path);
              }
              if (child.children) {
                collectFiles(child.children);
              }
            }
          };
          collectFiles(node.children);
          break;
        }
        if (node.children) {
          searchNode(node.children);
        }
      }
    };

    searchNode(tree);
    return files;
  };

  const isFileSelected = (filePath: string) => selectedFilesSet.has(filePath);

  const getFolderSelectionState = (
    folderPath: string,
  ): 'none' | 'some' | 'all' => {
    const filesInFolder = getAllFilesInFolder(treeData, folderPath);
    if (filesInFolder.length === 0) return 'none';

    const selectedCount = filesInFolder.filter((file) =>
      selectedFilesSet.has(file),
    ).length;

    if (selectedCount === 0) return 'none';
    if (selectedCount === filesInFolder.length) return 'all';
    return 'some';
  };

  const isFolderSelected = (folderPath: string) => {
    return getFolderSelectionState(folderPath) === 'all';
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Flatten tree structure for virtualization
  const flattenedTree = useMemo(() => {
    const flattened: Array<{ node: TreeNode; depth: number }> = [];

    const flatten = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        flattened.push({ node, depth });
        if (node.isDirectory && node.isExpanded && node.children) {
          flatten(node.children, depth + 1);
        }
      }
    };

    flatten(treeData, 0);
    return flattened;
  }, [treeData]);

  const renderTreeNode = useCallback(
    (index: number) => {
      const { node, depth } = flattenedTree[index];
      const isSelected = node.isDirectory
        ? isFolderSelected(node.path)
        : isFileSelected(node.path);
      const folderState = node.isDirectory
        ? getFolderSelectionState(node.path)
        : null;
      const isIndeterminate = folderState === 'some';
      const isTopLevelFolder = node.isDirectory && depth === 0;

      // Add extra indentation for files (non-directories)
      const extraFileIndent = node.isDirectory ? 0 : 20;

      return (
        <div
          className={`flex items-center py-2 px-3 hover:bg-gray-100 dark:hover:bg-gray-700 ${
            isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
          }`}
          style={{ paddingLeft: `${depth * 20 + 12 + extraFileIndent}px` }}
        >
          <div className="flex items-center flex-1 min-w-0">
            {node.isDirectory && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDirectory(node);
                }}
                className="mr-2 w-4 h-4 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              >
                {node.isLoading ? (
                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-gray-500 text-xs">
                    {node.isExpanded ? '▼' : '▶'}
                  </span>
                )}
              </button>
            )}

            <input
              type="checkbox"
              checked={isSelected}
              disabled={isTopLevelFolder}
              ref={(el) => {
                if (el) {
                  el.indeterminate = isIndeterminate;
                }
              }}
              onChange={() => handleFileSelect(node.path, node.isDirectory)}
              className={`mr-3 ${isTopLevelFolder ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            />

            <div
              className="flex items-center flex-1 min-w-0 cursor-pointer"
              onClick={() => {
                if (node.isDirectory) {
                  toggleDirectory(node);
                } else {
                  handleFileSelect(node.path, false);
                }
              }}
            >
              <span className="mr-2">{node.isDirectory ? '📁' : '📄'}</span>

              <span className="text-gray-900 dark:text-white truncate">
                {node.name}
              </span>

              {!node.isDirectory && node.size && (
                <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                  {formatFileSize(node.size)}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    },
    [
      flattenedTree,
      isFolderSelected,
      isFileSelected,
      getFolderSelectionState,
      handleFileSelect,
      toggleDirectory,
    ],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-5/6 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {currentStep === 'select'
                ? 'Select Files for Conversion'
                : 'Configure Conversion'}
            </h2>

            {/* Step indicator */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  console.log('Breadcrumb 1 clicked', {
                    currentStep,
                    disabled: currentStep === 'select',
                  });
                  onGoBack();
                }}
                disabled={currentStep === 'select'}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  currentStep === 'select'
                    ? 'bg-blue-600 text-white cursor-default'
                    : 'bg-green-600 text-white hover:bg-green-700 cursor-pointer'
                }`}
              >
                1
              </button>
              <div className="w-8 h-1 bg-gray-300 dark:bg-gray-600"></div>
              <button
                onClick={() => {
                  console.log('Breadcrumb 2 clicked', {
                    currentStep,
                    selectedFilesLength: selectedFiles.length,
                  });
                  if (currentStep === 'select' && selectedFiles.length > 0) {
                    onContinue(selectedFiles);
                  }
                }}
                disabled={
                  currentStep === 'configure' || selectedFiles.length === 0
                }
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  currentStep === 'configure'
                    ? 'bg-blue-600 text-white cursor-default'
                    : selectedFiles.length > 0
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 hover:bg-blue-600 hover:text-white cursor-pointer'
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                }`}
              >
                2
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {error && (
            <div className="m-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {loadingFolderPath && (
            <div className="mx-4 mt-4 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded flex items-center">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3" />
              <span>Loading all files in folder...</span>
            </div>
          )}

          {currentStep === 'select' ? (
            <div className="flex-1 overflow-y-auto border-b border-gray-200 dark:border-gray-600">
              {isLoading && treeData.length === 0 ? (
                <div className="flex items-center justify-center p-8">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-3 text-gray-600 dark:text-gray-400">
                    Loading files...
                  </span>
                </div>
              ) : (
                <Virtuoso
                  style={{ height: '100%' }}
                  totalCount={flattenedTree.length}
                  itemContent={renderTreeNode}
                />
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <ConversionConfig
                selectedFiles={selectedFiles}
                onOptionsChange={(options) => {
                  setConversionOptions(options);
                }}
                onStartConversion={(options) => {
                  onStartConversion?.(options);
                }}
                onFilesChange={(files) => {
                  onFilesChange?.(files);
                }}
              />
            </div>
          )}
        </div>

        {currentStep === 'select' && (
          <div className="p-6 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedFilesSet.size} file
                {selectedFilesSet.size !== 1 ? 's' : ''} selected
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>

                <button
                  onClick={() => {
                    onContinue(Array.from(selectedFilesSet));
                  }}
                  disabled={selectedFilesSet.size === 0}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'configure' && (
          <div className="p-6 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <button
                onClick={onGoBack}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Back
              </button>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>

                <button
                  onClick={() => {
                    if (conversionOptions) {
                      onStartConversion?.(conversionOptions);
                    }
                  }}
                  disabled={!conversionOptions || selectedFiles.length === 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Start Conversion
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
