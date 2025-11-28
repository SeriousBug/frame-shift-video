/**
 * Worker endpoints for follower instances
 */

import { followerExecutor } from '../index';
import { logger, captureException } from '../../src/lib/sentry';
import { parseAuthHeader, verifyAuthHeader } from '../auth';
import { ExecuteJobRequest, FollowerStatus } from '../follower-executor';
import { JobService } from '../db-service';
import { WSBroadcaster } from '../websocket';

/**
 * GET /worker/status
 * Get the current status of this follower instance
 */
export async function getWorkerStatusHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Verify this is a follower instance
    if (!followerExecutor) {
      return new Response(
        JSON.stringify({
          error: 'This endpoint is only available on follower instances',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    // Verify authentication
    const authHeaderValue = req.headers.get('X-Auth');
    if (!authHeaderValue) {
      return new Response(
        JSON.stringify({ error: 'Missing authentication header' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const sharedToken = process.env.SHARED_TOKEN!;
    // For GET requests, we verify using an empty payload
    const authHeader = parseAuthHeader(authHeaderValue);
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication header format' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    if (!verifyAuthHeader('', authHeader, sharedToken)) {
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const status: FollowerStatus = followerExecutor.getStatus();

    logger.debug('[Worker] Status requested', {
      workerId: status.workerId,
      busy: status.busy,
      activeJobCount: status.activeJobs.length,
    });

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    logger.error('[Worker] Error getting status', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);

    return new Response(
      JSON.stringify({
        error: 'Failed to get status',
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
 * POST /worker/cancel/:jobId
 * Cancel a job running on this follower instance
 */
export async function cancelJobOnWorkerHandler(
  req: Request,
  jobId: number,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Verify this is a follower instance
    if (!followerExecutor) {
      return new Response(
        JSON.stringify({
          error: 'This endpoint is only available on follower instances',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    // Verify authentication
    const authHeaderValue = req.headers.get('X-Auth');
    if (!authHeaderValue) {
      return new Response(
        JSON.stringify({ error: 'Missing authentication header' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const body = await req.text();
    const sharedToken = process.env.SHARED_TOKEN!;

    const authHeader = parseAuthHeader(authHeaderValue);
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication header format' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    if (!verifyAuthHeader(body, authHeader, sharedToken)) {
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    logger.info('[Worker] Received cancel request', { jobId });

    const cancelled = followerExecutor.cancelJob(jobId);

    if (cancelled) {
      logger.info('[Worker] Job cancelled successfully', { jobId });
      return new Response(JSON.stringify({ success: true, cancelled: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } else {
      logger.warn('[Worker] Job not found or already completed', { jobId });
      return new Response(
        JSON.stringify({
          success: true,
          cancelled: false,
          message: 'Job not found or already completed',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }
  } catch (error) {
    logger.error('[Worker] Error cancelling job', {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);

    return new Response(
      JSON.stringify({
        error: 'Failed to cancel job',
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
 * POST /worker/execute
 * Execute a job on this follower instance
 */
export async function executeJobHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Verify this is a follower instance
    if (!followerExecutor) {
      return new Response(
        JSON.stringify({
          error: 'This endpoint is only available on follower instances',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    // Verify authentication
    const authHeaderValue = req.headers.get('X-Auth');
    if (!authHeaderValue) {
      return new Response(
        JSON.stringify({ error: 'Missing authentication header' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const body = await req.text();
    const sharedToken = process.env.SHARED_TOKEN!;

    const authHeader = parseAuthHeader(authHeaderValue);
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication header format' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    if (!verifyAuthHeader(body, authHeader, sharedToken)) {
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Parse request body
    let request: ExecuteJobRequest;
    try {
      request = JSON.parse(body);
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    // Execute the job
    logger.info('[Worker] Received job execution request', {
      jobId: request.jobId,
      jobName: request.jobName,
    });

    const result = await followerExecutor.executeJob(request);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    logger.error('[Worker] Error executing job', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);

    return new Response(
      JSON.stringify({
        error: 'Failed to execute job',
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
 * POST /api/jobs/:id/progress
 * Receive progress update from follower (leader endpoint)
 */
export async function receiveProgressHandler(
  req: Request,
  jobId: number,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    // Verify authentication
    const authHeaderValue = req.headers.get('X-Auth');
    const workerId = req.headers.get('X-Worker-Id');

    if (!authHeaderValue || !workerId) {
      return new Response(
        JSON.stringify({ error: 'Missing authentication headers' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const body = await req.text();
    const sharedToken = process.env.SHARED_TOKEN;

    // Only validate auth if shared token is configured (leader mode)
    if (sharedToken) {
      const authHeader = parseAuthHeader(authHeaderValue);
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication header format' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      if (!verifyAuthHeader(body, authHeader, sharedToken)) {
        return new Response(
          JSON.stringify({ error: 'Authentication failed' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }
    }

    // Parse progress update
    let update: {
      jobId: number;
      progress: number;
      frame: number;
      fps: number;
      speed: number;
      eta?: number;
    };
    try {
      update = JSON.parse(body);
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    // Update job progress
    JobService.updateProgress(jobId, update.progress);
    JobService.updateWorkerHeartbeat(jobId, workerId);

    // Broadcast progress update via WebSocket
    WSBroadcaster.broadcastJobProgress(jobId, update.progress, {
      frame: update.frame,
      fps: update.fps,
    });

    logger.debug('[Worker] Received progress update', {
      jobId,
      workerId,
      progress: update.progress,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    logger.error('[Worker] Error receiving progress update', {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error);

    return new Response(
      JSON.stringify({
        error: 'Failed to update progress',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}
