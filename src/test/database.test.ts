/**
 * Database functionality tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetaService, JobService } from '../lib/db-service';
import { getDatabase } from '../lib/database';

describe('Database', () => {
  beforeEach(() => {
    // Clear all data before each test
    const db = getDatabase();
    db.exec('DELETE FROM jobs');
    db.exec("DELETE FROM meta WHERE key != 'version'");
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
      
      const testKeys = all.filter(record => record.key.startsWith('key'));
      expect(testKeys).toHaveLength(2);
      expect(testKeys.find(r => r.key === 'key1')?.value).toBe('value1');
      expect(testKeys.find(r => r.key === 'key2')?.value).toBe('value2');
    });
  });

  describe('JobService', () => {
    it('should create and retrieve jobs', () => {
      const jobId = JobService.create({
        name: 'Test Job',
        input_file: '/test/input.mp4',
        ffmpeg_command: 'ffmpeg -i input.mp4 output.mp4'
      });

      expect(jobId).toBeTypeOf('number');
      expect(jobId).toBeGreaterThan(0);

      const job = JobService.getById(jobId);
      expect(job).toBeDefined();
      expect(job?.name).toBe('Test Job');
      expect(job?.status).toBe('pending');
      expect(job?.input_file).toBe('/test/input.mp4');
      expect(job?.progress).toBe(0);
    });

    it('should update job progress', () => {
      const jobId = JobService.create({
        name: 'Progress Test Job',
        input_file: '/test/input.mp4'
      });

      JobService.updateProgress(jobId, 75);
      const job = JobService.getById(jobId);
      expect(job?.progress).toBe(75);
    });

    it('should complete jobs', () => {
      const jobId = JobService.create({
        name: 'Completion Test Job',
        input_file: '/test/input.mp4'
      });

      JobService.complete(jobId, '/test/output.mp4');
      const job = JobService.getById(jobId);
      expect(job?.status).toBe('completed');
      expect(job?.output_file).toBe('/test/output.mp4');
      expect(job?.progress).toBe(100);
    });

    it('should set job errors', () => {
      const jobId = JobService.create({
        name: 'Error Test Job',
        input_file: '/test/input.mp4'
      });

      JobService.setError(jobId, 'FFmpeg failed');
      const job = JobService.getById(jobId);
      expect(job?.status).toBe('failed');
      expect(job?.error_message).toBe('FFmpeg failed');
    });

    it('should filter jobs by status', () => {
      const pendingId = JobService.create({
        name: 'Pending Job',
        input_file: '/test/pending.mp4'
      });

      const processingId = JobService.create({
        name: 'Processing Job',
        input_file: '/test/processing.mp4'
      });

      JobService.update(processingId, { status: 'processing' });

      const pendingJobs = JobService.getByStatus('pending');
      const processingJobs = JobService.getByStatus('processing');

      expect(pendingJobs).toHaveLength(1);
      expect(pendingJobs[0].id).toBe(pendingId);
      expect(processingJobs).toHaveLength(1);
      expect(processingJobs[0].id).toBe(processingId);
    });

    it('should manage job queue', () => {
      const job1Id = JobService.create({
        name: 'Queue Job 1',
        input_file: '/test/queue1.mp4',
        queue_position: 2
      });

      const job2Id = JobService.create({
        name: 'Queue Job 2',
        input_file: '/test/queue2.mp4',
        queue_position: 1
      });

      const queue = JobService.getQueue();
      expect(queue).toHaveLength(2);
      // Should be ordered by queue_position
      expect(queue[0].id).toBe(job2Id); // position 1
      expect(queue[1].id).toBe(job1Id); // position 2
    });

    it('should get next pending job', () => {
      const job1Id = JobService.create({
        name: 'Second Job',
        input_file: '/test/second.mp4',
        queue_position: 2
      });

      const job2Id = JobService.create({
        name: 'First Job',
        input_file: '/test/first.mp4',
        queue_position: 1
      });

      const nextJob = JobService.getNextPendingJob();
      expect(nextJob).toBeDefined();
      expect(nextJob?.id).toBe(job2Id); // Should be the one with position 1
    });

    it('should reorder queue', () => {
      const job1Id = JobService.create({
        name: 'Job 1',
        input_file: '/test/1.mp4',
        queue_position: 0
      });

      const job2Id = JobService.create({
        name: 'Job 2',
        input_file: '/test/2.mp4',
        queue_position: 1
      });

      const job3Id = JobService.create({
        name: 'Job 3',
        input_file: '/test/3.mp4',
        queue_position: 2
      });

      // Reorder: job3, job1, job2
      JobService.reorderQueue([job3Id, job1Id, job2Id]);

      const job1 = JobService.getById(job1Id);
      const job2 = JobService.getById(job2Id);
      const job3 = JobService.getById(job3Id);

      expect(job3?.queue_position).toBe(0);
      expect(job1?.queue_position).toBe(1);
      expect(job2?.queue_position).toBe(2);
    });

    it('should delete jobs', () => {
      const jobId = JobService.create({
        name: 'Delete Test Job',
        input_file: '/test/delete.mp4'
      });

      JobService.delete(jobId);
      const job = JobService.getById(jobId);
      expect(job).toBeUndefined();
    });

    it('should get all jobs ordered by creation date', () => {
      const job1Id = JobService.create({
        name: 'Job 1',
        input_file: '/test/1.mp4'
      });

      const job2Id = JobService.create({
        name: 'Job 2',
        input_file: '/test/2.mp4'
      });

      const allJobs = JobService.getAll();
      expect(allJobs).toHaveLength(2);
      // Should be ordered by created_at DESC (newest first)
      expect(allJobs[0].id).toBe(job2Id);
      expect(allJobs[1].id).toBe(job1Id);
    });
  });
});