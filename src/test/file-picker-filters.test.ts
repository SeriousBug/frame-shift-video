/**
 * Integration tests for file picker filters and search
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FilePickerStateService } from '../../server/file-picker-service';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('FilePickerStateService - Filters and Search', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-picker-filters-'));
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

  describe('videosOnly filter', () => {
    beforeEach(() => {
      // Create test structure with mixed file types
      fs.writeFileSync(path.join(testDir, 'movie.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'clip.mkv'), 'video');
      fs.writeFileSync(path.join(testDir, 'document.txt'), 'text');
      fs.writeFileSync(path.join(testDir, 'image.jpg'), 'image');
      fs.writeFileSync(path.join(testDir, 'data.json'), '{}');
    });

    it('should show only video files when videosOnly is true', () => {
      const state = FilePickerStateService.createEmpty();
      state.videosOnly = true;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items.map((item) => item.name);
      expect(fileNames).toContain('movie.mp4');
      expect(fileNames).toContain('clip.mkv');
      expect(fileNames).not.toContain('document.txt');
      expect(fileNames).not.toContain('image.jpg');
      expect(fileNames).not.toContain('data.json');
    });

    it('should show all files when videosOnly is false', () => {
      const state = FilePickerStateService.createEmpty();
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items.map((item) => item.name);
      expect(fileNames).toContain('movie.mp4');
      expect(fileNames).toContain('clip.mkv');
      expect(fileNames).toContain('document.txt');
      expect(fileNames).toContain('image.jpg');
      expect(fileNames).toContain('data.json');
    });

    it('should recognize various video extensions', () => {
      // Create files with various video extensions
      fs.writeFileSync(path.join(testDir, 'test.avi'), 'video');
      fs.writeFileSync(path.join(testDir, 'test.mov'), 'video');
      fs.writeFileSync(path.join(testDir, 'test.wmv'), 'video');
      fs.writeFileSync(path.join(testDir, 'test.webm'), 'video');
      fs.writeFileSync(path.join(testDir, 'test.m4v'), 'video');

      const state = FilePickerStateService.createEmpty();
      state.videosOnly = true;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items.map((item) => item.name);
      expect(fileNames).toContain('test.avi');
      expect(fileNames).toContain('test.mov');
      expect(fileNames).toContain('test.wmv');
      expect(fileNames).toContain('test.webm');
      expect(fileNames).toContain('test.m4v');
    });
  });

  describe('showHidden filter', () => {
    beforeEach(() => {
      // Create test structure with hidden files
      fs.writeFileSync(path.join(testDir, 'visible.txt'), 'visible');
      fs.writeFileSync(path.join(testDir, '.hidden-file'), 'hidden');
      fs.mkdirSync(path.join(testDir, '.hidden-folder'));
      fs.writeFileSync(
        path.join(testDir, '.hidden-folder', 'file.txt'),
        'content',
      );
    });

    it('should hide hidden files when showHidden is false', () => {
      const state = FilePickerStateService.createEmpty();
      state.showHidden = false;
      state.videosOnly = false; // Show all file types
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items.map((item) => item.name);
      expect(fileNames).toContain('visible.txt');
      expect(fileNames).not.toContain('.hidden-file');
      expect(fileNames).not.toContain('.hidden-folder');
    });

    it('should show hidden files when showHidden is true', () => {
      const state = FilePickerStateService.createEmpty();
      state.showHidden = true;
      state.videosOnly = false; // Show all file types
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items.map((item) => item.name);
      expect(fileNames).toContain('visible.txt');
      expect(fileNames).toContain('.hidden-file');
      expect(fileNames).toContain('.hidden-folder');
    });

    it('should show hidden files in expanded folders when showHidden is true', () => {
      const state = FilePickerStateService.createEmpty();
      state.showHidden = true;
      state.videosOnly = false; // Show all file types
      state.expandedFolders.add('.hidden-folder');
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items.map((item) => item.name);
      expect(fileNames).toContain('.hidden-folder');
      expect(fileNames).toContain('file.txt');
    });
  });

  describe('hideConverted filter', () => {
    beforeEach(() => {
      // Create test structure with converted and non-converted videos
      fs.writeFileSync(path.join(testDir, 'movie1.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'movie1_converted.mp4'), 'converted');
      fs.writeFileSync(path.join(testDir, 'movie2.mp4'), 'video');
      // No converted version for movie2
      fs.writeFileSync(path.join(testDir, 'movie3_converted.mkv'), 'converted');
      // Only converted version exists
    });

    it('should hide converted files when hideConverted is true', () => {
      const state = FilePickerStateService.createEmpty();
      state.hideConverted = true;
      state.videosOnly = false; // Show all files for this test
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items.map((item) => item.name);
      expect(fileNames).toContain('movie1.mp4');
      expect(fileNames).not.toContain('movie1_converted.mp4');
      expect(fileNames).toContain('movie2.mp4');
      expect(fileNames).not.toContain('movie3_converted.mkv');
    });

    it('should show converted files when hideConverted is false', () => {
      const state = FilePickerStateService.createEmpty();
      state.hideConverted = false;
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items.map((item) => item.name);
      expect(fileNames).toContain('movie1.mp4');
      expect(fileNames).toContain('movie1_converted.mp4');
      expect(fileNames).toContain('movie2.mp4');
      expect(fileNames).toContain('movie3_converted.mkv');
    });

    it('should mark files with converted versions', () => {
      const state = FilePickerStateService.createEmpty();
      state.hideConverted = true;
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const movie1 = items.find((item) => item.name === 'movie1.mp4');
      const movie2 = items.find((item) => item.name === 'movie2.mp4');

      expect(movie1?.hasConvertedVersion).toBe(true);
      expect(movie2?.hasConvertedVersion).toBe(false);
    });
  });

  describe('search functionality - simple mode (wildcards)', () => {
    beforeEach(() => {
      // Create test structure for search
      fs.writeFileSync(path.join(testDir, 'charlie-2024.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'charlie-2023.mkv'), 'video');
      fs.writeFileSync(path.join(testDir, 'bob-2024.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'alice-movie.avi'), 'video');
      fs.mkdirSync(path.join(testDir, 'movies'));
      fs.writeFileSync(
        path.join(testDir, 'movies', 'charlie-epic.mp4'),
        'video',
      );
      fs.writeFileSync(path.join(testDir, 'movies', 'random.mp4'), 'video');
    });

    it('should find files with simple substring search', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*charlie*'; // Simple mode wraps with wildcards
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('charlie-2024.mp4');
      expect(fileNames).toContain('charlie-2023.mkv');
      expect(fileNames).toContain('charlie-epic.mp4');
      expect(fileNames).not.toContain('bob-2024.mp4');
      expect(fileNames).not.toContain('alice-movie.avi');
      expect(fileNames).not.toContain('random.mp4');
    });

    it('should find files with year pattern', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*2024*';
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('charlie-2024.mp4');
      expect(fileNames).toContain('bob-2024.mp4');
      expect(fileNames).not.toContain('charlie-2023.mkv');
      expect(fileNames).not.toContain('alice-movie.avi');
    });

    it('should be case insensitive', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*CHARLIE*'; // Uppercase search
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('charlie-2024.mp4');
      expect(fileNames).toContain('charlie-2023.mkv');
      expect(fileNames).toContain('charlie-epic.mp4');
    });

    it('should include parent folders in results when files match', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*charlie*';
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const folderNames = items
        .filter((item) => item.isDirectory)
        .map((item) => item.name);

      // The movies folder should be included because it contains charlie-epic.mp4
      expect(folderNames).toContain('movies');
    });
  });

  describe('search functionality - advanced mode (glob patterns)', () => {
    beforeEach(() => {
      // Create test structure for advanced search
      fs.writeFileSync(path.join(testDir, 'video.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'video.mkv'), 'video');
      fs.writeFileSync(path.join(testDir, 'movie.avi'), 'video');
      fs.writeFileSync(path.join(testDir, '2024-01-vacation.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, '2024-02-birthday.mkv'), 'video');
      fs.writeFileSync(path.join(testDir, '2023-summer.mp4'), 'video');
    });

    it('should match specific extension with wildcard', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*.mp4'; // Advanced mode pattern
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('video.mp4');
      expect(fileNames).toContain('2024-01-vacation.mp4');
      expect(fileNames).toContain('2023-summer.mp4');
      expect(fileNames).not.toContain('video.mkv');
      expect(fileNames).not.toContain('movie.avi');
    });

    it('should match multiple extensions with brace expansion', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*.{mp4,mkv}';
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('video.mp4');
      expect(fileNames).toContain('video.mkv');
      expect(fileNames).toContain('2024-02-birthday.mkv');
      expect(fileNames).not.toContain('movie.avi');
    });

    it('should match year prefix pattern', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '2024-*';
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('2024-01-vacation.mp4');
      expect(fileNames).toContain('2024-02-birthday.mkv');
      expect(fileNames).not.toContain('2023-summer.mp4');
      expect(fileNames).not.toContain('video.mp4');
    });

    it('should match complex pattern with year and extensions', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '2024-*.{mp4,mkv}';
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('2024-01-vacation.mp4');
      expect(fileNames).toContain('2024-02-birthday.mkv');
      expect(fileNames).not.toContain('2023-summer.mp4');
    });
  });

  describe('combined filters - videosOnly + search', () => {
    beforeEach(() => {
      // Mixed file types with search patterns
      fs.writeFileSync(path.join(testDir, 'charlie.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'charlie.txt'), 'text');
      fs.writeFileSync(path.join(testDir, 'bob.mkv'), 'video');
      fs.writeFileSync(path.join(testDir, 'charlie-notes.pdf'), 'pdf');
    });

    it('should filter by both videosOnly and search pattern', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*charlie*';
      state.videosOnly = true;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      // Should find charlie.mp4 (video + matches search)
      expect(fileNames).toContain('charlie.mp4');
      // Should NOT find charlie.txt (not a video)
      expect(fileNames).not.toContain('charlie.txt');
      // Should NOT find charlie-notes.pdf (not a video)
      expect(fileNames).not.toContain('charlie-notes.pdf');
      // Should NOT find bob.mkv (doesn't match search)
      expect(fileNames).not.toContain('bob.mkv');
    });

    it('should work with advanced patterns and videosOnly', () => {
      fs.writeFileSync(path.join(testDir, 'test.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'test.txt'), 'text');

      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*.mp4';
      state.videosOnly = true;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('charlie.mp4');
      expect(fileNames).toContain('test.mp4');
      expect(fileNames).not.toContain('bob.mkv');
      expect(fileNames).not.toContain('test.txt');
    });
  });

  describe('combined filters - showHidden + search', () => {
    beforeEach(() => {
      // Hidden and visible files with search patterns
      fs.writeFileSync(path.join(testDir, 'charlie.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, '.charlie-hidden.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'bob.mp4'), 'video');
      fs.mkdirSync(path.join(testDir, '.hidden-folder'));
      fs.writeFileSync(
        path.join(testDir, '.hidden-folder', 'charlie.mp4'),
        'video',
      );
    });

    it('should search only visible files when showHidden is false', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*charlie*';
      state.showHidden = false;
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('charlie.mp4');
      expect(fileNames).not.toContain('.charlie-hidden.mp4');
    });

    it('should search hidden files when showHidden is true', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*charlie*';
      state.showHidden = true;
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      // Should find visible charlie.mp4
      expect(fileNames).toContain('charlie.mp4');

      // Should have at least 2 files (charlie.mp4 visible + charlie.mp4 from hidden folder)
      expect(fileNames.length).toBeGreaterThanOrEqual(2);

      // Verify .hidden-folder was included in search results
      const folderNames = items
        .filter((item) => item.isDirectory)
        .map((item) => item.name);
      expect(folderNames).toContain('.hidden-folder');
    });
  });

  describe('combined filters - hideConverted + search', () => {
    beforeEach(() => {
      // Converted and non-converted files with search patterns
      fs.writeFileSync(path.join(testDir, 'charlie-2024.mp4'), 'video');
      fs.writeFileSync(
        path.join(testDir, 'charlie-2024_converted.mp4'),
        'converted',
      );
      fs.writeFileSync(path.join(testDir, 'charlie-2023.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'bob-2024.mp4'), 'video');
    });

    it('should exclude converted files from search results when hideConverted is true', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*charlie*';
      state.hideConverted = true;
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('charlie-2024.mp4');
      expect(fileNames).toContain('charlie-2023.mp4');
      expect(fileNames).not.toContain('charlie-2024_converted.mp4');
    });

    it('should include converted files in search results when hideConverted is false', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*charlie*';
      state.hideConverted = false;
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('charlie-2024.mp4');
      expect(fileNames).toContain('charlie-2023.mp4');
      expect(fileNames).toContain('charlie-2024_converted.mp4');
    });

    it('should search for only converted files when pattern matches', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*_converted*';
      state.hideConverted = false;
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('charlie-2024_converted.mp4');
      expect(fileNames).not.toContain('charlie-2024.mp4');
      expect(fileNames).not.toContain('charlie-2023.mp4');
    });
  });

  describe('combined filters - all filters + search', () => {
    beforeEach(() => {
      // Complex test structure with all filter types
      fs.writeFileSync(path.join(testDir, 'charlie-2024.mp4'), 'video');
      fs.writeFileSync(
        path.join(testDir, 'charlie-2024_converted.mp4'),
        'converted',
      );
      fs.writeFileSync(path.join(testDir, '.charlie-hidden.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'charlie-notes.txt'), 'text');
      fs.writeFileSync(path.join(testDir, 'bob-2024.mkv'), 'video');
      fs.mkdirSync(path.join(testDir, '.hidden-folder'));
      fs.writeFileSync(
        path.join(testDir, '.hidden-folder', 'charlie-secret.mp4'),
        'video',
      );
    });

    it('should apply all filters together: videosOnly + hideConverted + showHidden=false + search', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*charlie*';
      state.videosOnly = true;
      state.hideConverted = true;
      state.showHidden = false;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      // Should ONLY find charlie-2024.mp4
      expect(fileNames).toContain('charlie-2024.mp4');

      // Should NOT find:
      expect(fileNames).not.toContain('charlie-2024_converted.mp4'); // hideConverted
      expect(fileNames).not.toContain('.charlie-hidden.mp4'); // showHidden=false
      expect(fileNames).not.toContain('charlie-notes.txt'); // videosOnly
      expect(fileNames).not.toContain('bob-2024.mkv'); // search pattern
      expect(fileNames).not.toContain('charlie-secret.mp4'); // showHidden=false (in hidden folder)
    });

    it('should apply all filters together: videosOnly + hideConverted=false + showHidden=true + search', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*charlie*';
      state.videosOnly = true;
      state.hideConverted = false;
      state.showHidden = true;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      // Should find all charlie video files (including hidden and converted)
      expect(fileNames).toContain('charlie-2024.mp4');
      expect(fileNames).toContain('charlie-2024_converted.mp4');
      expect(fileNames).toContain('charlie-secret.mp4');

      // Should have at least 3 charlie video files
      expect(fileNames.length).toBeGreaterThanOrEqual(3);

      // Should NOT find non-video files
      expect(fileNames).not.toContain('charlie-notes.txt');
    });

    it('should work with no filters enabled and search', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*charlie*';
      state.videosOnly = false;
      state.hideConverted = false;
      state.showHidden = true;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      // Should find ALL charlie files (at least 4: video, converted, notes, secret)
      expect(fileNames).toContain('charlie-2024.mp4');
      expect(fileNames).toContain('charlie-2024_converted.mp4');
      expect(fileNames).toContain('charlie-notes.txt');
      expect(fileNames).toContain('charlie-secret.mp4');
      // Should have at least 4 files
      expect(fileNames.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('empty search results', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(testDir, 'movie1.mp4'), 'video');
      fs.writeFileSync(path.join(testDir, 'movie2.mkv'), 'video');
    });

    it('should return empty results when search matches nothing', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*nonexistent*';
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      expect(items.length).toBe(0);
    });

    it('should return empty results when filters exclude everything', () => {
      // Create a fresh test directory for this test
      const emptyTestDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'empty-test-'),
      );
      const prevDir = process.env.FRAME_SHIFT_HOME;
      process.env.FRAME_SHIFT_HOME = emptyTestDir;

      try {
        // Only non-video files exist
        fs.writeFileSync(path.join(emptyTestDir, 'document.txt'), 'text');

        const state = FilePickerStateService.createEmpty();
        state.videosOnly = true; // Only videos
        state.searchQuery = ''; // No search
        const items = FilePickerStateService.buildItemsList(state);

        const fileItems = items.filter((item) => !item.isDirectory);
        // Should not include the txt file
        expect(fileItems.length).toBe(0);
      } finally {
        // Restore and cleanup
        process.env.FRAME_SHIFT_HOME = prevDir;
        fs.rmSync(emptyTestDir, { recursive: true, force: true });
      }
    });
  });

  describe('nested folders with filters', () => {
    beforeEach(() => {
      // Create nested structure
      fs.mkdirSync(path.join(testDir, 'movies'));
      fs.mkdirSync(path.join(testDir, 'movies', 'charlie'));
      fs.writeFileSync(
        path.join(testDir, 'movies', 'charlie', 'epic-2024.mp4'),
        'video',
      );
      fs.writeFileSync(
        path.join(testDir, 'movies', 'charlie', 'comedy.mkv'),
        'video',
      );
      fs.mkdirSync(path.join(testDir, 'movies', 'bob'));
      fs.writeFileSync(
        path.join(testDir, 'movies', 'bob', 'action.mp4'),
        'video',
      );
    });

    it('should search nested folders and include parent folders', () => {
      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*epic*'; // Search for a specific file
      state.videosOnly = false;
      const items = FilePickerStateService.buildItemsList(state);

      const itemNames = items.map((item) => item.name);

      // Should include parent folders leading to matches
      expect(itemNames).toContain('movies');
      expect(itemNames).toContain('charlie');
      expect(itemNames).toContain('epic-2024.mp4');
      expect(itemNames).not.toContain('bob'); // No epic files in bob folder
    });

    it('should apply videosOnly filter in nested folders', () => {
      // Add non-video file in charlie folder
      fs.writeFileSync(
        path.join(testDir, 'movies', 'charlie', 'notes.txt'),
        'text',
      );

      const state = FilePickerStateService.createEmpty();
      state.searchQuery = '*';
      state.videosOnly = true;
      const items = FilePickerStateService.buildItemsList(state);

      const fileNames = items
        .filter((item) => !item.isDirectory)
        .map((item) => item.name);

      expect(fileNames).toContain('epic-2024.mp4');
      expect(fileNames).toContain('comedy.mkv');
      expect(fileNames).toContain('action.mp4');
      expect(fileNames).not.toContain('notes.txt');
    });
  });
});
