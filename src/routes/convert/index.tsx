import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useCallback, useRef, useEffect } from 'react';
import { FileSystemItem } from '@/types/files';
import { useFileSelections, useSaveFileSelections } from '@/lib/api-hooks';
import { fetchFiles } from '@/lib/api';

export const Route = createFileRoute('/convert/')({
  component: ConvertPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      key: (search.key as string) || undefined,
    };
  },
});

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

function ConvertPage() {
  const navigate = useNavigate();
  const { key: urlKey } = Route.useSearch();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedFilesSet, setSelectedFilesSet] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [loadingFolderPath, setLoadingFolderPath] = useState<string | null>(
    null,
  );
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load file selections using TanStack Query
  const { data: fileSelectionsData, isLoading: isLoadingSelections } =
    useFileSelections(urlKey);

  const saveFileSelectionsMutation = useSaveFileSelections();

  const loadDirectory = useCallback(async (path: string) => {
    try {
      setIsLoading(true);
      setError('');
      const data = await fetchFiles(path);

      if (path === '') {
        setTreeData(
          data.items.map((item: FileSystemItem) => ({
            ...item,
            isExpanded: false,
            isLoading: false,
          })),
        );
      } else {
        setTreeData((prev) => updateTreeWithChildren(prev, path, data.items));
      }
    } catch (err) {
      setError('Failed to load directory contents');
      console.error('Error loading directory:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync file selections from query to local state
  useEffect(() => {
    if (fileSelectionsData?.files) {
      setSelectedFilesSet(new Set(fileSelectionsData.files));
    }
  }, [fileSelectionsData]);

  useEffect(() => {
    loadDirectory('');
  }, [loadDirectory]);

  // Eagerly load folders containing pre-selected files
  useEffect(() => {
    const files = Array.from(selectedFilesSet);
    if (files.length === 0 || isLoadingSelections) return;

    const parentDirs = new Set<string>();
    files.forEach((file) => {
      const parts = file.split('/');
      for (let i = 1; i < parts.length; i++) {
        const parentPath = parts.slice(0, i).join('/');
        if (parentPath) {
          parentDirs.add(parentPath);
        }
      }
    });

    const loadParents = async () => {
      for (const dir of Array.from(parentDirs).sort()) {
        await loadDirectory(dir);
        setTreeData((prev) => {
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
  }, [selectedFilesSet, loadDirectory, isLoadingSelections]);

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

  // Debounced save function
  const saveFileSelections = useCallback(
    (files: string[]) => {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const data = await saveFileSelectionsMutation.mutateAsync({
            files,
          });
          navigate({
            to: '/convert',
            search: { key: data.key },
            replace: true,
          });
        } catch (error) {
          console.error('Error saving file selections:', error);
        }
      }, 15000); // 15 seconds debounce
    },
    [navigate, saveFileSelectionsMutation],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

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
        setTreeData((prev) => markNodeAsLoading(prev, node.path, true));
        await loadDirectory(node.path);
      }

      setTreeData((prev) => toggleNodeExpanded(prev, node.path));
    },
    [loadDirectory],
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

  const handleFileSelect = useCallback(
    async (filePath: string, isDirectory: boolean) => {
      if (isDirectory) {
        let allFilesInFolder = getAllFilesInFolder(treeData, filePath);

        const node = findNode(treeData, filePath);
        if (node && (!node.children || node.children.length === 0)) {
          setLoadingFolderPath(filePath);
          const result = await recursivelyLoadFolder(filePath);
          allFilesInFolder = result.files;

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

          const selectedCount = allFilesInFolder.filter((file) =>
            prev.has(file),
          ).length;
          const allSelected =
            allFilesInFolder.length > 0 &&
            selectedCount === allFilesInFolder.length;

          if (allSelected) {
            allFilesInFolder.forEach((file) => newSelected.delete(file));
          } else {
            allFilesInFolder.forEach((file) => newSelected.add(file));
          }

          saveFileSelections(Array.from(newSelected));
          return newSelected;
        });
      } else {
        setSelectedFilesSet((prev) => {
          const newSelected = new Set(prev);
          if (newSelected.has(filePath)) {
            newSelected.delete(filePath);
          } else {
            newSelected.add(filePath);
          }

          saveFileSelections(Array.from(newSelected));
          return newSelected;
        });
      }
    },
    [treeData, findNode, recursivelyLoadFolder, saveFileSelections],
  );

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

  const renderTreeNode = (node: TreeNode, depth = 0) => {
    const isSelected = node.isDirectory
      ? isFolderSelected(node.path)
      : isFileSelected(node.path);
    const folderState = node.isDirectory
      ? getFolderSelectionState(node.path)
      : null;
    const isIndeterminate = folderState === 'some';
    const isTopLevelFolder = node.isDirectory && depth === 0;

    const extraFileIndent = node.isDirectory ? 0 : 20;

    return (
      <div key={node.path}>
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

        {node.isDirectory && node.isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleContinue = async () => {
    // Force save immediately before navigating
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const files = Array.from(selectedFilesSet);

    try {
      const data = await saveFileSelectionsMutation.mutateAsync({
        files,
      });
      navigate({
        to: '/convert/configure',
        search: { key: data.key },
      });
    } catch (error) {
      console.error('Error saving file selections:', error);
      // Still navigate even if save fails
      navigate({
        to: '/convert/configure',
        search: { key: urlKey },
      });
    }
  };

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl mx-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Select Files for Conversion
          </h1>
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
              {error}
            </div>
          )}

          {loadingFolderPath && (
            <div className="mx-4 mt-4 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded flex items-center">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3" />
              <span>Loading all files in folder...</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto border-b border-gray-200 dark:border-gray-600">
            {isLoading && treeData.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-gray-600 dark:text-gray-400">
                  Loading files...
                </span>
              </div>
            ) : (
              <div>{treeData.map((node) => renderTreeNode(node))}</div>
            )}
          </div>

          <div className="p-6 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedFilesSet.size} file
                {selectedFilesSet.size !== 1 ? 's' : ''} selected
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
                  disabled={selectedFilesSet.size === 0}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
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
