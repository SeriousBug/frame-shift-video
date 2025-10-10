/**
 * Job processor tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JobProcessor } from '@/lib/job-processor';
import { JobService } from '@/lib/db-service';
import { getDatabase } from '@/lib/database';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

describe('JobProcessor', () => {
  let tempDir: string;
  let uploadsDir: string;
  let outputsDir: string;
  let originalPath: string;

  const testConfig = () => ({
    uploadsDir,
    outputsDir,
    checkInterval: 100, // Short interval for testing
  });

  beforeEach(async () => {
    // Create temporary directories
    tempDir = await mkdtemp(path.join(tmpdir(), 'job-processor-test-'));
    uploadsDir = path.join(tempDir, 'uploads');
    outputsDir = path.join(tempDir, 'outputs');

    await mkdir(uploadsDir, { recursive: true });
    await mkdir(outputsDir, { recursive: true });

    // Store original PATH and add our test-bin directory to front of PATH
    originalPath = process.env.PATH || '';
    const projectRoot = path.resolve(__dirname, '../..');
    const testBinPath = path.join(projectRoot, 'test-bin');
    process.env.PATH = `${testBinPath}:${originalPath}`;

    // Clear database before each test
    const db = getDatabase();
    db.exec('DELETE FROM jobs');
    db.exec("DELETE FROM meta WHERE key != 'version'");

    // Reset the singleton instance
    JobProcessor.resetInstance();
  });

  afterEach(async () => {
    // Stop processor if running
    try {
      const processor = JobProcessor.getInstance(testConfig());
      processor.stop();
    } catch {
      // Instance might not exist
    }
    JobProcessor.resetInstance();

    // Restore original PATH
    process.env.PATH = originalPath;

    // Clean up temporary directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Singleton pattern', () => {
    it('should create a singleton instance', () => {
      const processor1 = JobProcessor.getInstance(testConfig());
      const processor2 = JobProcessor.getInstance();
      expect(processor1).toBe(processor2);
    });

    it('should throw error if accessed before initialization', () => {
      JobProcessor.resetInstance();
      expect(() => JobProcessor.getInstance()).toThrow(
        'JobProcessor must be initialized with config on first call',
      );
    });

    it('should reset instance correctly', () => {
      JobProcessor.getInstance(testConfig());
      JobProcessor.resetInstance();
      expect(() => JobProcessor.getInstance()).toThrow();
    });
  });

  describe('Start and stop', () => {
    it('should start successfully', async () => {
      const processor = JobProcessor.getInstance(testConfig());
      await processor.start();
      expect(processor.getState().isProcessing).toBe(false);
    });

    it('should stop successfully', async () => {
      const processor = JobProcessor.getInstance(testConfig());
      await processor.start();
      processor.stop();
      expect(processor.getState().isProcessing).toBe(false);
      expect(processor.getState().currentJobId).toBeNull();
    });

    it('should allow restart after shutdown completes', async () => {
      const processor = JobProcessor.getInstance(testConfig());
      await processor.start();
      processor.stop();

      // Should allow starting again after shutdown completes
      await expect(processor.start()).resolves.not.toThrow();
      processor.stop();
    });
  });

  describe('Job processing', () => {
    it('should process a pending job on startup', async () => {
      // Create test input file
      await writeFile(path.join(uploadsDir, 'test-input.mp4'), 'dummy video');

      // Create a pending job
      const jobId = JobService.create({
        name: 'Test Job',
        input_file: 'test-input.mp4',
        output_file: 'test-output.mp4',
        ffmpeg_command:
          'ffmpeg -i test-input.mp4 -progress pipe:1 -y test-output.mp4',
      });

      const processor = JobProcessor.getInstance(testConfig());

      // Set up event listener
      const completePromise = new Promise((resolve) => {
        processor.once('job:complete', resolve);
      });

      await processor.start();
      await completePromise;

      const job = JobService.getById(jobId);
      expect(job?.status).toBe('completed');
    }, 10000);

    it('should update job status to processing when started', async () => {
      await writeFile(path.join(uploadsDir, 'test-input.mp4'), 'dummy video');

      const jobId = JobService.create({
        name: 'Status Test Job',
        input_file: 'test-input.mp4',
        ffmpeg_command:
          'ffmpeg -i test-input.mp4 -progress pipe:1 -y output.mp4',
      });

      const processor = JobProcessor.getInstance(testConfig());

      const startPromise = new Promise((resolve) => {
        processor.once('job:start', (job) => {
          expect(job.id).toBe(jobId);
          resolve(job);
        });
      });

      await processor.start();
      await startPromise;
    }, 10000);

    it('should emit job:complete on successful completion', async () => {
      await writeFile(path.join(uploadsDir, 'test-input.mp4'), 'dummy video');

      const jobId = JobService.create({
        name: 'Completion Test Job',
        input_file: 'test-input.mp4',
        ffmpeg_command:
          'ffmpeg -i test-input.mp4 -progress pipe:1 -y output.mp4',
      });

      const processor = JobProcessor.getInstance(testConfig());

      const completePromise = new Promise((resolve) => {
        processor.once('job:complete', (job) => {
          expect(job.id).toBe(jobId);
          expect(job.status).toBe('completed');
          resolve(job);
        });
      });

      await processor.start();
      await completePromise;
    }, 10000);

    it('should process jobs sequentially', async () => {
      await writeFile(path.join(uploadsDir, 'input1.mp4'), 'dummy video 1');
      await writeFile(path.join(uploadsDir, 'input2.mp4'), 'dummy video 2');

      const job1Id = JobService.create({
        name: 'Job 1',
        input_file: 'input1.mp4',
        ffmpeg_command: 'ffmpeg -i input1.mp4 -progress pipe:1 -y output1.mp4',
      });

      const job2Id = JobService.create({
        name: 'Job 2',
        input_file: 'input2.mp4',
        ffmpeg_command: 'ffmpeg -i input2.mp4 -progress pipe:1 -y output2.mp4',
      });

      const processor = JobProcessor.getInstance(testConfig());
      const completedJobs: number[] = [];

      processor.on('job:complete', (job) => {
        completedJobs.push(job.id);
      });

      await processor.start();

      // Wait for both jobs to complete
      await new Promise((resolve) => {
        const checkComplete = setInterval(() => {
          if (completedJobs.length === 2) {
            clearInterval(checkComplete);
            resolve(undefined);
          }
        }, 100);
      });

      expect(completedJobs).toHaveLength(2);
      expect(completedJobs[0]).toBe(job1Id);
      expect(completedJobs[1]).toBe(job2Id);
    }, 15000);
  });

  describe('Manual trigger', () => {
    it('should process jobs when manually triggered', async () => {
      const processor = JobProcessor.getInstance(testConfig());
      await processor.start();

      // Create test file and job after processor has started
      await writeFile(path.join(uploadsDir, 'test-input.mp4'), 'dummy video');

      const jobId = JobService.create({
        name: 'Triggered Job',
        input_file: 'test-input.mp4',
        ffmpeg_command:
          'ffmpeg -i test-input.mp4 -progress pipe:1 -y output.mp4',
      });

      const completePromise = new Promise((resolve) => {
        processor.once('job:complete', resolve);
      });

      // Manually trigger processing
      processor.trigger();

      await completePromise;

      const job = JobService.getById(jobId);
      expect(job?.status).toBe('completed');
    }, 10000);

    it('should not trigger while shutting down', async () => {
      const processor = JobProcessor.getInstance(testConfig());
      await processor.start();

      // Start shutdown process
      processor.stop();

      // Try to trigger - should be ignored
      processor.trigger();

      // No exception should be thrown
      expect(processor.getState().isProcessing).toBe(false);
    });
  });

  describe('State management', () => {
    it('should report correct processing state', async () => {
      await writeFile(path.join(uploadsDir, 'test-input.mp4'), 'dummy video');

      JobService.create({
        name: 'State Test Job',
        input_file: 'test-input.mp4',
        ffmpeg_command:
          'ffmpeg -i test-input.mp4 -progress pipe:1 -y output.mp4',
      });

      const processor = JobProcessor.getInstance(testConfig());

      const states: boolean[] = [];
      processor.on('state:change', (isProcessing) => {
        states.push(isProcessing);
      });

      // Set up completion listener before starting
      const completePromise = new Promise((resolve) => {
        processor.once('job:complete', resolve);
      });

      await processor.start();
      await completePromise;

      // Should have changed to processing (true) then back to idle (false)
      expect(states).toContain(true);
      expect(states).toContain(false);
    }, 10000);

    it('should return current job ID when processing', async () => {
      await writeFile(path.join(uploadsDir, 'test-input.mp4'), 'dummy video');

      const jobId = JobService.create({
        name: 'Current Job Test',
        input_file: 'test-input.mp4',
        ffmpeg_command:
          'ffmpeg -i test-input.mp4 -progress pipe:1 -y output.mp4',
      });

      const processor = JobProcessor.getInstance(testConfig());

      const statePromise = new Promise((resolve) => {
        processor.once('job:start', () => {
          const state = processor.getState();
          expect(state.currentJobId).toBe(jobId);
          expect(state.isProcessing).toBe(true);
          resolve(state);
        });
      });

      await processor.start();
      await statePromise;
    }, 10000);
  });

  describe('Progress tracking', () => {
    it('should emit progress events', async () => {
      await writeFile(path.join(uploadsDir, 'test-input.mp4'), 'dummy video');

      const jobId = JobService.create({
        name: 'Progress Test Job',
        input_file: 'test-input.mp4',
        ffmpeg_command:
          'ffmpeg -i test-input.mp4 -progress pipe:1 -y output.mp4',
      });

      const processor = JobProcessor.getInstance(testConfig());

      const progressPromise = new Promise((resolve) => {
        processor.once('job:progress', (job, progress) => {
          expect(job.id).toBe(jobId);
          expect(progress.progress).toBeGreaterThan(0);
          expect(progress.frame).toBeGreaterThan(0);
          resolve(progress);
        });
      });

      await processor.start();
      await progressPromise;
    }, 10000);

    it('should update job progress in database', async () => {
      await writeFile(path.join(uploadsDir, 'test-input.mp4'), 'dummy video');

      const jobId = JobService.create({
        name: 'DB Progress Test',
        input_file: 'test-input.mp4',
        ffmpeg_command:
          'ffmpeg -i test-input.mp4 -progress pipe:1 -y output.mp4',
      });

      const processor = JobProcessor.getInstance(testConfig());

      // Set up progress listener before starting
      const progressPromise = new Promise((resolve) => {
        processor.once('job:progress', resolve);
      });

      await processor.start();
      await progressPromise;

      const job = JobService.getById(jobId);
      expect(job?.progress).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Error handling', () => {
    it('should handle missing input file gracefully', async () => {
      // Don't create the input file

      const jobId = JobService.create({
        name: 'Missing File Job',
        input_file: 'nonexistent.mp4',
        ffmpeg_command:
          'ffmpeg -i nonexistent.mp4 -progress pipe:1 -y output.mp4',
      });

      const processor = JobProcessor.getInstance(testConfig());

      const failPromise = new Promise((resolve) => {
        processor.once('job:complete', (job) => {
          // Should still complete (mock ffmpeg doesn't check files)
          expect(job.id).toBe(jobId);
          resolve(job);
        });
      });

      await processor.start();
      await failPromise;
    }, 10000);
  });
});
