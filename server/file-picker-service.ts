/**
 * File picker state management service
 * Handles server-side state for the file picker UI
 */

import { query, queryOne, execute } from './database';
import { FileSelection } from '../src/types/database';
import { FilePickerItem, FilePickerState } from '../src/types/files';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import micromatch from 'micromatch';
import { orderBy } from 'natural-orderby';
import { stripLeadingArticles } from './sort-utils';

const VIDEO_EXTENSIONS = [
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
  '.mts',
  '.m2ts',
];

interface PickerStateData {
  selectedFiles: Set<string>;
  expandedFolders: Set<string>;
  currentPath: string;
  config?: any;
  searchQuery?: string;
  showHidden?: boolean;
  hideConverted?: boolean;
  videosOnly?: boolean;
}

export class FilePickerStateService {
  /**
   * Generate a unique state key based on the state data
   */
  private static generateKey(state: PickerStateData): string {
    const data = {
      selected: Array.from(state.selectedFiles).sort(),
      expanded: Array.from(state.expandedFolders).sort(),
      path: state.currentPath,
      search: state.searchQuery || '',
      showHidden: state.showHidden || false,
      hideConverted:
        state.hideConverted !== undefined ? state.hideConverted : true,
      videosOnly: state.videosOnly || false,
    };
    const json = JSON.stringify(data);
    return crypto.createHash('sha256').update(json).digest('base64url');
  }

  /**
   * Save picker state to database and return the key
   */
  static save(state: PickerStateData): string {
    const key = this.generateKey(state);
    // NOTE: The 'data' JSON field contains all picker state settings.
    // Add new properties here rather than creating new columns.
    const dataJson = JSON.stringify({
      selectedFiles: Array.from(state.selectedFiles),
      expandedFolders: Array.from(state.expandedFolders),
      currentPath: state.currentPath,
      config: state.config,
      searchQuery: state.searchQuery,
      showHidden: state.showHidden || false,
      hideConverted:
        state.hideConverted !== undefined ? state.hideConverted : true,
      videosOnly: state.videosOnly || false,
    });

    execute(`INSERT OR REPLACE INTO file_selections (id, data) VALUES (?, ?)`, [
      key,
      dataJson,
    ]);

    return key;
  }

  /**
   * Get picker state by key
   */
  static get(key: string): PickerStateData | null {
    const result = queryOne<FileSelection>(
      'SELECT data FROM file_selections WHERE id = ?',
      [key],
    );

    if (!result) return null;

    try {
      const data = JSON.parse(result.data);

      return {
        selectedFiles: new Set<string>(data.selectedFiles || []),
        expandedFolders: new Set<string>(data.expandedFolders || []),
        currentPath: data.currentPath || '',
        config: data.config,
        searchQuery: data.searchQuery,
        showHidden: data.showHidden || false,
        hideConverted:
          data.hideConverted !== undefined ? data.hideConverted : true,
        videosOnly: data.videosOnly || false,
      };
    } catch (error) {
      console.error('Failed to parse picker state:', error);
      return null;
    }
  }

  /**
   * Create a new empty picker state
   */
  static createEmpty(): PickerStateData {
    return {
      selectedFiles: new Set(),
      expandedFolders: new Set(),
      currentPath: '',
      config: undefined,
      videosOnly: true,
      hideConverted: true,
      showHidden: false,
    };
  }

  /**
   * Get the base path for file browsing (from env or default)
   */
  private static getBasePath(): string {
    return process.env.FRAME_SHIFT_HOME || process.env.HOME || process.cwd();
  }

  /**
   * List files and directories in a path
   */
  private static listDirectory(
    dirPath: string,
    showHidden: boolean = false,
    videosOnly: boolean = false,
  ): FilePickerItem[] {
    const basePath = this.getBasePath();
    const fullPath = path.join(basePath, dirPath);

    // Security check: ensure path is within base path
    const resolvedPath = path.resolve(fullPath);
    const resolvedBase = path.resolve(basePath);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error('Access denied: path outside allowed directory');
    }

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const items = entries
        .filter((entry) => {
          // Filter hidden files
          if (!showHidden && entry.name.startsWith('.')) return false;
          // Filter non-video files if videosOnly is enabled
          if (videosOnly && entry.isFile() && !this.isVideoFile(entry.name))
            return false;
          return true;
        })
        .map((entry) => {
          const itemPath = path.join(dirPath, entry.name);
          const fullItemPath = path.join(fullPath, entry.name);
          const stats = fs.statSync(fullItemPath);

          return {
            name: entry.name,
            path: itemPath,
            isDirectory: entry.isDirectory(),
            size: entry.isFile() ? stats.size : undefined,
            modified: stats.mtime.toISOString(),
            depth: 0,
            selectionState: 'none' as const,
          };
        });

      // Sort directories first, then files, using natural sort
      const directories = items.filter((item) => item.isDirectory);
      const files = items.filter((item) => !item.isDirectory);

      const sortedDirs = orderBy(
        directories,
        [(item) => stripLeadingArticles(item.name)],
        ['asc'],
      );
      const sortedFiles = orderBy(
        files,
        [(item) => stripLeadingArticles(item.name)],
        ['asc'],
      );

      return [...sortedDirs, ...sortedFiles];
    } catch (error) {
      console.error(`Failed to list directory ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Recursively scan a folder to get all file paths, respecting filters
   */
  private static scanFolderForFilesWithFilters(
    folderPath: string,
    showHidden: boolean,
    hideConverted: boolean,
    videosOnly: boolean = false,
    searchQuery?: string,
  ): string[] {
    const basePath = this.getBasePath();
    const fullPath = path.join(basePath, folderPath);
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files if showHidden is false
        if (!showHidden && entry.name.startsWith('.')) continue;

        const itemPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively get files from subdirectory
          files.push(
            ...this.scanFolderForFilesWithFilters(
              itemPath,
              showHidden,
              hideConverted,
              videosOnly,
              searchQuery,
            ),
          );
        } else {
          // Skip non-video files if videosOnly is enabled
          if (videosOnly && !this.isVideoFile(entry.name)) continue;

          // Skip converted files if hideConverted is true
          if (hideConverted && this.isConvertedFile(entry.name)) continue;

          // Skip files that don't match search query if provided
          if (
            searchQuery &&
            searchQuery.trim() &&
            !micromatch.isMatch(entry.name, searchQuery, { nocase: true })
          ) {
            continue;
          }

          files.push(itemPath);
        }
      }
    } catch (error) {
      console.error(`Failed to scan folder ${folderPath}:`, error);
    }

    return files;
  }

  /**
   * Recursively scan directory tree and filter by search pattern
   */
  private static scanDirectoryWithSearch(
    dirPath: string,
    searchPattern: string,
    showHidden: boolean = false,
    videosOnly: boolean = false,
  ): FilePickerItem[] {
    const basePath = this.getBasePath();
    const fullPath = path.join(basePath, dirPath);
    const results: FilePickerItem[] = [];

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });

      // Sort entries naturally: directories first, then files
      const directories = entries.filter((entry) => entry.isDirectory());
      const files = entries.filter((entry) => entry.isFile());
      const sortedDirs = orderBy(
        directories,
        [(entry) => stripLeadingArticles(entry.name)],
        ['asc'],
      );
      const sortedFiles = orderBy(
        files,
        [(entry) => stripLeadingArticles(entry.name)],
        ['asc'],
      );
      const sortedEntries = [...sortedDirs, ...sortedFiles];

      for (const entry of sortedEntries) {
        // Skip hidden files unless showHidden is true
        if (!showHidden && entry.name.startsWith('.')) continue;

        const itemPath = path.join(dirPath, entry.name);
        const fullItemPath = path.join(fullPath, entry.name);

        try {
          const stats = fs.statSync(fullItemPath);

          if (entry.isDirectory()) {
            // Recursively search subdirectories
            const subResults = this.scanDirectoryWithSearch(
              itemPath,
              searchPattern,
              showHidden,
              videosOnly,
            );

            // Only include directory if it has matching descendants
            if (subResults.length > 0) {
              results.push({
                name: entry.name,
                path: itemPath,
                isDirectory: true,
                size: undefined,
                modified: stats.mtime.toISOString(),
                depth: 0,
                selectionState: 'none',
              });
              results.push(...subResults);
            }
          } else {
            // Skip non-video files if videosOnly is enabled
            if (videosOnly && !this.isVideoFile(entry.name)) continue;

            // Check if file matches the search pattern (case insensitive)
            if (
              micromatch.isMatch(entry.name, searchPattern, { nocase: true })
            ) {
              results.push({
                name: entry.name,
                path: itemPath,
                isDirectory: false,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                depth: 0,
                selectionState: 'none',
              });
            }
          }
        } catch (error) {
          // Skip files we can't access
          console.warn(`Could not access ${entry.name}:`, error);
        }
      }
    } catch (error) {
      console.error(`Failed to scan directory ${dirPath}:`, error);
    }

    return results;
  }

  /**
   * Check if a file is a video based on extension
   */
  private static isVideoFile(name: string): boolean {
    const ext = path.extname(name).toLowerCase();
    return VIDEO_EXTENSIONS.includes(ext);
  }

  /**
   * Check if a file is a converted video (ends with _converted.ext)
   */
  private static isConvertedFile(name: string): boolean {
    const nameWithoutExt = name.replace(/\.[^.]+$/, '');
    return nameWithoutExt.endsWith('_converted');
  }

  /**
   * Check if a file has a converted version in the given items list
   */
  private static hasConvertedVersion(
    item: FilePickerItem,
    allItems: FilePickerItem[],
  ): boolean {
    if (item.isDirectory) return false;

    const nameWithoutExt = item.name.replace(/\.[^.]+$/, '');
    const itemDir = item.path.substring(0, item.path.lastIndexOf('/'));

    // Check if any file with the pattern <name>_converted.<any-ext> exists in the same directory
    return allItems.some((otherItem) => {
      if (otherItem.isDirectory || otherItem.path === item.path) return false;

      const otherNameWithoutExt = otherItem.name.replace(/\.[^.]+$/, '');
      const otherDir = otherItem.path.substring(
        0,
        otherItem.path.lastIndexOf('/'),
      );

      // Check if it's in the same directory and has the _converted suffix
      return (
        otherDir === itemDir &&
        otherNameWithoutExt === `${nameWithoutExt}_converted`
      );
    });
  }

  /**
   * Build the flat list of items to render based on current state
   */
  static buildItemsList(state: PickerStateData): FilePickerItem[] {
    const hideConverted =
      state.hideConverted !== undefined ? state.hideConverted : true;
    const videosOnly = state.videosOnly || false;

    // If search query is present, use search mode
    if (state.searchQuery && state.searchQuery.trim()) {
      const searchResults = this.scanDirectoryWithSearch(
        '',
        state.searchQuery,
        state.showHidden || false,
        videosOnly,
      );

      // Build a map of folder -> all descendant files for efficient selection state calculation
      // This avoids rescanning the same folders multiple times
      const folderToFiles = new Map<string, string[]>();

      for (const item of searchResults) {
        if (!item.isDirectory) {
          // Add this file to all ancestor folders in the map
          const parts = item.path.split('/');
          for (let i = 0; i < parts.length; i++) {
            const folderPath = i === 0 ? '' : parts.slice(0, i).join('/');
            if (!folderToFiles.has(folderPath)) {
              folderToFiles.set(folderPath, []);
            }
            folderToFiles.get(folderPath)!.push(item.path);
          }
        }
      }

      // Calculate depths and selection states
      const items: FilePickerItem[] = [];
      const itemsByPath = new Map<string, FilePickerItem>();
      searchResults.forEach((item) => itemsByPath.set(item.path, item));

      for (const item of searchResults) {
        // Calculate depth based on path
        item.depth = item.path.split('/').length - 1;

        // Calculate selection state
        if (item.isDirectory) {
          // Use the pre-built map instead of rescanning
          const filesInFolder = folderToFiles.get(item.path) || [];
          if (filesInFolder.length === 0) {
            item.selectionState = 'none';
          } else {
            const selectedCount = filesInFolder.filter((f) =>
              state.selectedFiles.has(f),
            ).length;
            if (selectedCount === 0) {
              item.selectionState = 'none';
            } else if (selectedCount === filesInFolder.length) {
              item.selectionState = 'full';
            } else {
              item.selectionState = 'partial';
            }
          }
          item.isExpanded = false;
        } else {
          item.selectionState = state.selectedFiles.has(item.path)
            ? 'full'
            : 'none';
        }

        // Check if file has converted version (before filtering)
        if (!item.isDirectory) {
          item.hasConvertedVersion = this.hasConvertedVersion(
            item,
            searchResults,
          );
        }

        items.push(item);
      }

      // Filter out converted files if hideConverted is enabled
      const filteredItems = hideConverted
        ? items.filter(
            (item) => item.isDirectory || !this.isConvertedFile(item.name),
          )
        : items;

      return filteredItems;
    }

    // Build tree and compute allConverted recursively, then flatten for UI
    // Use bottom-up approach to avoid redundant scans
    interface TreeBuildResult {
      items: FilePickerItem[];
      allFiles: string[]; // All file paths in this subtree (for selection state calculation)
    }

    function buildTree(dirPath: string, depth: number): TreeBuildResult {
      const showHidden = state.showHidden || false;
      const videosOnly = state.videosOnly || false;
      const entries = FilePickerStateService.listDirectory(
        dirPath,
        showHidden,
        videosOnly,
      );
      const result: FilePickerItem[] = [];
      const allFilesInSubtree: string[] = [];

      for (const entry of entries) {
        entry.depth = depth;
        if (entry.isDirectory) {
          entry.isExpanded = state.expandedFolders.has(entry.path);

          // Recursively build children and get file list
          // This single recursion gives us both the UI items AND the file list
          const childResult = buildTree(entry.path, depth + 1);
          const childFiles = childResult.allFiles;

          // Add all child files to this subtree's file list
          allFilesInSubtree.push(...childFiles);

          // Calculate selection state from child files (bottom-up, no rescan needed!)
          if (childFiles.length === 0) {
            entry.selectionState = 'none';
          } else {
            const selectedCount = childFiles.filter((f) =>
              state.selectedFiles.has(f),
            ).length;
            if (selectedCount === 0) {
              entry.selectionState = 'none';
            } else if (selectedCount === childFiles.length) {
              entry.selectionState = 'full';
            } else {
              entry.selectionState = 'partial';
            }
          }

          // Compute allConverted by checking immediate children only
          // Get immediate children (depth = current depth + 1)
          const immediateChildren = childResult.items.filter(
            (child) => child.depth === depth + 1,
          );

          // Check immediate child folders for their allConverted status
          const childFolders = immediateChildren.filter(
            (child) => child.isDirectory,
          );
          const childFoldersConverted = childFolders.every(
            (child) => child.allConverted,
          );

          // Check immediate child video files (exclude _converted files)
          const videoFiles = immediateChildren.filter(
            (child) =>
              !child.isDirectory &&
              FilePickerStateService.isVideoFile(child.name) &&
              !FilePickerStateService.isConvertedFile(child.name),
          );

          // All immediate video files must be converted
          const allFilesConverted =
            videoFiles.length === 0 ||
            videoFiles.every((file) =>
              FilePickerStateService.hasConvertedVersion(
                file,
                immediateChildren,
              ),
            );

          // Check if this folder has any video content at all (direct files or in subfolders)
          const hasVideoFiles = videoFiles.length > 0;
          const hasVideoFolders = childFolders.some(
            (f) => f.allConverted === true,
          );
          const hasVideoContent = hasVideoFiles || hasVideoFolders;

          // Only mark as allConverted if there's video content AND it's all converted
          entry.allConverted =
            hasVideoContent && allFilesConverted && childFoldersConverted;
          result.push(entry);
          // If expanded, flatten children into result
          if (entry.isExpanded) {
            result.push(...childResult.items);
          }
        } else {
          entry.selectionState = state.selectedFiles.has(entry.path)
            ? 'full'
            : 'none';
          // Mark file as converted if it has a converted version in this folder
          entry.hasConvertedVersion =
            FilePickerStateService.hasConvertedVersion(entry, entries);
          // Add this file to the subtree's file list
          allFilesInSubtree.push(entry.path);
          result.push(entry);
        }
      }
      return { items: result, allFiles: allFilesInSubtree };
    }

    const treeResult = buildTree(state.currentPath, 0);

    // Now that all items are collected, compute hasConvertedVersion for each file
    // (tree-based items already have allConverted set)
    // Filter out converted files if hideConverted is enabled
    const filteredItems = hideConverted
      ? treeResult.items.filter(
          (item) =>
            item.isDirectory ||
            !FilePickerStateService.isConvertedFile(item.name),
        )
      : treeResult.items;

    return filteredItems;
  }

  /**
   * Build the full picker state response
   */
  static buildStateResponse(
    key: string,
    state: PickerStateData,
  ): FilePickerState {
    const items = this.buildItemsList(state);
    const selectedCount = state.selectedFiles.size;

    return {
      key,
      currentPath: state.currentPath,
      items,
      selectedCount,
      searchQuery: state.searchQuery,
      videosOnly: state.videosOnly,
      showHidden: state.showHidden,
      hideConverted: state.hideConverted,
    };
  }

  /**
   * Toggle folder expansion
   */
  static toggleFolder(
    state: PickerStateData,
    folderPath: string,
  ): PickerStateData {
    const newExpandedFolders = new Set(state.expandedFolders);

    if (newExpandedFolders.has(folderPath)) {
      newExpandedFolders.delete(folderPath);
    } else {
      newExpandedFolders.add(folderPath);
    }

    return {
      ...state,
      expandedFolders: newExpandedFolders,
    };
  }

  /**
   * Toggle file selection
   */
  static toggleFile(state: PickerStateData, filePath: string): PickerStateData {
    const newSelectedFiles = new Set(state.selectedFiles);

    if (newSelectedFiles.has(filePath)) {
      newSelectedFiles.delete(filePath);
    } else {
      newSelectedFiles.add(filePath);
    }

    return {
      ...state,
      selectedFiles: newSelectedFiles,
    };
  }

  /**
   * Toggle folder selection (selects/deselects all files in folder)
   */
  static toggleFolderSelection(
    state: PickerStateData,
    folderPath: string,
  ): PickerStateData {
    // First, ensure the folder is expanded so we can scan it
    const expandedFolders = new Set(state.expandedFolders);
    if (!expandedFolders.has(folderPath)) {
      expandedFolders.add(folderPath);
    }

    // Use recursive scanning to get ALL files in the folder (including nested ones)
    // This respects all filters: showHidden, hideConverted, videosOnly, searchQuery
    const showHidden = state.showHidden || false;
    const hideConverted =
      state.hideConverted !== undefined ? state.hideConverted : true;
    const videosOnly = state.videosOnly || false;
    const searchQuery = state.searchQuery;

    const allFiles = this.scanFolderForFilesWithFilters(
      folderPath,
      showHidden,
      hideConverted,
      videosOnly,
      searchQuery,
    );

    if (allFiles.length === 0) {
      // No files in folder, just return state with expanded folder
      return {
        ...state,
        expandedFolders,
      };
    }

    // Check current selection state
    const selectedCount = allFiles.filter((file) =>
      state.selectedFiles.has(file),
    ).length;
    const isFullySelected = selectedCount === allFiles.length;

    // Toggle selection
    const newSelectedFiles = new Set(state.selectedFiles);

    if (isFullySelected) {
      // Deselect all files in folder
      allFiles.forEach((file) => newSelectedFiles.delete(file));
    } else {
      // Select all files in folder
      allFiles.forEach((file) => newSelectedFiles.add(file));
    }

    return {
      ...state,
      selectedFiles: newSelectedFiles,
      expandedFolders,
    };
  }

  /**
   * Navigate to a different directory
   */
  static navigateTo(
    state: PickerStateData,
    targetPath: string,
  ): PickerStateData {
    return {
      ...state,
      currentPath: targetPath,
    };
  }

  /**
   * Update config in state
   */
  static updateConfig(state: PickerStateData, config: any): PickerStateData {
    return {
      ...state,
      config,
    };
  }

  /**
   * Update search query in state
   */
  static updateSearch(
    state: PickerStateData,
    searchQuery: string,
  ): PickerStateData {
    return {
      ...state,
      searchQuery: searchQuery.trim() || undefined,
    };
  }

  /**
   * Update showHidden setting in state
   */
  static updateShowHidden(
    state: PickerStateData,
    showHidden: boolean,
  ): PickerStateData {
    return {
      ...state,
      showHidden,
    };
  }

  /**
   * Update hideConverted setting in state
   */
  static updateHideConverted(
    state: PickerStateData,
    hideConverted: boolean,
  ): PickerStateData {
    return {
      ...state,
      hideConverted,
    };
  }

  /**
   * Update videosOnly setting in state
   */
  static updateVideosOnly(
    state: PickerStateData,
    videosOnly: boolean,
  ): PickerStateData {
    return {
      ...state,
      videosOnly,
    };
  }
}
