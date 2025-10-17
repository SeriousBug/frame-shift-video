import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import micromatch from 'micromatch';
import { orderBy } from 'natural-orderby';
import { FileSystemItem } from '../../src/types/files';
import { logger, captureException } from '../../src/lib/sentry';

/**
 * Recursively scan a directory and its subdirectories
 */
async function scanDirectory(
  basePath: string,
  relativePath: string,
  searchPattern: string,
  showHidden: boolean = false,
): Promise<FileSystemItem[]> {
  const results: FileSystemItem[] = [];
  const fullPath = join(basePath, relativePath);

  try {
    const items = await readdir(fullPath);

    for (const item of items) {
      // Skip hidden files and system files unless showHidden is true
      if (!showHidden && item.startsWith('.')) continue;

      try {
        const itemFullPath = join(fullPath, item);
        const itemRelativePath = relativePath ? join(relativePath, item) : item;
        const stats = await stat(itemFullPath);

        if (stats.isDirectory()) {
          // Recursively scan subdirectories
          const subItems = await scanDirectory(
            basePath,
            itemRelativePath,
            searchPattern,
            showHidden,
          );

          // Only include directory if it has matching descendants
          if (subItems.length > 0) {
            results.push({
              name: item,
              path: itemRelativePath,
              isDirectory: true,
              size: undefined,
              modified: stats.mtime.toISOString(),
            });
            results.push(...subItems);
          }
        } else {
          // Check if file matches the search pattern
          if (micromatch.isMatch(item, searchPattern)) {
            results.push({
              name: item,
              path: itemRelativePath,
              isDirectory: false,
              size: stats.size,
              modified: stats.mtime.toISOString(),
            });
          }
        }
      } catch (error) {
        // Skip files we can't access
        logger.warn(`Could not access ${item}`, { error });
        continue;
      }
    }
  } catch (error) {
    logger.error(`Error scanning directory ${fullPath}`, { error });
  }

  return results;
}

/**
 * Build a tree structure from flat file list
 */
function buildTreeStructure(items: FileSystemItem[]): FileSystemItem[] {
  // Group items by their immediate parent directory
  const rootItems: FileSystemItem[] = [];
  const itemsByParent = new Map<string, FileSystemItem[]>();

  for (const item of items) {
    const pathParts = item.path.split('/');

    if (pathParts.length === 1) {
      // Root level item
      rootItems.push(item);
    } else {
      // Nested item
      const parentPath = pathParts.slice(0, -1).join('/');
      if (!itemsByParent.has(parentPath)) {
        itemsByParent.set(parentPath, []);
      }
      itemsByParent.get(parentPath)!.push(item);
    }
  }

  // Sort function - directories first, then natural sort by name
  const sortItems = (items: FileSystemItem[]) => {
    // Separate directories and files
    const directories = items.filter((item) => item.isDirectory);
    const files = items.filter((item) => !item.isDirectory);

    // Sort each group naturally
    const sortedDirs = orderBy(directories, [(item) => item.name], ['asc']);
    const sortedFiles = orderBy(files, [(item) => item.name], ['asc']);

    // Replace items array contents (in-place mutation)
    items.length = 0;
    items.push(...sortedDirs, ...sortedFiles);
  };

  sortItems(rootItems);
  itemsByParent.forEach((items) => sortItems(items));

  return rootItems;
}

export async function filesHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const url = new URL(req.url);
  const requestedPath = url.searchParams.get('path');
  const searchQuery = url.searchParams.get('search');
  const showHidden = url.searchParams.get('showHidden') === 'true';

  // Determine the base directory
  const baseDir = process.env.FRAME_SHIFT_HOME || process.env.HOME || '/';
  const targetPath = requestedPath ? join(baseDir, requestedPath) : baseDir;

  try {
    // Security check: ensure we're not accessing files outside the base directory
    const resolvedPath = join(targetPath);
    if (!resolvedPath.startsWith(baseDir)) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    let fileSystemItems: FileSystemItem[] = [];

    if (searchQuery) {
      // Search mode: recursively scan from base directory
      const allItems = await scanDirectory(
        baseDir,
        '',
        searchQuery,
        showHidden,
      );
      fileSystemItems = buildTreeStructure(allItems);
    } else {
      // Normal mode: list current directory only
      const items = await readdir(resolvedPath);

      for (const item of items) {
        try {
          const itemPath = join(resolvedPath, item);
          const stats = await stat(itemPath);

          // Skip hidden files and system files unless showHidden is true
          if (!showHidden && item.startsWith('.')) continue;

          fileSystemItems.push({
            name: item,
            path: requestedPath ? join(requestedPath, item) : item,
            isDirectory: stats.isDirectory(),
            size: stats.isDirectory() ? undefined : stats.size,
            modified: stats.mtime.toISOString(),
          });
        } catch (error) {
          // Skip files we can't access
          logger.warn(`Could not access ${item}`, { error });
          continue;
        }
      }

      // Sort directories first, then files, naturally
      const directories = fileSystemItems.filter((item) => item.isDirectory);
      const files = fileSystemItems.filter((item) => !item.isDirectory);

      const sortedDirs = orderBy(directories, [(item) => item.name], ['asc']);
      const sortedFiles = orderBy(files, [(item) => item.name], ['asc']);

      fileSystemItems = [...sortedDirs, ...sortedFiles];
    }

    return new Response(
      JSON.stringify({
        path: requestedPath || '',
        basePath: baseDir,
        items: fileSystemItems,
        searchQuery: searchQuery || undefined,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    logger.error('Error reading directory', { error });
    captureException(error);
    return new Response(JSON.stringify({ error: 'Could not read directory' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
