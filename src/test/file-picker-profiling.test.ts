/**
 * Detailed profiling test for file picker service
 * Instruments the code to identify specific bottlenecks
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import micromatch from 'micromatch';
import { orderBy } from 'natural-orderby';
import { stripLeadingArticles } from '../../server/sort-utils';

describe('FilePickerService - Detailed Profiling', () => {
  let testDir: string;
  let stats = {
    totalFiles: 0,
    totalDirs: 0,
    maxDepth: 0,
  };

  interface ProfileMetrics {
    operation: string;
    count: number;
    totalTime: number;
    avgTime: number;
  }

  const metrics: Map<string, ProfileMetrics> = new Map();

  function recordMetric(operation: string, duration: number) {
    const existing = metrics.get(operation);
    if (existing) {
      existing.count++;
      existing.totalTime += duration;
      existing.avgTime = existing.totalTime / existing.count;
    } else {
      metrics.set(operation, {
        operation,
        count: 1,
        totalTime: duration,
        avgTime: duration,
      });
    }
  }

  function createMockFileSystem(
    basePath: string,
    depth: number,
    dirsPerLevel: number,
    filesPerDir: number,
    currentDepth: number = 0,
  ): void {
    if (currentDepth > depth) return;

    if (currentDepth > stats.maxDepth) {
      stats.maxDepth = currentDepth;
    }

    for (let i = 0; i < filesPerDir; i++) {
      const isVideo = i % 3 === 0;
      const hasConverted = i % 6 === 0;

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

  /**
   * Instrumented version of scanDirectoryWithSearch
   * This is a copy of the function from file-picker-service.ts with profiling added
   */
  function scanDirectoryWithSearchProfiled(
    basePath: string,
    dirPath: string,
    searchPattern: string,
    showHidden: boolean = false,
    videosOnly: boolean = false,
  ): any[] {
    const fullPath = path.join(basePath, dirPath);
    const results: any[] = [];

    try {
      // Profile: readdir
      const readdirStart = performance.now();
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const readdirEnd = performance.now();
      recordMetric('fs.readdirSync', readdirEnd - readdirStart);

      // Profile: sorting
      const sortStart = performance.now();
      const directories = entries.filter((entry) => entry.isDirectory());
      const files = entries.filter((entry) => entry.isFile());
      const sortedDirs = orderBy(
        directories,
        [(entry) => stripLeadingArticles(entry.name)],
        ['asc'],
      );
      const sortedFiles = orderBy(
        files,
        [(entry) => stripLeadingArticles(entry.name)],
        ['asc'],
      );
      const sortedEntries = [...sortedDirs, ...sortedFiles];
      const sortEnd = performance.now();
      recordMetric('sorting', sortEnd - sortStart);

      for (const entry of sortedEntries) {
        if (!showHidden && entry.name.startsWith('.')) continue;

        const itemPath = path.join(dirPath, entry.name);
        const fullItemPath = path.join(fullPath, entry.name);

        try {
          // Profile: stat
          const statStart = performance.now();
          const stats = fs.statSync(fullItemPath);
          const statEnd = performance.now();
          recordMetric('fs.statSync', statEnd - statStart);

          if (entry.isDirectory()) {
            // Profile: recursive scan
            const recursiveStart = performance.now();
            const subResults = scanDirectoryWithSearchProfiled(
              basePath,
              itemPath,
              searchPattern,
              showHidden,
              videosOnly,
            );
            const recursiveEnd = performance.now();
            recordMetric('recursive-scan', recursiveEnd - recursiveStart);

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
            if (videosOnly && !isVideoFile(entry.name)) continue;

            // Profile: micromatch
            const matchStart = performance.now();
            const matches = micromatch.isMatch(entry.name, searchPattern, {
              nocase: true,
            });
            const matchEnd = performance.now();
            recordMetric('micromatch.isMatch', matchEnd - matchStart);

            if (matches) {
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
        }
      }
    } catch (error) {
      console.error(`Failed to scan directory ${dirPath}:`, error);
    }

    return results;
  }

  function isVideoFile(name: string): boolean {
    const ext = path.extname(name).toLowerCase();
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
    return VIDEO_EXTENSIONS.includes(ext);
  }

  beforeAll(() => {
    console.log('\n🔧 Setting up profiling test environment...');
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-test-'));
    process.env.FRAME_SHIFT_HOME = testDir;

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
    console.log('\n🧹 Cleaning up test environment...');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.FRAME_SHIFT_HOME;
    console.log('✅ Cleanup complete\n');
  });

  it('should profile search operation in detail', () => {
    console.log('🔬 Profiling search operation...\n');

    metrics.clear();

    const searchPattern = '*.mp4';
    const start = performance.now();
    const results = scanDirectoryWithSearchProfiled(
      testDir,
      '',
      searchPattern,
      false,
      false,
    );
    const end = performance.now();

    const totalDuration = end - start;

    console.log(`📊 PROFILING RESULTS:`);
    console.log(`   Total duration: ${totalDuration.toFixed(2)}ms`);
    console.log(`   Results found: ${results.length}`);
    console.log(`\n   Breakdown by operation:`);

    // Sort metrics by total time
    const sortedMetrics = Array.from(metrics.values()).sort(
      (a, b) => b.totalTime - a.totalTime,
    );

    let otherTime = totalDuration;
    for (const metric of sortedMetrics) {
      const percentage = (metric.totalTime / totalDuration) * 100;
      otherTime -= metric.totalTime;

      console.log(`   ${metric.operation}:`);
      console.log(`     - Count: ${metric.count}`);
      console.log(
        `     - Total: ${metric.totalTime.toFixed(2)}ms (${percentage.toFixed(1)}%)`,
      );
      console.log(`     - Avg: ${metric.avgTime.toFixed(4)}ms per call`);
    }

    console.log(`   Other (overhead):`);
    console.log(
      `     - Total: ${otherTime.toFixed(2)}ms (${((otherTime / totalDuration) * 100).toFixed(1)}%)`,
    );

    console.log(`\n   🎯 Key findings:`);

    // Calculate recursive overhead
    const recursiveMetric = metrics.get('recursive-scan');
    if (recursiveMetric) {
      const recursiveOverhead = recursiveMetric.totalTime - totalDuration;
      console.log(`     - Recursive calls made: ${recursiveMetric.count}`);
      console.log(
        `     - Average directory scan: ${recursiveMetric.avgTime.toFixed(2)}ms`,
      );
    }

    // Check stat overhead
    const statMetric = metrics.get('fs.statSync');
    if (statMetric) {
      console.log(`     - File stat() calls: ${statMetric.count}`);
      console.log(
        `     - Time in stat(): ${statMetric.totalTime.toFixed(2)}ms (${((statMetric.totalTime / totalDuration) * 100).toFixed(1)}%)`,
      );
    }

    // Check micromatch overhead
    const matchMetric = metrics.get('micromatch.isMatch');
    if (matchMetric) {
      console.log(`     - Pattern matches: ${matchMetric.count}`);
      console.log(
        `     - Time in micromatch: ${matchMetric.totalTime.toFixed(2)}ms (${((matchMetric.totalTime / totalDuration) * 100).toFixed(1)}%)`,
      );
    }

    // Check sorting overhead
    const sortMetric = metrics.get('sorting');
    if (sortMetric) {
      console.log(`     - Sort operations: ${sortMetric.count}`);
      console.log(
        `     - Time sorting: ${sortMetric.totalTime.toFixed(2)}ms (${((sortMetric.totalTime / totalDuration) * 100).toFixed(1)}%)`,
      );
    }

    // Check readdir overhead
    const readdirMetric = metrics.get('fs.readdirSync');
    if (readdirMetric) {
      console.log(`     - Directory reads: ${readdirMetric.count}`);
      console.log(
        `     - Time in readdir: ${readdirMetric.totalTime.toFixed(2)}ms (${((readdirMetric.totalTime / totalDuration) * 100).toFixed(1)}%)`,
      );
    }

    console.log('\n');
  });

  it('should analyze hasConvertedVersion performance', () => {
    console.log('🔬 Profiling hasConvertedVersion check...\n');

    // Simulate the hasConvertedVersion check on a large list
    const items: any[] = [];

    // Create sample items
    for (let i = 0; i < 1000; i++) {
      items.push({
        name: `video_${i}.mp4`,
        path: `folder/video_${i}.mp4`,
        isDirectory: false,
      });
      if (i % 2 === 0) {
        items.push({
          name: `video_${i}_converted.mp4`,
          path: `folder/video_${i}_converted.mp4`,
          isDirectory: false,
        });
      }
    }

    console.log(`   Test dataset: ${items.length} items`);

    function hasConvertedVersion(item: any, allItems: any[]): boolean {
      if (item.isDirectory) return false;

      const nameWithoutExt = item.name.replace(/\.[^.]+$/, '');
      const itemDir = item.path.substring(0, item.path.lastIndexOf('/'));

      return allItems.some((otherItem) => {
        if (otherItem.isDirectory || otherItem.path === item.path) return false;

        const otherNameWithoutExt = otherItem.name.replace(/\.[^.]+$/, '');
        const otherDir = otherItem.path.substring(
          0,
          otherItem.path.lastIndexOf('/'),
        );

        return (
          otherDir === itemDir &&
          otherNameWithoutExt === `${nameWithoutExt}_converted`
        );
      });
    }

    // Test the performance of checking each item
    const start = performance.now();
    let checkedCount = 0;
    let foundCount = 0;

    for (const item of items) {
      if (!item.isDirectory) {
        const hasConverted = hasConvertedVersion(item, items);
        checkedCount++;
        if (hasConverted) foundCount++;
      }
    }

    const end = performance.now();
    const duration = end - start;

    console.log(`\n   📊 Results:`);
    console.log(`     - Items checked: ${checkedCount}`);
    console.log(`     - Items with converted version: ${foundCount}`);
    console.log(`     - Total time: ${duration.toFixed(2)}ms`);
    console.log(
      `     - Average per check: ${(duration / checkedCount).toFixed(4)}ms`,
    );
    console.log(
      `     - Complexity: O(n²) - ${items.length} × ${items.length} = ${items.length * items.length} theoretical comparisons`,
    );
    console.log(
      `\n   ⚠️  This is a quadratic algorithm that scales poorly with file count\n`,
    );
  });
});
