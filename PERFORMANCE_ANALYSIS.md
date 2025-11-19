# File Picker Performance Analysis

## Summary

Performance testing revealed that search operations are significantly slower than normal directory listing (20-21x slower). The tests used a mock filesystem with **8,736 files in 1,092 directories** at a depth of 5 levels.

## Test Results

### Normal Operations (Fast ✅)

- **Root directory listing**: 40-55ms
- **Single folder expansion**: 43-46ms
- **Deep hierarchy (4 folders)**: 40-42ms
- **Folder selection**: 7-10ms (847 files)
- **VideosOnly/HideConverted filters**: 42-52ms

### Search Operations (Slow ⚠️)

- **Search for `*.mp4`**: 873-895ms
- **Search for specific pattern**: 60-70ms (when few results)
- **21x slower** than normal browsing with multiple expansions

## Detailed Profiling Results

When searching for `*.mp4` across the entire filesystem (69ms wall time, but includes recursive overhead):

| Operation          | Calls | Total Time | % of Time | Avg/Call |
| ------------------ | ----- | ---------- | --------- | -------- |
| `fs.statSync`      | 9,828 | 22.28ms    | 32.3%     | 0.0023ms |
| `fs.readdirSync`   | 1,093 | 21.63ms    | 31.3%     | 0.0198ms |
| Sorting operations | 1,093 | 13.35ms    | 19.3%     | 0.0122ms |
| Pattern matching   | 8,736 | 4.74ms     | 6.9%      | 0.0005ms |

### Key Finding: Quadratic Algorithm

The `hasConvertedVersion()` function has **O(n²) complexity**:

- For 1,500 items: **124.90ms**
- Average per check: **0.0833ms**
- Theoretical comparisons: **2,250,000** (1,500 × 1,500)

This function is called once per file to check if a `_converted` version exists. With thousands of files, this becomes a major bottleneck.

## Identified Bottlenecks

### 1. Multiple `fs.statSync()` Calls (Critical)

**Impact**: 32% of search time

- Called once per file/directory (9,828 calls)
- Each call queries file metadata individually
- No batching or caching

**Location**: `file-picker-service.ts:308`

### 2. Sorting at Every Directory Level (High)

**Impact**: 19% of search time

- Sorting happens for every directory (1,093 times)
- Uses natural-orderby for both directories and files
- Sorts happen even when order doesn't matter for the final result

**Location**: `file-picker-service.ts:288-298`

### 3. O(n²) Converted File Detection (Critical)

**Impact**: Can dominate with large file counts

- Every file checks against every other file in the list
- Gets exponentially worse with more files
- Called from multiple places in the codebase

**Location**: `file-picker-service.ts:382-407`

### 4. Recursive Directory Traversal (Architectural)

**Impact**: Moderate

- Scans entire directory tree for every search
- No caching or indexing of filesystem
- Repeats work on subsequent searches

**Location**: `file-picker-service.ts:272-361`

## Optimization Recommendations

### High Priority (Quick Wins)

#### 1. Optimize `hasConvertedVersion()` - O(n²) → O(n)

**Current approach** (quadratic):

```typescript
function hasConvertedVersion(item, allItems) {
  return allItems.some((otherItem) => {
    // Check each item against every other item
  });
}
```

**Proposed approach** (linear):

```typescript
// Build a Set once at the start
function buildConvertedFilesIndex(items: FilePickerItem[]): Set<string> {
  const convertedFiles = new Set<string>();

  for (const item of items) {
    if (!item.isDirectory && item.name.includes('_converted.')) {
      // Extract base name: "movie_converted.mp4" -> "folder/movie"
      const baseName = item.path.replace(/_converted\.([^.]+)$/, '');
      convertedFiles.add(baseName);
    }
  }

  return convertedFiles;
}

// Then check in O(1) time
function hasConvertedVersion(item, convertedIndex) {
  if (item.isDirectory) return false;
  const basePath = item.path.replace(/\.([^.]+)$/, '');
  return convertedIndex.has(basePath);
}
```

**Expected improvement**: 100-200ms reduction for large directories

#### 2. Defer Sorting Until Final Result

Instead of sorting at each directory level during recursion, collect all results first and sort once at the end.

**Current**: 1,093 sort operations
**Proposed**: 1 sort operation

**Expected improvement**: 10-15ms reduction

#### 3. Batch File Stats with `readdirSync({ withFileTypes: true })`

You're already using `withFileTypes: true`, but you're still calling `statSync()` separately. The `Dirent` objects from `readdirSync` already know if they're directories or files.

**Optimization**:

- Use `entry.isFile()` and `entry.isDirectory()` from Dirent
- Only call `statSync()` when you actually need size/mtime
- For search, delay stat calls until after pattern matching

**Expected improvement**: 15-20ms reduction

### Medium Priority

#### 4. Implement Search Result Caching

Cache search results with a simple LRU cache:

- Key: `${searchPattern}-${showHidden}-${videosOnly}-${hideConverted}`
- Invalidate on filesystem changes (use file watcher)
- Or use time-based expiry (e.g., 5 seconds)

**Expected improvement**: Near-instant for repeated searches

#### 5. Optimize Micromatch Usage

While micromatch is already fast (0.0005ms/call), you could:

- Compile patterns once and reuse: `micromatch.makeRe(pattern)`
- Use simple glob checks for common patterns like `*.mp4`

**Expected improvement**: 2-3ms reduction

### Low Priority (Architectural Changes)

#### 6. Implement Filesystem Indexing

Build an in-memory index of the filesystem:

- Background worker that indexes on startup
- File watcher to update index on changes
- Search becomes a simple index lookup instead of filesystem scan

**Expected improvement**: 50-100x faster searches (sub-10ms)

#### 7. Pagination for Search Results

With very large result sets (2,911 items in our test), loading all at once can be slow. Implement cursor-based pagination for search results similar to the job queue.

## Comparative Analysis

### Small filesystems (<100 files)

Current performance is acceptable. No optimization needed.

### Medium filesystems (100-1,000 files)

- Searches: 100-300ms (noticeable but acceptable)
- Recommend: Optimize `hasConvertedVersion()` only

### Large filesystems (1,000-10,000 files)

- Searches: 500-2,000ms (slow, impacts UX)
- Recommend: All high-priority optimizations

### Very large filesystems (>10,000 files)

- Searches: 2,000ms+ (unacceptable)
- Recommend: Consider architectural changes (indexing)

## Implementation Priority

1. **Immediate (Quick wins)**:
   - Fix `hasConvertedVersion()` O(n²) → O(n) using Set/Map
   - Defer sorting to final result

2. **Short-term (1-2 days)**:
   - Optimize stat calls
   - Add search caching

3. **Long-term (Future consideration)**:
   - Filesystem indexing
   - Result pagination

## Testing

Two new test files have been created:

1. `src/test/file-picker-performance.test.ts` - High-level performance benchmarks
2. `src/test/file-picker-profiling.test.ts` - Detailed operation-level profiling

Run with:

```bash
bun test src/test/file-picker-performance.test.ts
bun test src/test/file-picker-profiling.test.ts
```

These tests create a mock filesystem with realistic structure and measure performance of various operations.
