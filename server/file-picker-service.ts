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

/**
 * Simple LRU cache with TTL for search results
 */
class SearchCache {
  private cache = new Map<
    string,
    { results: FilePickerItem[]; timestamp: number }
  >();
  private maxSize = 50; // Maximum number of cached searches
  private ttl = 5000; // 5 seconds TTL

  get(key: string): FilePickerItem[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if cache entry is still valid
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.results;
  }

  set(key: string, results: FilePickerItem[]): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      results,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

const searchCache = new SearchCache();

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
    compiledSearchPattern?: RegExp | false,
  ): string[] {
    const basePath = this.getBasePath();
    const fullPath = path.join(basePath, folderPath);
    const files: string[] = [];

    // Compile search pattern once at the top level
    if (
      searchQuery &&
      searchQuery.trim() &&
      compiledSearchPattern === undefined
    ) {
      const compiled = micromatch.makeRe(searchQuery, { nocase: true });
      compiledSearchPattern = compiled === false ? false : compiled;
    }

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files if showHidden is false
        if (!showHidden && entry.name.startsWith('.')) continue;

        const itemPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively get files from subdirectory, passing compiled pattern
          files.push(
            ...this.scanFolderForFilesWithFilters(
              itemPath,
              showHidden,
              hideConverted,
              videosOnly,
              searchQuery,
              compiledSearchPattern,
            ),
          );
        } else {
          // Skip non-video files if videosOnly is enabled
          if (videosOnly && !this.isVideoFile(entry.name)) continue;

          // Skip converted files if hideConverted is true
          if (hideConverted && this.isConvertedFile(entry.name)) continue;

          // Skip files that don't match search query
          // Use compiled pattern if available, otherwise fall back to micromatch.isMatch
          if (compiledSearchPattern !== undefined) {
            const matches =
              compiledSearchPattern !== false
                ? compiledSearchPattern.test(entry.name)
                : micromatch.isMatch(entry.name, searchQuery!, {
                    nocase: true,
                  });
            if (!matches) continue;
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
   * Note: Sorting is deferred until all results are collected for performance
   */
  private static scanDirectoryWithSearch(
    dirPath: string,
    searchPattern: string,
    showHidden: boolean = false,
    videosOnly: boolean = false,
    compiledPattern?: RegExp | false,
  ): FilePickerItem[] {
    const basePath = this.getBasePath();
    const fullPath = path.join(basePath, dirPath);
    const results: FilePickerItem[] = [];

    // Compile pattern once at the top level for reuse in recursive calls
    // Note: makeRe can return false for patterns that can't be compiled to regex
    if (compiledPattern === undefined) {
      const compiled = micromatch.makeRe(searchPattern, { nocase: true });
      compiledPattern = compiled === false ? false : compiled;
    }

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });

      // Process entries without sorting - we'll sort once at the end
      for (const entry of entries) {
        // Skip hidden files unless showHidden is true
        if (!showHidden && entry.name.startsWith('.')) continue;

        const itemPath = path.join(dirPath, entry.name);
        const fullItemPath = path.join(fullPath, entry.name);

        try {
          if (entry.isDirectory()) {
            // Check if directory name matches the search pattern
            const dirMatches =
              compiledPattern !== false
                ? compiledPattern.test(entry.name)
                : micromatch.isMatch(entry.name, searchPattern, {
                    nocase: true,
                  });

            // Recursively search subdirectories, passing compiled pattern for reuse
            const subResults = this.scanDirectoryWithSearch(
              itemPath,
              searchPattern,
              showHidden,
              videosOnly,
              compiledPattern,
            );

            // Include directory if it matches the pattern OR has matching descendants
            if (dirMatches || subResults.length > 0) {
              // Only call statSync when we know we need the directory
              const stats = fs.statSync(fullItemPath);
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

            // Check if file matches the search pattern
            // Use compiled regex if available, otherwise fall back to micromatch.isMatch
            const matches =
              compiledPattern !== false
                ? compiledPattern.test(entry.name)
                : micromatch.isMatch(entry.name, searchPattern, {
                    nocase: true,
                  });

            if (matches) {
              // Only call statSync for files that match the pattern
              const stats = fs.statSync(fullItemPath);
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
   * Build an index of converted files for O(1) lookup
   * Returns a Set of base paths (without extension, without _converted suffix)
   */
  private static buildConvertedFilesIndex(
    items: FilePickerItem[],
  ): Set<string> {
    const convertedFiles = new Set<string>();

    for (const item of items) {
      if (!item.isDirectory && this.isConvertedFile(item.name)) {
        // Extract base path: "folder/movie_converted.mp4" -> "folder/movie"
        const pathWithoutExt = item.path.replace(/\.[^.]+$/, '');
        const basePath = pathWithoutExt.replace(/_converted$/, '');
        convertedFiles.add(basePath);
      }
    }

    return convertedFiles;
  }

  /**
   * Check if a file has a converted version using the pre-built index
   * This is O(1) instead of O(n)
   */
  private static hasConvertedVersion(
    item: FilePickerItem,
    convertedIndex: Set<string>,
  ): boolean {
    if (item.isDirectory) return false;

    const pathWithoutExt = item.path.replace(/\.[^.]+$/, '');
    return convertedIndex.has(pathWithoutExt);
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
      // Check cache first - include base path in cache key to avoid collisions
      const showHidden = state.showHidden || false;
      const basePath = this.getBasePath();
      const cacheKey = `${basePath}:${state.searchQuery}-${showHidden}-${videosOnly}-${hideConverted}`;
      const cachedResults = searchCache.get(cacheKey);

      let unsortedResults: FilePickerItem[];
      if (cachedResults) {
        // Use cached results (already includes all processing)
        unsortedResults = cachedResults;
      } else {
        // Perform search and cache the results
        unsortedResults = this.scanDirectoryWithSearch(
          '',
          state.searchQuery,
          showHidden,
          videosOnly,
        );
        // Cache the unsorted results before further processing
        searchCache.set(cacheKey, unsortedResults);
      }

      // Sort results in tree order (parent, then children)
      // Build parent->children mapping
      const childrenByParent = new Map<string, FilePickerItem[]>();
      for (const item of unsortedResults) {
        const parentPath = item.path.includes('/')
          ? item.path.substring(0, item.path.lastIndexOf('/'))
          : '';

        if (!childrenByParent.has(parentPath)) {
          childrenByParent.set(parentPath, []);
        }
        childrenByParent.get(parentPath)!.push(item);
      }

      // Sort children within each parent (directories first, then files, alphabetically)
      for (const children of childrenByParent.values()) {
        children.sort((a, b) => {
          // Directories before files
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          // Then sort alphabetically (with natural sort)
          const aName = stripLeadingArticles(a.name);
          const bName = stripLeadingArticles(b.name);
          return aName.localeCompare(bName, undefined, { numeric: true });
        });
      }

      // Flatten tree in depth-first order
      const searchResults: FilePickerItem[] = [];
      const addItemAndChildren = (item: FilePickerItem) => {
        searchResults.push(item);
        const children = childrenByParent.get(item.path) || [];
        for (const child of children) {
          addItemAndChildren(child);
        }
      };

      // Start with root items
      const rootItems = childrenByParent.get('') || [];
      for (const item of rootItems) {
        addItemAndChildren(item);
      }

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

      // Build converted files index once for O(1) lookups
      const convertedIndex = this.buildConvertedFilesIndex(searchResults);

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

        // Check if file has converted version using O(1) index lookup
        if (!item.isDirectory) {
          item.hasConvertedVersion = this.hasConvertedVersion(
            item,
            convertedIndex,
          );
        }

        items.push(item);
      }

      // Filter out converted files if hideConverted is enabled
      let filteredItems = hideConverted
        ? items.filter(
            (item) => item.isDirectory || !this.isConvertedFile(item.name),
          )
        : items;

      // After filtering converted files, remove folders that have no descendant files
      // and don't match the search pattern themselves
      if (hideConverted) {
        // Build a set of all file paths for quick lookup
        const filePaths = new Set(
          filteredItems
            .filter((item) => !item.isDirectory)
            .map((item) => item.path),
        );

        // Compile the search pattern for checking if folder names match
        const compiledPattern = state.searchQuery
          ? micromatch.makeRe(state.searchQuery, {
              nocase: true,
            })
          : false;

        // Filter out directories that don't have any descendant files
        // and don't match the search pattern themselves
        filteredItems = filteredItems.filter((item) => {
          if (!item.isDirectory) return true;

          // Check if any file path starts with this folder path
          const folderPrefix = item.path + '/';
          const hasDescendantFiles = Array.from(filePaths).some((filePath) =>
            filePath.startsWith(folderPrefix),
          );

          // If folder has descendant files, keep it
          if (hasDescendantFiles) return true;

          // If folder name matches the search pattern AND it's not just a wildcard,
          // keep it (even if empty after filtering)
          // Don't keep folders for generic wildcards like "*" or "**"
          if (
            state.searchQuery &&
            state.searchQuery.trim() !== '*' &&
            state.searchQuery.trim() !== '**' &&
            compiledPattern &&
            compiledPattern !== false
          ) {
            return compiledPattern.test(item.name);
          }

          return false;
        });
      }

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

      // Build converted files index once per directory for O(1) lookups
      const convertedIndex =
        FilePickerStateService.buildConvertedFilesIndex(entries);

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

          // Build index from immediate children for checking converted versions
          const immediateConvertedIndex =
            FilePickerStateService.buildConvertedFilesIndex(immediateChildren);

          // All immediate video files must be converted
          const allFilesConverted =
            videoFiles.length === 0 ||
            videoFiles.every((file) =>
              FilePickerStateService.hasConvertedVersion(
                file,
                immediateConvertedIndex,
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
          // Mark file as converted if it has a converted version using O(1) index lookup
          entry.hasConvertedVersion =
            FilePickerStateService.hasConvertedVersion(entry, convertedIndex);
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
   * Select a range of files between startPath and endPath (inclusive)
   * Only selects files, not folders
   */
  static selectRange(
    state: PickerStateData,
    startPath: string,
    endPath: string,
  ): PickerStateData {
    // Build the current items list to get the flat, ordered list
    const items = this.buildItemsList(state);

    // Find indices of start and end paths
    const startIndex = items.findIndex((item) => item.path === startPath);
    const endIndex = items.findIndex((item) => item.path === endPath);

    // If either path is not found, return state unchanged
    if (startIndex === -1 || endIndex === -1) {
      return state;
    }

    // Determine the range (handle both directions)
    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);

    // Select all files in the range (skip folders)
    const newSelectedFiles = new Set(state.selectedFiles);
    for (let i = minIndex; i <= maxIndex; i++) {
      const item = items[i];
      if (!item.isDirectory) {
        newSelectedFiles.add(item.path);
      }
    }

    return {
      ...state,
      selectedFiles: newSelectedFiles,
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
