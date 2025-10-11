import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { FileSystemItem } from '../../src/types/files';

export async function filesHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const url = new URL(req.url);
  const requestedPath = url.searchParams.get('path');

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

    const items = await readdir(resolvedPath);
    const fileSystemItems: FileSystemItem[] = [];

    for (const item of items) {
      try {
        const itemPath = join(resolvedPath, item);
        const stats = await stat(itemPath);

        // Skip hidden files and system files
        if (item.startsWith('.')) continue;

        fileSystemItems.push({
          name: item,
          path: requestedPath ? join(requestedPath, item) : item,
          isDirectory: stats.isDirectory(),
          size: stats.isDirectory() ? undefined : stats.size,
          modified: stats.mtime.toISOString(),
        });
      } catch (error) {
        // Skip files we can't access
        console.warn(`Could not access ${item}:`, error);
        continue;
      }
    }

    // Sort directories first, then files, alphabetically
    fileSystemItems.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return new Response(
      JSON.stringify({
        path: requestedPath || '',
        basePath: baseDir,
        items: fileSystemItems,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    console.error('Error reading directory:', error);
    return new Response(JSON.stringify({ error: 'Could not read directory' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
