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
import { type NodeSystemStatus } from './system-status';

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

/** Default interval for periodic full sync (4 hours) */
const DEFAULT_SYNC_INTERVAL = 4 * 60 * 60 * 1000;

/** Default interval for checking dead followers (30 seconds) */
const DEFAULT_DEAD_CHECK_INTERVAL = 30 * 1000;

/** Number of retries for initial sync */
const SYNC_RETRIES = 3;

/** Delay between sync retries (2 seconds) */
const SYNC_RETRY_DELAY = 2000;

/**
 * Leader distributor
 * Distributes jobs to available follower instances
 */
export class LeaderDistributor extends EventEmitter {
  private config: LeaderDistributorConfig;
  private followers: FollowerConfig[];
  private busyFollowers = new Set<string>();
  /** Map of jobId to followerId - tracks which follower is processing which job */
  private jobToFollower = new Map<number, string>();
  /** Set of follower IDs that failed to sync and are considered dead */
  private deadFollowers = new Set<string>();
  /** Interval ID for periodic full sync */
  private syncIntervalId: NodeJS.Timeout | null = null;
  /** Interval ID for dead follower health checks */
  private deadCheckIntervalId: NodeJS.Timeout | null = null;

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

    // Mark follower as busy and track job assignment
    this.busyFollowers.add(follower.id);
    this.jobToFollower.set(job.id, follower.id);
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
      // Mark follower as available again and clean up job tracking
      this.busyFollowers.delete(follower.id);
      this.jobToFollower.delete(job.id);
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
   * Get the first available (not busy and not dead) follower
   * Uses "first available" strategy as requested
   */
  private getAvailableFollower(): FollowerConfig | null {
    for (const follower of this.followers) {
      if (
        !this.busyFollowers.has(follower.id) &&
        !this.deadFollowers.has(follower.id)
      ) {
        return follower;
      }
    }
    return null;
  }

  /**
   * Get status of all followers
   */
  getFollowerStatus(): Array<{
    id: string;
    url: string;
    busy: boolean;
    dead: boolean;
    currentJobId: number | null;
  }> {
    return this.followers.map((follower) => {
      // Find the job this follower is processing
      let currentJobId: number | null = null;
      for (const [jobId, fId] of this.jobToFollower.entries()) {
        if (fId === follower.id) {
          currentJobId = jobId;
          break;
        }
      }

      return {
        id: follower.id,
        url: follower.url,
        busy: this.busyFollowers.has(follower.id),
        dead: this.deadFollowers.has(follower.id),
        currentJobId,
      };
    });
  }

  /**
   * Handle progress update received from a follower
   * Called by the API endpoint when follower reports progress
   */
  handleProgressUpdate(jobId: number, progress: FFmpegProgress): void {
    // Emit progress event (mimics FFmpegExecutor)
    this.emit('progress', progress);
  }

  /**
   * Cancel a job running on a follower
   * Returns true if cancellation was successful, false otherwise
   */
  async cancelJobOnFollower(jobId: number): Promise<boolean> {
    const followerId = this.jobToFollower.get(jobId);
    if (!followerId) {
      logger.warn('[LeaderDistributor] Cannot cancel job - not tracked', {
        jobId,
      });
      return false;
    }

    const follower = this.followers.find((f) => f.id === followerId);
    if (!follower) {
      logger.error(
        '[LeaderDistributor] Cannot cancel job - follower not found',
        {
          jobId,
          followerId,
        },
      );
      return false;
    }

    try {
      const payload = JSON.stringify({ jobId });
      const authHeader = generateAuthHeader(payload, this.config.sharedToken);

      const response = await fetch(`${follower.url}/worker/cancel/${jobId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth': formatAuthHeader(authHeader),
        },
        body: payload,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[LeaderDistributor] Cancel request failed', {
          jobId,
          followerId,
          status: response.status,
          error: errorText,
        });
        return false;
      }

      const result = await response.json();
      logger.info('[LeaderDistributor] Job cancellation result', {
        jobId,
        followerId,
        cancelled: result.cancelled,
      });

      // Clean up tracking if cancelled
      if (result.cancelled) {
        this.busyFollowers.delete(followerId);
        this.jobToFollower.delete(jobId);
      }

      return result.cancelled === true;
    } catch (error: any) {
      logger.error('[LeaderDistributor] Error cancelling job on follower', {
        jobId,
        followerId,
        error: error.message,
      });
      captureException(error, {
        tags: { context: 'leader-distributor-cancel' },
        extra: { jobId, followerId },
      });
      return false;
    }
  }

  /**
   * Get the follower ID that is processing a specific job
   */
  getFollowerForJob(jobId: number): string | undefined {
    return this.jobToFollower.get(jobId);
  }

  /**
   * Try to sync with a single follower, with retries
   * Returns the status if successful, null if all retries failed
   */
  private async syncFollowerWithRetry(
    follower: FollowerConfig,
    retries: number = SYNC_RETRIES,
  ): Promise<any | null> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const authHeader = generateAuthHeader('', this.config.sharedToken);

        const response = await fetch(`${follower.url}/worker/status`, {
          method: 'GET',
          headers: {
            'X-Auth': formatAuthHeader(authHeader),
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const status = await response.json();
        return status;
      } catch (error: any) {
        if (attempt < retries) {
          logger.warn(
            `[LeaderDistributor] Sync attempt ${attempt}/${retries} failed, retrying...`,
            {
              followerId: follower.id,
              error: error.message,
            },
          );
          await new Promise((resolve) => setTimeout(resolve, SYNC_RETRY_DELAY));
        } else {
          logger.error(
            `[LeaderDistributor] All ${retries} sync attempts failed`,
            {
              followerId: follower.id,
              followerUrl: follower.url,
              error: error.message,
            },
          );
        }
      }
    }
    return null;
  }

  /**
   * Sync state with all followers
   * Called during leader initialization to recover state after restart
   * Returns the list of active job IDs found on followers
   */
  async syncWithFollowers(): Promise<number[]> {
    logger.info('[LeaderDistributor] Syncing state with followers');

    const activeJobIds: number[] = [];

    for (const follower of this.followers) {
      const status = await this.syncFollowerWithRetry(follower);

      if (!status) {
        // All retries failed - mark as dead
        logger.error('[LeaderDistributor] Marking follower as dead', {
          followerId: follower.id,
          followerUrl: follower.url,
        });
        this.deadFollowers.add(follower.id);
        continue;
      }

      // Follower responded successfully - remove from dead list if it was there
      if (this.deadFollowers.has(follower.id)) {
        logger.info('[LeaderDistributor] Follower recovered', {
          followerId: follower.id,
        });
        this.deadFollowers.delete(follower.id);
      }

      logger.info('[LeaderDistributor] Follower status', {
        followerId: follower.id,
        workerId: status.workerId,
        busy: status.busy,
        activeJobCount: status.activeJobs?.length ?? 0,
      });

      // Update our tracking based on follower state
      if (status.busy && status.activeJobs?.length > 0) {
        this.busyFollowers.add(follower.id);

        // Track each active job
        for (const activeJob of status.activeJobs) {
          this.jobToFollower.set(activeJob.jobId, follower.id);
          activeJobIds.push(activeJob.jobId);

          // Update job progress in database
          if (activeJob.progress > 0) {
            JobService.updateProgress(activeJob.jobId, activeJob.progress);
            logger.info('[LeaderDistributor] Restored job progress', {
              jobId: activeJob.jobId,
              progress: activeJob.progress,
              followerId: follower.id,
            });
          }
        }
      } else {
        // Follower is not busy, make sure it's not marked as busy
        this.busyFollowers.delete(follower.id);
      }
    }

    const aliveCount = this.followers.length - this.deadFollowers.size;
    logger.info('[LeaderDistributor] Sync complete', {
      totalFollowers: this.followers.length,
      aliveFollowers: aliveCount,
      deadFollowers: this.deadFollowers.size,
      busyFollowerCount: this.busyFollowers.size,
      trackedJobCount: this.jobToFollower.size,
      activeJobIds,
    });

    return activeJobIds;
  }

  /**
   * Check if dead followers have recovered
   * This runs more frequently than full sync to quickly detect recovered followers
   */
  private async checkDeadFollowers(): Promise<void> {
    if (this.deadFollowers.size === 0) {
      return; // No dead followers to check
    }

    logger.debug('[LeaderDistributor] Checking dead followers', {
      deadCount: this.deadFollowers.size,
    });

    for (const followerId of this.deadFollowers) {
      const follower = this.followers.find((f) => f.id === followerId);
      if (!follower) continue;

      try {
        const authHeader = generateAuthHeader('', this.config.sharedToken);
        const response = await fetch(`${follower.url}/worker/status`, {
          method: 'GET',
          headers: {
            'X-Auth': formatAuthHeader(authHeader),
          },
        });

        if (response.ok) {
          const status = await response.json();
          // Follower is back online!
          logger.info('[LeaderDistributor] Dead follower recovered!', {
            followerId: follower.id,
            followerUrl: follower.url,
            workerId: status.workerId,
          });
          this.deadFollowers.delete(followerId);

          // Update busy state based on current status
          if (status.busy && status.activeJobs?.length > 0) {
            this.busyFollowers.add(follower.id);
            // Track any active jobs
            for (const activeJob of status.activeJobs) {
              this.jobToFollower.set(activeJob.jobId, follower.id);
            }
          } else {
            this.busyFollowers.delete(follower.id);
          }
        }
      } catch (error) {
        // Still dead, that's expected
        logger.debug('[LeaderDistributor] Follower still unreachable', {
          followerId: follower.id,
        });
      }
    }
  }

  /**
   * Start periodic sync and dead follower health checks
   */
  startPeriodicSync(
    fullSyncIntervalMs: number = DEFAULT_SYNC_INTERVAL,
    deadCheckIntervalMs: number = DEFAULT_DEAD_CHECK_INTERVAL,
  ): void {
    // Clear existing intervals
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }
    if (this.deadCheckIntervalId) {
      clearInterval(this.deadCheckIntervalId);
    }

    logger.info(
      '[LeaderDistributor] Starting periodic sync and health checks',
      {
        fullSyncIntervalMs,
        fullSyncIntervalHours: fullSyncIntervalMs / (60 * 60 * 1000),
        deadCheckIntervalMs,
        deadCheckIntervalSeconds: deadCheckIntervalMs / 1000,
      },
    );

    // Full sync every few hours
    this.syncIntervalId = setInterval(async () => {
      try {
        logger.info('[LeaderDistributor] Running periodic full sync');
        await this.syncWithFollowers();
      } catch (error: any) {
        logger.error('[LeaderDistributor] Periodic sync failed', {
          error: error.message,
        });
      }
    }, fullSyncIntervalMs);

    // Quick health check for dead followers every 30 seconds
    this.deadCheckIntervalId = setInterval(async () => {
      try {
        await this.checkDeadFollowers();
      } catch (error: any) {
        logger.error('[LeaderDistributor] Dead follower check failed', {
          error: error.message,
        });
      }
    }, deadCheckIntervalMs);
  }

  /**
   * Stop periodic sync and clean up
   */
  stop(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    if (this.deadCheckIntervalId) {
      clearInterval(this.deadCheckIntervalId);
      this.deadCheckIntervalId = null;
    }
    logger.info('[LeaderDistributor] Stopped');
  }

  /**
   * Fetch system status from all alive followers
   * Returns a map of follower ID to their system status
   */
  async fetchFollowerSystemStatuses(): Promise<Map<string, NodeSystemStatus>> {
    const results = new Map<string, NodeSystemStatus>();

    const aliveFollowers = this.followers.filter(
      (f) => !this.deadFollowers.has(f.id),
    );

    await Promise.all(
      aliveFollowers.map(async (follower) => {
        try {
          const authHeader = generateAuthHeader('', this.config.sharedToken);

          const response = await fetch(`${follower.url}/worker/system-status`, {
            method: 'GET',
            headers: {
              'X-Auth': formatAuthHeader(authHeader),
            },
          });

          if (response.ok) {
            const status: NodeSystemStatus = await response.json();
            // Ensure the nodeId matches our follower ID
            status.nodeId = follower.id;
            results.set(follower.id, status);
          } else {
            logger.warn(
              '[LeaderDistributor] Failed to fetch system status from follower',
              {
                followerId: follower.id,
                status: response.status,
              },
            );
          }
        } catch (error: any) {
          logger.warn(
            '[LeaderDistributor] Error fetching system status from follower',
            {
              followerId: follower.id,
              error: error.message,
            },
          );
        }
      }),
    );

    return results;
  }
}
