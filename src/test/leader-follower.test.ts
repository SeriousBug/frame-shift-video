/**
 * Tests for leader-follower architecture components
 *
 * Note: Full end-to-end tests with running servers should be done using
 * the docker-compose setup in test-deployment/
 *
 * These tests focus on the individual components and their interactions.
 */

import { describe, test, expect } from 'bun:test';
import {
  generateAuthHeader,
  verifyAuthHeader,
  formatAuthHeader,
  parseAuthHeader,
} from '../../server/auth';
import { JobService } from '../../server/db-service';
import { resetDatabase } from '../../server/database';

describe('Leader-Follower Architecture Component Tests', () => {
  describe('Authentication', () => {
    test('should generate valid authentication header', () => {
      const payload = 'test-payload';
      const token = 'test-token';

      const authHeader = generateAuthHeader(payload, token);

      expect(authHeader.salt).toBeDefined();
      expect(authHeader.hash).toBeDefined();
      expect(authHeader.salt.length).toBeGreaterThan(0);
      expect(authHeader.hash.length).toBeGreaterThan(0);
    });

    test('should verify valid authentication', () => {
      const payload = 'test-payload';
      const token = 'test-token';

      const authHeader = generateAuthHeader(payload, token);
      const isValid = verifyAuthHeader(payload, authHeader, token);

      expect(isValid).toBe(true);
    });

    test('should reject invalid authentication with wrong token', () => {
      const payload = 'test-payload';
      const correctToken = 'correct-token';
      const wrongToken = 'wrong-token';

      const authHeader = generateAuthHeader(payload, correctToken);
      const isValid = verifyAuthHeader(payload, authHeader, wrongToken);

      expect(isValid).toBe(false);
    });

    test('should reject tampered payload', () => {
      const originalPayload = 'original-payload';
      const tamperedPayload = 'tampered-payload';
      const token = 'test-token';

      const authHeader = generateAuthHeader(originalPayload, token);
      const isValid = verifyAuthHeader(tamperedPayload, authHeader, token);

      expect(isValid).toBe(false);
    });

    test('should format and parse auth header correctly', () => {
      const payload = 'test-payload';
      const token = 'test-token';

      const authHeader = generateAuthHeader(payload, token);
      const formatted = formatAuthHeader(authHeader);
      const parsed = parseAuthHeader(formatted);

      expect(parsed).not.toBeNull();
      expect(parsed?.salt).toBe(authHeader.salt);
      expect(parsed?.hash).toBe(authHeader.hash);
    });

    test('should reject malformed auth header', () => {
      const malformed = 'invalid-header-format';
      const parsed = parseAuthHeader(malformed);

      expect(parsed).toBeNull();
    });

    test('should use different salts for same payload', () => {
      const payload = 'test-payload';
      const token = 'test-token';

      const auth1 = generateAuthHeader(payload, token);
      const auth2 = generateAuthHeader(payload, token);

      // Different salts
      expect(auth1.salt).not.toBe(auth2.salt);
      // Different hashes (due to different salts)
      expect(auth1.hash).not.toBe(auth2.hash);
      // But both should be valid
      expect(verifyAuthHeader(payload, auth1, token)).toBe(true);
      expect(verifyAuthHeader(payload, auth2, token)).toBe(true);
    });
  });

  describe('Database Worker Methods', () => {
    test('should claim next pending job atomically', () => {
      resetDatabase();

      // Create test jobs
      const jobId1 = JobService.create({
        name: 'Test Job 1',
        input_file: '/tmp/test1.mp4',
        output_file: '/tmp/test1-out.mp4',
      });

      const jobId2 = JobService.create({
        name: 'Test Job 2',
        input_file: '/tmp/test2.mp4',
        output_file: '/tmp/test2-out.mp4',
      });

      // Claim first job
      const claimedJob1 = JobService.claimNextJob('worker-1');
      expect(claimedJob1).toBeDefined();
      expect(claimedJob1?.id).toBe(jobId1);
      expect(claimedJob1?.status).toBe('processing');
      expect(claimedJob1?.assigned_worker).toBe('worker-1');

      // Claim second job
      const claimedJob2 = JobService.claimNextJob('worker-2');
      expect(claimedJob2).toBeDefined();
      expect(claimedJob2?.id).toBe(jobId2);
      expect(claimedJob2?.assigned_worker).toBe('worker-2');

      // No more jobs to claim
      const claimedJob3 = JobService.claimNextJob('worker-3');
      expect(claimedJob3).toBeUndefined();
    });

    test('should update worker heartbeat', () => {
      resetDatabase();

      const jobId = JobService.create({
        name: 'Test Job',
        input_file: '/tmp/test.mp4',
        output_file: '/tmp/test-out.mp4',
      });

      const claimedJob = JobService.claimNextJob('worker-1');
      expect(claimedJob).toBeDefined();

      const beforeHeartbeat = claimedJob?.worker_last_seen;

      // Wait a bit and update heartbeat
      setTimeout(() => {
        JobService.updateWorkerHeartbeat(jobId, 'worker-1');

        const updatedJob = JobService.getById(jobId);
        expect(updatedJob?.worker_last_seen).toBeDefined();
        expect(updatedJob?.worker_last_seen).not.toBe(beforeHeartbeat);
      }, 100);
    });

    test('should get jobs by worker', () => {
      resetDatabase();

      // Create and claim multiple jobs
      const jobId1 = JobService.create({
        name: 'Job 1',
        input_file: '/tmp/test1.mp4',
      });
      const jobId2 = JobService.create({
        name: 'Job 2',
        input_file: '/tmp/test2.mp4',
      });
      const jobId3 = JobService.create({
        name: 'Job 3',
        input_file: '/tmp/test3.mp4',
      });

      JobService.claimNextJob('worker-1');
      JobService.claimNextJob('worker-1');
      JobService.claimNextJob('worker-2');

      const worker1Jobs = JobService.getJobsByWorker('worker-1');
      const worker2Jobs = JobService.getJobsByWorker('worker-2');

      expect(worker1Jobs.length).toBe(2);
      expect(worker2Jobs.length).toBe(1);
    });

    test('should update job as worker with validation', () => {
      resetDatabase();

      const jobId = JobService.create({
        name: 'Test Job',
        input_file: '/tmp/test.mp4',
      });

      JobService.claimNextJob('worker-1');

      // Worker 1 can update the job
      const success1 = JobService.updateJobAsWorker(jobId, 'worker-1', {
        progress: 50,
      });
      expect(success1).toBe(true);

      const job = JobService.getById(jobId);
      expect(job?.progress).toBe(50);

      // Worker 2 cannot update the job (not assigned to them)
      const success2 = JobService.updateJobAsWorker(jobId, 'worker-2', {
        progress: 75,
      });
      expect(success2).toBe(false);

      // Progress should still be 50
      const job2 = JobService.getById(jobId);
      expect(job2?.progress).toBe(50);
    });
  });

  describe('Leader-Follower Integration', () => {
    test('documentation note: use docker-compose for full E2E tests', () => {
      // This test serves as documentation
      console.log(
        '\n📝 Note: For full end-to-end testing with running servers,',
      );
      console.log('   use the Docker Compose setup in test-deployment/');
      console.log('   Run: cd test-deployment && docker compose up');
      expect(true).toBe(true);
    });
  });
});
