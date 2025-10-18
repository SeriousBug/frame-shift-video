/**
 * Database functionality tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MetaService, JobService } from '../../server/db-service';
import { resetDatabase } from '../../server/database';

describe('Database', () => {
  beforeEach(() => {
    // Reset to a fresh in-memory database before each test
    resetDatabase();
  });

  describe('MetaService', () => {
    it('should store and retrieve key-value pairs', () => {
      MetaService.set('test_key', 'test_value');
      const value = MetaService.get('test_key');
      expect(value).toBe('test_value');
    });

    it('should return undefined for non-existent keys', () => {
      const value = MetaService.get('non_existent_key');
      expect(value).toBeUndefined();
    });

    it('should update existing keys', () => {
      MetaService.set('test_key', 'original_value');
      MetaService.set('test_key', 'updated_value');
      const value = MetaService.get('test_key');
      expect(value).toBe('updated_value');
    });

    it('should delete keys', () => {
      MetaService.set('test_key', 'test_value');
      MetaService.delete('test_key');
      const value = MetaService.get('test_key');
      expect(value).toBeUndefined();
    });

    it('should get all meta records', () => {
      MetaService.set('key1', 'value1');
      MetaService.set('key2', 'value2');
      const all = MetaService.getAll();

      const testKeys = all.filter((record) => record.key.startsWith('key'));
      expect(testKeys).toHaveLength(2);
      expect(testKeys.find((r) => r.key === 'key1')?.value).toBe('value1');
      expect(testKeys.find((r) => r.key === 'key2')?.value).toBe('value2');
    });
  });

  describe('JobService', () => {
    it('should create and retrieve jobs', () => {
      JobService.create({
        name: 'Test Job',
        input_file: '/test/input.mp4',
        ffmpeg_command_json: JSON.stringify({
          args: ['ffmpeg', '-i', 'input.mp4', 'output.mp4'],
          inputPath: '/test/input.mp4',
          outputPath: 'output.mp4',
        }),
      });

      // Get all jobs and find the one we just created
      const allJobs = JobService.getAll();
      expect(allJobs.length).toBeGreaterThan(0);

      const job = allJobs.find((j) => j.name === 'Test Job');
      expect(job).toBeDefined();
      expect(job?.name).toBe('Test Job');
      expect(job?.status).toBe('pending');
      expect(job?.input_file).toBe('/test/input.mp4');
      expect(job?.progress).toBe(0);
    });

    it('should update job progress', () => {
      JobService.create({
        name: 'Progress Test Job',
        input_file: '/test/input.mp4',
      });

      const job = JobService.getAll().find(
        (j) => j.name === 'Progress Test Job',
      );
      expect(job).toBeDefined();

      JobService.updateProgress(job!.id, 75);
      const updatedJob = JobService.getById(job!.id);
      expect(updatedJob?.progress).toBe(75);
    });

    it('should complete jobs', () => {
      JobService.create({
        name: 'Completion Test Job',
        input_file: '/test/input.mp4',
      });

      const job = JobService.getAll().find(
        (j) => j.name === 'Completion Test Job',
      );
      expect(job).toBeDefined();

      JobService.complete(job!.id, '/test/output.mp4');
      const updatedJob = JobService.getById(job!.id);
      expect(updatedJob?.status).toBe('completed');
      expect(updatedJob?.output_file).toBe('/test/output.mp4');
      expect(updatedJob?.progress).toBe(100);
    });

    it('should set job errors', () => {
      JobService.create({
        name: 'Error Test Job',
        input_file: '/test/input.mp4',
      });

      const job = JobService.getAll().find((j) => j.name === 'Error Test Job');
      expect(job).toBeDefined();

      JobService.setError(job!.id, 'FFmpeg failed');
      const updatedJob = JobService.getById(job!.id);
      expect(updatedJob?.status).toBe('failed');
      expect(updatedJob?.error_message).toBe('FFmpeg failed');
    });

    it('should filter jobs by status', () => {
      JobService.create({
        name: 'Pending Job',
        input_file: '/test/pending.mp4',
      });

      JobService.create({
        name: 'Processing Job',
        input_file: '/test/processing.mp4',
      });

      const processingJob = JobService.getAll().find(
        (j) => j.name === 'Processing Job',
      );
      expect(processingJob).toBeDefined();

      JobService.update(processingJob!.id, { status: 'processing' });

      const pendingJobs = JobService.getByStatus('pending');
      const processingJobs = JobService.getByStatus('processing');

      expect(pendingJobs).toHaveLength(1);
      expect(pendingJobs[0].name).toBe('Pending Job');
      expect(processingJobs).toHaveLength(1);
      expect(processingJobs[0].name).toBe('Processing Job');
    });

    it('should manage job queue', () => {
      JobService.create({
        name: 'Queue Job 1',
        input_file: '/test/queue1.mp4',
        queue_position: 2,
      });

      JobService.create({
        name: 'Queue Job 2',
        input_file: '/test/queue2.mp4',
        queue_position: 1,
      });

      const queue = JobService.getQueue();
      expect(queue).toHaveLength(2);
      // Should be ordered by queue_position
      expect(queue[0].name).toBe('Queue Job 2'); // position 1
      expect(queue[0].queue_position).toBe(1);
      expect(queue[1].name).toBe('Queue Job 1'); // position 2
      expect(queue[1].queue_position).toBe(2);
    });

    it('should get next pending job', () => {
      JobService.create({
        name: 'Second Job',
        input_file: '/test/second.mp4',
        queue_position: 2,
      });

      JobService.create({
        name: 'First Job',
        input_file: '/test/first.mp4',
        queue_position: 1,
      });

      const nextJob = JobService.getNextPendingJob();
      expect(nextJob).toBeDefined();
      expect(nextJob?.name).toBe('First Job'); // Should be the one with position 1
      expect(nextJob?.queue_position).toBe(1);
    });

    it('should reorder queue', () => {
      JobService.create({
        name: 'Job 1',
        input_file: '/test/1.mp4',
        queue_position: 0,
      });

      JobService.create({
        name: 'Job 2',
        input_file: '/test/2.mp4',
        queue_position: 1,
      });

      JobService.create({
        name: 'Job 3',
        input_file: '/test/3.mp4',
        queue_position: 2,
      });

      const allJobs = JobService.getAll();
      const job1 = allJobs.find((j) => j.name === 'Job 1');
      const job2 = allJobs.find((j) => j.name === 'Job 2');
      const job3 = allJobs.find((j) => j.name === 'Job 3');

      expect(job1).toBeDefined();
      expect(job2).toBeDefined();
      expect(job3).toBeDefined();

      // Reorder: job3, job1, job2
      JobService.reorderQueue([job3!.id, job1!.id, job2!.id]);

      const updatedJob1 = JobService.getById(job1!.id);
      const updatedJob2 = JobService.getById(job2!.id);
      const updatedJob3 = JobService.getById(job3!.id);

      expect(updatedJob3?.queue_position).toBe(0);
      expect(updatedJob1?.queue_position).toBe(1);
      expect(updatedJob2?.queue_position).toBe(2);
    });

    it('should delete jobs', () => {
      JobService.create({
        name: 'Delete Test Job',
        input_file: '/test/delete.mp4',
      });

      const job = JobService.getAll().find((j) => j.name === 'Delete Test Job');
      expect(job).toBeDefined();

      JobService.delete(job!.id);
      const deletedJob = JobService.getById(job!.id);
      expect(deletedJob).toBeUndefined();
    });

    it('should get all jobs ordered by creation date', () => {
      JobService.create({
        name: 'Job 1',
        input_file: '/test/1.mp4',
      });

      JobService.create({
        name: 'Job 2',
        input_file: '/test/2.mp4',
      });

      const allJobs = JobService.getAll();
      expect(allJobs).toHaveLength(2);
      // Should be ordered by created_at DESC (newest first)
      expect(allJobs[0].name).toBe('Job 2');
      expect(allJobs[1].name).toBe('Job 1');
    });
  });
});
