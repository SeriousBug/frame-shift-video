/**
 * FFmpeg command generation utility with secure argument handling
 */

import path from 'path';
import { ConversionOptions } from '@/types/conversion';

/**
 * Individual FFmpeg job configuration for a single file
 */
export interface FFmpegJobConfig {
  /** Input file path (relative to uploads directory) */
  inputFile: string;
  /** Output file path (relative to outputs directory) */
  outputFile: string;
  /** Conversion options */
  options: ConversionOptions;
  /** Job name for display */
  jobName: string;
}

/**
 * Generated FFmpeg command with metadata
 */
export interface FFmpegCommand {
  /** Complete FFmpeg command as array (safer than string) */
  args: string[];
  /** Human-readable command string for display */
  displayCommand: string;
  /** Input file path */
  inputPath: string;
  /** Output file path */
  outputPath: string;
  /** Job configuration */
  config: FFmpegJobConfig;
}

/**
 * Securely escape and validate a file path argument
 * Prevents command injection while allowing legitimate file names
 */
function escapeFilePath(filePath: string): string {
  // Remove any null bytes (security)
  const cleaned = filePath.replace(/\0/g, '');

  // Check for dangerous patterns that could break out of arguments
  // Note: We allow () and [] as they're common in filenames, but not in shell injection contexts
  const dangerousPatterns = [
    /[;&|`$]/, // Core shell metacharacters
    /\s*;/, // Command separators
    /\|\s*\w/, // Pipe attempts
    /&&|\|\|/, // Logic operators
    /`.*`/, // Command substitution
    /\$\(/, // Command substitution
    /\${/, // Variable substitution
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(cleaned)) {
      throw new Error(
        `Invalid file path contains dangerous characters: ${filePath}`,
      );
    }
  }

  // Validate path structure
  if (cleaned.includes('..')) {
    throw new Error(`Path traversal not allowed: ${filePath}`);
  }

  // Allow absolute paths (needed for server-local files)
  return cleaned;
}

/**
 * Validate and escape a generic FFmpeg argument
 *
 * Note: Since we use spawn() with an array of arguments (not shell execution),
 * shell metacharacters are inherently safe. We only sanitize null bytes.
 */
function escapeArgument(arg: string | number): string {
  const str = String(arg);

  // Remove null bytes (the only real threat in array-based spawn)
  const cleaned = str.replace(/\0/g, '');

  return cleaned;
}

/**
 * Generate output filename with proper extension
 * Places the output file in the same directory as the source file
 */
function generateOutputFileName(inputFile: string, format: string): string {
  const parsed = path.parse(inputFile);
  return path.join(parsed.dir, `${parsed.name}_converted.${format}`);
}

/**
 * Build FFmpeg arguments array from conversion options
 */
function buildFFmpegArgs(config: FFmpegJobConfig): string[] {
  const { options } = config;
  const args: string[] = [];

  // Input file
  args.push('-i', escapeFilePath(config.inputFile));

  // If custom command is provided, use it (but still validate)
  if (options.customCommand) {
    const customArgs = options.customCommand.trim().split(/\s+/);
    customArgs.forEach((arg) => args.push(escapeArgument(arg)));
    args.push(escapeFilePath(config.outputFile));
    return args;
  }

  // Video codec
  if (options.basic.videoCodec !== 'copy') {
    args.push('-c:v', escapeArgument(options.basic.videoCodec));

    // Quality (CRF) for lossy codecs
    if (options.advanced.bitrate.mode === 'crf') {
      args.push('-crf', escapeArgument(options.basic.quality));
    }

    // Preset for lossy codecs
    args.push('-preset', escapeArgument(options.advanced.preset));
  } else {
    args.push('-c:v', 'copy');
  }

  // Audio codec
  if (options.advanced.audio.codec !== 'copy') {
    args.push('-c:a', escapeArgument(options.advanced.audio.codec));

    // Audio bitrate
    if (options.advanced.audio.bitrate) {
      args.push('-b:a', escapeArgument(`${options.advanced.audio.bitrate}k`));
    }

    // Audio sample rate
    if (options.advanced.audio.sampleRate) {
      args.push('-ar', escapeArgument(options.advanced.audio.sampleRate));
    }

    // Audio channels
    if (options.advanced.audio.channels) {
      args.push('-ac', escapeArgument(options.advanced.audio.channels));
    }
  } else {
    args.push('-c:a', 'copy');
  }

  // Subtitle codec - always copy subtitles
  args.push('-c:s', 'copy');

  // Bitrate mode (if not CRF)
  if (
    options.advanced.bitrate.mode !== 'crf' &&
    options.basic.videoCodec !== 'copy'
  ) {
    if (options.advanced.bitrate.videoBitrate) {
      args.push(
        '-b:v',
        escapeArgument(`${options.advanced.bitrate.videoBitrate}k`),
      );
    }

    if (options.advanced.bitrate.mode === 'vbr') {
      if (options.advanced.bitrate.maxBitrate) {
        args.push(
          '-maxrate',
          escapeArgument(`${options.advanced.bitrate.maxBitrate}k`),
        );
      }
      if (options.advanced.bitrate.bufferSize) {
        args.push(
          '-bufsize',
          escapeArgument(`${options.advanced.bitrate.bufferSize}k`),
        );
      }
    }
  }

  // Resolution scaling
  if (options.advanced.resolution.width || options.advanced.resolution.height) {
    const width = options.advanced.resolution.width || -1;
    const height = options.advanced.resolution.height || -1;

    if (options.advanced.resolution.maintainAspectRatio) {
      // Use -1 to maintain aspect ratio for the unspecified dimension
      args.push('-vf', `scale=${width}:${height}`);
    } else {
      args.push('-vf', `scale=${width}:${height}`);
    }
  }

  // Frame rate
  if (
    !options.advanced.frameRate.copyOriginal &&
    options.advanced.frameRate.fps
  ) {
    args.push('-r', escapeArgument(options.advanced.frameRate.fps));
  }

  // Progress reporting (for parsing progress updates)
  args.push('-progress', 'pipe:1');

  // Overwrite output files
  args.push('-y');

  // Output file
  args.push(escapeFilePath(config.outputFile));

  return args;
}

/**
 * Create individual FFmpeg jobs from conversion options
 */
export function createFFmpegJobs(
  options: ConversionOptions,
): FFmpegJobConfig[] {
  const jobs: FFmpegJobConfig[] = [];

  for (const inputFile of options.selectedFiles) {
    const outputFile = generateOutputFileName(
      inputFile,
      options.basic.outputFormat,
    );
    const jobName = `Convert ${path.basename(inputFile)} to ${options.basic.outputFormat.toUpperCase()}`;

    jobs.push({
      inputFile: escapeFilePath(inputFile),
      outputFile: escapeFilePath(outputFile),
      options,
      jobName,
    });
  }

  return jobs;
}

/**
 * Generate FFmpeg command for a single job
 */
export function generateFFmpegCommand(config: FFmpegJobConfig): FFmpegCommand {
  const args = buildFFmpegArgs(config);

  // Create display-friendly command string
  const displayCommand = `ffmpeg ${args.join(' ')}`;

  return {
    args: ['ffmpeg', ...args],
    displayCommand,
    inputPath: config.inputFile,
    outputPath: config.outputFile,
    config,
  };
}

/**
 * Generate all FFmpeg commands from conversion options
 */
export function generateAllFFmpegCommands(
  options: ConversionOptions,
): FFmpegCommand[] {
  const jobs = createFFmpegJobs(options);
  return jobs.map(generateFFmpegCommand);
}

/**
 * Validate FFmpeg command for security before execution
 *
 * Since we use spawn() with an array of arguments (not shell=true),
 * shell metacharacters in arguments are automatically safe.
 * We only need to ensure the executable is ffmpeg.
 */
export function validateFFmpegCommand(command: FFmpegCommand): void {
  // Ensure ffmpeg is the only executable
  if (command.args[0] !== 'ffmpeg') {
    throw new Error('Only ffmpeg commands are allowed');
  }

  // No need to validate individual arguments - spawn() with array is safe from injection
}
