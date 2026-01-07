/**
 * FFmpeg capability detection service
 * Detects available encoders and their supported features
 */

import { spawn } from 'child_process';

export interface FFmpegCapabilities {
  /** Whether libx264 supports 10-bit encoding (yuv420p10le) */
  x264_10bit: boolean;
}

// Cache the capabilities once detected
let cachedCapabilities: FFmpegCapabilities | null = null;

/**
 * Run a command and return stdout as a string
 */
function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      // FFmpeg returns non-zero exit codes for help commands, so we accept output regardless
      resolve(stdout + stderr);
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Check if libx264 encoder supports 10-bit pixel formats
 */
async function checkX264_10bitSupport(): Promise<boolean> {
  try {
    const output = await runCommand('ffmpeg', ['-h', 'encoder=libx264']);

    // Check if yuv420p10le is in the supported pixel formats
    // The output will contain something like: "Supported pixel formats: yuv420p ... yuv420p10le ..."
    return output.includes('yuv420p10le');
  } catch (error) {
    console.error(
      '[FFmpeg Capabilities] Failed to check x264 10-bit support:',
      error,
    );
    return false;
  }
}

/**
 * Detect FFmpeg capabilities
 * Results are cached after first detection
 */
export async function detectFFmpegCapabilities(): Promise<FFmpegCapabilities> {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  console.log('[FFmpeg Capabilities] Detecting FFmpeg capabilities...');

  const x264_10bit = await checkX264_10bitSupport();

  cachedCapabilities = {
    x264_10bit,
  };

  console.log('[FFmpeg Capabilities] Detection complete:', cachedCapabilities);

  return cachedCapabilities;
}

/**
 * Get cached capabilities without re-detecting
 * Returns null if not yet detected
 */
export function getCachedCapabilities(): FFmpegCapabilities | null {
  return cachedCapabilities;
}
