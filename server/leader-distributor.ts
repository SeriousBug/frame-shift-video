/**
 * Leader distributor for distributed job processing
 * Distributes jobs to follower instances instead of executing them locally
 */

import { EventEmitter } from 'events';
import { Job } from '../src/types/database';
import { FFmpegCommand } from '../src/lib/ffmpeg-command';
import { FFmpegProgress } from '../src/lib/ffmpeg-executor';
import { JobService } from './db-service';
import { logger, captureException } from '../src/lib/sentry';
import { generateAuthHeader, formatAuthHeader } from './auth';

/**
 * Follower instance configuration
 */
export interface FollowerConfig {
  url: string;
  id: string;
}

/**
 * Leader distributor configuration
 */
export interface LeaderDistributorConfig {
  /** List of follower URLs to distribute jobs to */
  followerUrls: string[];
  /** Shared token for authentication with followers */
  sharedToken: string;
}

/**
 * Leader distributor events (mimics FFmpegExecutor interface)
 */
export interface LeaderDistributorEvents {
  /** Emitted when job progress updates */
  progress: (progress: FFmpegProgress) => void;
}

/**
 * Leader distributor
 * Distributes jobs to available follower instances
 */
export class LeaderDistributor extends EventEmitter {
  private config: LeaderDistributorConfig;
  private followers: FollowerConfig[];
  private busyFollowers = new Set<string>();

  constructor(config: LeaderDistributorConfig) {
    super();
    this.config = config;

    // Parse follower URLs into configs
    this.followers = config.followerUrls.map((url, index) => ({
      url: url.trim(),
      id: `follower-${index}`,
    }));

    if (this.followers.length === 0) {
      throw new Error('At least one follower URL must be configured');
    }

    logger.info('[LeaderDistributor] Initialized with followers', {
      followerCount: this.followers.length,
      followers: this.followers.map((f) => f.url),
    });
  }

  /**
   * Execute a job by distributing it to an available follower
   * This method mimics the FFmpegExecutor.execute() interface
   */
  async execute(
    command: FFmpegCommand,
    job: Job,
  ): Promise<{
    success: boolean;
    output?: string;
    error?: string;
    stderr?: string;
    finalProgress?: FFmpegProgress;
  }> {
    // Find first available follower
    const follower = this.getAvailableFollower();
    if (!follower) {
      const error = 'No available followers to process job';
      logger.error('[LeaderDistributor] All followers busy', {
        jobId: job.id,
      });
      return {
        success: false,
        error,
      };
    }

    // Mark follower as busy
    this.busyFollowers.add(follower.id);
    logger.info('[LeaderDistributor] Assigning job to follower', {
      jobId: job.id,
      followerId: follower.id,
      followerUrl: follower.url,
    });

    try {
      // Prepare request payload
      const requestPayload = {
        jobId: job.id,
        jobName: job.name,
        inputFile: job.input_file,
        outputFile: job.output_file!,
        ffmpegCommand: command,
      };

      // Update job with assigned worker
      JobService.update(job.id, {
        // @ts-expect-error - assigned_worker is not in UpdateJobInput type yet
        assigned_worker: follower.id,
      });

      const payload = JSON.stringify(requestPayload);
      const authHeader = generateAuthHeader(payload, this.config.sharedToken);

      // Send job to follower
      const response = await fetch(`${follower.url}/worker/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth': formatAuthHeader(authHeader),
        },
        body: payload,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Follower returned error: ${response.status} ${errorText}`,
        );
      }

      const result = await response.json();

      if (result.success) {
        logger.info('[LeaderDistributor] Job completed successfully', {
          jobId: job.id,
          followerId: follower.id,
        });

        return {
          success: true,
          output: result.outputFile,
          finalProgress: result.totalFrames
            ? {
                frame: result.totalFrames,
                fps: 0,
                speed: 0,
                progress: 100,
              }
            : undefined,
        };
      } else {
        logger.error('[LeaderDistributor] Job failed on follower', {
          jobId: job.id,
          followerId: follower.id,
          error: result.errorMessage,
        });

        return {
          success: false,
          error: result.errorMessage || 'Unknown error from follower',
          stderr: result.ffmpegStderr,
        };
      }
    } catch (error: any) {
      logger.error('[LeaderDistributor] Error communicating with follower', {
        jobId: job.id,
        followerId: follower.id,
        error: error.message,
      });

      captureException(error, {
        tags: { context: 'leader-distributor' },
        extra: { jobId: job.id, followerId: follower.id },
      });

      return {
        success: false,
        error: `Failed to communicate with follower: ${error.message}`,
      };
    } finally {
      // Mark follower as available again
      this.busyFollowers.delete(follower.id);
    }
  }

  /**
   * Kill/cancel job execution
   * This method mimics the FFmpegExecutor.kill() interface
   */
  kill(): void {
    // For leader distributor, we don't directly kill jobs
    // The job cancellation is handled through the API
    logger.warn(
      '[LeaderDistributor] kill() called - not implemented for distributed execution',
    );
  }

  /**
   * Get the first available (not busy) follower
   * Uses "first available" strategy as requested
   */
  private getAvailableFollower(): FollowerConfig | null {
    for (const follower of this.followers) {
      if (!this.busyFollowers.has(follower.id)) {
        return follower;
      }
    }
    return null;
  }

  /**
   * Get status of all followers
   */
  getFollowerStatus(): Array<{ id: string; url: string; busy: boolean }> {
    return this.followers.map((follower) => ({
      id: follower.id,
      url: follower.url,
      busy: this.busyFollowers.has(follower.id),
    }));
  }

  /**
   * Handle progress update received from a follower
   * Called by the API endpoint when follower reports progress
   */
  handleProgressUpdate(jobId: number, progress: FFmpegProgress): void {
    // Emit progress event (mimics FFmpegExecutor)
    this.emit('progress', progress);
  }
}
