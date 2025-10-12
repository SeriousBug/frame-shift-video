/**
 * FFmpeg command execution with progress tracking and error handling
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { FFmpegCommand, validateFFmpegCommand } from './ffmpeg-command';

/**
 * Progress information parsed from FFmpeg output
 */
export interface FFmpegProgress {
  /** Current frame being processed */
  frame: number;
  /** Frames per second during processing */
  fps: number;
  /** Quality metric (if available) */
  q: number;
  /** Output file size in bytes */
  size: number;
  /** Processing time elapsed */
  time: string;
  /** Bitrate of output */
  bitrate: string;
  /** Processing speed relative to realtime */
  speed: string;
  /** Progress percentage (0-100) */
  progress: number;
}

/**
 * Successful FFmpeg execution result
 */
export interface FFmpegSuccess {
  success: true;
  /** Output file path */
  outputPath: string;
  /** Final progress information */
  finalProgress?: FFmpegProgress;
  /** Full stderr output for debugging */
  stderr: string;
  /** Exit code */
  exitCode: number;
}

/**
 * Failed FFmpeg execution result
 */
export interface FFmpegFailure {
  success: false;
  /** Error message */
  error: string;
  /** Full stderr output for debugging */
  stderr: string;
  /** Exit code (null if process failed to start) */
  exitCode: number | null;
  /** Partial progress information if available */
  finalProgress?: FFmpegProgress;
}

/**
 * FFmpeg execution result as discriminated union
 */
export type FFmpegResult = FFmpegSuccess | FFmpegFailure;

/**
 * FFmpeg execution options
 */
export interface FFmpegExecutionOptions {
  /** Base directory for uploads */
  uploadsDir: string;
  /** Base directory for outputs */
  outputsDir: string;
  /** Enable dry run mode (for testing) */
  dryRun?: boolean;
  /** Timeout in milliseconds (optional, no timeout if not specified) */
  timeout?: number;
}

/**
 * FFmpeg executor with progress tracking
 */
export class FFmpegExecutor extends EventEmitter {
  private process: ChildProcess | null = null;
  private killed = false;
  private options: FFmpegExecutionOptions;
  private inputDuration: number | null = null; // Duration in seconds

  constructor(options: FFmpegExecutionOptions) {
    super();
    this.options = options;
  }

  /**
   * Execute an FFmpeg command with progress tracking
   */
  async execute(command: FFmpegCommand): Promise<FFmpegResult> {
    // Validate command for security
    validateFFmpegCommand(command);

    // Get input video duration for accurate progress calculation
    const inputPath = path.isAbsolute(command.inputPath)
      ? command.inputPath
      : path.join(this.options.uploadsDir, command.inputPath);
    this.inputDuration = await this.getVideoDuration(inputPath);

    // Resolve output path (handle both absolute and relative paths)
    const outputPath = path.isAbsolute(command.outputPath)
      ? command.outputPath
      : path.join(this.options.outputsDir, command.outputPath);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Prepare command arguments
    const args = [...command.args.slice(1)]; // Remove 'ffmpeg' from start

    // Replace relative paths with absolute paths in args
    const processedArgs = args.map((arg, index) => {
      if (args[index - 1] === '-i') {
        return inputPath;
      }
      if (index === args.length - 1 && !arg.startsWith('-')) {
        return outputPath;
      }
      return arg;
    });

    // Add dry run flag for testing
    if (this.options.dryRun) {
      processedArgs.unshift('-f', 'null');
      // Replace output with null device for dry run
      const lastArgIndex = processedArgs.length - 1;
      processedArgs[lastArgIndex] = '-';
    }

    this.emit('start', { command: command.displayCommand });

    return new Promise((resolve) => {
      let stderr = '';
      let lastProgress: FFmpegProgress | undefined;
      let progressBuffer = ''; // Accumulate progress data across chunks

      // Spawn FFmpeg process
      this.process = spawn('ffmpeg', processedArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Set up timeout (only if specified)
      const timeoutId = this.options.timeout
        ? setTimeout(() => {
            this.kill();
            resolve({
              success: false,
              error: 'FFmpeg execution timed out',
              stderr,
              exitCode: null,
              finalProgress: lastProgress,
            });
          }, this.options.timeout)
        : null;

      // Parse progress from stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        progressBuffer += output;
        const progress = this.parseProgress(progressBuffer);
        if (progress) {
          lastProgress = progress;
          this.emit('progress', progress);
          // Clear the buffer after successful parsing to avoid duplicate progress
          progressBuffer = '';
        }
      });

      // Capture stderr for error reporting
      this.process.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle process completion
      this.process.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.process = null;

        if (this.killed) {
          resolve({
            success: false,
            error: 'FFmpeg execution was cancelled',
            stderr,
            exitCode: code,
            finalProgress: lastProgress,
          });
          return;
        }

        if (code === 0) {
          resolve({
            success: true,
            outputPath: this.options.dryRun ? 'dry-run-output' : outputPath,
            finalProgress: lastProgress,
            stderr,
            exitCode: code,
          });
        } else {
          resolve({
            success: false,
            error: `FFmpeg failed with exit code ${code}`,
            stderr,
            exitCode: code,
            finalProgress: lastProgress,
          });
        }

        this.emit('complete', { success: code === 0, exitCode: code });
      });

      // Handle process errors
      this.process.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.process = null;
        resolve({
          success: false,
          error: `Failed to start FFmpeg: ${error.message}`,
          stderr,
          exitCode: null,
          finalProgress: lastProgress,
        });
      });
    });
  }

  /**
   * Kill the running FFmpeg process
   */
  kill(): void {
    if (this.process && !this.killed) {
      this.killed = true;
      this.process.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  /**
   * Get video duration in seconds using ffprobe
   */
  private async getVideoDuration(inputPath: string): Promise<number | null> {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ]);

      let output = '';
      ffprobe.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0 && output.trim()) {
          const duration = parseFloat(output.trim());
          resolve(isNaN(duration) ? null : duration);
        } else {
          resolve(null);
        }
      });

      ffprobe.on('error', () => resolve(null));
    });
  }

  /**
   * Convert time string (HH:MM:SS.ms or MM:SS.ms) to seconds
   */
  private timeToSeconds(timeStr: string): number {
    const parts = timeStr.split(':');
    if (parts.length === 3) {
      // HH:MM:SS.ms
      const [hours, minutes, seconds] = parts;
      return (
        parseInt(hours, 10) * 3600 +
        parseInt(minutes, 10) * 60 +
        parseFloat(seconds)
      );
    } else if (parts.length === 2) {
      // MM:SS.ms
      const [minutes, seconds] = parts;
      return parseInt(minutes, 10) * 60 + parseFloat(seconds);
    } else {
      // Just seconds
      return parseFloat(timeStr);
    }
  }

  /**
   * Parse progress information from FFmpeg output
   * Handles both stderr format (time=, size=, q=) and progress pipe format (out_time=, total_size=, stream_0_0_q=)
   */
  private parseProgress(output: string): FFmpegProgress | null {
    const lines = output.split('\n');
    const progressData: Partial<FFmpegProgress> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('frame=')) {
        const match = trimmed.match(/frame=\s*(\d+)/);
        if (match) progressData.frame = parseInt(match[1], 10);
      } else if (trimmed.startsWith('fps=')) {
        const match = trimmed.match(/fps=\s*([\d.]+)/);
        if (match) progressData.fps = parseFloat(match[1]);
      } else if (trimmed.startsWith('q=')) {
        // stderr format: q=28.0
        const match = trimmed.match(/q=\s*([\d.-]+)/);
        if (match) progressData.q = parseFloat(match[1]);
      } else if (trimmed.startsWith('stream_0_0_q=')) {
        // progress pipe format: stream_0_0_q=34.2
        const match = trimmed.match(/stream_0_0_q=\s*([\d.-]+)/);
        if (match) progressData.q = parseFloat(match[1]);
      } else if (trimmed.startsWith('size=')) {
        // stderr format: size=1024kB
        const match = trimmed.match(/size=\s*(\d+)kB/);
        if (match) progressData.size = parseInt(match[1], 10) * 1024;
      } else if (trimmed.startsWith('total_size=')) {
        // progress pipe format: total_size=262144
        const match = trimmed.match(/total_size=\s*(\d+)/);
        if (match) progressData.size = parseInt(match[1], 10);
      } else if (trimmed.startsWith('time=')) {
        // stderr format: time=00:00:04.00
        const match = trimmed.match(/time=\s*([\d:.]+)/);
        if (match) progressData.time = match[1];
      } else if (trimmed.startsWith('out_time=')) {
        // progress pipe format: out_time=00:00:04.170833
        const match = trimmed.match(/out_time=\s*([\d:.]+)/);
        if (match) progressData.time = match[1];
      } else if (trimmed.startsWith('bitrate=')) {
        // Both formats: bitrate=502.8kbits/s or bitrate=N/A
        const match = trimmed.match(/bitrate=\s*([\d.]+kbits\/s|N\/A)/);
        if (match) progressData.bitrate = match[1];
      } else if (trimmed.startsWith('speed=')) {
        // Both formats: speed=4.13x or speed=N/A
        const match = trimmed.match(/speed=\s*([\d.]+x|N\/A)/);
        if (match) progressData.speed = match[1];
      }
    }

    // Only return progress if we have essential fields
    if (
      progressData.frame !== undefined &&
      progressData.time &&
      progressData.time !== 'N/A'
    ) {
      // Calculate accurate progress percentage using duration
      let progress = -1; // Indicate unknown progress if duration unavailable
      if (this.inputDuration && this.inputDuration > 0) {
        const currentSeconds = this.timeToSeconds(progressData.time);
        progress = Math.min((currentSeconds / this.inputDuration) * 100, 100);
        progress = Math.round(progress * 10) / 10; // Round to 1 decimal place
      }

      return {
        frame: progressData.frame,
        fps: progressData.fps || 0,
        q: progressData.q || 0,
        size: progressData.size || 0,
        time: progressData.time,
        bitrate: progressData.bitrate || '0kbits/s',
        speed: progressData.speed || '0x',
        progress,
      };
    }

    return null;
  }
}

/**
 * Utility function to execute a single FFmpeg command
 */
export async function executeFFmpegCommand(
  command: FFmpegCommand,
  options: FFmpegExecutionOptions,
): Promise<FFmpegResult> {
  const executor = new FFmpegExecutor(options);
  return executor.execute(command);
}

/**
 * Execute multiple FFmpeg commands sequentially
 */
export async function executeFFmpegCommands(
  commands: FFmpegCommand[],
  options: FFmpegExecutionOptions,
  onProgress?: (commandIndex: number, progress: FFmpegProgress) => void,
): Promise<FFmpegResult[]> {
  const results: FFmpegResult[] = [];

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    const executor = new FFmpegExecutor(options);

    if (onProgress) {
      executor.on('progress', (progress) => onProgress(i, progress));
    }

    const result = await executor.execute(command);
    results.push(result);

    // Stop on first failure unless in dry run mode
    if (!result.success && !options.dryRun) {
      break;
    }
  }

  return results;
}
