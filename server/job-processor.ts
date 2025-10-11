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

/**
 * Job processor configuration
 */
export interface JobProcessorConfig {
  /** Directory where uploaded files are stored */
  uploadsDir: string;
  /** Directory where output files will be saved */
  outputsDir: string;
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

    console.log('[JobProcessor] Starting job processor...');

    // Check for incomplete jobs immediately
    await this.checkForJobs();

    // Set up periodic checks
    this.checkIntervalId = setInterval(() => {
      this.checkForJobs();
    }, this.config.checkInterval);

    console.log(
      `[JobProcessor] Started with check interval of ${this.config.checkInterval}ms`,
    );
  }

  /**
   * Stop the job processor
   * - Cancels the current job if running
   * - Clears periodic checks
   */
  stop(): void {
    console.log('[JobProcessor] Stopping job processor...');
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
      JobService.update(this.currentJobId, {
        status: 'pending', // Return to pending so it can be retried
        error_message: 'Job cancelled due to processor shutdown',
      });
      this.currentJobId = null;
    }

    this.isProcessing = false;
    this.isShuttingDown = false;
    console.log('[JobProcessor] Stopped');
  }

  /**
   * Manually trigger a job check
   * Useful for triggering immediate processing after adding new jobs
   */
  trigger(): void {
    if (this.isShuttingDown) {
      console.log('[JobProcessor] Cannot trigger check while shutting down');
      return;
    }

    console.log('[JobProcessor] Manual trigger requested');
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
   * Check for pending jobs and process the next one
   */
  private async checkForJobs(): Promise<void> {
    // Don't check if already processing or shutting down
    if (this.isProcessing || this.isShuttingDown) {
      return;
    }

    // Get next pending job
    const nextJob = JobService.getNextPendingJob();

    if (!nextJob) {
      // No pending jobs
      return;
    }

    console.log(
      `[JobProcessor] Found pending job: ${nextJob.id} - ${nextJob.name}`,
    );
    await this.processJob(nextJob);
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    this.isProcessing = true;
    this.currentJobId = job.id;
    this.emit('state:change', true);

    try {
      // Update job status to processing
      JobService.update(job.id, { status: 'processing', progress: 0 });
      console.log(
        `[JobProcessor] Started processing job ${job.id}: ${job.name}`,
      );
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

      // Set up progress tracking
      this.executor.on('progress', (progress: FFmpegProgress) => {
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
        JobService.complete(job.id, result.outputPath);
        console.log(`[JobProcessor] Job ${job.id} completed successfully`);
        const completedJob = JobService.getById(job.id);
        if (completedJob) {
          this.emit('job:complete', completedJob);
        }
      } else {
        const errorMessage = this.formatErrorMessage(result);
        JobService.setError(job.id, errorMessage);
        console.error(`[JobProcessor] Job ${job.id} failed: ${result.error}`);
        const failedJob = JobService.getById(job.id);
        if (failedJob) {
          this.emit('job:fail', failedJob, result.error);
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      JobService.setError(job.id, errorMessage);
      console.error(
        `[JobProcessor] Job ${job.id} failed with exception:`,
        error,
      );
      const failedJob = JobService.getById(job.id);
      if (failedJob) {
        this.emit('job:fail', failedJob, errorMessage);
      }
    } finally {
      // Clean up
      this.executor = null;
      this.currentJobId = null;
      this.isProcessing = false;
      this.emit('state:change', false);

      // Check for next job if not shutting down
      if (!this.isShuttingDown) {
        setImmediate(() => this.checkForJobs());
      }
    }
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

    throw new Error(`Job ${job.id} has no FFmpeg command stored`);
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
