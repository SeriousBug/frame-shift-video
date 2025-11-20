/**
 * Performance tests for file picker service
 * Tests directory listing and search performance with large file systems
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { FilePickerStateService } from '../../server/file-picker-service';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('FilePickerStateService - Performance Tests', () => {
  let testDir: string;
  let stats = {
    totalFiles: 0,
    totalDirs: 0,
    maxDepth: 0,
  };

  /**
   * Create a deep directory structure for testing
   * This simulates a realistic file system with:
   * - Deep nesting (configurable depth)
   * - Many files per directory
   * - Mix of video and non-video files
   */
  function createMockFileSystem(
    basePath: string,
    depth: number,
    dirsPerLevel: number,
    filesPerDir: number,
    currentDepth: number = 0,
  ): void {
    if (currentDepth > depth) return;

    // Track max depth
    if (currentDepth > stats.maxDepth) {
      stats.maxDepth = currentDepth;
    }

    // Create files in this directory
    for (let i = 0; i < filesPerDir; i++) {
      const isVideo = i % 3 === 0; // Every 3rd file is a video
      const hasConverted = i % 6 === 0; // Every 6th file has a converted version

      if (isVideo) {
        const videoName = `video_${currentDepth}_${i}.mp4`;
        fs.writeFileSync(path.join(basePath, videoName), '');
        stats.totalFiles++;

        if (hasConverted) {
          const convertedName = `video_${currentDepth}_${i}_converted.mp4`;
          fs.writeFileSync(path.join(basePath, convertedName), '');
          stats.totalFiles++;
        }
      } else {
        const fileName = `file_${currentDepth}_${i}.txt`;
        fs.writeFileSync(path.join(basePath, fileName), '');
        stats.totalFiles++;
      }
    }

    // Create subdirectories and recurse
    for (let i = 0; i < dirsPerLevel; i++) {
      const dirName = `folder_${currentDepth}_${i}`;
      const dirPath = path.join(basePath, dirName);
      fs.mkdirSync(dirPath);
      stats.totalDirs++;

      createMockFileSystem(
        dirPath,
        depth,
        dirsPerLevel,
        filesPerDir,
        currentDepth + 1,
      );
    }
  }

  beforeAll(() => {
    console.log('\n🔧 Setting up performance test environment...');

    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-test-'));
    process.env.FRAME_SHIFT_HOME = testDir;

    // Create a realistic file system
    // Depth: 5, Dirs per level: 3, Files per dir: 20
    // This creates a moderately complex structure
    console.log('📁 Creating mock file system...');
    const startCreate = performance.now();

    createMockFileSystem(testDir, 5, 3, 20, 0);

    const endCreate = performance.now();
    console.log(
      `✅ Created ${stats.totalFiles} files in ${stats.totalDirs} directories`,
    );
    console.log(`   Max depth: ${stats.maxDepth}`);
    console.log(
      `   Creation time: ${(endCreate - startCreate).toFixed(2)}ms\n`,
    );
  });

  afterAll(() => {
    // Clean up test directory
    console.log('\n🧹 Cleaning up test environment...');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.FRAME_SHIFT_HOME;
    console.log('✅ Cleanup complete\n');
  });

  it('should measure initial directory listing performance (root level)', async () => {
    console.log('🧪 Test: Initial directory listing (root)');

    const state = FilePickerStateService.createEmpty();

    const start = performance.now();
    const items = await FilePickerStateService.buildItemsList(state);
    const end = performance.now();

    const duration = end - start;
    console.log(`   Items returned: ${items.length}`);
    console.log(`   Duration: ${duration.toFixed(2)}ms`);

    // This should be fast as it only lists one level
    expect(items.length).toBeGreaterThan(0);

    // Log warning if slow
    if (duration > 100) {
      console.warn(
        `   ⚠️  WARNING: Root listing took ${duration.toFixed(2)}ms (expected < 100ms)`,
      );
    }
  });

  it('should measure performance with one folder expanded', async () => {
    console.log('🧪 Test: One folder expanded');

    const state = FilePickerStateService.createEmpty();
    state.expandedFolders.add('folder_0_0');

    const start = performance.now();
    const items = await FilePickerStateService.buildItemsList(state);
    const end = performance.now();

    const duration = end - start;
    console.log(`   Items returned: ${items.length}`);
    console.log(`   Duration: ${duration.toFixed(2)}ms`);

    expect(items.length).toBeGreaterThan(0);

    if (duration > 200) {
      console.warn(
        `   ⚠️  WARNING: Single folder expansion took ${duration.toFixed(2)}ms (expected < 200ms)`,
      );
    }
  });

  it('should measure performance with deep folder hierarchy expanded', async () => {
    console.log('🧪 Test: Deep folder hierarchy expanded');

    const state = FilePickerStateService.createEmpty();
    // Expand a path down the tree
    state.expandedFolders.add('folder_0_0');
    state.expandedFolders.add('folder_0_0/folder_1_0');
    state.expandedFolders.add('folder_0_0/folder_1_0/folder_2_0');
    state.expandedFolders.add('folder_0_0/folder_1_0/folder_2_0/folder_3_0');

    const start = performance.now();
    const items = await FilePickerStateService.buildItemsList(state);
    const end = performance.now();

    const duration = end - start;
    console.log(`   Expanded folders: ${state.expandedFolders.size}`);
    console.log(`   Items returned: ${items.length}`);
    console.log(`   Duration: ${duration.toFixed(2)}ms`);

    expect(items.length).toBeGreaterThan(0);

    if (duration > 500) {
      console.warn(
        `   ⚠️  WARNING: Deep expansion took ${duration.toFixed(2)}ms (expected < 500ms)`,
      );
    }
  });

  it('should measure search performance (simple pattern)', async () => {
    console.log('🧪 Test: Search with simple pattern');

    const state = FilePickerStateService.createEmpty();
    state.searchQuery = '*.mp4';

    const start = performance.now();
    const items = await FilePickerStateService.buildItemsList(state);
    const end = performance.now();

    const duration = end - start;
    console.log(`   Search pattern: ${state.searchQuery}`);
    console.log(`   Items returned: ${items.length}`);
    console.log(`   Duration: ${duration.toFixed(2)}ms`);

    // Search should return only video files
    const videoFiles = items.filter((item) => !item.isDirectory);
    expect(videoFiles.length).toBeGreaterThan(0);

    if (duration > 1000) {
      console.warn(
        `   ⚠️  WARNING: Search took ${duration.toFixed(2)}ms (expected < 1000ms)`,
      );
    }
  });

  it('should measure search performance (specific filename)', async () => {
    console.log('🧪 Test: Search with specific filename');

    const state = FilePickerStateService.createEmpty();
    state.searchQuery = '*video_2_5*';

    const start = performance.now();
    const items = await FilePickerStateService.buildItemsList(state);
    const end = performance.now();

    const duration = end - start;
    console.log(`   Search pattern: ${state.searchQuery}`);
    console.log(`   Items returned: ${items.length}`);
    console.log(`   Duration: ${duration.toFixed(2)}ms`);

    expect(items.length).toBeGreaterThanOrEqual(0);

    if (duration > 1000) {
      console.warn(
        `   ⚠️  WARNING: Specific search took ${duration.toFixed(2)}ms (expected < 1000ms)`,
      );
    }
  });

  it('should measure folder selection toggle performance', async () => {
    console.log('🧪 Test: Folder selection toggle');

    const state = FilePickerStateService.createEmpty();
    state.expandedFolders.add('folder_0_0');

    const start = performance.now();
    const newState = await FilePickerStateService.toggleFolderSelection(
      state,
      'folder_0_0',
    );
    const end = performance.now();

    const duration = end - start;
    console.log(`   Files selected: ${newState.selectedFiles.size}`);
    console.log(`   Duration: ${duration.toFixed(2)}ms`);

    expect(newState.selectedFiles.size).toBeGreaterThan(0);

    if (duration > 500) {
      console.warn(
        `   ⚠️  WARNING: Folder selection took ${duration.toFixed(2)}ms (expected < 500ms)`,
      );
    }
  });

  it('should measure performance with videosOnly filter enabled', async () => {
    console.log('🧪 Test: VideosOnly filter');

    const state = FilePickerStateService.createEmpty();
    state.videosOnly = true;

    const start = performance.now();
    const items = await FilePickerStateService.buildItemsList(state);
    const end = performance.now();

    const duration = end - start;
    const files = items.filter((item) => !item.isDirectory);
    console.log(`   Items returned: ${items.length}`);
    console.log(`   Files (should be videos only): ${files.length}`);
    console.log(`   Duration: ${duration.toFixed(2)}ms`);

    // All files should be videos
    const allVideos = files.every((file) => file.name.endsWith('.mp4'));
    expect(allVideos).toBe(true);

    if (duration > 200) {
      console.warn(
        `   ⚠️  WARNING: VideosOnly filter took ${duration.toFixed(2)}ms (expected < 200ms)`,
      );
    }
  });

  it('should measure performance with hideConverted filter enabled', async () => {
    console.log('🧪 Test: HideConverted filter');

    const state = FilePickerStateService.createEmpty();
    state.hideConverted = true;

    const start = performance.now();
    const items = await FilePickerStateService.buildItemsList(state);
    const end = performance.now();

    const duration = end - start;
    const files = items.filter((item) => !item.isDirectory);
    const convertedFiles = files.filter((file) =>
      file.name.includes('_converted'),
    );

    console.log(`   Items returned: ${items.length}`);
    console.log(`   Converted files (should be 0): ${convertedFiles.length}`);
    console.log(`   Duration: ${duration.toFixed(2)}ms`);

    // No converted files should be present
    expect(convertedFiles.length).toBe(0);

    if (duration > 200) {
      console.warn(
        `   ⚠️  WARNING: HideConverted filter took ${duration.toFixed(2)}ms (expected < 200ms)`,
      );
    }
  });

  it('should compare performance: multiple expansions vs search', async () => {
    console.log('🧪 Test: Multiple expansions vs Search comparison');

    // Test 1: Multiple folder expansions
    const expandedState = FilePickerStateService.createEmpty();
    expandedState.expandedFolders.add('folder_0_0');
    expandedState.expandedFolders.add('folder_0_1');
    expandedState.expandedFolders.add('folder_0_2');

    const startExpanded = performance.now();
    const expandedItems =
      await FilePickerStateService.buildItemsList(expandedState);
    const endExpanded = performance.now();
    const expandedDuration = endExpanded - startExpanded;

    // Test 2: Search
    const searchState = FilePickerStateService.createEmpty();
    searchState.searchQuery = '*.mp4';

    const startSearch = performance.now();
    const searchItems =
      await FilePickerStateService.buildItemsList(searchState);
    const endSearch = performance.now();
    const searchDuration = endSearch - startSearch;

    console.log(`   Multiple expansions:`);
    console.log(
      `     - Folders expanded: ${expandedState.expandedFolders.size}`,
    );
    console.log(`     - Items returned: ${expandedItems.length}`);
    console.log(`     - Duration: ${expandedDuration.toFixed(2)}ms`);
    console.log(`   Search:`);
    console.log(`     - Items returned: ${searchItems.length}`);
    console.log(`     - Duration: ${searchDuration.toFixed(2)}ms`);
    console.log(`   Ratio: ${(searchDuration / expandedDuration).toFixed(2)}x`);

    expect(expandedItems.length).toBeGreaterThan(0);
    expect(searchItems.length).toBeGreaterThan(0);
  });
});
