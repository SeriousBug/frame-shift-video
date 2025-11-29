/**
 * Follower executor for distributed job processing
 * Receives job execution requests from leader instance and executes them locally
 */

import {
  FFmpegExecutor,
  FFmpegProgress,
  FFmpegResult,
} from '../src/lib/ffmpeg-executor';
import { FFmpegCommand } from '../src/lib/ffmpeg-command';
import { logger, captureException, startSpan } from '../src/lib/sentry';
import { finalizeTempFile, cleanupTempFile } from './temp-file-service';

/**
 * Request payload for executing a job on a follower
 */
export interface ExecuteJobRequest {
  jobId: number;
  jobName: string;
  inputFile: string;
  outputFile: string;
  ffmpegCommand: FFmpegCommand;
}

/**
 * Progress update sent back to leader
 */
export interface JobProgressUpdate {
  jobId: number;
  progress: number;
  frame: number;
  fps: number;
  speed: number;
  eta?: number;
}

/**
 * Result sent back to leader when job completes
 */
export interface JobCompleteResult {
  jobId: number;
  success: boolean;
  outputFile?: string;
  errorMessage?: string;
  ffmpegStderr?: string;
  totalFrames?: number;
}

/**
 * Follower executor configuration
 */
export interface FollowerExecutorConfig {
  /** URL of the leader instance to report progress to */
  leaderUrl: string;
  /** Shared token for authentication with leader */
  sharedToken: string;
  /** Worker ID to identify this follower */
  workerId: string;
}

/**
 * Active job state
 */
interface ActiveJob {
  jobId: number;
  jobName: string;
  executor: FFmpegExecutor;
  abortController: AbortController;
  lastProgress: JobProgressUpdate | null;
}

/**
 * Follower status response
 */
export interface FollowerStatus {
  workerId: string;
  busy: boolean;
  activeJobs: Array<{
    jobId: number;
    jobName: string;
    progress: number;
    frame: number;
    fps: number;
    speed: number;
  }>;
}

/**
 * Follower executor singleton
 * Executes jobs received from leader and reports progress back
 */
export class FollowerExecutor {
  private static instance: FollowerExecutor | null = null;
  private config: FollowerExecutorConfig;
  private activeJobs = new Map<number, ActiveJob>();

  private constructor(config: FollowerExecutorConfig) {
    this.config = config;
  }

  static getInstance(config?: FollowerExecutorConfig): FollowerExecutor {
    if (!FollowerExecutor.instance) {
      if (!config) {
        throw new Error(
          'FollowerExecutor must be initialized with config on first call',
        );
      }
      FollowerExecutor.instance = new FollowerExecutor(config);
    }
    return FollowerExecutor.instance;
  }

  static resetInstance(): void {
    if (FollowerExecutor.instance) {
      // Cancel all active jobs
      for (const activeJob of FollowerExecutor.instance.activeJobs.values()) {
        activeJob.executor.kill();
      }
      FollowerExecutor.instance.activeJobs.clear();
      FollowerExecutor.instance = null;
    }
  }

  /**
   * Execute a job received from the leader
   */
  async executeJob(request: ExecuteJobRequest): Promise<JobCompleteResult> {
    return startSpan(
      { op: 'follower.execute', name: `Execute job ${request.jobId}` },
      async () => {
        logger.info('[FollowerExecutor] Starting job execution', {
          jobId: request.jobId,
          jobName: request.jobName,
          inputFile: request.inputFile,
        });

        // Create executor
        const executor = new FFmpegExecutor({});
        const abortController = new AbortController();

        // Track this job
        const activeJob: ActiveJob = {
          jobId: request.jobId,
          jobName: request.jobName,
          executor,
          abortController,
          lastProgress: null,
        };
        this.activeJobs.set(request.jobId, activeJob);

        try {
          // Track maximum frame count
          let maxFrames = 0;

          // Set up progress tracking
          executor.on('progress', async (progress: FFmpegProgress) => {
            if (progress.frame > maxFrames) {
              maxFrames = progress.frame;
            }

            const progressUpdate: JobProgressUpdate = {
              jobId: request.jobId,
              progress: progress.progress,
              frame: progress.frame,
              fps: progress.fps,
              speed: progress.speed,
              eta: progress.eta,
            };

            // Store last progress for status queries
            activeJob.lastProgress = progressUpdate;

            // Send progress update to leader
            await this.sendProgressUpdate(progressUpdate);
          });

          // Execute the FFmpeg command
          const result: FFmpegResult = await executor.execute(
            request.ffmpegCommand,
          );

          // Update max frames from final progress
          if (result.finalProgress && result.finalProgress.frame > maxFrames) {
            maxFrames = result.finalProgress.frame;
          }

          if (result.success) {
            logger.info('[FollowerExecutor] Job completed successfully', {
              jobId: request.jobId,
              outputFile: request.outputFile,
            });

            // Finalize temp file if output was to a temp location
            if (request.outputFile.includes('/.temp_')) {
              await finalizeTempFile(request.outputFile);
            }

            return {
              jobId: request.jobId,
              success: true,
              outputFile: request.outputFile,
              totalFrames: maxFrames || undefined,
            };
          } else {
            logger.error('[FollowerExecutor] Job failed', {
              jobId: request.jobId,
              error: result.error,
            });

            // Cleanup temp file on failure
            if (request.outputFile.includes('/.temp_')) {
              await cleanupTempFile(request.outputFile);
            }

            return {
              jobId: request.jobId,
              success: false,
              errorMessage: result.error || 'Unknown error',
              ffmpegStderr: result.stderr,
            };
          }
        } catch (error: any) {
          logger.error('[FollowerExecutor] Job execution error', {
            jobId: request.jobId,
            error: error.message,
          });

          captureException(error, {
            tags: { context: 'follower-executor' },
            extra: { jobId: request.jobId, jobName: request.jobName },
          });

          // Cleanup temp file on error
          if (request.outputFile.includes('/.temp_')) {
            await cleanupTempFile(request.outputFile);
          }

          return {
            jobId: request.jobId,
            success: false,
            errorMessage: error.message || 'Unknown error',
          };
        } finally {
          // Clean up tracking
          this.activeJobs.delete(request.jobId);
        }
      },
    );
  }

  /**
   * Cancel a job that's currently executing
   */
  cancelJob(jobId: number): boolean {
    const activeJob = this.activeJobs.get(jobId);
    if (!activeJob) {
      return false;
    }

    logger.info('[FollowerExecutor] Cancelling job', { jobId });
    activeJob.executor.kill();
    activeJob.abortController.abort();
    this.activeJobs.delete(jobId);
    return true;
  }

  /**
   * Get list of currently executing job IDs
   */
  getActiveJobIds(): number[] {
    return Array.from(this.activeJobs.keys());
  }

  /**
   * Check if this follower is currently busy
   */
  isBusy(): boolean {
    return this.activeJobs.size > 0;
  }

  /**
   * Get the worker ID
   */
  getWorkerId(): string {
    return this.config.workerId;
  }

  /**
   * Get current status of this follower
   */
  getStatus(): FollowerStatus {
    const activeJobs = Array.from(this.activeJobs.values()).map((job) => ({
      jobId: job.jobId,
      jobName: job.jobName,
      progress: job.lastProgress?.progress ?? 0,
      frame: job.lastProgress?.frame ?? 0,
      fps: job.lastProgress?.fps ?? 0,
      speed: job.lastProgress?.speed ?? 0,
    }));

    return {
      workerId: this.config.workerId,
      busy: this.activeJobs.size > 0,
      activeJobs,
    };
  }

  /**
   * Send progress update to leader
   */
  private async sendProgressUpdate(update: JobProgressUpdate): Promise<void> {
    try {
      const { generateAuthHeader, formatAuthHeader } = await import('./auth');
      const payload = JSON.stringify(update);
      const authHeader = generateAuthHeader(payload, this.config.sharedToken);

      const response = await fetch(
        `${this.config.leaderUrl}/api/jobs/${update.jobId}/progress`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth': formatAuthHeader(authHeader),
            'X-Worker-Id': this.config.workerId,
          },
          body: payload,
        },
      );

      if (!response.ok) {
        logger.warn('[FollowerExecutor] Failed to send progress update', {
          jobId: update.jobId,
          status: response.status,
        });
      }
    } catch (error: any) {
      logger.error('[FollowerExecutor] Error sending progress update', {
        jobId: update.jobId,
        error: error.message,
      });
      // Don't throw - progress updates are best-effort
    }
  }
}
