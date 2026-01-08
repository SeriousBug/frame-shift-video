/**
 * Service for async job creation batch processing
 * Handles the background creation of jobs from a batch request
 */

import path from 'path';
import { orderBy } from 'natural-orderby';
import { ConversionOptions } from '../src/types/conversion';
import {
  createFFmpegJobs,
  generateFFmpegCommand,
} from '../src/lib/ffmpeg-command';
import { getSubtitleFormats } from '../src/lib/ffmpeg-executor';
import {
  JobService,
  FileSelectionService,
  JobCreationBatchService,
  JobCreationBatch,
} from './db-service';
import { JobProcessor } from './job-processor';
import { WSBroadcaster } from './websocket';
import { logger, captureException } from '../src/lib/sentry';

// Store active batch creations to prevent duplicate processing
const activeBatches = new Set<number>();

/**
 * Start async job creation for a batch
 * Returns immediately after starting the background process
 */
export async function startJobCreationBatch(batchId: number): Promise<void> {
  // Prevent duplicate processing
  if (activeBatches.has(batchId)) {
    logger.info('[JobCreation] Batch already being processed', { batchId });
    return;
  }

  activeBatches.add(batchId);

  // Process in background - don't await
  processJobCreationBatch(batchId).catch((error) => {
    logger.error('[JobCreation] Background batch processing failed', {
      batchId,
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);
  });
}

/**
 * Process a job creation batch asynchronously
 */
async function processJobCreationBatch(batchId: number): Promise<void> {
  logger.info('[JobCreation] Starting batch processing', { batchId });

  try {
    // Get batch details
    const batch = JobCreationBatchService.getById(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    if (batch.status !== 'pending' && batch.status !== 'in_progress') {
      logger.info('[JobCreation] Batch already processed', {
        batchId,
        status: batch.status,
      });
      return;
    }

    // Mark as in progress
    JobCreationBatchService.updateStatus(batchId, 'in_progress');

    // Parse config
    if (!batch.config_json) {
      throw new Error('Batch has no config');
    }

    const options: ConversionOptions = JSON.parse(batch.config_json);

    logger.info('[JobCreation] Parsed options', {
      batchId,
      fileCount: options.selectedFiles?.length || 0,
      videoCodec: options.basic?.videoCodec,
      outputFormat: options.basic?.outputFormat,
    });

    // Validate files
    if (!options.selectedFiles || options.selectedFiles.length === 0) {
      throw new Error('No files selected for conversion');
    }

    // Resolve paths (same logic as original handler)
    const baseDir = process.env.FRAME_SHIFT_HOME || process.env.HOME || '/';
    const resolvedFiles: string[] = [];

    for (const file of options.selectedFiles) {
      const absolutePath = path.isAbsolute(file)
        ? file
        : path.join(baseDir, file);

      // Security check
      if (!absolutePath.startsWith(baseDir)) {
        throw new Error(
          `Access denied: File path ${file} is outside allowed directory`,
        );
      }

      resolvedFiles.push(absolutePath);
    }

    const resolvedOptions: ConversionOptions = {
      ...options,
      selectedFiles: resolvedFiles,
    };

    // Create FFmpeg job configs
    let jobConfigs = createFFmpegJobs(resolvedOptions);
    jobConfigs = orderBy(jobConfigs, [(config) => config.inputFile], ['asc']);

    // Save configuration
    const configJson = JSON.stringify(resolvedOptions);
    const configKey = FileSelectionService.save(
      resolvedOptions.selectedFiles,
      configJson,
    );

    // Get starting queue position
    const maxQueuePosition = JobService.getMaxQueuePosition();
    let nextQueuePosition = (maxQueuePosition || 0) + 1;

    const createdJobIds: number[] = [];
    const totalJobs = jobConfigs.length;

    // Process each job config
    for (let i = 0; i < jobConfigs.length; i++) {
      const config = jobConfigs[i];

      try {
        // Detect subtitle formats
        const subtitleCodecs = await getSubtitleFormats(config.inputFile);

        const configWithSubtitles = {
          ...config,
          subtitleCodecs,
        };

        // Generate FFmpeg command
        const ffmpegCommand = generateFFmpegCommand(configWithSubtitles);

        // Create job in database
        const jobId = JobService.create({
          name: config.jobName,
          input_file: config.inputFile,
          output_file: config.outputFile,
          ffmpeg_command_json: JSON.stringify({
            args: ffmpegCommand.args,
            inputPath: ffmpegCommand.inputPath,
            outputPath: ffmpegCommand.outputPath,
          }),
          queue_position: nextQueuePosition++,
          config_key: configKey,
          config_json: configJson,
        });

        createdJobIds.push(jobId);

        // Broadcast job created
        const job = JobService.getById(jobId);
        if (job) {
          WSBroadcaster.broadcastJobCreated(job);
        }

        // Update batch progress
        JobCreationBatchService.incrementCreatedCount(batchId);

        // Broadcast progress
        WSBroadcaster.broadcastJobCreationProgress(batchId, i + 1, totalJobs);

        // Yield to allow other operations (prevent blocking)
        if (i % 10 === 9) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      } catch (error) {
        logger.error('[JobCreation] Failed to create job', {
          batchId,
          inputFile: config.inputFile,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other jobs, don't fail the whole batch
      }
    }

    // Broadcast status counts
    WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());

    // Mark batch as completed
    JobCreationBatchService.updateStatus(batchId, 'completed');

    // Broadcast completion
    WSBroadcaster.broadcastJobCreationComplete(
      batchId,
      createdJobIds,
      createdJobIds.length,
    );

    logger.info('[JobCreation] Batch completed', {
      batchId,
      jobsCreated: createdJobIds.length,
    });

    // Trigger job processor
    try {
      const processor = JobProcessor.getInstance();
      processor.trigger();
    } catch {
      // Initialize processor if not yet initialized
      try {
        const processor = JobProcessor.getInstance({
          checkInterval: 60000,
        });
        await processor.start();
        processor.trigger();
      } catch (error) {
        logger.error('[JobCreation] Failed to trigger job processor', {
          error,
        });
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[JobCreation] Batch failed', {
      batchId,
      error: errorMessage,
    });
    captureException(error);

    // Mark batch as failed
    JobCreationBatchService.updateStatus(batchId, 'failed', errorMessage);

    // Broadcast error
    WSBroadcaster.broadcastJobCreationError(batchId, errorMessage);
  } finally {
    activeBatches.delete(batchId);
  }
}

/**
 * Resume any in-progress batches on server startup
 */
export async function resumeInProgressBatches(): Promise<void> {
  const inProgressBatches = JobCreationBatchService.getInProgressBatches();

  if (inProgressBatches.length > 0) {
    logger.info('[JobCreation] Resuming in-progress batches', {
      count: inProgressBatches.length,
    });

    for (const batch of inProgressBatches) {
      // Re-start batch processing
      // Note: This might create duplicate jobs if the batch was partially completed
      // For simplicity, we mark failed batches as failed - users can retry manually
      JobCreationBatchService.updateStatus(
        batch.id,
        'failed',
        'Server restarted during job creation',
      );
      WSBroadcaster.broadcastJobCreationError(
        batch.id,
        'Server restarted during job creation. Please try again.',
      );
    }
  }
}
