/**
 * Integration tests for file picker service allConverted feature
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FilePickerStateService } from '../../server/file-picker-service';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('FilePickerStateService - allConverted feature', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-picker-test-'));
    // Set the base path for testing
    process.env.FRAME_SHIFT_HOME = testDir;
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.FRAME_SHIFT_HOME;
  });

  describe('single level folders', () => {
    it('should mark folder as NOT converted when it has non-converted videos', () => {
      // Create folder with non-converted video
      fs.mkdirSync(path.join(testDir, 'videos'));
      fs.writeFileSync(
        path.join(testDir, 'videos', 'movie.mp4'),
        'video content',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('videos');
      const items = FilePickerStateService.buildItemsList(state);

      const videosFolder = items.find((item) => item.name === 'videos');
      expect(videosFolder?.allConverted).toBe(false);
    });

    it('should mark folder as converted when all videos have converted versions', () => {
      // Create folder with converted video
      fs.mkdirSync(path.join(testDir, 'videos'));
      fs.writeFileSync(
        path.join(testDir, 'videos', 'movie.mp4'),
        'video content',
      );
      fs.writeFileSync(
        path.join(testDir, 'videos', 'movie_converted.mp4'),
        'converted content',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('videos');
      const items = FilePickerStateService.buildItemsList(state);

      const videosFolder = items.find((item) => item.name === 'videos');
      expect(videosFolder?.allConverted).toBe(true);
    });

    it('should NOT show checkmark for empty folders', () => {
      // Create empty folder
      fs.mkdirSync(path.join(testDir, 'empty'));

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('empty');
      const items = FilePickerStateService.buildItemsList(state);

      const emptyFolder = items.find((item) => item.name === 'empty');
      expect(emptyFolder?.allConverted).toBe(false);
    });

    it('should NOT show checkmark for folders with only non-video files', () => {
      // Create folder with non-video files
      fs.mkdirSync(path.join(testDir, 'documents'));
      fs.writeFileSync(
        path.join(testDir, 'documents', 'readme.txt'),
        'text content',
      );
      fs.writeFileSync(path.join(testDir, 'documents', 'data.json'), '{}');

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('documents');
      const items = FilePickerStateService.buildItemsList(state);

      const documentsFolder = items.find((item) => item.name === 'documents');
      expect(documentsFolder?.allConverted).toBe(false);
    });

    it('should handle mixed converted and non-converted videos correctly', () => {
      // Create folder with mixed videos
      fs.mkdirSync(path.join(testDir, 'mixed'));
      fs.writeFileSync(path.join(testDir, 'mixed', 'movie1.mp4'), 'video 1');
      fs.writeFileSync(
        path.join(testDir, 'mixed', 'movie1_converted.mp4'),
        'converted 1',
      );
      fs.writeFileSync(path.join(testDir, 'mixed', 'movie2.mp4'), 'video 2');
      // movie2 has no converted version

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('mixed');
      const items = FilePickerStateService.buildItemsList(state);

      const mixedFolder = items.find((item) => item.name === 'mixed');
      expect(mixedFolder?.allConverted).toBe(false);
    });
  });

  describe('nested folders (2 levels)', () => {
    it('should mark parent as NOT converted when child has non-converted videos', () => {
      // Create nested structure with non-converted video
      fs.mkdirSync(path.join(testDir, 'parent'));
      fs.mkdirSync(path.join(testDir, 'parent', 'child'));
      fs.writeFileSync(
        path.join(testDir, 'parent', 'child', 'video.mp4'),
        'video content',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('parent');
      state.expandedFolders.add('parent/child');
      const items = FilePickerStateService.buildItemsList(state);

      const parentFolder = items.find((item) => item.name === 'parent');
      const childFolder = items.find((item) => item.name === 'child');

      expect(childFolder?.allConverted).toBe(false);
      expect(parentFolder?.allConverted).toBe(false);
    });

    it('should mark both parent and child as converted when all videos are converted', () => {
      // Create nested structure with all converted videos
      fs.mkdirSync(path.join(testDir, 'parent'));
      fs.mkdirSync(path.join(testDir, 'parent', 'child'));
      fs.writeFileSync(
        path.join(testDir, 'parent', 'child', 'video.mp4'),
        'video content',
      );
      fs.writeFileSync(
        path.join(testDir, 'parent', 'child', 'video_converted.mp4'),
        'converted content',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('parent');
      state.expandedFolders.add('parent/child');
      const items = FilePickerStateService.buildItemsList(state);

      const parentFolder = items.find((item) => item.name === 'parent');
      const childFolder = items.find((item) => item.name === 'child');

      expect(childFolder?.allConverted).toBe(true);
      expect(parentFolder?.allConverted).toBe(true);
    });

    it('should NOT show checkmark on parent when child has no videos', () => {
      // Create parent with child that has no videos
      fs.mkdirSync(path.join(testDir, 'parent'));
      fs.mkdirSync(path.join(testDir, 'parent', 'empty-child'));

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('parent');
      const items = FilePickerStateService.buildItemsList(state);

      const parentFolder = items.find((item) => item.name === 'parent');
      expect(parentFolder?.allConverted).toBe(false);
    });
  });

  describe('deeply nested folders (3+ levels)', () => {
    it('should correctly compute allConverted for deeply nested structure', () => {
      // Create 3-level nested structure
      fs.mkdirSync(path.join(testDir, 'level1'));
      fs.mkdirSync(path.join(testDir, 'level1', 'level2'));
      fs.mkdirSync(path.join(testDir, 'level1', 'level2', 'level3'));
      fs.writeFileSync(
        path.join(testDir, 'level1', 'level2', 'level3', 'video.mp4'),
        'video',
      );
      fs.writeFileSync(
        path.join(testDir, 'level1', 'level2', 'level3', 'video_converted.mp4'),
        'converted',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('level1');
      state.expandedFolders.add('level1/level2');
      state.expandedFolders.add('level1/level2/level3');
      const items = FilePickerStateService.buildItemsList(state);

      const level1 = items.find((item) => item.name === 'level1');
      const level2 = items.find((item) => item.name === 'level2');
      const level3 = items.find((item) => item.name === 'level3');

      expect(level3?.allConverted).toBe(true);
      expect(level2?.allConverted).toBe(true);
      expect(level1?.allConverted).toBe(true);
    });

    it('should mark all ancestors as NOT converted when deep child has non-converted video', () => {
      // Create 4-level nested structure with non-converted video at bottom
      fs.mkdirSync(path.join(testDir, 'a'));
      fs.mkdirSync(path.join(testDir, 'a', 'b'));
      fs.mkdirSync(path.join(testDir, 'a', 'b', 'c'));
      fs.mkdirSync(path.join(testDir, 'a', 'b', 'c', 'd'));
      fs.writeFileSync(
        path.join(testDir, 'a', 'b', 'c', 'd', 'video.mp4'),
        'video',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('a');
      state.expandedFolders.add('a/b');
      state.expandedFolders.add('a/b/c');
      state.expandedFolders.add('a/b/c/d');
      const items = FilePickerStateService.buildItemsList(state);

      const folderA = items.find((item) => item.name === 'a');
      const folderB = items.find((item) => item.name === 'b');
      const folderC = items.find((item) => item.name === 'c');
      const folderD = items.find((item) => item.name === 'd');

      expect(folderD?.allConverted).toBe(false);
      expect(folderC?.allConverted).toBe(false);
      expect(folderB?.allConverted).toBe(false);
      expect(folderA?.allConverted).toBe(false);
    });
  });

  describe('folders with mixed children (files and subfolders)', () => {
    it('should handle parent with direct files and subfolder correctly', () => {
      // Parent has direct video + subfolder with video
      // Both are converted
      fs.mkdirSync(path.join(testDir, 'parent'));
      fs.writeFileSync(path.join(testDir, 'parent', 'direct.mp4'), 'video');
      fs.writeFileSync(
        path.join(testDir, 'parent', 'direct_converted.mp4'),
        'converted',
      );
      fs.mkdirSync(path.join(testDir, 'parent', 'subfolder'));
      fs.writeFileSync(
        path.join(testDir, 'parent', 'subfolder', 'nested.mp4'),
        'video',
      );
      fs.writeFileSync(
        path.join(testDir, 'parent', 'subfolder', 'nested_converted.mp4'),
        'converted',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('parent');
      state.expandedFolders.add('parent/subfolder');
      const items = FilePickerStateService.buildItemsList(state);

      const parentFolder = items.find((item) => item.name === 'parent');
      const subfolder = items.find((item) => item.name === 'subfolder');

      expect(subfolder?.allConverted).toBe(true);
      expect(parentFolder?.allConverted).toBe(true);
    });

    it('should fail parent when direct file is not converted but subfolder is', () => {
      // Parent has non-converted direct video + converted subfolder
      fs.mkdirSync(path.join(testDir, 'parent'));
      fs.writeFileSync(path.join(testDir, 'parent', 'direct.mp4'), 'video');
      // No converted version for direct.mp4
      fs.mkdirSync(path.join(testDir, 'parent', 'subfolder'));
      fs.writeFileSync(
        path.join(testDir, 'parent', 'subfolder', 'nested.mp4'),
        'video',
      );
      fs.writeFileSync(
        path.join(testDir, 'parent', 'subfolder', 'nested_converted.mp4'),
        'converted',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('parent');
      state.expandedFolders.add('parent/subfolder');
      const items = FilePickerStateService.buildItemsList(state);

      const parentFolder = items.find((item) => item.name === 'parent');
      const subfolder = items.find((item) => item.name === 'subfolder');

      expect(subfolder?.allConverted).toBe(true);
      expect(parentFolder?.allConverted).toBe(false); // Direct file not converted
    });

    it('should fail parent when subfolder is not converted but direct file is', () => {
      // Parent has converted direct video + non-converted subfolder
      fs.mkdirSync(path.join(testDir, 'parent'));
      fs.writeFileSync(path.join(testDir, 'parent', 'direct.mp4'), 'video');
      fs.writeFileSync(
        path.join(testDir, 'parent', 'direct_converted.mp4'),
        'converted',
      );
      fs.mkdirSync(path.join(testDir, 'parent', 'subfolder'));
      fs.writeFileSync(
        path.join(testDir, 'parent', 'subfolder', 'nested.mp4'),
        'video',
      );
      // No converted version for nested.mp4

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('parent');
      state.expandedFolders.add('parent/subfolder');
      const items = FilePickerStateService.buildItemsList(state);

      const parentFolder = items.find((item) => item.name === 'parent');
      const subfolder = items.find((item) => item.name === 'subfolder');

      expect(subfolder?.allConverted).toBe(false);
      expect(parentFolder?.allConverted).toBe(false); // Subfolder not converted
    });

    it('should handle parent with multiple subfolders in mixed states', () => {
      // Parent has 2 subfolders: one converted, one not
      fs.mkdirSync(path.join(testDir, 'parent'));
      fs.mkdirSync(path.join(testDir, 'parent', 'converted-folder'));
      fs.writeFileSync(
        path.join(testDir, 'parent', 'converted-folder', 'video.mp4'),
        'video',
      );
      fs.writeFileSync(
        path.join(testDir, 'parent', 'converted-folder', 'video_converted.mp4'),
        'converted',
      );

      fs.mkdirSync(path.join(testDir, 'parent', 'unconverted-folder'));
      fs.writeFileSync(
        path.join(testDir, 'parent', 'unconverted-folder', 'video.mp4'),
        'video',
      );
      // No converted version

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('parent');
      state.expandedFolders.add('parent/converted-folder');
      state.expandedFolders.add('parent/unconverted-folder');
      const items = FilePickerStateService.buildItemsList(state);

      const parentFolder = items.find((item) => item.name === 'parent');
      const convertedFolder = items.find(
        (item) => item.name === 'converted-folder',
      );
      const unconvertedFolder = items.find(
        (item) => item.name === 'unconverted-folder',
      );

      expect(convertedFolder?.allConverted).toBe(true);
      expect(unconvertedFolder?.allConverted).toBe(false);
      expect(parentFolder?.allConverted).toBe(false); // One child not converted
    });
  });

  describe('edge cases', () => {
    it('should handle folder with only _converted files (no originals)', () => {
      // Folder has only converted files, no originals
      fs.mkdirSync(path.join(testDir, 'converted-only'));
      fs.writeFileSync(
        path.join(testDir, 'converted-only', 'video_converted.mp4'),
        'converted',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('converted-only');
      const items = FilePickerStateService.buildItemsList(state);

      const folder = items.find((item) => item.name === 'converted-only');
      // No original videos to convert, so no checkmark
      expect(folder?.allConverted).toBe(false);
    });

    it('should handle various video file extensions', () => {
      // Test multiple video extensions
      fs.mkdirSync(path.join(testDir, 'multi-format'));
      fs.writeFileSync(
        path.join(testDir, 'multi-format', 'video.mp4'),
        'video',
      );
      fs.writeFileSync(
        path.join(testDir, 'multi-format', 'video_converted.mp4'),
        'converted',
      );
      fs.writeFileSync(
        path.join(testDir, 'multi-format', 'movie.mkv'),
        'video',
      );
      fs.writeFileSync(
        path.join(testDir, 'multi-format', 'movie_converted.mkv'),
        'converted',
      );
      fs.writeFileSync(path.join(testDir, 'multi-format', 'clip.avi'), 'video');
      fs.writeFileSync(
        path.join(testDir, 'multi-format', 'clip_converted.avi'),
        'converted',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('multi-format');
      const items = FilePickerStateService.buildItemsList(state);

      const folder = items.find((item) => item.name === 'multi-format');
      expect(folder?.allConverted).toBe(true);
    });

    it('should ignore non-video files when computing allConverted', () => {
      // Folder has videos (all converted) + non-video files
      fs.mkdirSync(path.join(testDir, 'mixed-types'));
      fs.writeFileSync(path.join(testDir, 'mixed-types', 'video.mp4'), 'video');
      fs.writeFileSync(
        path.join(testDir, 'mixed-types', 'video_converted.mp4'),
        'converted',
      );
      fs.writeFileSync(path.join(testDir, 'mixed-types', 'readme.txt'), 'text');
      fs.writeFileSync(path.join(testDir, 'mixed-types', 'data.json'), '{}');
      fs.writeFileSync(path.join(testDir, 'mixed-types', 'image.jpg'), 'image');

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('mixed-types');
      const items = FilePickerStateService.buildItemsList(state);

      const folder = items.find((item) => item.name === 'mixed-types');
      // Non-video files should not affect the result
      expect(folder?.allConverted).toBe(true);
    });

    it('should handle folder with mix of video types where some are not video extensions', () => {
      // One real video converted, one non-video file
      fs.mkdirSync(path.join(testDir, 'partial-video'));
      fs.writeFileSync(
        path.join(testDir, 'partial-video', 'video.mp4'),
        'video',
      );
      fs.writeFileSync(
        path.join(testDir, 'partial-video', 'video_converted.mp4'),
        'converted',
      );
      fs.writeFileSync(
        path.join(testDir, 'partial-video', 'not-a-video.txt'),
        'text',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('partial-video');
      const items = FilePickerStateService.buildItemsList(state);

      const folder = items.find((item) => item.name === 'partial-video');
      expect(folder?.allConverted).toBe(true);
    });
  });

  describe('complex nested scenarios', () => {
    it('should handle complex tree with mixed conversion states at multiple levels', () => {
      /**
       * Structure:
       * root/
       *   video1.mp4 (converted)
       *   video1_converted.mp4
       *   subfolder1/
       *     video2.mp4 (NOT converted)
       *   subfolder2/
       *     video3.mp4 (converted)
       *     video3_converted.mp4
       *     deep/
       *       video4.mp4 (converted)
       *       video4_converted.mp4
       */
      fs.mkdirSync(path.join(testDir, 'root'));
      fs.writeFileSync(path.join(testDir, 'root', 'video1.mp4'), 'video');
      fs.writeFileSync(
        path.join(testDir, 'root', 'video1_converted.mp4'),
        'converted',
      );

      fs.mkdirSync(path.join(testDir, 'root', 'subfolder1'));
      fs.writeFileSync(
        path.join(testDir, 'root', 'subfolder1', 'video2.mp4'),
        'video',
      );
      // No converted version for video2

      fs.mkdirSync(path.join(testDir, 'root', 'subfolder2'));
      fs.writeFileSync(
        path.join(testDir, 'root', 'subfolder2', 'video3.mp4'),
        'video',
      );
      fs.writeFileSync(
        path.join(testDir, 'root', 'subfolder2', 'video3_converted.mp4'),
        'converted',
      );

      fs.mkdirSync(path.join(testDir, 'root', 'subfolder2', 'deep'));
      fs.writeFileSync(
        path.join(testDir, 'root', 'subfolder2', 'deep', 'video4.mp4'),
        'video',
      );
      fs.writeFileSync(
        path.join(
          testDir,
          'root',
          'subfolder2',
          'deep',
          'video4_converted.mp4',
        ),
        'converted',
      );

      const state = FilePickerStateService.createEmpty();
      state.expandedFolders.add('root');
      state.expandedFolders.add('root/subfolder1');
      state.expandedFolders.add('root/subfolder2');
      state.expandedFolders.add('root/subfolder2/deep');
      const items = FilePickerStateService.buildItemsList(state);

      const root = items.find((item) => item.name === 'root');
      const subfolder1 = items.find((item) => item.name === 'subfolder1');
      const subfolder2 = items.find((item) => item.name === 'subfolder2');
      const deep = items.find((item) => item.name === 'deep');

      expect(deep?.allConverted).toBe(true);
      expect(subfolder2?.allConverted).toBe(true); // Both direct file and deep folder converted
      expect(subfolder1?.allConverted).toBe(false); // Has unconverted video
      expect(root?.allConverted).toBe(false); // subfolder1 not converted
    });
  });
});
