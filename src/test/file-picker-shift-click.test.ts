/**
 * Integration tests for file picker shift-click range selection functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FilePickerStateService } from '../../server/file-picker-service';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('File Picker - Shift-Click Range Selection', () => {
  let testDir: string;
  let originalFrameShiftHome: string | undefined;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-picker-test-'));

    // Override FRAME_SHIFT_HOME to point to our test directory
    originalFrameShiftHome = process.env.FRAME_SHIFT_HOME;
    process.env.FRAME_SHIFT_HOME = testDir;
  });

  afterEach(() => {
    // Restore original FRAME_SHIFT_HOME
    if (originalFrameShiftHome !== undefined) {
      process.env.FRAME_SHIFT_HOME = originalFrameShiftHome;
    } else {
      delete process.env.FRAME_SHIFT_HOME;
    }

    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create a test directory structure with multiple files
   */
  function createTestStructure() {
    // Create a simple flat structure with several files
    fs.writeFileSync(path.join(testDir, 'video1.mp4'), 'test content');
    fs.writeFileSync(path.join(testDir, 'video2.mp4'), 'test content');
    fs.writeFileSync(path.join(testDir, 'video3.mp4'), 'test content');
    fs.writeFileSync(path.join(testDir, 'video4.mp4'), 'test content');
    fs.writeFileSync(path.join(testDir, 'video5.mp4'), 'test content');

    // Create a folder with files
    fs.mkdirSync(path.join(testDir, 'folderA'));
    fs.writeFileSync(path.join(testDir, 'folderA', 'video6.mp4'), 'test');
    fs.writeFileSync(path.join(testDir, 'folderA', 'video7.mp4'), 'test');
    fs.writeFileSync(path.join(testDir, 'folderA', 'video8.mp4'), 'test');

    // Create another folder
    fs.mkdirSync(path.join(testDir, 'folderB'));
    fs.writeFileSync(path.join(testDir, 'folderB', 'video9.mp4'), 'test');
    fs.writeFileSync(path.join(testDir, 'folderB', 'video10.mp4'), 'test');
  }

  describe('Basic range selection', () => {
    it('should select all files between two paths (forward direction)', () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Select range from video1.mp4 to video4.mp4
      const newState = FilePickerStateService.selectRange(
        state,
        'video1.mp4',
        'video4.mp4',
      );

      // Should select video1, video2, video3, video4
      expect(newState.selectedFiles.size).toBe(4);
      expect(newState.selectedFiles.has('video1.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video2.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video3.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video4.mp4')).toBe(true);

      // Should NOT select video5.mp4
      expect(newState.selectedFiles.has('video5.mp4')).toBe(false);
    });

    it('should select all files between two paths (backward direction)', () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Select range from video4.mp4 to video1.mp4 (reversed)
      const newState = FilePickerStateService.selectRange(
        state,
        'video4.mp4',
        'video1.mp4',
      );

      // Should select the same files regardless of direction
      expect(newState.selectedFiles.size).toBe(4);
      expect(newState.selectedFiles.has('video1.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video2.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video3.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video4.mp4')).toBe(true);
    });

    it('should select a single file when start and end are the same', () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Select range from video2.mp4 to video2.mp4
      const newState = FilePickerStateService.selectRange(
        state,
        'video2.mp4',
        'video2.mp4',
      );

      // Should select only video2.mp4
      expect(newState.selectedFiles.size).toBe(1);
      expect(newState.selectedFiles.has('video2.mp4')).toBe(true);
    });
  });

  describe('Range selection with folders', () => {
    it('should skip folders and only select files in range', () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Expand folderA to make it visible in the items list
      state.expandedFolders.add('folderA');

      // Note: Items are sorted with folders first, then root files
      // So the order is: folderA, folderA/video6-8, folderB, video1-5
      // Select range from folderA/video6.mp4 to video2.mp4
      const newState = FilePickerStateService.selectRange(
        state,
        'folderA/video6.mp4',
        'video2.mp4',
      );

      // Should select files in the range
      // Range is: folderA/video6, folderA/video7, folderA/video8, video1, video2
      expect(newState.selectedFiles.has('folderA/video6.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderA/video7.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderA/video8.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video1.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video2.mp4')).toBe(true);

      // Should NOT select files outside the range
      expect(newState.selectedFiles.has('video3.mp4')).toBe(false);
      expect(newState.selectedFiles.has('video4.mp4')).toBe(false);

      // Should NOT select the folder itself (only files)
      expect(newState.selectedFiles.has('folderA')).toBe(false);
    });

    it('should work with files inside expanded folders', () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Expand both folders
      state.expandedFolders.add('folderA');
      state.expandedFolders.add('folderB');

      // Select range within folderA
      const newState = FilePickerStateService.selectRange(
        state,
        'folderA/video6.mp4',
        'folderA/video8.mp4',
      );

      // Should select all files in the range within folderA
      expect(newState.selectedFiles.has('folderA/video6.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderA/video7.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderA/video8.mp4')).toBe(true);

      // Should not select files outside the range
      expect(newState.selectedFiles.has('video1.mp4')).toBe(false);
      expect(newState.selectedFiles.has('folderB/video9.mp4')).toBe(false);
    });
  });

  describe('Range selection preserves existing selections', () => {
    it('should add to existing selections, not replace them', () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Pre-select video1.mp4
      state.selectedFiles.add('video1.mp4');

      // Select range from video3.mp4 to video5.mp4
      const newState = FilePickerStateService.selectRange(
        state,
        'video3.mp4',
        'video5.mp4',
      );

      // Should have both the pre-selected file AND the range
      expect(newState.selectedFiles.size).toBe(4); // video1 + video3,4,5
      expect(newState.selectedFiles.has('video1.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video3.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video4.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video5.mp4')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle invalid start path gracefully', () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Try to select range with non-existent start path
      const newState = FilePickerStateService.selectRange(
        state,
        'nonexistent.mp4',
        'video2.mp4',
      );

      // Should return state unchanged
      expect(newState.selectedFiles.size).toBe(0);
    });

    it('should handle invalid end path gracefully', () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Try to select range with non-existent end path
      const newState = FilePickerStateService.selectRange(
        state,
        'video1.mp4',
        'nonexistent.mp4',
      );

      // Should return state unchanged
      expect(newState.selectedFiles.size).toBe(0);
    });

    it('should handle both invalid paths gracefully', () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Try to select range with both paths non-existent
      const newState = FilePickerStateService.selectRange(
        state,
        'nonexistent1.mp4',
        'nonexistent2.mp4',
      );

      // Should return state unchanged
      expect(newState.selectedFiles.size).toBe(0);
    });
  });

  describe('Range selection with filters', () => {
    it('should respect current filter settings when building items list', () => {
      // Create structure with mixed file types
      fs.writeFileSync(path.join(testDir, 'video1.mp4'), 'test');
      fs.writeFileSync(path.join(testDir, 'document.txt'), 'test');
      fs.writeFileSync(path.join(testDir, 'video2.mp4'), 'test');
      fs.writeFileSync(path.join(testDir, 'image.jpg'), 'test');
      fs.writeFileSync(path.join(testDir, 'video3.mp4'), 'test');

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = true; // Filter to only show videos

      // Select range from first video to last video
      // The items list will only include video files due to videosOnly filter
      const newState = FilePickerStateService.selectRange(
        state,
        'video1.mp4',
        'video3.mp4',
      );

      // Should select only the video files (txt and jpg are filtered out from items list)
      expect(newState.selectedFiles.has('video1.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video2.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video3.mp4')).toBe(true);

      // Non-video files should not be in the selection
      expect(newState.selectedFiles.has('document.txt')).toBe(false);
      expect(newState.selectedFiles.has('image.jpg')).toBe(false);
    });

    it('should work with hideConverted filter', () => {
      fs.writeFileSync(path.join(testDir, 'video1.mp4'), 'test');
      fs.writeFileSync(path.join(testDir, 'video2.mp4'), 'test');
      fs.writeFileSync(path.join(testDir, 'video2_converted.mkv'), 'test');
      fs.writeFileSync(path.join(testDir, 'video3.mp4'), 'test');

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;
      state.hideConverted = true;

      // Select range - converted file should be filtered out from items list
      const newState = FilePickerStateService.selectRange(
        state,
        'video1.mp4',
        'video3.mp4',
      );

      // Should select non-converted files
      expect(newState.selectedFiles.has('video1.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video2.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video3.mp4')).toBe(true);

      // Converted file should not be selected (it's filtered from items list)
      expect(newState.selectedFiles.has('video2_converted.mkv')).toBe(false);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle selecting across multiple folders', () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Expand both folders
      state.expandedFolders.add('folderA');
      state.expandedFolders.add('folderB');

      // Items order: folderA, folderA/video6-8, folderB, folderB/video9-10, video1-5
      // Select range from folderA/video7.mp4 to video3.mp4
      const newState = FilePickerStateService.selectRange(
        state,
        'folderA/video7.mp4',
        'video3.mp4',
      );

      // Should select all files in the range
      expect(newState.selectedFiles.has('folderA/video7.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderA/video8.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderB/video9.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderB/video10.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video1.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video2.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video3.mp4')).toBe(true);

      // Should not select files outside the range
      expect(newState.selectedFiles.has('folderA/video6.mp4')).toBe(false);
      expect(newState.selectedFiles.has('video4.mp4')).toBe(false);
      expect(newState.selectedFiles.has('video5.mp4')).toBe(false);
    });

    it('should work with nested folder structure', () => {
      // Create nested structure
      fs.mkdirSync(path.join(testDir, 'parent'));
      fs.writeFileSync(path.join(testDir, 'parent', 'file1.mp4'), 'test');

      fs.mkdirSync(path.join(testDir, 'parent', 'child'));
      fs.writeFileSync(
        path.join(testDir, 'parent', 'child', 'file2.mp4'),
        'test',
      );
      fs.writeFileSync(
        path.join(testDir, 'parent', 'child', 'file3.mp4'),
        'test',
      );

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Expand folders
      state.expandedFolders.add('parent');
      state.expandedFolders.add('parent/child');

      // Items order: parent, parent/child, parent/child/file2, parent/child/file3, parent/file1
      // Select range within nested structure from file2 to file1
      const newState = FilePickerStateService.selectRange(
        state,
        'parent/child/file2.mp4',
        'parent/file1.mp4',
      );

      // Should select all files in the range
      expect(newState.selectedFiles.has('parent/child/file2.mp4')).toBe(true);
      expect(newState.selectedFiles.has('parent/child/file3.mp4')).toBe(true);
      expect(newState.selectedFiles.has('parent/file1.mp4')).toBe(true);
    });
  });

  describe('Real-world usage simulation', () => {
    it('should simulate typical user workflow: click, shift-click, shift-click again', () => {
      createTestStructure();

      let state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // First click: select video2.mp4
      state = FilePickerStateService.toggleFile(state, 'video2.mp4');
      expect(state.selectedFiles.size).toBe(1);
      expect(state.selectedFiles.has('video2.mp4')).toBe(true);

      // Shift-click video4.mp4: should select range video2-video4
      state = FilePickerStateService.selectRange(
        state,
        'video2.mp4',
        'video4.mp4',
      );
      expect(state.selectedFiles.size).toBe(3);
      expect(state.selectedFiles.has('video2.mp4')).toBe(true);
      expect(state.selectedFiles.has('video3.mp4')).toBe(true);
      expect(state.selectedFiles.has('video4.mp4')).toBe(true);

      // Shift-click video5.mp4: should extend range to video5
      state = FilePickerStateService.selectRange(
        state,
        'video4.mp4',
        'video5.mp4',
      );
      expect(state.selectedFiles.size).toBe(4);
      expect(state.selectedFiles.has('video2.mp4')).toBe(true);
      expect(state.selectedFiles.has('video3.mp4')).toBe(true);
      expect(state.selectedFiles.has('video4.mp4')).toBe(true);
      expect(state.selectedFiles.has('video5.mp4')).toBe(true);
    });
  });
});
