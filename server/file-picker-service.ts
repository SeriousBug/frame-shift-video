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
      return entries
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
        })
        .sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
    } catch (error) {
      console.error(`Failed to list directory ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Recursively scan a folder to get all file paths
   * Only scans if the folder or its descendants have selections
   */
  private static getAllFilesInFolder(
    folderPath: string,
    selectedFiles: Set<string>,
  ): string[] {
    // Check if this folder or any descendant has selections
    const hasSelections = Array.from(selectedFiles).some((file) =>
      file.startsWith(folderPath + '/'),
    );

    if (!hasSelections) {
      // No selections in this folder, skip scanning
      return [];
    }

    return this.scanFolderForFiles(folderPath);
  }

  /**
   * Recursively scan a folder to get all file paths (always scans)
   */
  private static scanFolderForFiles(folderPath: string): string[] {
    const basePath = this.getBasePath();
    const fullPath = path.join(basePath, folderPath);
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        const itemPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively get files from subdirectory
          files.push(...this.scanFolderForFiles(itemPath));
        } else {
          files.push(itemPath);
        }
      }
    } catch (error) {
      console.error(`Failed to scan folder ${folderPath}:`, error);
    }

    return files;
  }

  /**
   * Recursively scan a folder to get all file paths, respecting filters
   */
  private static scanFolderForFilesWithFilters(
    folderPath: string,
    showHidden: boolean,
    hideConverted: boolean,
    allFilesForConversionCheck: string[] = [],
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
              allFilesForConversionCheck,
            ),
          );
        } else {
          // Skip converted files if hideConverted is true
          if (hideConverted && this.isConvertedFile(entry.name)) continue;

          files.push(itemPath);
        }
      }
    } catch (error) {
      console.error(`Failed to scan folder ${folderPath}:`, error);
    }

    return files;
  }

  /**
   * Calculate selection state for a folder
   * Returns 'none', 'partial', or 'full'
   */
  private static calculateFolderSelectionState(
    folderPath: string,
    selectedFiles: Set<string>,
  ): 'none' | 'partial' | 'full' {
    const allFiles = this.getAllFilesInFolder(folderPath, selectedFiles);

    if (allFiles.length === 0) return 'none';

    const selectedCount = allFiles.filter((file) =>
      selectedFiles.has(file),
    ).length;

    if (selectedCount === 0) return 'none';
    if (selectedCount === allFiles.length) return 'full';
    return 'partial';
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

      for (const entry of entries) {
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
    const items: FilePickerItem[] = [];
    const basePath = this.getBasePath();
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

      // Calculate depths and selection states
      const itemsByPath = new Map<string, FilePickerItem>();
      searchResults.forEach((item) => itemsByPath.set(item.path, item));

      for (const item of searchResults) {
        // Calculate depth based on path
        item.depth = item.path.split('/').length - 1;

        // Calculate selection state
        if (item.isDirectory) {
          item.selectionState = this.calculateFolderSelectionState(
            item.path,
            state.selectedFiles,
          );
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

    // Normal mode: Get items in current directory
    const showHidden = state.showHidden || false;
    const currentItems = this.listDirectory(
      state.currentPath,
      showHidden,
      videosOnly,
    );

    // Build flat list with expanded folders
    const processItems = (
      itemList: FilePickerItem[],
      depth: number,
      parentPath: string,
    ) => {
      for (const item of itemList) {
        // Set depth
        item.depth = depth;

        // Calculate selection state
        if (item.isDirectory) {
          item.selectionState = this.calculateFolderSelectionState(
            item.path,
            state.selectedFiles,
          );
          item.isExpanded = state.expandedFolders.has(item.path);
        } else {
          item.selectionState = state.selectedFiles.has(item.path)
            ? 'full'
            : 'none';
        }

        items.push(item);

        // If directory is expanded, load and process its children
        if (item.isDirectory && item.isExpanded) {
          const children = this.listDirectory(
            item.path,
            showHidden,
            videosOnly,
          );
          processItems(children, depth + 1, item.path);
        }
      }
    };

    processItems(currentItems, 0, state.currentPath);

    // Now that all items are collected, compute hasConvertedVersion for each file
    for (const item of items) {
      if (!item.isDirectory) {
        item.hasConvertedVersion = this.hasConvertedVersion(item, items);
      }
    }

    // Filter out converted files if hideConverted is enabled
    const filteredItems = hideConverted
      ? items.filter(
          (item) => item.isDirectory || !this.isConvertedFile(item.name),
        )
      : items;

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

    // Build items list with current filters to get the actual visible files
    // This respects all filters: showHidden, hideConverted, search, etc.
    const tempState = { ...state, expandedFolders };
    const items = this.buildItemsList(tempState);

    // Get all files in this folder from the filtered items list
    const allFiles = items
      .filter(
        (item) =>
          !item.isDirectory &&
          (item.path === folderPath || item.path.startsWith(folderPath + '/')),
      )
      .map((item) => item.path);

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
