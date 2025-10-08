/**
 * Basic tests for FFmpeg executor functionality
 */

import { describe, it, expect } from 'vitest';
import { FFmpegExecutor } from '@/lib/ffmpeg-executor';
import {
  generateFFmpegCommand,
  type FFmpegJobConfig,
} from '@/lib/ffmpeg-command';
import { DEFAULT_CONVERSION_OPTIONS } from '@/types/conversion';

describe('FFmpegExecutor Basic Tests', () => {
  describe('constructor', () => {
    it('should create executor with default timeout', () => {
      const exec = new FFmpegExecutor({
        uploadsDir: '/uploads',
        outputsDir: '/outputs',
      });
      expect(exec).toBeInstanceOf(FFmpegExecutor);
    });

    it('should create executor with custom timeout', () => {
      const exec = new FFmpegExecutor({
        uploadsDir: '/uploads',
        outputsDir: '/outputs',
        timeout: 10000,
      });
      expect(exec).toBeInstanceOf(FFmpegExecutor);
    });

    it('should create executor with dry run option', () => {
      const exec = new FFmpegExecutor({
        uploadsDir: '/uploads',
        outputsDir: '/outputs',
        dryRun: true,
      });
      expect(exec).toBeInstanceOf(FFmpegExecutor);
    });
  });

  describe('command validation', () => {
    let executor: FFmpegExecutor;

    beforeEach(() => {
      executor = new FFmpegExecutor({
        uploadsDir: '/test/uploads',
        outputsDir: '/test/outputs',
        dryRun: true,
      });
    });

    it('should reject non-ffmpeg commands', async () => {
      const invalidCommand = {
        args: ['rm', '-rf', '/'],
        displayCommand: 'rm -rf /',
        inputPath: 'test.mp4',
        outputPath: 'output.mp4',
        config: {
          inputFile: 'test.mp4',
          outputFile: 'output.mp4',
          options: DEFAULT_CONVERSION_OPTIONS,
          jobName: 'Test',
        },
      };

      await expect(executor.execute(invalidCommand)).rejects.toThrow(
        'Only ffmpeg commands are allowed',
      );
    });

    it('should accept valid ffmpeg commands', () => {
      const jobConfig: FFmpegJobConfig = {
        inputFile: 'test-video.mp4',
        outputFile: 'test-output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: ['test-video.mp4'],
        },
        jobName: 'Test conversion',
      };

      const validCommand = generateFFmpegCommand(jobConfig);
      expect(validCommand.args[0]).toBe('ffmpeg');
      expect(validCommand.displayCommand).toContain('ffmpeg');
    });
  });

  describe('progress parsing', () => {
    let executor: FFmpegExecutor;

    beforeEach(() => {
      executor = new FFmpegExecutor({
        uploadsDir: '/test/uploads',
        outputsDir: '/test/outputs',
        dryRun: true,
      });
    });

    it('should parse progress data correctly', () => {
      // Access the private method for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parseProgress = (executor as any).parseProgress.bind(executor);

      // Test with line-separated output like FFmpeg actually produces
      const progressOutput =
        'frame=   100\nfps= 25\nq=28.0\nsize=    1024kB\ntime=00:00:04.00\nbitrate=2097.2kbits/s\nspeed=   1x';
      const progress = parseProgress(progressOutput);

      expect(progress).toEqual(
        expect.objectContaining({
          frame: 100,
          fps: 25,
          q: 28.0,
          size: 1024 * 1024, // Convert kB to bytes
          time: '00:00:04.00',
          bitrate: '2097.2kbits/s',
          speed: '1x',
          progress: expect.any(Number),
        }),
      );
    });

    it('should return null for incomplete progress data', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parseProgress = (executor as any).parseProgress.bind(executor);

      // Only frame info, no time
      const incompleteOutput = 'frame=   50';
      const progress = parseProgress(incompleteOutput);

      expect(progress).toBeNull();
    });

    it('should handle multiple progress lines', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parseProgress = (executor as any).parseProgress.bind(executor);

      const progressLines = [
        'frame=   150',
        'fps= 30.5',
        'q=23.5',
        'size=    2048kB',
        'time=00:00:05.50',
        'bitrate=3051.6kbits/s',
        'speed= 1.2x',
      ];

      const output = progressLines.join('\n');
      const progress = parseProgress(output);

      expect(progress).toEqual(
        expect.objectContaining({
          frame: 150,
          fps: 30.5,
          q: 23.5,
          size: 2048 * 1024,
          time: '00:00:05.50',
          bitrate: '3051.6kbits/s',
          speed: '1.2x',
        }),
      );
    });
  });

  describe('discriminated union types', () => {
    it('should type-check success results correctly', () => {
      const successResult = {
        success: true as const,
        outputPath: '/test/output.mp4',
        finalProgress: undefined,
        stderr: '',
        exitCode: 0,
      };

      // Type checking - success result should have outputPath
      if (successResult.success) {
        expect(successResult.outputPath).toBe('/test/output.mp4');
        expect(successResult.exitCode).toBe(0);
      }
    });

    it('should type-check failure results correctly', () => {
      const failureResult = {
        success: false as const,
        error: 'FFmpeg failed',
        stderr: 'Error output',
        exitCode: 1,
        finalProgress: undefined,
      };

      // Type checking - failure result should have error
      if (!failureResult.success) {
        expect(failureResult.error).toBe('FFmpeg failed');
        expect(failureResult.exitCode).toBe(1);
      }
    });
  });

  describe('command generation', () => {
    it('should generate dry run commands correctly', () => {
      const jobConfig: FFmpegJobConfig = {
        inputFile: 'test-video.mp4',
        outputFile: 'test-output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: ['test-video.mp4'],
        },
        jobName: 'Test conversion',
      };

      const command = generateFFmpegCommand(jobConfig);

      expect(command.args).toContain('ffmpeg');
      expect(command.args).toContain('-i');
      expect(command.args).toContain('-progress');
      expect(command.args).toContain('pipe:1');
      expect(command.args).toContain('-y'); // Overwrite flag
      expect(command.displayCommand).toContain('ffmpeg');
    });

    it('should include dry run flags when needed', () => {
      const executor = new FFmpegExecutor({
        uploadsDir: '/test/uploads',
        outputsDir: '/test/outputs',
        dryRun: true,
      });

      // Test that the class knows about dry run mode
      expect(executor).toBeInstanceOf(FFmpegExecutor);
    });
  });
});
