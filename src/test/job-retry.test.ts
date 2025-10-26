/**
 * Integration tests for job retry functionality
 * These tests verify the complete flow from job creation -> failure -> retry -> config retrieval
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { getDatabase, resetDatabase } from '../../server/database';
import { JobService, FileSelectionService } from '../../server/db-service';
import { jobByIdHandler, jobsHandler } from '../../server/handlers/jobs';
import { fileSelectionByKeyHandler } from '../../server/handlers/file-selections';
import type { ConversionOptions } from '../types/conversion';

describe('Job Retry Integration Tests', () => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

  beforeEach(() => {
    // Reset the database singleton to get a fresh in-memory database
    resetDatabase();
    // Initialize the database (this will run migrations)
    getDatabase();
  });

  describe('Single Job Retry Flow', () => {
    it('should create job, fail it, retry it, and retrieve config correctly', async () => {
      // Step 1: Create a conversion job with file selections
      const conversionOptions: ConversionOptions = {
        selectedFiles: ['/test/video1.mp4', '/test/video2.mp4'],
        basic: {
          videoCodec: 'libx265',
          quality: 22,
          outputFormat: 'mkv',
        },
        advanced: {
          preset: 'slow',
          bitrate: { mode: 'crf' },
          resolution: { maintainAspectRatio: true },
          frameRate: { copyOriginal: true },
          audio: { codec: 'copy' },
        },
        outputDirectory: '/test/output',
      };

      // Save file selection (simulating what POST /api/jobs does)
      const configJson = JSON.stringify(conversionOptions);
      const configKey = FileSelectionService.save(
        conversionOptions.selectedFiles,
        configJson,
      );

      expect(configKey).toBeDefined();
      expect(typeof configKey).toBe('string');

      // Create a job
      const jobId = JobService.create({
        name: 'Test Job',
        input_file: '/test/video1.mp4',
        output_file: '/test/output/video1.mkv',
        ffmpeg_command_json: JSON.stringify({ args: ['-i', 'input.mp4'] }),
        queue_position: 1,
        config_key: configKey,
        config_json: configJson,
      });

      expect(jobId).toBeGreaterThan(0);

      // Step 2: Simulate job failure
      JobService.update(jobId, {
        status: 'failed',
        error_message: 'FFmpeg encoding error',
      });

      const failedJob = JobService.getById(jobId);
      expect(failedJob).toBeDefined();
      expect(failedJob!.status).toBe('failed');
      expect(failedJob!.config_key).toBe(configKey);

      // Step 3: Retry the job
      const retryRequest = new Request('http://localhost/api/jobs/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });

      const retryResponse = await jobByIdHandler(
        retryRequest,
        jobId,
        corsHeaders,
      );

      expect(retryResponse.status).toBe(200);

      const retryResult = await retryResponse.json();
      expect(retryResult.success).toBe(true);
      expect(retryResult.configKey).toBeDefined();

      const newConfigKey = retryResult.configKey;

      // Step 4: Verify the original job is marked as retried
      const retriedJob = JobService.getById(jobId);
      expect(retriedJob!.retried).toBe(1);
      expect(retriedJob!.cleared).toBe(1);

      // Step 5: Retrieve file selection using the new config key
      // This simulates navigating to /convert/configure?key=...
      const getConfigRequest = new Request(
        `http://localhost/api/file-selections/${newConfigKey}`,
        { method: 'GET' },
      );

      const getConfigResponse = await fileSelectionByKeyHandler(
        getConfigRequest,
        newConfigKey,
        corsHeaders,
      );

      // THIS IS THE KEY TEST - it should return 200, not 400
      expect(getConfigResponse.status).toBe(200);

      const configData = await getConfigResponse.json();
      expect(configData).toBeDefined();
      expect(configData.files).toBeDefined();
      expect(Array.isArray(configData.files)).toBe(true);
      expect(configData.files).toContain('/test/video1.mp4');
      expect(configData.config).toBeDefined();
      expect(configData.config.basic.videoCodec).toBe('libx265');
    });

    it('should handle retry with just the failed file', async () => {
      // Create initial config with multiple files
      const conversionOptions: ConversionOptions = {
        selectedFiles: [
          '/test/video1.mp4',
          '/test/video2.mp4',
          '/test/video3.mp4',
        ],
        basic: {
          videoCodec: 'libx264',
          quality: 23,
          outputFormat: 'mp4',
        },
        advanced: {
          preset: 'medium',
          bitrate: { mode: 'crf' },
          resolution: { maintainAspectRatio: true },
          frameRate: { copyOriginal: true },
          audio: { codec: 'copy' },
        },
      };

      const configJson = JSON.stringify(conversionOptions);
      const configKey = FileSelectionService.save(
        conversionOptions.selectedFiles,
        configJson,
      );

      // Create a job for video2 that fails
      const jobId = JobService.create({
        name: 'Test Job 2',
        input_file: '/test/video2.mp4',
        output_file: '/test/output/video2.mp4',
        ffmpeg_command_json: JSON.stringify({ args: [] }),
        queue_position: 1,
        config_key: configKey,
        config_json: configJson,
      });

      JobService.update(jobId, {
        status: 'failed',
        error_message: 'Disk full',
      });

      // Retry the job
      const retryRequest = new Request('http://localhost/api/jobs/1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'retry' }),
      });

      const retryResponse = await jobByIdHandler(
        retryRequest,
        jobId,
        corsHeaders,
      );

      const retryResult = await retryResponse.json();
      const newConfigKey = retryResult.configKey;

      // Retrieve the config
      const getConfigRequest = new Request(
        `http://localhost/api/file-selections/${newConfigKey}`,
        { method: 'GET' },
      );

      const getConfigResponse = await fileSelectionByKeyHandler(
        getConfigRequest,
        newConfigKey,
        corsHeaders,
      );

      expect(getConfigResponse.status).toBe(200);

      const configData = await getConfigResponse.json();

      // Should only contain the failed file
      expect(configData.files).toHaveLength(1);
      expect(configData.files[0]).toBe('/test/video2.mp4');

      // But should preserve all other config settings
      expect(configData.config.basic.videoCodec).toBe('libx264');
      expect(configData.config.basic.quality).toBe(23);
    });
  });

  describe('Batch Retry Flow', () => {
    it('should retry all failed jobs and create valid config key', async () => {
      // Create multiple failed jobs
      const conversionOptions: ConversionOptions = {
        selectedFiles: [
          '/test/video1.mp4',
          '/test/video2.mp4',
          '/test/video3.mp4',
        ],
        basic: {
          videoCodec: 'libx265',
          quality: 22,
          outputFormat: 'mkv',
        },
        advanced: {
          preset: 'slow',
          bitrate: { mode: 'crf' },
          resolution: { maintainAspectRatio: true },
          frameRate: { copyOriginal: true },
          audio: { codec: 'copy' },
        },
      };

      const configJson = JSON.stringify(conversionOptions);
      const configKey = FileSelectionService.save(
        conversionOptions.selectedFiles,
        configJson,
      );

      // Create 3 jobs, all failed
      const jobIds = [
        '/test/video1.mp4',
        '/test/video2.mp4',
        '/test/video3.mp4',
      ].map((file, index) => {
        const jobId = JobService.create({
          name: `Job ${index + 1}`,
          input_file: file,
          output_file: file.replace('.mp4', '.mkv'),
          ffmpeg_command_json: JSON.stringify({ args: [] }),
          queue_position: index + 1,
          config_key: configKey,
          config_json: configJson,
        });

        JobService.update(jobId, {
          status: 'failed',
          error_message: 'Network error',
        });

        return jobId;
      });

      expect(jobIds).toHaveLength(3);

      // Retry all failed jobs
      const retryAllRequest = new Request('http://localhost/api/jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry-all-failed' }),
      });

      const retryAllResponse = await jobsHandler(retryAllRequest, corsHeaders);

      expect(retryAllResponse.status).toBe(200);

      const retryAllResult = await retryAllResponse.json();
      expect(retryAllResult.success).toBe(true);
      expect(retryAllResult.count).toBe(3);
      expect(retryAllResult.configKey).toBeDefined();

      const newConfigKey = retryAllResult.configKey;

      // Retrieve the config using the new key
      const getConfigRequest = new Request(
        `http://localhost/api/file-selections/${newConfigKey}`,
        { method: 'GET' },
      );

      const getConfigResponse = await fileSelectionByKeyHandler(
        getConfigRequest,
        newConfigKey,
        corsHeaders,
      );

      expect(getConfigResponse.status).toBe(200);

      const configData = await getConfigResponse.json();
      expect(configData.files).toHaveLength(3);
      expect(configData.files).toContain('/test/video1.mp4');
      expect(configData.files).toContain('/test/video2.mp4');
      expect(configData.files).toContain('/test/video3.mp4');
      expect(configData.config.basic.videoCodec).toBe('libx265');
    });

    it('should handle retry-all when no jobs have config_key', async () => {
      // Create jobs without config_key (legacy scenario)
      const jobId = JobService.create({
        name: 'Legacy Job',
        input_file: '/test/legacy.mp4',
        output_file: '/test/legacy.mkv',
        ffmpeg_command_json: JSON.stringify({ args: [] }),
        queue_position: 1,
      });

      JobService.update(jobId, {
        status: 'failed',
        error_message: 'Error',
      });

      const retryAllRequest = new Request('http://localhost/api/jobs', {
        method: 'PUT',
        body: JSON.stringify({ action: 'retry-all-failed' }),
      });

      const retryAllResponse = await jobsHandler(retryAllRequest, corsHeaders);

      expect(retryAllResponse.status).toBe(200);

      const retryAllResult = await retryAllResponse.json();
      expect(retryAllResult.success).toBe(true);
      expect(retryAllResult.configKey).toBeNull();
    });
  });

  describe('FileSelectionService Data Format', () => {
    it('should store and retrieve files as a flat array', () => {
      const files = ['/test/file1.mp4', '/test/file2.mp4'];
      const config = { basic: { videoCodec: 'libx265' } };

      const key = FileSelectionService.save(files, JSON.stringify(config));

      const result = FileSelectionService.get(key);

      expect(result).toBeDefined();
      expect(Array.isArray(result!.files)).toBe(true);
      expect(result!.files).toEqual(files);
      expect(result!.config).toEqual(config);
    });

    it('should not have nested selectedFiles structure', () => {
      const files = ['/test/file1.mp4'];
      const config = { basic: { videoCodec: 'libx264' } };

      const key = FileSelectionService.save(files, JSON.stringify(config));
      const result = FileSelectionService.get(key);

      // Result should be { files: string[], config: any }
      // NOT { files: { selectedFiles: string[] }, config: any }
      expect(result).toBeDefined();
      expect(result!.files).toEqual(files);
      expect((result!.files as any).selectedFiles).toBeUndefined();
    });

    it('should handle old picker state format from database', async () => {
      // Manually insert old-format data directly into the database
      // This simulates data that was created by the old picker state format
      const db = getDatabase();

      const oldPickerState = {
        selectedFiles: ['/test/old-format1.mp4', '/test/old-format2.mp4'],
        expandedFolders: ['test'],
        currentPath: '',
        showHidden: false,
        hideConverted: true,
        videosOnly: true,
      };

      const oldConfig = {
        basic: { videoCodec: 'libx264', quality: 23, outputFormat: 'mkv' },
      };

      const key = 'test-old-format-key-12345';

      // Insert old format directly into database
      db.run(
        'INSERT INTO file_selections (id, data, config) VALUES (?, ?, ?)',
        [key, JSON.stringify(oldPickerState), JSON.stringify(oldConfig)],
      );

      // Now try to retrieve it via the GET endpoint
      const getConfigRequest = new Request(
        `http://localhost/api/file-selections/${key}`,
        { method: 'GET' },
      );

      const getConfigResponse = await fileSelectionByKeyHandler(
        getConfigRequest,
        key,
        corsHeaders,
      );

      // Should successfully handle the old format
      expect(getConfigResponse.status).toBe(200);

      const configData = await getConfigResponse.json();

      // Should extract the selectedFiles from the old format
      expect(configData.files).toBeDefined();
      expect(Array.isArray(configData.files)).toBe(true);
      expect(configData.files).toHaveLength(2);
      expect(configData.files).toContain('/test/old-format1.mp4');
      expect(configData.files).toContain('/test/old-format2.mp4');

      // Should preserve the config
      expect(configData.config).toBeDefined();
      expect(configData.config.basic.videoCodec).toBe('libx264');
    });
  });

  describe('Error Cases', () => {
    it('should return 400 for invalid file selection key', async () => {
      const getConfigRequest = new Request(
        'http://localhost/api/file-selections/invalid-key',
        { method: 'GET' },
      );

      const getConfigResponse = await fileSelectionByKeyHandler(
        getConfigRequest,
        'invalid-key',
        corsHeaders,
      );

      expect(getConfigResponse.status).toBe(404);
    });

    it('should return 400 when trying to retry non-failed job', async () => {
      const jobId = JobService.create({
        name: 'Pending Job',
        input_file: '/test/video.mp4',
        output_file: '/test/output.mkv',
        ffmpeg_command_json: JSON.stringify({ args: [] }),
        queue_position: 1,
      });

      const retryRequest = new Request('http://localhost/api/jobs/1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'retry' }),
      });

      const retryResponse = await jobByIdHandler(
        retryRequest,
        jobId,
        corsHeaders,
      );

      expect(retryResponse.status).toBe(400);

      const result = await retryResponse.json();
      expect(result.error).toContain('Only failed or cancelled jobs');
    });

    it('should return 404 when trying to retry non-existent job', async () => {
      const retryRequest = new Request('http://localhost/api/jobs/999', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'retry' }),
      });

      const retryResponse = await jobByIdHandler(
        retryRequest,
        999,
        corsHeaders,
      );

      expect(retryResponse.status).toBe(404);
    });
  });
});
