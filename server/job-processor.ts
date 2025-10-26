/**
 * Job processor service for executing FFmpeg conversion jobs
 * Handles job queue management, execution, and status updates
 */

import { EventEmitter } from 'events';
import path from 'path';
import { Job } from '../src/types/database';
import {
  FFmpegExecutor,
  FFmpegProgress,
  FFmpegResult,
} from '../src/lib/ffmpeg-executor';
import { FFmpegCommand } from '../src/lib/ffmpeg-command';
import { DEFAULT_CONVERSION_OPTIONS } from '../src/types/conversion';
import { JobService } from './db-service';
import { notificationService } from './notification-service';
import { WSBroadcaster } from './websocket';
import { finalizeTempFile, cleanupTempFile } from './temp-file-service';
import { logger, captureException, startSpan } from '../src/lib/sentry';

/**
 * Job processor configuration
 */
export interface JobProcessorConfig {
  /**
   * Directory where uploaded files are stored (legacy, not used)
   * @deprecated No longer used - file paths are absolute
   */
  uploadsDir?: string;
  /**
   * Directory where output files will be saved (legacy, not used)
   * @deprecated No longer used - output paths are absolute
   */
  outputsDir?: string;
  /** Interval in milliseconds to check for new jobs (default: 60000 = 1 minute) */
  checkInterval?: number;
}

/**
 * Job processor events
 */
export interface JobProcessorEvents {
  /** Emitted when a job starts processing */
  'job:start': (job: Job) => void;
  /** Emitted when job progress updates */
  'job:progress': (job: Job, progress: FFmpegProgress) => void;
  /** Emitted when a job completes successfully */
  'job:complete': (job: Job) => void;
  /** Emitted when a job fails */
  'job:fail': (job: Job, error: string) => void;
  /** Emitted when processor state changes */
  'state:change': (isProcessing: boolean) => void;
}

/**
 * Job processor singleton for managing video conversion jobs
 */
export class JobProcessor extends EventEmitter {
  private static instance: JobProcessor | null = null;
  private config: Required<JobProcessorConfig>;
  private currentJobId: number | null = null;
  private executor: FFmpegExecutor | null = null;
  private checkIntervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isShuttingDown = false;
  private lastCompletionNotificationSent = false;

  private constructor(config: JobProcessorConfig) {
    super();
    this.config = {
      checkInterval: 60000, // 1 minute default
      ...config,
    };
  }

  /**
   * Get or create the job processor singleton instance
   */
  static getInstance(config?: JobProcessorConfig): JobProcessor {
    if (!JobProcessor.instance) {
      if (!config) {
        throw new Error(
          'JobProcessor must be initialized with config on first call',
        );
      }
      JobProcessor.instance = new JobProcessor(config);
    }
    return JobProcessor.instance;
  }

  /**
   * Reset the singleton instance (mainly for testing)
   */
  static resetInstance(): void {
    if (JobProcessor.instance) {
      JobProcessor.instance.stop();
      JobProcessor.instance = null;
    }
  }

  /**
   * Start the job processor
   * - Checks for incomplete jobs on startup
   * - Sets up periodic database checks
   */
  async start(): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Cannot start processor while shutting down');
    }

    logger.info('[JobProcessor] Starting job processor');

    // Reset any jobs that were in processing state (from server restart/crash)
    const resetCount = JobService.resetProcessingJobs();
    if (resetCount > 0) {
      logger.info('[JobProcessor] Reset processing jobs to pending', {
        resetCount,
      });
    }

    // Check for incomplete jobs immediately (don't await - run async)
    this.checkForJobs();

    // Set up periodic checks
    this.checkIntervalId = setInterval(() => {
      this.checkForJobs();
    }, this.config.checkInterval);

    logger.info('[JobProcessor] Started', {
      checkInterval: this.config.checkInterval,
    });
  }

  /**
   * Stop the job processor
   * - Cancels the current job if running
   * - Clears periodic checks
   */
  stop(): void {
    logger.info('[JobProcessor] Stopping job processor');
    this.isShuttingDown = true;

    // Clear interval
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }

    // Kill current job if running
    if (this.executor) {
      this.executor.kill();
      this.executor = null;
    }

    // Update current job status if exists
    if (this.currentJobId) {
      const currentJob = JobService.getById(this.currentJobId);
      // Only return to pending if the job wasn't already cancelled
      if (currentJob && currentJob.status !== 'cancelled') {
        JobService.update(this.currentJobId, {
          status: 'pending', // Return to pending so it can be retried
          error_message: 'Job cancelled due to processor shutdown',
        });
      }
      this.currentJobId = null;
    }

    this.isProcessing = false;
    this.isShuttingDown = false;
    logger.info('[JobProcessor] Stopped');
  }

  /**
   * Manually trigger a job check
   * Useful for triggering immediate processing after adding new jobs
   */
  trigger(): void {
    if (this.isShuttingDown) {
      logger.debug('[JobProcessor] Cannot trigger check while shutting down');
      return;
    }

    logger.debug('[JobProcessor] Manual trigger requested', {
      isProcessing: this.isProcessing,
      currentJobId: this.currentJobId,
    });
    this.checkForJobs();
  }

  /**
   * Get the current processing state
   */
  getState(): { isProcessing: boolean; currentJobId: number | null } {
    return {
      isProcessing: this.isProcessing,
      currentJobId: this.currentJobId,
    };
  }

  /**
   * Cancel a specific job
   * If the job is currently processing, kill the FFmpeg process
   * If the job is pending, just update the status
   * Note: Temp file cleanup is handled by the processJob method when
   * the FFmpeg process returns after being killed
   */
  cancelJob(jobId: number): void {
    const job = JobService.getById(jobId);
    if (!job) {
      throw new Error('Job not found', { cause: { jobId } });
    }

    // If this is the current job being processed, kill it
    if (this.currentJobId === jobId && this.executor) {
      logger.info('[JobProcessor] Cancelling job', { jobId });
      this.executor.kill();
      JobService.update(jobId, {
        status: 'cancelled',
        error_message: 'Job cancelled by user',
      });
      const updatedJob = JobService.getById(jobId);
      if (updatedJob) {
        this.emit('job:fail', updatedJob, 'Job cancelled by user');
      }
      // Note: Temp file cleanup happens automatically when the killed
      // FFmpeg process returns in the processJob method
    }
    // If it's a pending job, just update the status
    else if (job.status === 'pending') {
      JobService.update(jobId, {
        status: 'cancelled',
        error_message: 'Job cancelled by user',
      });
    }
  }

  /**
   * Check for pending jobs and process the next one
   * Note: This is intentionally non-async to prevent accidental awaiting.
   * The async work happens in an IIFE.
   */
  private checkForJobs(): void {
    logger.debug('[JobProcessor] checkForJobs called', {
      isProcessing: this.isProcessing,
      isShuttingDown: this.isShuttingDown,
    });

    // Don't check if already processing or shutting down
    if (this.isProcessing || this.isShuttingDown) {
      logger.debug(
        '[JobProcessor] Skipping check - already processing or shutting down',
      );
      return;
    }

    // Get next pending job
    const nextJob = JobService.getNextPendingJob();

    if (!nextJob) {
      // No pending jobs
      logger.debug('[JobProcessor] No pending jobs found');
      return;
    }

    // Reset notification flag when starting a new batch of jobs
    if (this.lastCompletionNotificationSent) {
      this.lastCompletionNotificationSent = false;
      logger.info('[JobProcessor] Starting new batch of jobs');
    }

    logger.info('[JobProcessor] Found pending job', {
      jobId: nextJob.id,
      jobName: nextJob.name,
    });

    // Run async processing in IIFE (don't await - fire and forget)
    (async () => {
      await this.processJob(nextJob);
    })();
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    return startSpan(
      { op: 'job.process', name: `Process job ${job.id}` },
      async () => {
        this.isProcessing = true;
        this.currentJobId = job.id;
        this.emit('state:change', true);

        try {
          // Update job status to processing and set start time
          const startTime = new Date().toISOString();
          JobService.update(job.id, {
            status: 'processing',
            progress: 0,
            start_time: startTime,
          });
          logger.info('[JobProcessor] Started processing job', {
            jobId: job.id,
            jobName: job.name,
          });
          const updatedJob = JobService.getById(job.id);
          if (updatedJob) {
            this.emit('job:start', updatedJob);
          }

          // Parse FFmpeg command from job
          const command = this.parseJobCommand(job);

          // Create executor (no timeout - jobs can run as long as needed)
          this.executor = new FFmpegExecutor({
            uploadsDir: this.config.uploadsDir,
            outputsDir: this.config.outputsDir,
          });

          // Track maximum frame count
          let maxFrames = 0;

          // Set up progress tracking
          this.executor.on('progress', (progress: FFmpegProgress) => {
            // Track maximum frame count
            if (progress.frame > maxFrames) {
              maxFrames = progress.frame;
            }
            JobService.updateProgress(job.id, progress.progress);
            const updatedJob = JobService.getById(job.id);
            if (updatedJob) {
              this.emit('job:progress', updatedJob, progress);
            }
          });

          // Execute the command
          const result: FFmpegResult = await this.executor.execute(command);

          // Handle result
          if (result.success) {
            const endTime = new Date().toISOString();
            // Update with total frames if we have them
            if (
              result.finalProgress &&
              result.finalProgress.frame > maxFrames
            ) {
              maxFrames = result.finalProgress.frame;
            }

            // Rename temporary file to final output path
            try {
              await finalizeTempFile(result.tempPath, result.finalPath);
              JobService.complete(job.id, result.finalPath);
              JobService.update(job.id, {
                end_time: endTime,
                total_frames: maxFrames > 0 ? maxFrames : undefined,
              });
              logger.info('[JobProcessor] Job completed successfully', {
                jobId: job.id,
                outputPath: result.finalPath,
                totalFrames: maxFrames,
              });
              const completedJob = JobService.getById(job.id);
              if (completedJob) {
                this.emit('job:complete', completedJob);
              }
            } catch (error) {
              // Failed to rename - treat as failure and clean up temp file
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              await cleanupTempFile(result.tempPath);
              JobService.setError(
                job.id,
                `Failed to finalize output file: ${errorMessage}`,
              );
              JobService.update(job.id, { end_time: endTime });
              logger.error('[JobProcessor] Job failed to finalize', {
                jobId: job.id,
                error: errorMessage,
              });
              captureException(error, {
                extra: {
                  jobId: job.id,
                  jobName: job.name,
                  ffmpegStderr: result.stderr,
                },
              });
              const failedJob = JobService.getById(job.id);
              if (failedJob) {
                this.emit('job:fail', failedJob, errorMessage);
              }
            }
          } else {
            const endTime = new Date().toISOString();
            // Clean up temporary file
            await cleanupTempFile(result.tempPath);

            // Check if job was already cancelled (don't override cancelled status)
            const currentJob = JobService.getById(job.id);
            if (currentJob && currentJob.status !== 'cancelled') {
              const errorMessage = this.formatErrorMessage(result);
              JobService.setError(job.id, errorMessage);
              JobService.update(job.id, { end_time: endTime });
              logger.error('[JobProcessor] Job failed', {
                jobId: job.id,
                error: result.error,
              });
              captureException(new Error(result.error), {
                extra: {
                  jobId: job.id,
                  jobName: job.name,
                  exitCode: result.exitCode,
                  ffmpegStderr: result.stderr,
                  inputFile: job.input_file,
                  outputFile: job.output_file,
                },
              });
              const failedJob = JobService.getById(job.id);
              if (failedJob) {
                this.emit('job:fail', failedJob, result.error);
              }
            } else {
              // Job was cancelled, just update end time
              JobService.update(job.id, { end_time: endTime });
              logger.info('[JobProcessor] Job was cancelled', {
                jobId: job.id,
              });
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          // Check if job was already cancelled (don't override cancelled status)
          const currentJob = JobService.getById(job.id);
          if (currentJob && currentJob.status !== 'cancelled') {
            JobService.setError(job.id, errorMessage);
            logger.error('[JobProcessor] Job failed with exception', {
              jobId: job.id,
              error: errorMessage,
            });
            captureException(error, {
              extra: {
                jobId: job.id,
                jobName: job.name,
                inputFile: job.input_file,
                outputFile: job.output_file,
              },
            });
            const failedJob = JobService.getById(job.id);
            if (failedJob) {
              this.emit('job:fail', failedJob, errorMessage);
            }
          } else {
            logger.info('[JobProcessor] Job was cancelled during processing', {
              jobId: job.id,
            });
          }
        } finally {
          // Clean up
          this.executor = null;
          this.currentJobId = null;
          this.isProcessing = false;
          this.emit('state:change', false);

          logger.debug('[JobProcessor] Job finished, cleaning up');

          // Check if all jobs are complete and send notification
          if (!this.isShuttingDown) {
            await this.checkAndNotifyIfAllJobsComplete();
          }

          // Check for next job if not shutting down
          if (!this.isShuttingDown) {
            logger.debug('[JobProcessor] Scheduling next job check');
            setImmediate(() => this.checkForJobs());
          }
        }
      },
    );
  }

  /**
   * Parse FFmpeg command from job record
   */
  private parseJobCommand(job: Job): FFmpegCommand {
    // Parse JSON-encoded command
    if (job.ffmpeg_command_json) {
      const commandData = JSON.parse(job.ffmpeg_command_json);
      return {
        args: commandData.args,
        displayCommand: commandData.args.join(' '),
        inputPath: commandData.inputPath,
        outputPath: commandData.outputPath,
        config: {
          inputFile: job.input_file,
          outputFile:
            job.output_file || this.generateOutputPath(job.input_file),
          options: DEFAULT_CONVERSION_OPTIONS, // Not used when executing from stored command
          jobName: job.name,
        },
      };
    }

    throw new Error('Job has no FFmpeg command stored', {
      cause: { jobId: job.id },
    });
  }

  /**
   * Generate output path from input path
   */
  private generateOutputPath(inputPath: string): string {
    const parsed = path.parse(inputPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${parsed.name}-${timestamp}${parsed.ext}`;
  }

  /**
   * Check if all jobs are complete and send notification if enabled
   */
  private async checkAndNotifyIfAllJobsComplete(): Promise<void> {
    // Check if there are any pending or processing jobs
    const pendingJobs = JobService.getByStatus('pending');
    const processingJobs = JobService.getByStatus('processing');

    // If there are still jobs in the queue, don't process
    if (pendingJobs.length > 0 || processingJobs.length > 0) {
      // Reset the flag since there are still jobs to process
      this.lastCompletionNotificationSent = false;
      return;
    }

    // All jobs are complete - process completion actions if we haven't already
    if (!this.lastCompletionNotificationSent) {
      const completedJobs = JobService.getByStatus('completed');
      const failedJobs = JobService.getByStatus('failed');

      // Count only uncleared jobs for notification (exclude cleared jobs since user already acknowledged them)
      // We do this BEFORE auto-clearing to get accurate counts for this batch
      const unclearedCompletedCount = completedJobs.filter(
        (job) => !job.cleared,
      ).length;
      const unclearedFailedCount = failedJobs.filter(
        (job) => !job.cleared,
      ).length;

      // Only process if there were actually jobs processed
      if (completedJobs.length > 0 || failedJobs.length > 0) {
        // Send notification if enabled (using uncleared counts only)
        if (notificationService.isEnabled()) {
          try {
            await notificationService.notifyAllJobsComplete(
              unclearedCompletedCount,
              unclearedFailedCount,
            );
          } catch (error) {
            logger.error(
              '[JobProcessor] Failed to send completion notification',
              {
                error: error instanceof Error ? error.message : String(error),
              },
            );
            captureException(error);
          }
        }

        // Auto-clear all successful jobs when queue completes (regardless of notification settings)
        const clearedCount = JobService.clearSuccessfulJobs();
        if (clearedCount > 0) {
          logger.info('[JobProcessor] Auto-cleared successful jobs', {
            clearedCount,
          });
        }

        // Always trigger UI refresh when queue completes (even if jobs were already cleared)
        logger.info('[JobProcessor] Queue complete, triggering UI refresh');
        WSBroadcaster.broadcastJobsCleared();

        this.lastCompletionNotificationSent = true;
      }
    }
  }

  /**
   * Format error message from FFmpeg result
   */
  private formatErrorMessage(result: FFmpegResult): string {
    if (!result.success) {
      let message = result.error;

      // Include relevant stderr information if available
      if (result.stderr) {
        // Extract last few lines of stderr for context (max 500 chars)
        const stderrLines = result.stderr.trim().split('\n');
        const relevantLines = stderrLines.slice(-5).join('\n');
        const truncated =
          relevantLines.length > 500
            ? relevantLines.substring(relevantLines.length - 500)
            : relevantLines;

        message += `\n\nFFmpeg output:\n${truncated}`;
      }

      return message;
    }
    return '';
  }
}

/**
 * Initialize and start the job processor
 */
export async function initializeJobProcessor(
  config: JobProcessorConfig,
): Promise<JobProcessor> {
  const processor = JobProcessor.getInstance(config);
  await processor.start();
  return processor;
}

/**
 * Get the job processor instance (must be initialized first)
 */
export function getJobProcessor(): JobProcessor {
  const instance = JobProcessor.getInstance();
  if (!instance) {
    throw new Error(
      'JobProcessor not initialized. Call initializeJobProcessor first.',
    );
  }
  return instance;
}
