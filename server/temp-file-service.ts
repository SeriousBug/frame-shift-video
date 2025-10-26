/**
 * Temporary file service for managing FFmpeg conversion temporary files
 * Handles creation, deletion, and cleanup of .fsvtemp files
 */

import fs from 'fs/promises';
import path from 'path';

const TEMP_FILE_PREFIX = '.fsvtemp.';

/**
 * Generate temporary file path from target output path
 * Format: .fsvtemp.filename_converted.ext
 */
export function getTempFilePath(outputPath: string): string {
  const dir = path.dirname(outputPath);
  const filename = path.basename(outputPath);
  return path.join(dir, `${TEMP_FILE_PREFIX}${filename}`);
}

/**
 * Check if a file path is a temporary file
 */
export function isTempFile(filePath: string): boolean {
  return path.basename(filePath).startsWith(TEMP_FILE_PREFIX);
}

/**
 * Rename temporary file to final output path
 * This is called after successful FFmpeg conversion
 */
export async function finalizeTempFile(
  tempPath: string,
  finalPath: string,
): Promise<void> {
  try {
    await fs.rename(tempPath, finalPath);
    console.log(`[TempFile] Finalized: ${tempPath} -> ${finalPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[TempFile] Failed to finalize ${tempPath}:`, errorMessage);
    throw new Error('Failed to rename temporary file', {
      cause: { error: errorMessage, tempPath, finalPath },
    });
  }
}

/**
 * Delete a temporary file if it exists
 * This is called on conversion failure or cancellation
 */
export async function cleanupTempFile(tempPath: string): Promise<void> {
  try {
    await fs.unlink(tempPath);
    console.log(`[TempFile] Cleaned up: ${tempPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Ignore file not found errors (file may not have been created yet)
      console.warn(
        `[TempFile] Warning: Could not delete ${tempPath}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

/**
 * Scan a directory recursively for temporary files and delete them
 * This is called on server startup to clean up any leftover temp files
 * from previous runs (crashed conversions, server restarts, etc.)
 * @param baseDir The base directory to scan (FRAME_SHIFT_HOME)
 * @returns Number of temp files deleted
 */
export async function cleanupAllTempFiles(baseDir: string): Promise<number> {
  console.log(`[TempFile] Scanning for temporary files in: ${baseDir}`);

  try {
    // Recursively read all files in the directory
    const entries = await fs.readdir(baseDir, {
      recursive: true,
      withFileTypes: true,
    });

    // Filter for temp files (files that start with .fsvtemp.)
    const tempFiles = entries
      .filter((entry) => {
        // Only process files, not directories
        if (!entry.isFile()) return false;
        // Check if filename starts with temp prefix
        return entry.name.startsWith(TEMP_FILE_PREFIX);
      })
      .map((entry) => path.join(entry.parentPath || entry.path, entry.name));

    if (tempFiles.length === 0) {
      console.log('[TempFile] No temporary files found');
      return 0;
    }

    console.log(
      `[TempFile] Found ${tempFiles.length} temporary file(s) to clean up`,
    );

    let deletedCount = 0;
    for (const tempFile of tempFiles) {
      try {
        await fs.unlink(tempFile);
        console.log(`[TempFile] Deleted: ${tempFile}`);
        deletedCount++;
      } catch (error) {
        console.error(
          `[TempFile] Failed to delete ${tempFile}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    console.log(`[TempFile] Cleanup complete: ${deletedCount} file(s) deleted`);
    return deletedCount;
  } catch (error) {
    console.error(
      '[TempFile] Error during cleanup scan:',
      error instanceof Error ? error.message : String(error),
    );
    return 0;
  }
}
