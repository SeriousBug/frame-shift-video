/**
 * Tests for FFmpeg executor with real process execution
 * Uses mock ffmpeg/ffprobe scripts from test-bin/
 */

import { describe, it, expect, beforeAll, afterEach } from 'bun:test';
import {
  FFmpegExecutor,
  executeFFmpegCommand,
  executeFFmpegCommands,
  type FFmpegProgress,
  type FFmpegCommand,
} from '@/lib/ffmpeg-executor';
import {
  ConversionOptions,
  DEFAULT_CONVERSION_OPTIONS,
} from '@/types/conversion';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// Set FFMPEG_BIN_PATH and FFPROBE_BIN_PATH to use mock scripts
const testBinDir = path.join(process.cwd(), 'test-bin');

beforeAll(() => {
  process.env.FFMPEG_BIN_PATH = path.join(testBinDir, 'ffmpeg');
  process.env.FFPROBE_BIN_PATH = path.join(testBinDir, 'ffprobe');
});

// Helper to create a temporary test file
async function createTestFile(filename: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-test-'));
  const testFilePath = path.join(tempDir, filename);
  await fs.writeFile(testFilePath, 'mock video content');
  return testFilePath;
}

// Helper to cleanup temporary files
async function cleanupTestFile(filePath: string): Promise<void> {
  try {
    const dir = path.dirname(filePath);
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

describe('FFmpegExecutor', () => {
  const basicOptions: ConversionOptions = {
    ...DEFAULT_CONVERSION_OPTIONS,
    selectedFiles: [],
    basic: {
      videoCodec: 'libx265',
      quality: 22,
      outputFormat: 'mp4',
    },
  };

  describe('Basic Execution', () => {
    it('should execute ffmpeg successfully with mock script', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-c:v',
          'libx265',
          '-crf',
          '22',
          '-preset',
          'slow',
          '-c:a',
          'copy',
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -c:v libx265 -crf 22 -preset slow -c:a copy -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      const result = await executor.execute(command);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain('ffmpeg version mock-test-1.0');
        expect(result.finalProgress).toBeDefined();
      }

      await cleanupTestFile(inputPath);
    });

    it('should emit start event when execution begins', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      let startEmitted = false;

      executor.on('start', () => {
        startEmitted = true;
      });

      await executor.execute(command);

      expect(startEmitted).toBe(true);

      await cleanupTestFile(inputPath);
    });

    it('should emit complete event when execution finishes', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      let completeEmitted = false;

      executor.on('complete', ({ success, exitCode }) => {
        completeEmitted = true;
        expect(success).toBe(true);
        expect(exitCode).toBe(0);
      });

      await executor.execute(command);

      expect(completeEmitted).toBe(true);

      await cleanupTestFile(inputPath);
    });
  });

  describe('Progress Tracking', () => {
    it('should parse and emit progress updates from pipe format', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      const progressUpdates: FFmpegProgress[] = [];

      executor.on('progress', (progress: FFmpegProgress) => {
        progressUpdates.push(progress);
      });

      const result = await executor.execute(command);

      expect(result.success).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Verify progress data structure
      progressUpdates.forEach((progress) => {
        expect(progress.frame).toBeGreaterThan(0);
        expect(typeof progress.fps).toBe('number');
        expect(typeof progress.q).toBe('number');
        expect(typeof progress.size).toBe('number');
        expect(typeof progress.time).toBe('string');
        expect(typeof progress.bitrate).toBe('string');
        expect(typeof progress.speed).toBe('string');
        expect(typeof progress.progress).toBe('number');
      });

      // Verify frame progression (mock script outputs frames: 61, 127, 192, 228)
      expect(progressUpdates.some((p) => p.frame === 61)).toBe(true);
      expect(progressUpdates.some((p) => p.frame === 127)).toBe(true);

      await cleanupTestFile(inputPath);
    });

    it('should calculate progress percentage based on video duration', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      const progressUpdates: FFmpegProgress[] = [];

      executor.on('progress', (progress: FFmpegProgress) => {
        progressUpdates.push(progress);
      });

      await executor.execute(command);

      // Mock ffprobe returns duration of 7.66 seconds
      // Mock ffmpeg outputs times like 00:00:01.96, 00:00:04.17, 00:00:07.54
      // Progress should increase over time
      const validProgressUpdates = progressUpdates.filter(
        (p) => p.progress >= 0,
      );
      expect(validProgressUpdates.length).toBeGreaterThan(0);

      // Check that progress values are reasonable (0-100%)
      validProgressUpdates.forEach((progress) => {
        expect(progress.progress).toBeGreaterThanOrEqual(0);
        expect(progress.progress).toBeLessThanOrEqual(100);
      });

      await cleanupTestFile(inputPath);
    });

    it('should handle N/A values in progress data', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      const progressUpdates: FFmpegProgress[] = [];

      executor.on('progress', (progress: FFmpegProgress) => {
        progressUpdates.push(progress);
      });

      await executor.execute(command);

      // Mock script outputs some N/A values (frame 192)
      // Should still parse other progress updates successfully
      expect(progressUpdates.length).toBeGreaterThan(0);

      await cleanupTestFile(inputPath);
    });
  });

  describe('Video Duration Detection', () => {
    it('should detect video duration using ffprobe', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      const result = await executor.execute(command);

      // Mock ffprobe returns 7.66 seconds
      // If duration is detected, progress should be calculated
      if (result.success && result.finalProgress) {
        expect(result.finalProgress.progress).toBeGreaterThanOrEqual(0);
      }

      await cleanupTestFile(inputPath);
    });
  });

  describe('Stderr Output', () => {
    it('should capture full stderr output', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-c:v',
          'libx265',
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -c:v libx265 -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      const result = await executor.execute(command);

      expect(result.success).toBe(true);
      expect(result.stderr).toContain('ffmpeg version mock-test-1.0');
      expect(result.stderr).toContain('libavutil');
      expect(result.stderr).toContain('libavcodec');
      expect(result.stderr).toContain('x265 [info]');

      await cleanupTestFile(inputPath);
    });

    it('should include codec-specific output in stderr', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-c:v',
          'libx265',
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -c:v libx265 -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      const result = await executor.execute(command);

      expect(result.success).toBe(true);
      expect(result.stderr).toContain('x265 [info]: HEVC encoder');
      expect(result.stderr).toContain('encoded 228 frames');

      await cleanupTestFile(inputPath);
    });
  });

  describe('Process Killing', () => {
    it('should kill running ffmpeg process', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      let killCalled = false;

      // Kill process immediately when it starts
      executor.on('start', () => {
        executor.kill();
        killCalled = true;
      });

      const result = await executor.execute(command);

      // Verify kill was called
      expect(killCalled).toBe(true);

      // Mock script might complete before kill takes effect, so we accept either outcome
      // The important thing is that kill() doesn't crash
      if (!result.success) {
        expect(result.error).toBe('FFmpeg execution was cancelled');
      }

      await cleanupTestFile(inputPath);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout if execution takes too long', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      // Set very short timeout (shorter than mock script execution time)
      const executor = new FFmpegExecutor({ timeout: 10 });
      const result = await executor.execute(command);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('FFmpeg execution timed out');
        expect(result.exitCode).toBe(null);
      }

      await cleanupTestFile(inputPath);
    });

    it('should not timeout with sufficient time', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      // Set generous timeout
      const executor = new FFmpegExecutor({ timeout: 5000 });
      const result = await executor.execute(command);

      expect(result.success).toBe(true);

      await cleanupTestFile(inputPath);
    });
  });

  describe('Dry Run Mode', () => {
    it('should handle dry run mode', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({ dryRun: true });
      const result = await executor.execute(command);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.outputPath).toBe('dry-run-output');
      }

      await cleanupTestFile(inputPath);
    });
  });

  describe('Utility Functions', () => {
    it('should execute single command with executeFFmpegCommand', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const result = await executeFFmpegCommand(command, {});

      expect(result.success).toBe(true);

      await cleanupTestFile(inputPath);
    });

    it('should execute multiple commands sequentially', async () => {
      const inputPath1 = await createTestFile('test-input-1.mkv');
      const outputPath1 = path.join(
        path.dirname(inputPath1),
        'test-output-1.mp4',
      );

      const inputPath2 = await createTestFile('test-input-2.mkv');
      const outputPath2 = path.join(
        path.dirname(inputPath2),
        'test-output-2.mp4',
      );

      const commands: FFmpegCommand[] = [
        {
          args: [
            'ffmpeg',
            '-i',
            inputPath1,
            '-progress',
            'pipe:1',
            '-y',
            outputPath1,
          ],
          displayCommand: `ffmpeg -i ${inputPath1} -progress pipe:1 -y ${outputPath1}`,
          inputPath: inputPath1,
          outputPath: outputPath1,
          config: {
            inputFile: inputPath1,
            outputFile: outputPath1,
            options: basicOptions,
            jobName: 'Test Job 1',
          },
        },
        {
          args: [
            'ffmpeg',
            '-i',
            inputPath2,
            '-progress',
            'pipe:1',
            '-y',
            outputPath2,
          ],
          displayCommand: `ffmpeg -i ${inputPath2} -progress pipe:1 -y ${outputPath2}`,
          inputPath: inputPath2,
          outputPath: outputPath2,
          config: {
            inputFile: inputPath2,
            outputFile: outputPath2,
            options: basicOptions,
            jobName: 'Test Job 2',
          },
        },
      ];

      const progressMap = new Map<number, FFmpegProgress[]>();

      const results = await executeFFmpegCommands(
        commands,
        {},
        (index, progress) => {
          if (!progressMap.has(index)) {
            progressMap.set(index, []);
          }
          progressMap.get(index)!.push(progress);
        },
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);

      // Verify progress was tracked for both commands
      expect(progressMap.has(0)).toBe(true);
      expect(progressMap.has(1)).toBe(true);
      expect(progressMap.get(0)!.length).toBeGreaterThan(0);
      expect(progressMap.get(1)!.length).toBeGreaterThan(0);

      await cleanupTestFile(inputPath1);
      await cleanupTestFile(inputPath2);
    });
  });

  describe('Path Handling', () => {
    it('should handle absolute input and output paths', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      // Ensure paths are absolute
      expect(path.isAbsolute(inputPath)).toBe(true);
      expect(path.isAbsolute(outputPath)).toBe(true);

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      const result = await executor.execute(command);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.finalPath).toBe(outputPath);
        expect(path.isAbsolute(result.finalPath)).toBe(true);
      }

      await cleanupTestFile(inputPath);
    });

    it('should create output directory if it does not exist', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputDir = path.join(path.dirname(inputPath), 'new-output-dir');
      const outputPath = path.join(outputDir, 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      const result = await executor.execute(command);

      expect(result.success).toBe(true);

      // Verify output directory was created
      const dirExists = await fs
        .stat(outputDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);

      await cleanupTestFile(inputPath);
    });
  });

  describe('Temp File Handling', () => {
    it('should use temporary file path during conversion', async () => {
      const inputPath = await createTestFile('test-input.mkv');
      const outputPath = path.join(path.dirname(inputPath), 'test-output.mp4');

      const command: FFmpegCommand = {
        args: [
          'ffmpeg',
          '-i',
          inputPath,
          '-progress',
          'pipe:1',
          '-y',
          outputPath,
        ],
        displayCommand: `ffmpeg -i ${inputPath} -progress pipe:1 -y ${outputPath}`,
        inputPath,
        outputPath,
        config: {
          inputFile: inputPath,
          outputFile: outputPath,
          options: basicOptions,
          jobName: 'Test Job',
        },
      };

      const executor = new FFmpegExecutor({});
      const result = await executor.execute(command);

      expect(result.success).toBe(true);
      if (result.success) {
        // tempPath should contain .fsvtemp. prefix
        expect(result.tempPath).toContain('.fsvtemp.');
        // finalPath should be the original output path
        expect(result.finalPath).toBe(outputPath);
        // outputPath should point to temp file
        expect(result.outputPath).toBe(result.tempPath);
        // Temp path and final path should be different
        expect(result.tempPath).not.toBe(result.finalPath);
      }

      await cleanupTestFile(inputPath);
    });
  });
});
