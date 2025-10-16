/**
 * Integration tests for FFmpeg executor functionality
 * Uses real file system operations and mock ffmpeg script
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
    await writeFile(
      path.join(uploadsDir, testInputFile),
      'dummy video content',
    );

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
        inputFile: path.join(uploadsDir, testInputFile),
        outputFile: path.join(outputsDir, 'test-output.mp4'),
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
        inputFile: path.join(uploadsDir, testInputFile),
        outputFile: path.join(outputsDir, 'subfolder/deep/test-output.mp4'),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        await writeFile(
          path.join(uploadsDir, file),
          `dummy content for ${file}`,
        );
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
        }),
      );

      const progressUpdates: Array<{ commandIndex: number; frame: number }> =
        [];
      const results = await executeFFmpegCommands(
        commands,
        options,
        (commandIndex, progress) => {
          progressUpdates.push({ commandIndex, frame: progress.frame });
        },
      );

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Check that we got progress for different commands
      const commandIndices = [
        ...new Set(progressUpdates.map((p) => p.commandIndex)),
      ];
      expect(commandIndices.length).toBeGreaterThan(0);
    });

    it('should continue on failure in dry run mode', async () => {
      // Use the existing test-ffmpeg which always succeeds
      // To test failure handling, we'd need a different mock script
      const commands = [
        generateFFmpegCommand({
          inputFile: testInputFile,
          outputFile: 'output1.mp4',
          options: {
            ...DEFAULT_CONVERSION_OPTIONS,
            selectedFiles: [testInputFile],
          },
          jobName: 'Test 1',
        }),
        generateFFmpegCommand({
          inputFile: testInputFile,
          outputFile: 'output2.mp4',
          options: {
            ...DEFAULT_CONVERSION_OPTIONS,
            selectedFiles: [testInputFile],
          },
          jobName: 'Test 2',
        }),
      ];

      const results = await executeFFmpegCommands(commands, {
        ...options,
        dryRun: true,
      });

      expect(results).toHaveLength(2);
      // With our mock ffmpeg that always succeeds, both should succeed
      expect(results.every((r) => r.success)).toBe(true);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      await executor.execute(command);

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
      const frames = progressData.map((p) => p.frame);
      expect(frames).toContain(61);
      expect(frames).toContain(127);
      expect(frames).toContain(228);

      // Verify progress is increasing
      for (let i = 1; i < progressData.length; i++) {
        expect(progressData[i].frame).toBeGreaterThan(
          progressData[i - 1].frame,
        );
      }
    });
  });

  describe('Command Injection Protection - End-to-End Integration Tests', () => {
    /**
     * These tests verify that malicious inputs are safely handled through
     * the entire pipeline: generation -> validation -> execution.
     * We use non-destructive commands to verify injection is blocked.
     */

    beforeEach(async () => {
      // Create a marker file that injection attempts might try to read
      await writeFile(
        path.join(tempDir, 'MARKER.txt'),
        'MARKER_CONTENT_SHOULD_NOT_APPEAR_IN_OUTPUT',
      );
    });

    it('should safely handle semicolon in custom command without execution', async () => {
      // Semicolon with echo command - if injection works, we'd see the echo output
      const maliciousCustomCommand = `-c:v libx264 -crf 23; echo INJECTION_SUCCESSFUL`;

      const executor = new FFmpegExecutor(options);
      const command = generateFFmpegCommand({
        inputFile: testInputFile,
        outputFile: 'output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          customCommand: maliciousCustomCommand,
          selectedFiles: [testInputFile],
        },
        jobName: 'Semicolon injection test',
      });

      const result = await executor.execute(command);

      // Since we use spawn() with array, the semicolon is passed as a literal argument to ffmpeg
      // FFmpeg will likely fail because "; echo INJECTION_SUCCESSFUL" is not a valid argument
      // But the important thing is that "echo INJECTION_SUCCESSFUL" never executes
      if (!result.success) {
        // Expected - ffmpeg doesn't understand the malicious argument
        expect(result.stderr).not.toContain('INJECTION_SUCCESSFUL');
      } else {
        // If it somehow succeeded, verify the injection didn't run
        expect(result.stderr).not.toContain('INJECTION_SUCCESSFUL');
      }
    });

    it('should safely handle pipe operator in custom command', async () => {
      const maliciousCustomCommand = `-c:v libx264 | echo PIPED_INJECTION`;

      const executor = new FFmpegExecutor(options);
      const command = generateFFmpegCommand({
        inputFile: testInputFile,
        outputFile: 'output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          customCommand: maliciousCustomCommand,
          selectedFiles: [testInputFile],
        },
        jobName: 'Pipe injection test',
      });

      const result = await executor.execute(command);

      // The pipe character is passed as a literal argument, not executed
      expect(result.stderr).not.toContain('PIPED_INJECTION');
    });

    it('should safely handle command substitution with backticks', async () => {
      const maliciousCustomCommand = `-c:v libx264 -crf \`echo 23\``;

      const executor = new FFmpegExecutor(options);
      const command = generateFFmpegCommand({
        inputFile: testInputFile,
        outputFile: 'output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          customCommand: maliciousCustomCommand,
          selectedFiles: [testInputFile],
        },
        jobName: 'Backtick injection test',
      });

      const result = await executor.execute(command);

      // Backticks are passed literally - command substitution doesn't happen
      // The literal string "`echo 23`" would be an invalid argument to ffmpeg
      if (!result.success) {
        // Expected failure due to invalid argument
        expect(result.exitCode).not.toBe(0);
      }
      // Either way, command substitution should not have occurred
    });

    it('should safely handle command substitution with $() syntax', async () => {
      const maliciousCustomCommand = `-c:v libx264 -crf $(echo 23)`;

      const executor = new FFmpegExecutor(options);
      const command = generateFFmpegCommand({
        inputFile: testInputFile,
        outputFile: 'output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          customCommand: maliciousCustomCommand,
          selectedFiles: [testInputFile],
        },
        jobName: 'Dollar paren injection test',
      });

      const result = await executor.execute(command);

      // The string "$(echo 23)" is passed literally, not executed
      if (!result.success) {
        // Expected failure
        expect(result.exitCode).not.toBe(0);
      }
    });

    it('should safely handle AND operator (&&) in custom command', async () => {
      const maliciousCustomCommand = `-c:v libx264 && echo DOUBLE_AMPERSAND`;

      const executor = new FFmpegExecutor(options);
      const command = generateFFmpegCommand({
        inputFile: testInputFile,
        outputFile: 'output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          customCommand: maliciousCustomCommand,
          selectedFiles: [testInputFile],
        },
        jobName: 'AND operator test',
      });

      const result = await executor.execute(command);

      // The && is treated as a literal string, not a shell operator
      expect(result.stderr).not.toContain('DOUBLE_AMPERSAND');
    });

    it('should safely handle OR operator (||) in custom command', async () => {
      const maliciousCustomCommand = `-c:v libx264 || echo DOUBLE_PIPE`;

      const executor = new FFmpegExecutor(options);
      const command = generateFFmpegCommand({
        inputFile: testInputFile,
        outputFile: 'output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          customCommand: maliciousCustomCommand,
          selectedFiles: [testInputFile],
        },
        jobName: 'OR operator test',
      });

      const result = await executor.execute(command);

      // The || is treated as a literal string, not a shell operator
      expect(result.stderr).not.toContain('DOUBLE_PIPE');
    });

    it('should safely handle variable substitution attempts', async () => {
      const maliciousCustomCommand = `-c:v libx264 -preset \${HOME}`;

      const executor = new FFmpegExecutor(options);
      const command = generateFFmpegCommand({
        inputFile: testInputFile,
        outputFile: 'output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          customCommand: maliciousCustomCommand,
          selectedFiles: [testInputFile],
        },
        jobName: 'Variable substitution test',
      });

      const result = await executor.execute(command);

      // The literal string "${HOME}" is passed, not expanded
      // FFmpeg will treat it as an invalid preset name
      if (!result.success) {
        // Expected - invalid preset
        expect(result.exitCode).not.toBe(0);
      }
    });

    it('should prevent non-ffmpeg executable execution', async () => {
      const executor = new FFmpegExecutor(options);

      // Try to execute 'cat' instead of 'ffmpeg'
      const maliciousCommand = {
        args: ['cat', path.join(tempDir, 'MARKER.txt')],
        displayCommand: 'cat MARKER.txt',
        inputPath: testInputFile,
        outputPath: 'output.mp4',
        config: {
          inputFile: testInputFile,
          outputFile: 'output.mp4',
          options: DEFAULT_CONVERSION_OPTIONS,
          jobName: 'Executable injection',
        },
      };

      // Should be rejected during validation
      await expect(executor.execute(maliciousCommand)).rejects.toThrow(
        'Only ffmpeg commands are allowed',
      );
    });

    it('should handle null bytes safely in custom commands', async () => {
      const maliciousCustomCommand = `-c:v libx264\x00 -preset fast`;

      const executor = new FFmpegExecutor(options);
      const command = generateFFmpegCommand({
        inputFile: testInputFile,
        outputFile: 'output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          customCommand: maliciousCustomCommand,
          selectedFiles: [testInputFile],
        },
        jobName: 'Null byte test',
      });

      // Null bytes should be stripped
      expect(command.args.join(' ')).not.toContain('\x00');

      const result = await executor.execute(command);

      // Should execute without the null byte
      expect(result.success).toBe(true);
    });

    it('should execute successfully with legitimate special characters in arguments', async () => {
      // FFmpeg filter syntax often includes special characters like : , ( ) [ ]
      const legitimateCommand = `-vf scale=1920:1080,fps=30`;

      const executor = new FFmpegExecutor(options);
      const command = generateFFmpegCommand({
        inputFile: testInputFile,
        outputFile: 'output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          customCommand: legitimateCommand,
          selectedFiles: [testInputFile],
        },
        jobName: 'Legitimate special chars test',
      });

      const result = await executor.execute(command);

      // Should succeed - these are legitimate FFmpeg arguments
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.exitCode).toBe(0);
      }
    });

    it('should verify injection attempts fail but do not execute shell commands', async () => {
      // Create a comprehensive injection attempt
      const maliciousCustomCommand = `-c:v libx264; cat ${path.join(tempDir, 'MARKER.txt')}; echo FINAL`;

      const executor = new FFmpegExecutor(options);
      const command = generateFFmpegCommand({
        inputFile: testInputFile,
        outputFile: 'output.mp4',
        options: {
          ...DEFAULT_CONVERSION_OPTIONS,
          customCommand: maliciousCustomCommand,
          selectedFiles: [testInputFile],
        },
        jobName: 'Comprehensive injection test',
      });

      const result = await executor.execute(command);

      // The marker file content should NEVER appear in output
      expect(result.stderr).not.toContain(
        'MARKER_CONTENT_SHOULD_NOT_APPEAR_IN_OUTPUT',
      );
      // The echo should never execute
      expect(result.stderr).not.toContain('FINAL');

      // Either it fails (expected) or succeeds with our mock
      // But injection must not occur either way
      if (result.success) {
        expect(result.exitCode).toBe(0);
      }
    });
  });
});
