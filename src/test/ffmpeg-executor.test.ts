/**
 * Tests for FFmpeg command execution using mock ffmpeg script
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  FFmpegExecutor,
  executeFFmpegCommand,
  executeFFmpegCommands,
  type FFmpegExecutionOptions,
} from '@/lib/ffmpeg-executor';
import {
  generateFFmpegCommand,
  type FFmpegJobConfig,
} from '@/lib/ffmpeg-command';
import { DEFAULT_CONVERSION_OPTIONS } from '@/types/conversion';

describe('FFmpegExecutor', () => {
  let tempDir: string;
  let uploadsDir: string;
  let outputsDir: string;
  let options: FFmpegExecutionOptions;
  let testInputFile: string;
  let originalPath: string;
  let executor: FFmpegExecutor;
  let testCommand: ReturnType<typeof generateFFmpegCommand>;

  beforeEach(async () => {
    // Create temporary directories
    tempDir = await mkdtemp(path.join(tmpdir(), 'ffmpeg-test-'));
    uploadsDir = path.join(tempDir, 'uploads');
    outputsDir = path.join(tempDir, 'outputs');

    await mkdir(uploadsDir, { recursive: true });
    await mkdir(outputsDir, { recursive: true });

    // Create a dummy input file
    testInputFile = 'test-video.mp4';
    await writeFile(
      path.join(uploadsDir, testInputFile),
      'dummy video content',
    );

    // Set up test options
    options = {
      uploadsDir,
      outputsDir,
      timeout: 5000, // Short timeout for tests
    };

    // Store original PATH and add our test-bin directory to front of PATH
    originalPath = process.env.PATH || '';
    const projectRoot = path.resolve(__dirname, '../..');
    const testBinPath = path.join(projectRoot, 'test-bin');
    process.env.PATH = `${testBinPath}:${originalPath}`;

    executor = new FFmpegExecutor(options);

    // Create a test command with absolute paths
    const jobConfig: FFmpegJobConfig = {
      inputFile: path.join(uploadsDir, testInputFile),
      outputFile: path.join(outputsDir, 'test-output.mp4'),
      options: {
        ...DEFAULT_CONVERSION_OPTIONS,
        selectedFiles: [testInputFile],
      },
      jobName: 'Test conversion',
    };
    testCommand = generateFFmpegCommand(jobConfig);
  });

  afterEach(async () => {
    // Restore original PATH
    process.env.PATH = originalPath;

    // Clean up temporary directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

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
  });

  describe('execute', () => {
    it('should execute command successfully with mock ffmpeg', async () => {
      const result = await executor.execute(testCommand);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.finalPath).toContain(outputsDir);
        expect(result.finalPath).toContain('test-output.mp4');
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain('ffmpeg version mock-test-1.0');
      }
    });

    it('should execute command successfully in dry run mode', async () => {
      const dryRunExecutor = new FFmpegExecutor({
        ...options,
        dryRun: true,
      });

      const result = await dryRunExecutor.execute(testCommand);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.outputPath).toBe('dry-run-output');
        expect(result.exitCode).toBe(0);
      }
    });

    it('should validate command before execution', async () => {
      const invalidCommand = {
        ...testCommand,
        args: ['rm', '-rf', '/'], // Invalid command
      };

      await expect(executor.execute(invalidCommand)).rejects.toThrow(
        'Only ffmpeg commands are allowed',
      );
    });

    it('should handle timeout with very short timeout', async () => {
      const shortTimeoutExecutor = new FFmpegExecutor({
        ...options,
        timeout: 1, // Very short timeout (1ms)
      });

      const result = await shortTimeoutExecutor.execute(testCommand);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('timed out');
      }
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
  });

  describe('kill', () => {
    it('should not throw when killing executor with no running process', () => {
      expect(() => executor.kill()).not.toThrow();
    });
  });
});

describe('executeFFmpegCommand', () => {
  let tempDir: string;
  let uploadsDir: string;
  let outputsDir: string;
  let testInputFile: string;
  let originalPath: string;

  beforeEach(async () => {
    // Create temporary directories
    tempDir = await mkdtemp(path.join(tmpdir(), 'ffmpeg-cmd-test-'));
    uploadsDir = path.join(tempDir, 'uploads');
    outputsDir = path.join(tempDir, 'outputs');

    await mkdir(uploadsDir, { recursive: true });
    await mkdir(outputsDir, { recursive: true });

    // Create a dummy input file
    testInputFile = 'test.mp4';
    await writeFile(
      path.join(uploadsDir, testInputFile),
      'dummy video content',
    );

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

  it('should execute single command with mock ffmpeg', async () => {
    const jobConfig: FFmpegJobConfig = {
      inputFile: path.join(uploadsDir, testInputFile),
      outputFile: path.join(outputsDir, 'output.mp4'),
      options: {
        ...DEFAULT_CONVERSION_OPTIONS,
        selectedFiles: [testInputFile],
      },
      jobName: 'Test',
    };

    const command = generateFFmpegCommand(jobConfig);
    const result = await executeFFmpegCommand(command, {
      uploadsDir,
      outputsDir,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.stderr).toContain('ffmpeg version mock-test-1.0');
    }
  });

  it('should execute single command in dry run mode', async () => {
    const jobConfig: FFmpegJobConfig = {
      inputFile: path.join(uploadsDir, testInputFile),
      outputFile: path.join(outputsDir, 'output.mp4'),
      options: {
        ...DEFAULT_CONVERSION_OPTIONS,
        selectedFiles: [testInputFile],
      },
      jobName: 'Test',
    };

    const command = generateFFmpegCommand(jobConfig);
    const result = await executeFFmpegCommand(command, {
      uploadsDir,
      outputsDir,
      dryRun: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.outputPath).toBe('dry-run-output');
    }
  });
});

describe('executeFFmpegCommands', () => {
  let tempDir: string;
  let uploadsDir: string;
  let outputsDir: string;
  let originalPath: string;

  beforeEach(async () => {
    // Create temporary directories
    tempDir = await mkdtemp(path.join(tmpdir(), 'ffmpeg-cmds-test-'));
    uploadsDir = path.join(tempDir, 'uploads');
    outputsDir = path.join(tempDir, 'outputs');

    await mkdir(uploadsDir, { recursive: true });
    await mkdir(outputsDir, { recursive: true });

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

  it('should execute multiple commands sequentially', async () => {
    // Create test input files
    const inputFiles = ['test1.mp4', 'test2.mp4'];
    for (const file of inputFiles) {
      await writeFile(path.join(uploadsDir, file), `dummy content for ${file}`);
    }

    const commands = [
      generateFFmpegCommand({
        inputFile: path.join(uploadsDir, 'test1.mp4'),
        outputFile: path.join(outputsDir, 'output1.mp4'),
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: ['test1.mp4'],
        },
        jobName: 'Test 1',
      }),
      generateFFmpegCommand({
        inputFile: path.join(uploadsDir, 'test2.mp4'),
        outputFile: path.join(outputsDir, 'output2.mp4'),
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: ['test2.mp4'],
        },
        jobName: 'Test 2',
      }),
    ];

    const results = await executeFFmpegCommands(commands, {
      uploadsDir,
      outputsDir,
    });

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it('should execute multiple commands in dry run mode', async () => {
    const commands = [
      generateFFmpegCommand({
        inputFile: path.join(uploadsDir, 'test1.mp4'),
        outputFile: path.join(outputsDir, 'output1.mp4'),
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: ['test1.mp4'],
        },
        jobName: 'Test 1',
      }),
      generateFFmpegCommand({
        inputFile: path.join(uploadsDir, 'test2.mp4'),
        outputFile: path.join(outputsDir, 'output2.mp4'),
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          selectedFiles: ['test2.mp4'],
        },
        jobName: 'Test 2',
      }),
    ];

    const results = await executeFFmpegCommands(commands, {
      uploadsDir,
      outputsDir,
      dryRun: true,
    });

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    // In dry run mode, all results should have dry-run-output
    if (results[0].success && results[1].success) {
      expect(results[0].outputPath).toBe('dry-run-output');
      expect(results[1].outputPath).toBe('dry-run-output');
    }
  });
});
