'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FileSystemItem } from '@/app/api/files/route';
import { ConversionConfig } from './conversion-config';
import { ConversionOptions } from '@/types/conversion';

interface FileBrowserModalProps {
  isOpen: boolean;
  selectedFiles: string[];
  currentStep: 'select' | 'configure';
  onClose: () => void;
  onContinue: (selectedFiles: string[]) => void;
  onGoBack: () => void;
  onStartConversion?: (options: ConversionOptions) => void;
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
}: FileBrowserModalProps) {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedFilesSet, setSelectedFilesSet] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Sync selectedFiles prop with internal state
  useEffect(() => {
    setSelectedFilesSet(new Set(selectedFiles));
  }, [selectedFiles]);

  const loadDirectory = useCallback(async (path: string) => {
    try {
      setIsLoading(true);
      setError('');
      const response = await fetch(
        `/api/files?path=${encodeURIComponent(path)}`,
      );

      if (!response.ok) {
        throw new Error('Failed to load directory');
      }

      const data = await response.json();

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
    (filePath: string, isDirectory: boolean) => {
      if (isDirectory) {
        // Handle folder selection - select all files in folder
        const allFilesInFolder = getAllFilesInFolder(treeData, filePath);
        setSelectedFilesSet((prev) => {
          const newSelected = new Set(prev);
          const folderSelected = allFilesInFolder.every((file) =>
            newSelected.has(file),
          );

          if (folderSelected) {
            // Deselect all files in folder
            allFilesInFolder.forEach((file) => newSelected.delete(file));
          } else {
            // Select all files in folder
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
    [treeData],
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

  const isFolderSelected = (folderPath: string) => {
    const filesInFolder = getAllFilesInFolder(treeData, folderPath);
    return (
      filesInFolder.length > 0 &&
      filesInFolder.every((file) => selectedFilesSet.has(file))
    );
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

    return (
      <div key={node.path}>
        <div
          className={`flex items-center py-2 px-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
            isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
          }`}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
          onClick={() => handleFileSelect(node.path, node.isDirectory)}
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
              onChange={() => {}}
              className="mr-3"
              onClick={(e) => e.stopPropagation()}
            />

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

        {node.isDirectory && node.isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

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
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep === 'select'
                    ? 'bg-blue-600 text-white'
                    : 'bg-green-600 text-white'
                }`}
              >
                1
              </div>
              <div className="w-8 h-1 bg-gray-300 dark:bg-gray-600"></div>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep === 'configure'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                }`}
              >
                2
              </div>
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
                <div>{treeData.map((node) => renderTreeNode(node))}</div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <ConversionConfig
                selectedFiles={selectedFiles}
                onOptionsChange={() => {
                  // Options are automatically saved in the component
                }}
                onStartConversion={(options) => {
                  onStartConversion?.(options);
                }}
              />
            </div>
          )}
        </div>

        {currentStep === 'select' && (
          <div className="p-6 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedFilesSet.size} file{selectedFilesSet.size !== 1 ? 's' : ''}{' '}
                selected
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
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}{' '}
                selected for conversion
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>

                <button
                  onClick={onGoBack}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
