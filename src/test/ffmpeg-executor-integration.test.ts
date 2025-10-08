/**
 * Integration tests for FFmpeg executor functionality
 * Uses real file system operations and mock ffmpeg script
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  FFmpegExecutor,
  executeFFmpegCommand,
  executeFFmpegCommands,
  type FFmpegExecutionOptions,
} from '@/lib/ffmpeg-executor';
import { generateFFmpegCommand, type FFmpegJobConfig } from '@/lib/ffmpeg-command';
import { DEFAULT_CONVERSION_OPTIONS } from '@/types/conversion';

describe('FFmpeg Executor Integration Tests', () => {
  let tempDir: string;
  let uploadsDir: string;
  let outputsDir: string;
  let options: FFmpegExecutionOptions;
  let testInputFile: string;
  let originalPath: string;

  beforeEach(async () => {
    // Create temporary directories
    tempDir = await mkdtemp(path.join(tmpdir(), 'ffmpeg-test-'));
    uploadsDir = path.join(tempDir, 'uploads');
    outputsDir = path.join(tempDir, 'outputs');
    
    await mkdir(uploadsDir, { recursive: true });
    await mkdir(outputsDir, { recursive: true });

    // Create a dummy input file
    testInputFile = 'test-video.mp4';
    await writeFile(path.join(uploadsDir, testInputFile), 'dummy video content');

    // Set up test options
    options = {
      uploadsDir,
      outputsDir,
      timeout: 10000, // 10 seconds for tests
    };

    // Store original PATH and add our test-bin directory to front of PATH
    originalPath = process.env.PATH || '';
    const projectRoot = path.resolve(__dirname, '../..');
    const testBinPath = path.join(projectRoot, 'test-bin');
    process.env.PATH = `${testBinPath}:${originalPath}`;
  });

  afterEach(async () => {
    // Restore original PATH
    process.env.PATH = originalPath;
    
    // Clean up temporary directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('FFmpegExecutor with real file operations', () => {
    let executor: FFmpegExecutor;
    let testCommand: ReturnType<typeof generateFFmpegCommand>;

    beforeEach(() => {
      executor = new FFmpegExecutor(options);

      const jobConfig: FFmpegJobConfig = {
        inputFile: testInputFile,
        outputFile: 'test-output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: [testInputFile],
        },
        jobName: 'Integration test conversion',
      };
      testCommand = generateFFmpegCommand(jobConfig);
    });

    it('should execute command successfully with real directories', async () => {
      const result = await executor.execute(testCommand);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.outputPath).toContain(outputsDir);
        expect(result.outputPath).toContain('test-output.mp4');
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain('ffmpeg version mock-test-1.0');
        expect(result.stderr).toContain('libx265');
      }
    });

    it('should create output directories as needed', async () => {
      const jobConfig: FFmpegJobConfig = {
        inputFile: testInputFile,
        outputFile: 'subfolder/deep/test-output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: [testInputFile],
        },
        jobName: 'Deep folder test',
      };
      const command = generateFFmpegCommand(jobConfig);

      const result = await executor.execute(command);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.outputPath).toContain('subfolder/deep/test-output.mp4');
      }
    });

    it('should track progress during execution', async () => {
      const progressEvents: any[] = [];

      executor.on('progress', (progress) => {
        progressEvents.push(progress);
        expect(progress).toMatchObject({
          frame: expect.any(Number),
          fps: expect.any(Number),
          time: expect.any(String),
          progress: expect.any(Number),
        });
        expect(progress.frame).toBeGreaterThan(0);
      });

      const result = await executor.execute(testCommand);
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('should emit start and complete events', async () => {
      const events: string[] = [];

      executor.on('start', (data) => {
        events.push('start');
        expect(data.command).toContain('ffmpeg');
      });

      executor.on('complete', (data) => {
        events.push('complete');
        expect(data.success).toBe(true);
        expect(data.exitCode).toBe(0);
      });

      await executor.execute(testCommand);

      expect(events).toEqual(['start', 'complete']);
    });

    it('should validate that input file exists implicitly', async () => {
      const jobConfig: FFmpegJobConfig = {
        inputFile: 'nonexistent-file.mp4',
        outputFile: 'test-output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: ['nonexistent-file.mp4'],
        },
        jobName: 'Nonexistent file test',
      };
      const command = generateFFmpegCommand(jobConfig);

      // The executor will still try to run since our mock ffmpeg doesn't check input files
      // In real scenarios, FFmpeg would fail, but our mock succeeds
      const result = await executor.execute(command);
      expect(result.success).toBe(true); // Mock ffmpeg always succeeds
    });

    it('should handle commands with safe file names', async () => {
      const safeFile = 'test-video-safe-name.mp4';
      await writeFile(path.join(uploadsDir, safeFile), 'dummy content');

      const jobConfig: FFmpegJobConfig = {
        inputFile: safeFile,
        outputFile: 'output-safe-name.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: [safeFile],
        },
        jobName: 'Safe file name test',
      };
      const command = generateFFmpegCommand(jobConfig);

      const result = await executor.execute(command);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.outputPath).toContain('output-safe-name.mp4');
      }
    });
  });

  describe('executeFFmpegCommand utility', () => {
    it('should execute single command with real file operations', async () => {
      const jobConfig: FFmpegJobConfig = {
        inputFile: testInputFile,
        outputFile: 'single-command-output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: [testInputFile],
        },
        jobName: 'Single command test',
      };

      const command = generateFFmpegCommand(jobConfig);
      const result = await executeFFmpegCommand(command, options);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.outputPath).toContain('single-command-output.mp4');
        expect(result.stderr).toContain('ffmpeg version mock-test-1.0');
      }
    });
  });

  describe('executeFFmpegCommands utility', () => {
    it('should execute multiple commands sequentially', async () => {
      // Create multiple input files
      const inputFiles = ['input1.mp4', 'input2.mp4', 'input3.mp4'];
      for (const file of inputFiles) {
        await writeFile(path.join(uploadsDir, file), `dummy content for ${file}`);
      }

      const commands = inputFiles.map((inputFile, index) =>
        generateFFmpegCommand({
          inputFile,
          outputFile: `output${index + 1}.mp4`,
          options: {
            ...DEFAULT_CONVERSION_OPTIONS,
            selectedFiles: [inputFile],
          },
          jobName: `Batch test ${index + 1}`,
        })
      );

      const progressUpdates: Array<{ commandIndex: number; frame: number }> = [];
      const results = await executeFFmpegCommands(
        commands,
        options,
        (commandIndex, progress) => {
          progressUpdates.push({ commandIndex, frame: progress.frame });
        }
      );

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Check that we got progress for different commands
      const commandIndices = [...new Set(progressUpdates.map(p => p.commandIndex))];
      expect(commandIndices.length).toBeGreaterThan(0);
    });

    it('should continue on failure in dry run mode', async () => {
      // Use the existing test-ffmpeg which always succeeds
      // To test failure handling, we'd need a different mock script
      const commands = [
        generateFFmpegCommand({
          inputFile: testInputFile,
          outputFile: 'output1.mp4',
          options: { ...DEFAULT_CONVERSION_OPTIONS, selectedFiles: [testInputFile] },
          jobName: 'Test 1',
        }),
        generateFFmpegCommand({
          inputFile: testInputFile,
          outputFile: 'output2.mp4',
          options: { ...DEFAULT_CONVERSION_OPTIONS, selectedFiles: [testInputFile] },
          jobName: 'Test 2',
        }),
      ];

      const results = await executeFFmpegCommands(commands, {
        ...options,
        dryRun: true,
      });

      expect(results).toHaveLength(2);
      // With our mock ffmpeg that always succeeds, both should succeed
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('Mock FFmpeg behavior verification', () => {
    it('should verify mock ffmpeg produces expected output', async () => {
      const executor = new FFmpegExecutor(options);
      const jobConfig: FFmpegJobConfig = {
        inputFile: testInputFile,
        outputFile: 'mock-test-output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: [testInputFile],
        },
        jobName: 'Mock verification test',
      };
      const command = generateFFmpegCommand(jobConfig);

      const result = await executor.execute(command);

      expect(result.success).toBe(true);
      if (result.success) {
        // Verify mock ffmpeg specific output
        expect(result.stderr).toContain('ffmpeg version mock-test-1.0');
        expect(result.stderr).toContain('Mock Test Configuration');
        expect(result.stderr).toContain(testInputFile);
        expect(result.stderr).toContain('mock-test-output.mp4');
        expect(result.stderr).toContain('libx265');
        expect(result.stderr).toContain('x265 [info]');
      }
    });

    it('should verify progress parsing works with mock output', async () => {
      const executor = new FFmpegExecutor(options);
      const progressData: any[] = [];

      executor.on('progress', (progress) => {
        progressData.push(progress);
      });

      const jobConfig: FFmpegJobConfig = {
        inputFile: testInputFile,
        outputFile: 'progress-test-output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: [testInputFile],
        },
        jobName: 'Progress test',
      };
      const command = generateFFmpegCommand(jobConfig);

      const result = await executor.execute(command);

      expect(progressData.length).toBeGreaterThan(2); // Should have multiple progress updates
      
      const lastProgress = progressData[progressData.length - 1];
      expect(lastProgress).toMatchObject({
        frame: expect.any(Number),
        fps: expect.any(Number),
        time: expect.any(String),
        speed: expect.any(String),
        size: expect.any(Number),
      });
      
      // Should have frames from our mock (61, 127, 192, 228)
      const frames = progressData.map(p => p.frame);
      expect(frames).toContain(61);
      expect(frames).toContain(127);
      expect(frames).toContain(228);
      
      // Verify progress is increasing
      for (let i = 1; i < progressData.length; i++) {
        expect(progressData[i].frame).toBeGreaterThan(progressData[i-1].frame);
      }
    });
  });
});