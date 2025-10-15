export interface FileSystemItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}

/**
 * File picker item with selection and expansion state
 */
export interface FilePickerItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
  depth: number; // Nesting depth for rendering
  isExpanded?: boolean; // Only for directories
  selectionState: 'none' | 'partial' | 'full'; // Selection state
  hasConvertedVersion?: boolean; // True if this file has a _converted version
}

/**
 * File picker state response from server
 */
export interface FilePickerState {
  key: string; // Unique state key for browser history
  currentPath: string; // Current directory being viewed
  items: FilePickerItem[]; // Flat list of items to render
  selectedCount: number; // Total number of selected files
  searchQuery?: string; // Current search query if any
}
