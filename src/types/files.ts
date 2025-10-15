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
  allConverted?: boolean; // True if all video files in this folder are converted
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
  videosOnly?: boolean; // Filter to show only video files
  showHidden?: boolean; // Show hidden files
  hideConverted?: boolean; // Hide converted videos
}
