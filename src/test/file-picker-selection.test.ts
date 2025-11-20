/**
 * Integration tests for file picker "select all files in folder" functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FilePickerStateService } from '../../server/file-picker-service';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('File Picker - Select All Files in Folder', () => {
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
   * Helper to create a test directory structure
   */
  function createTestStructure() {
    // Root level files
    fs.writeFileSync(path.join(testDir, 'video1.mp4'), 'test content');
    fs.writeFileSync(path.join(testDir, 'video2.mkv'), 'test content');
    fs.writeFileSync(path.join(testDir, 'document.txt'), 'test content');

    // Folder A with nested structure
    fs.mkdirSync(path.join(testDir, 'folderA'));
    fs.writeFileSync(path.join(testDir, 'folderA', 'video3.mp4'), 'test');
    fs.writeFileSync(path.join(testDir, 'folderA', 'video4.avi'), 'test');
    fs.writeFileSync(path.join(testDir, 'folderA', 'image.jpg'), 'test');

    // Nested folder inside folderA
    fs.mkdirSync(path.join(testDir, 'folderA', 'subfolder'));
    fs.writeFileSync(
      path.join(testDir, 'folderA', 'subfolder', 'video5.mp4'),
      'test',
    );
    fs.writeFileSync(
      path.join(testDir, 'folderA', 'subfolder', 'video6.webm'),
      'test',
    );

    // Deep nesting
    fs.mkdirSync(path.join(testDir, 'folderA', 'subfolder', 'deepfolder'));
    fs.writeFileSync(
      path.join(testDir, 'folderA', 'subfolder', 'deepfolder', 'video7.mov'),
      'test',
    );

    // Folder B (separate structure)
    fs.mkdirSync(path.join(testDir, 'folderB'));
    fs.writeFileSync(path.join(testDir, 'folderB', 'video8.mp4'), 'test');

    // Hidden files folder
    fs.mkdirSync(path.join(testDir, 'folderC'));
    fs.writeFileSync(path.join(testDir, 'folderC', '.hidden.mp4'), 'test');
    fs.writeFileSync(path.join(testDir, 'folderC', 'visible.mp4'), 'test');

    // Converted files folder
    fs.mkdirSync(path.join(testDir, 'folderD'));
    fs.writeFileSync(path.join(testDir, 'folderD', 'original.mp4'), 'test');
    fs.writeFileSync(
      path.join(testDir, 'folderD', 'original_converted.mkv'),
      'test',
    );
    fs.writeFileSync(path.join(testDir, 'folderD', 'other.mp4'), 'test');
  }

  describe('Basic functionality', () => {
    it('should select all files in a folder recursively', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false; // Include all files for this test

      // Select all files in folderA
      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA',
      );

      // Should select:
      // - folderA/video3.mp4
      // - folderA/video4.avi
      // - folderA/image.jpg
      // - folderA/subfolder/video5.mp4
      // - folderA/subfolder/video6.webm
      // - folderA/subfolder/deepfolder/video7.mov
      expect(newState.selectedFiles.size).toBe(6);
      expect(newState.selectedFiles.has('folderA/video3.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderA/video4.avi')).toBe(true);
      expect(newState.selectedFiles.has('folderA/image.jpg')).toBe(true);
      expect(newState.selectedFiles.has('folderA/subfolder/video5.mp4')).toBe(
        true,
      );
      expect(newState.selectedFiles.has('folderA/subfolder/video6.webm')).toBe(
        true,
      );
      expect(
        newState.selectedFiles.has('folderA/subfolder/deepfolder/video7.mov'),
      ).toBe(true);

      // Should NOT select files outside folderA
      expect(newState.selectedFiles.has('video1.mp4')).toBe(false);
      expect(newState.selectedFiles.has('folderB/video8.mp4')).toBe(false);
    });

    it('should automatically expand the folder after selection', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      expect(state.expandedFolders.has('folderA')).toBe(false);

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA',
      );

      expect(newState.expandedFolders.has('folderA')).toBe(true);
    });

    it('should handle empty folders without error', async () => {
      fs.mkdirSync(path.join(testDir, 'emptyFolder'));

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'emptyFolder',
      );

      expect(newState.selectedFiles.size).toBe(0);
      expect(newState.expandedFolders.has('emptyFolder')).toBe(true);
    });
  });

  describe('Toggle behavior', () => {
    it('should deselect all files when all are already selected', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // First selection: select all
      const selectedState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA',
      );
      expect(selectedState.selectedFiles.size).toBe(6);

      // Second selection: deselect all
      const deselectedState =
        await FilePickerStateService.toggleFolderSelection(
          selectedState,
          'folderA',
        );
      expect(deselectedState.selectedFiles.size).toBe(0);
    });

    it('should select remaining files when only some are selected', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Manually select one file
      state.selectedFiles.add('folderA/video3.mp4');

      // Toggle folder selection should select the rest
      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA',
      );

      expect(newState.selectedFiles.size).toBe(6);
      expect(newState.selectedFiles.has('folderA/video3.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderA/video4.avi')).toBe(true);
    });

    it('should work independently for multiple folders', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Select all in folderA
      const stateA = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA',
      );
      expect(stateA.selectedFiles.size).toBe(6);

      // Select all in folderB (should add to existing)
      const stateB = await FilePickerStateService.toggleFolderSelection(
        stateA,
        'folderB',
      );
      expect(stateB.selectedFiles.size).toBe(7); // 6 from A + 1 from B

      // Deselect folderA (folderB should remain)
      const stateC = await FilePickerStateService.toggleFolderSelection(
        stateB,
        'folderA',
      );
      expect(stateC.selectedFiles.size).toBe(1);
      expect(stateC.selectedFiles.has('folderB/video8.mp4')).toBe(true);
    });
  });

  describe('Filter respect - videosOnly', () => {
    it('should only select video files when videosOnly is enabled', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = true; // Only videos

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA',
      );

      // Should select only video files (not image.jpg)
      expect(newState.selectedFiles.size).toBe(5);
      expect(newState.selectedFiles.has('folderA/video3.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderA/video4.avi')).toBe(true);
      expect(newState.selectedFiles.has('folderA/subfolder/video5.mp4')).toBe(
        true,
      );
      expect(newState.selectedFiles.has('folderA/subfolder/video6.webm')).toBe(
        true,
      );
      expect(
        newState.selectedFiles.has('folderA/subfolder/deepfolder/video7.mov'),
      ).toBe(true);

      // Should NOT select non-video files
      expect(newState.selectedFiles.has('folderA/image.jpg')).toBe(false);
    });
  });

  describe('Filter respect - showHidden', () => {
    it('should exclude hidden files when showHidden is false', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;
      state.showHidden = false;

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderC',
      );

      // Should only select visible.mp4, not .hidden.mp4
      expect(newState.selectedFiles.size).toBe(1);
      expect(newState.selectedFiles.has('folderC/visible.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderC/.hidden.mp4')).toBe(false);
    });

    it('should include hidden files when showHidden is true', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;
      state.showHidden = true;

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderC',
      );

      // Should select both files
      expect(newState.selectedFiles.size).toBe(2);
      expect(newState.selectedFiles.has('folderC/visible.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderC/.hidden.mp4')).toBe(true);
    });
  });

  describe('Filter respect - hideConverted', () => {
    it('should exclude converted files when hideConverted is true', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;
      state.hideConverted = true;

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderD',
      );

      // Should select original.mp4 and other.mp4, but not original_converted.mkv
      expect(newState.selectedFiles.size).toBe(2);
      expect(newState.selectedFiles.has('folderD/original.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderD/other.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderD/original_converted.mkv')).toBe(
        false,
      );
    });

    it('should include converted files when hideConverted is false', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;
      state.hideConverted = false;

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderD',
      );

      // Should select all files including converted
      expect(newState.selectedFiles.size).toBe(3);
      expect(newState.selectedFiles.has('folderD/original.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderD/other.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folderD/original_converted.mkv')).toBe(
        true,
      );
    });
  });

  describe('Nested folder selection', () => {
    it('should only select files within the specified folder', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Select only the subfolder, not the parent
      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA/subfolder',
      );

      // Should select files in subfolder and its children
      expect(newState.selectedFiles.size).toBe(3);
      expect(newState.selectedFiles.has('folderA/subfolder/video5.mp4')).toBe(
        true,
      );
      expect(newState.selectedFiles.has('folderA/subfolder/video6.webm')).toBe(
        true,
      );
      expect(
        newState.selectedFiles.has('folderA/subfolder/deepfolder/video7.mov'),
      ).toBe(true);

      // Should NOT select files in parent folder
      expect(newState.selectedFiles.has('folderA/video3.mp4')).toBe(false);
      expect(newState.selectedFiles.has('folderA/video4.avi')).toBe(false);
    });

    it('should handle deeply nested folders correctly', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Select the deepest folder
      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA/subfolder/deepfolder',
      );

      // Should only select the file in the deep folder
      expect(newState.selectedFiles.size).toBe(1);
      expect(
        newState.selectedFiles.has('folderA/subfolder/deepfolder/video7.mov'),
      ).toBe(true);
    });
  });

  describe('Combined filters', () => {
    it('should respect multiple filters simultaneously', async () => {
      // Create a complex structure
      fs.mkdirSync(path.join(testDir, 'complex'));
      fs.writeFileSync(path.join(testDir, 'complex', 'video.mp4'), 'test');
      fs.writeFileSync(
        path.join(testDir, 'complex', 'video_converted.mkv'),
        'test',
      );
      fs.writeFileSync(path.join(testDir, 'complex', '.hidden.mp4'), 'test');
      fs.writeFileSync(path.join(testDir, 'complex', 'document.txt'), 'test');
      fs.writeFileSync(path.join(testDir, 'complex', 'other.avi'), 'test');

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = true;
      state.hideConverted = true;
      state.showHidden = false;

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'complex',
      );

      // Should only select: video.mp4 and other.avi
      // - video_converted.mkv excluded (hideConverted)
      // - .hidden.mp4 excluded (showHidden=false)
      // - document.txt excluded (videosOnly)
      expect(newState.selectedFiles.size).toBe(2);
      expect(newState.selectedFiles.has('complex/video.mp4')).toBe(true);
      expect(newState.selectedFiles.has('complex/other.avi')).toBe(true);
      expect(newState.selectedFiles.has('complex/video_converted.mkv')).toBe(
        false,
      );
      expect(newState.selectedFiles.has('complex/.hidden.mp4')).toBe(false);
      expect(newState.selectedFiles.has('complex/document.txt')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle folder with only subdirectories (no files)', async () => {
      fs.mkdirSync(path.join(testDir, 'parent'));
      fs.mkdirSync(path.join(testDir, 'parent', 'child1'));
      fs.mkdirSync(path.join(testDir, 'parent', 'child2'));
      // No files, only directories

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'parent',
      );

      expect(newState.selectedFiles.size).toBe(0);
    });

    it('should handle folder with files at multiple nesting levels', async () => {
      fs.mkdirSync(path.join(testDir, 'multi'));
      fs.writeFileSync(path.join(testDir, 'multi', 'level0.mp4'), 'test');

      fs.mkdirSync(path.join(testDir, 'multi', 'level1'));
      fs.writeFileSync(
        path.join(testDir, 'multi', 'level1', 'level1.mp4'),
        'test',
      );

      fs.mkdirSync(path.join(testDir, 'multi', 'level1', 'level2'));
      fs.writeFileSync(
        path.join(testDir, 'multi', 'level1', 'level2', 'level2.mp4'),
        'test',
      );

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'multi',
      );

      expect(newState.selectedFiles.size).toBe(3);
      expect(newState.selectedFiles.has('multi/level0.mp4')).toBe(true);
      expect(newState.selectedFiles.has('multi/level1/level1.mp4')).toBe(true);
      expect(newState.selectedFiles.has('multi/level1/level2/level2.mp4')).toBe(
        true,
      );
    });

    it('should preserve selections from other folders', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Select root level files manually
      state.selectedFiles.add('video1.mp4');
      state.selectedFiles.add('video2.mkv');

      // Select all in folderA
      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA',
      );

      // Should have root files + folderA files
      expect(newState.selectedFiles.size).toBe(8); // 2 root + 6 folderA
      expect(newState.selectedFiles.has('video1.mp4')).toBe(true);
      expect(newState.selectedFiles.has('video2.mkv')).toBe(true);
    });
  });

  describe('Potential bug scenarios', () => {
    it('should not select files from parent directory', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Select subfolder
      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA/subfolder',
      );

      // Make sure parent folder files are NOT selected
      expect(newState.selectedFiles.has('folderA/video3.mp4')).toBe(false);
      expect(newState.selectedFiles.has('folderA/video4.avi')).toBe(false);
    });

    it('should not select files from sibling directories', async () => {
      createTestStructure();

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Select folderA
      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA',
      );

      // Make sure folderB and folderC files are NOT selected
      expect(newState.selectedFiles.has('folderB/video8.mp4')).toBe(false);
      expect(newState.selectedFiles.has('folderC/visible.mp4')).toBe(false);
    });

    it('should handle paths with similar names correctly', async () => {
      // Create folders with similar names to test prefix matching
      fs.mkdirSync(path.join(testDir, 'folder'));
      fs.writeFileSync(path.join(testDir, 'folder', 'file.mp4'), 'test');

      fs.mkdirSync(path.join(testDir, 'folderA'));
      fs.writeFileSync(path.join(testDir, 'folderA', 'fileA.mp4'), 'test');

      fs.mkdirSync(path.join(testDir, 'folderAB'));
      fs.writeFileSync(path.join(testDir, 'folderAB', 'fileAB.mp4'), 'test');

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      // Select only 'folderA'
      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'folderA',
      );

      // Should only select from folderA
      expect(newState.selectedFiles.size).toBe(1);
      expect(newState.selectedFiles.has('folderA/fileA.mp4')).toBe(true);
      expect(newState.selectedFiles.has('folder/file.mp4')).toBe(false);
      expect(newState.selectedFiles.has('folderAB/fileAB.mp4')).toBe(false);
    });

    it('should correctly identify all files even with special characters in names', async () => {
      fs.mkdirSync(path.join(testDir, 'special'));
      fs.writeFileSync(
        path.join(testDir, 'special', 'file with spaces.mp4'),
        'test',
      );
      fs.writeFileSync(
        path.join(testDir, 'special', "file's apostrophe.mp4"),
        'test',
      );
      fs.writeFileSync(
        path.join(testDir, 'special', 'file-with-dash.mp4'),
        'test',
      );

      const state = FilePickerStateService.createEmpty();
      state.currentPath = '';
      state.videosOnly = false;

      const newState = await FilePickerStateService.toggleFolderSelection(
        state,
        'special',
      );

      expect(newState.selectedFiles.size).toBe(3);
      expect(newState.selectedFiles.has('special/file with spaces.mp4')).toBe(
        true,
      );
      expect(newState.selectedFiles.has("special/file's apostrophe.mp4")).toBe(
        true,
      );
      expect(newState.selectedFiles.has('special/file-with-dash.mp4')).toBe(
        true,
      );
    });
  });
});
