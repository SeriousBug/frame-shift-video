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

interface PickerStateData {
  selectedFiles: Set<string>;
  expandedFolders: Set<string>;
  currentPath: string;
  config?: any;
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
    };
    const json = JSON.stringify(data);
    return crypto.createHash('sha256').update(json).digest('base64url');
  }

  /**
   * Save picker state to database and return the key
   */
  static save(state: PickerStateData): string {
    const key = this.generateKey(state);
    const selectedFilesJson = JSON.stringify(Array.from(state.selectedFiles));
    const expandedFoldersJson = JSON.stringify(
      Array.from(state.expandedFolders),
    );
    const configJson = state.config ? JSON.stringify(state.config) : null;

    execute(
      `INSERT OR REPLACE INTO file_selections
       (id, data, expanded_folders, current_path, config)
       VALUES (?, ?, ?, ?, ?)`,
      [
        key,
        selectedFilesJson,
        expandedFoldersJson,
        state.currentPath,
        configJson,
      ],
    );

    return key;
  }

  /**
   * Get picker state by key
   */
  static get(key: string): PickerStateData | null {
    const result = queryOne<FileSelection>(
      'SELECT data, expanded_folders, current_path, config FROM file_selections WHERE id = ?',
      [key],
    );

    if (!result) return null;

    try {
      const selectedFiles = new Set<string>(JSON.parse(result.data));
      const expandedFolders = new Set<string>(
        result.expanded_folders ? JSON.parse(result.expanded_folders) : [],
      );
      const config = result.config ? JSON.parse(result.config) : undefined;

      return {
        selectedFiles,
        expandedFolders,
        currentPath: result.current_path || '',
        config,
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
  private static listDirectory(dirPath: string): FilePickerItem[] {
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
   * Build the flat list of items to render based on current state
   */
  static buildItemsList(state: PickerStateData): FilePickerItem[] {
    const items: FilePickerItem[] = [];
    const basePath = this.getBasePath();

    // Get items in current directory
    const currentItems = this.listDirectory(state.currentPath);

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
          const children = this.listDirectory(item.path);
          processItems(children, depth + 1, item.path);
        }
      }
    };

    processItems(currentItems, 0, state.currentPath);

    return items;
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

    // Get all files in the folder (always scan, even if nothing selected)
    const allFiles = this.scanFolderForFiles(folderPath);

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
}
