/**
 * Tests for FFmpeg command execution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import {
  FFmpegExecutor,
  executeFFmpegCommand,
  executeFFmpegCommands,
  type FFmpegExecutionOptions,
} from '@/lib/ffmpeg-executor';
import { generateFFmpegCommand, type FFmpegJobConfig } from '@/lib/ffmpeg-command';
import { DEFAULT_CONVERSION_OPTIONS } from '@/types/conversion';

// Simple mocks that always succeed
vi.mock('fs/promises', () => {
  return {
    default: {
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();
    mockProcess.killed = false;
    
    // Immediately emit close with success
    process.nextTick(() => {
      mockProcess.emit('close', 0);
    });
    
    return mockProcess;
  }),
  ChildProcess: class {} // Mock the ChildProcess class
}));

describe('FFmpegExecutor', () => {
  let executor: FFmpegExecutor;
  let options: FFmpegExecutionOptions;
  let testCommand: ReturnType<typeof generateFFmpegCommand>;

  beforeEach(() => {
    options = {
      uploadsDir: '/test/uploads',
      outputsDir: '/test/outputs',
      dryRun: true, // Always use dry run in tests
      timeout: 5000, // Short timeout for tests
    };

    executor = new FFmpegExecutor(options);

    // Create a test command
    const jobConfig: FFmpegJobConfig = {
      inputFile: 'test-video.mp4',
      outputFile: 'test-output.mp4',
      options: {
        ...DEFAULT_CONVERSION_OPTIONS,
        selectedFiles: ['test-video.mp4'],
      },
      jobName: 'Test conversion',
    };
    testCommand = generateFFmpegCommand(jobConfig);
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
    it('should execute command successfully in dry run mode', async () => {
      const result = await executor.execute(testCommand);

      console.log('Test result:', result);
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
      const startSpy = vi.fn();
      const completeSpy = vi.fn();
      
      executor.on('start', startSpy);
      executor.on('complete', completeSpy);

      await executor.execute(testCommand);

      expect(startSpy).toHaveBeenCalledWith({
        command: expect.stringContaining('ffmpeg'),
      });
      expect(completeSpy).toHaveBeenCalledWith({
        success: true,
        exitCode: 0,
      });
    });
  });

  describe('kill', () => {
    it('should not throw when killing executor with no running process', () => {
      expect(() => executor.kill()).not.toThrow();
    });
  });
});

describe('executeFFmpegCommand', () => {
  it('should execute single command', async () => {
    const jobConfig: FFmpegJobConfig = {
      inputFile: 'test.mp4',
      outputFile: 'output.mp4',
      options: {
        ...DEFAULT_CONVERSION_OPTIONS,
        selectedFiles: ['test.mp4'],
      },
      jobName: 'Test',
    };

    const command = generateFFmpegCommand(jobConfig);
    const result = await executeFFmpegCommand(command, {
      uploadsDir: '/uploads',
      outputsDir: '/outputs',
      dryRun: true,
    });

    expect(result.success).toBe(true);
  });
});

describe('executeFFmpegCommands', () => {
  it('should execute multiple commands sequentially', async () => {
    const commands = [
      generateFFmpegCommand({
        inputFile: 'test1.mp4',
        outputFile: 'output1.mp4',
        options: { ...DEFAULT_CONVERSION_OPTIONS, selectedFiles: ['test1.mp4'] },
        jobName: 'Test 1',
      }),
      generateFFmpegCommand({
        inputFile: 'test2.mp4',
        outputFile: 'output2.mp4',
        options: { ...DEFAULT_CONVERSION_OPTIONS, selectedFiles: ['test2.mp4'] },
        jobName: 'Test 2',
      }),
    ];

    const results = await executeFFmpegCommands(commands, {
      uploadsDir: '/uploads',
      outputsDir: '/outputs',
      dryRun: true,
    });

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it('should stop on first failure in non-dry-run mode', async () => {
    // Mock spawn to return failing process for first command
    vi.doMock('child_process', () => ({
      spawn: vi.fn(() => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.killed = false;
        
        // Fail the first command
        setTimeout(() => {
          mockProcess.emit('close', 1);
        }, 10);
        
        return mockProcess;
      }),
    }));

    const commands = [
      generateFFmpegCommand({
        inputFile: 'test1.mp4',
        outputFile: 'output1.mp4',
        options: { ...DEFAULT_CONVERSION_OPTIONS, selectedFiles: ['test1.mp4'] },
        jobName: 'Test 1',
      }),
      generateFFmpegCommand({
        inputFile: 'test2.mp4',
        outputFile: 'output2.mp4',
        options: { ...DEFAULT_CONVERSION_OPTIONS, selectedFiles: ['test2.mp4'] },
        jobName: 'Test 2',
      }),
    ];

    const results = await executeFFmpegCommands(commands, {
      uploadsDir: '/uploads',
      outputsDir: '/outputs',
      dryRun: false, // Not dry run
    });

    expect(results).toHaveLength(1); // Should stop after first failure
    expect(results[0].success).toBe(false);
  });
});