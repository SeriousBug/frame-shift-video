/**
 * Settings handlers for server configuration
 */

import { leaderDistributor } from '../index';
import { JobService } from '../db-service';
import { logger, captureException } from '../../src/lib/sentry';
import {
  collectSystemStatus,
  type NodeSystemStatus,
  type SystemStatusResponse,
} from '../system-status';

/** Follower status with optional job info */
export interface FollowerStatusResponse {
  id: string;
  url: string;
  busy: boolean;
  dead: boolean;
  currentJob: {
    id: number;
    name: string;
    progress: number;
  } | null;
}

/** Response for GET /api/settings/followers */
export interface FollowersStatusResponse {
  enabled: boolean;
  followers: FollowerStatusResponse[];
  hasDeadFollowers: boolean;
}

/**
 * GET /api/settings/followers
 * Get the status of all followers (leader mode only)
 */
export async function getFollowersStatusHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Check if leader mode is enabled
    if (!leaderDistributor) {
      return new Response(
        JSON.stringify({
          enabled: false,
          followers: [],
          hasDeadFollowers: false,
        } satisfies FollowersStatusResponse),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    // Get follower status from leader distributor
    const followerStatus = leaderDistributor.getFollowerStatus();

    // Enrich with job information
    const followers: FollowerStatusResponse[] = followerStatus.map(
      (follower) => {
        let currentJob: FollowerStatusResponse['currentJob'] = null;

        if (follower.currentJobId !== null) {
          const job = JobService.getById(follower.currentJobId);
          if (job) {
            currentJob = {
              id: job.id,
              name: job.name,
              progress: job.progress ?? 0,
            };
          }
        }

        return {
          id: follower.id,
          url: follower.url,
          busy: follower.busy,
          dead: follower.dead,
          currentJob,
        };
      },
    );

    const hasDeadFollowers = followers.some((f) => f.dead);

    logger.debug('[Settings] Followers status requested', {
      followerCount: followers.length,
      hasDeadFollowers,
    });

    return new Response(
      JSON.stringify({
        enabled: true,
        followers,
        hasDeadFollowers,
      } satisfies FollowersStatusResponse),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    logger.error('[Settings] Error getting followers status', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);

    return new Response(
      JSON.stringify({
        error: 'Failed to get followers status',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}

/**
 * POST /api/settings/followers/retry
 * Trigger immediate sync with followers (to retry dead ones)
 */
export async function retryFollowersHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Check if leader mode is enabled
    if (!leaderDistributor) {
      return new Response(
        JSON.stringify({
          error: 'Leader mode is not enabled',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    logger.info('[Settings] Manual follower sync triggered');

    // Sync with followers
    await leaderDistributor.syncWithFollowers();

    // Get updated status
    const followerStatus = leaderDistributor.getFollowerStatus();
    const hasDeadFollowers = followerStatus.some((f) => f.dead);
    const recoveredCount = followerStatus.filter((f) => !f.dead).length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sync complete. ${recoveredCount} of ${followerStatus.length} followers are available.`,
        hasDeadFollowers,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    logger.error('[Settings] Error retrying followers', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);

    return new Response(
      JSON.stringify({
        error: 'Failed to retry followers',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}

// Store follower system status received from followers
const followerSystemStatus = new Map<string, NodeSystemStatus>();

/**
 * Update system status for a follower (called when follower reports status)
 */
export function updateFollowerSystemStatus(
  followerId: string,
  status: NodeSystemStatus,
): void {
  followerSystemStatus.set(followerId, status);
}

/**
 * Clear system status for a follower (called when follower is marked as dead)
 */
export function clearFollowerSystemStatus(followerId: string): void {
  followerSystemStatus.delete(followerId);
}

/**
 * Get all stored follower system statuses
 */
export function getFollowerSystemStatuses(): Map<string, NodeSystemStatus> {
  return followerSystemStatus;
}

/**
 * GET /api/settings/system-status
 * Get system status for all nodes
 */
export async function getSystemStatusHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const instanceType = (process.env.INSTANCE_TYPE || 'standalone') as
      | 'standalone'
      | 'leader'
      | 'follower';
    const PORT = parseInt(process.env.PORT || '3001', 10);

    // Determine node ID based on instance type
    let nodeId: string;
    if (instanceType === 'follower') {
      nodeId = `follower-${PORT}`;
    } else if (instanceType === 'leader') {
      nodeId = 'leader';
    } else {
      nodeId = 'standalone';
    }

    // Collect local system status
    const localStatus = collectSystemStatus(nodeId);
    const nodes: NodeSystemStatus[] = [localStatus];

    // For leader mode, include follower statuses
    if (instanceType === 'leader' && leaderDistributor) {
      const followerStatuses = leaderDistributor.getFollowerStatus();

      for (const follower of followerStatuses) {
        const storedStatus = followerSystemStatus.get(follower.id);
        if (storedStatus && !follower.dead) {
          // Use the stored status from the follower
          nodes.push(storedStatus);
        } else if (!follower.dead) {
          // Follower is alive but we don't have status yet - add placeholder
          nodes.push({
            nodeId: follower.id,
            cpuUsagePercent: 0,
            cpuCores: 0,
            memoryUsedBytes: 0,
            memoryTotalBytes: 0,
            memoryUsagePercent: 0,
            timestamp: 0,
          });
        }
        // Dead followers are excluded from the list
      }
    }

    const response: SystemStatusResponse = {
      instanceType,
      nodes,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    logger.error('[Settings] Error getting system status', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);

    return new Response(
      JSON.stringify({
        error: 'Failed to get system status',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}
