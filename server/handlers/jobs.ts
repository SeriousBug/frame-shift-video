import path from 'path';
import { orderBy } from 'natural-orderby';
import { ConversionOptions } from '../../src/types/conversion';
import {
  createFFmpegJobs,
  generateFFmpegCommand,
} from '../../src/lib/ffmpeg-command';
import { JobService, FileSelectionService } from '../db-service';
import { JobProcessor } from '../job-processor';
import { WSBroadcaster } from '../websocket';
import { decodeCursor } from '../cursor-utils';

/**
 * GET /api/jobs - Fetch jobs with cursor-based pagination
 * Query params:
 *   - cursor: opaque cursor for pagination
 *   - limit: number of jobs to return (default: 20)
 */
export async function jobsHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const cursorParam = url.searchParams.get('cursor');
      const limitParam = url.searchParams.get('limit');
      const statusParam = url.searchParams.get('status');
      const includeClearedParam = url.searchParams.get('includeCleared');

      // If status filter is provided, return jobs by status (non-paginated)
      if (statusParam) {
        const jobs = JobService.getByStatus(statusParam as any);
        return new Response(JSON.stringify({ jobs }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const limit = limitParam ? parseInt(limitParam, 10) : 20;
      const includeCleared = includeClearedParam === 'true';

      let cursor: any = undefined;

      if (cursorParam) {
        const decodedCursor = decodeCursor(cursorParam);
        if (!decodedCursor) {
          return new Response(JSON.stringify({ error: 'Invalid cursor' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        cursor = decodedCursor;
      }

      const result = JobService.getPaginated(limit, cursor, includeCleared);
      const statusCounts = JobService.getStatusCounts();
      const failedNotRetriedCount = JobService.getFailedNotRetriedCount();
      const clearableJobsCount = JobService.getClearableJobsCount();

      return new Response(
        JSON.stringify({
          ...result,
          statusCounts,
          failedNotRetriedCount,
          clearableJobsCount,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    } catch (error) {
      console.error('Error fetching jobs:', error);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch jobs',
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
   * PUT /api/jobs - Batch operations (e.g., retry all failed)
   */
  if (req.method === 'PUT') {
    try {
      const body = await req.json();
      const { action } = body;

      if (action === 'clear-finished') {
        // Clear all finished jobs (completed, failed, cancelled)
        const clearedCount = JobService.clearAllFinishedJobs();

        // Broadcast updated status counts
        WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());

        return new Response(
          JSON.stringify({
            success: true,
            message: `Cleared ${clearedCount} finished job(s)`,
            count: clearedCount,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      if (action === 'retry-all-failed') {
        // Get all failed jobs that haven't been retried yet
        const failedJobs = JobService.getByStatus('failed').filter(
          (job) => !job.retried,
        );

        if (failedJobs.length === 0) {
          return new Response(
            JSON.stringify({
              success: true,
              message: 'No failed jobs to retry',
              count: 0,
              configKey: null,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          );
        }

        const inputFiles: string[] = [];
        let configKey: string | null = null;

        for (const job of failedJobs) {
          // Mark the original job as retried and cleared
          JobService.update(job.id, { retried: 1, cleared: 1 });

          // Broadcast updated job to WebSocket clients
          const updatedOriginalJob = JobService.getById(job.id);
          if (updatedOriginalJob) {
            WSBroadcaster.broadcastJobUpdate(updatedOriginalJob);
          }

          // Collect input files
          inputFiles.push(job.input_file);

          // Use the config_key from the first job (they should all have the same config if from the same batch)
          if (!configKey && job.config_key) {
            configKey = job.config_key;
          }
        }

        // If we have a config key, load it and update with the failed files
        if (configKey) {
          const savedConfig = FileSelectionService.get(configKey);
          if (savedConfig?.config) {
            // Update the config with the failed files and save as a new key
            const updatedConfigJson = JSON.stringify({
              ...savedConfig.config,
              selectedFiles: inputFiles,
            });
            configKey = FileSelectionService.save(
              inputFiles,
              updatedConfigJson,
            );
          }
        }

        // Broadcast updated status counts
        WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());

        return new Response(
          JSON.stringify({
            success: true,
            message: `Marked ${failedJobs.length} failed job(s) as retried`,
            count: failedJobs.length,
            configKey,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      return new Response(
        JSON.stringify({
          error:
            'Invalid action. Use action: "retry-all-failed" or "clear-finished"',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    } catch (error) {
      console.error('Error handling batch operation:', error);
      return new Response(
        JSON.stringify({
          error: 'Failed to perform batch operation',
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
   * DELETE /api/jobs - Cancel all pending and processing jobs
   */
  if (req.method === 'DELETE') {
    try {
      // Get all pending and processing jobs
      const pendingJobs = JobService.getByStatus('pending');
      const processingJobs = JobService.getByStatus('processing');

      // Cancel all processing jobs
      for (const job of processingJobs) {
        try {
          const processor = JobProcessor.getInstance();
          processor.cancelJob(job.id);
        } catch (error) {
          console.error(`Failed to cancel job ${job.id}:`, error);
        }
      }

      // Cancel all pending jobs
      for (const job of pendingJobs) {
        JobService.update(job.id, {
          status: 'cancelled',
          error_message: 'Job cancelled by user',
        });

        // Broadcast updated job to WebSocket clients
        const updatedJob = JobService.getById(job.id);
        if (updatedJob) {
          WSBroadcaster.broadcastJobUpdate(updatedJob);
        }
      }

      const totalCancelled = pendingJobs.length + processingJobs.length;

      // Broadcast updated status counts
      WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());

      return new Response(
        JSON.stringify({
          success: true,
          message: `Cancelled ${totalCancelled} job(s)`,
          count: totalCancelled,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    } catch (error) {
      console.error('Error cancelling all jobs:', error);
      return new Response(
        JSON.stringify({
          error: 'Failed to cancel all jobs',
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
   * POST /api/jobs - Create new conversion jobs
   */
  if (req.method === 'POST') {
    try {
      const options: ConversionOptions = await req.json();

      // Validate that files are selected
      if (!options.selectedFiles || options.selectedFiles.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No files selected for conversion' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      // Convert file paths to absolute paths and validate they're within base directory
      // File browser returns paths relative to HOME, so resolve them
      const baseDir = process.env.FRAME_SHIFT_HOME || process.env.HOME || '/';
      const resolvedFiles: string[] = [];

      for (const file of options.selectedFiles) {
        const absolutePath = path.isAbsolute(file)
          ? file
          : path.join(baseDir, file);

        // Security check: ensure the resolved path is within the base directory
        if (!absolutePath.startsWith(baseDir)) {
          return new Response(
            JSON.stringify({
              error: 'Access denied',
              details: `File path ${file} is outside allowed directory`,
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          );
        }

        resolvedFiles.push(absolutePath);
      }

      const resolvedOptions: ConversionOptions = {
        ...options,
        selectedFiles: resolvedFiles,
      };

      // Create job configs from conversion options
      let jobConfigs = createFFmpegJobs(resolvedOptions);

      // Sort job configs naturally by input file path
      // This ensures "Episode 9" comes before "Episode 10"
      jobConfigs = orderBy(jobConfigs, [(config) => config.inputFile], ['asc']);

      // Save the configuration with file selections
      const configJson = JSON.stringify(resolvedOptions);
      const configKey = FileSelectionService.save(
        resolvedOptions.selectedFiles,
        configJson,
      );

      // Get the current maximum queue_position to append new jobs to the end of the queue
      const maxQueuePosition = JobService.getMaxQueuePosition();
      let nextQueuePosition = (maxQueuePosition || 0) + 1;

      // Create database entries for each job
      const createdJobIds: number[] = [];

      console.log(`[Jobs API] Creating ${jobConfigs.length} job(s)`);

      for (const config of jobConfigs) {
        // Generate FFmpeg command for storage
        const ffmpegCommand = generateFFmpegCommand(config);

        // Create job in database with JSON-encoded command and config key
        const jobId = JobService.create({
          name: config.jobName,
          input_file: config.inputFile,
          output_file: config.outputFile,
          ffmpeg_command_json: JSON.stringify({
            args: ffmpegCommand.args,
            inputPath: ffmpegCommand.inputPath,
            outputPath: ffmpegCommand.outputPath,
          }),
          queue_position: nextQueuePosition++, // Explicit position based on sort order
          config_key: configKey,
          config_json: configJson, // Store the full config on the job
        });

        console.log(`[Jobs API] Created job ${jobId}: ${config.jobName}`);
        createdJobIds.push(jobId);

        // Broadcast new job to WebSocket clients
        const job = JobService.getById(jobId);
        if (job) {
          WSBroadcaster.broadcastJobCreated(job);
        }
      }

      // Broadcast updated status counts
      WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());

      // Get or initialize job processor
      let processor: JobProcessor;
      try {
        processor = JobProcessor.getInstance();
        console.log('[Jobs API] Got existing job processor instance');
      } catch {
        // If not initialized, initialize it now
        console.log('[Jobs API] Initializing new job processor');
        processor = JobProcessor.getInstance({
          checkInterval: 60000, // Check every minute
        });
        await processor.start();
      }

      // Trigger immediate job processing
      console.log('[Jobs API] Triggering job processor');
      processor.trigger();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Created ${createdJobIds.length} conversion job(s)`,
          jobIds: createdJobIds,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    } catch (error) {
      console.error('Error creating jobs:', error);
      return new Response(
        JSON.stringify({
          error: 'Failed to create conversion jobs',
          details: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * GET /api/jobs/:id - Get a single job
 * PATCH /api/jobs/:id - Update job (e.g., retry failed job)
 */
export async function jobByIdHandler(
  req: Request,
  jobId: number,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    if (isNaN(jobId)) {
      return new Response(JSON.stringify({ error: 'Invalid job ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (req.method === 'GET') {
      const job = JobService.getById(jobId);
      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return new Response(JSON.stringify(job), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'retry') {
      // Get the job to verify it's in a failed or cancelled state
      const job = JobService.getById(jobId);
      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      if (job.status !== 'failed' && job.status !== 'cancelled') {
        return new Response(
          JSON.stringify({
            error: 'Only failed or cancelled jobs can be retried',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      // Mark the original job as retried and cleared
      JobService.update(jobId, { retried: 1, cleared: 1 });

      // Broadcast updated job to WebSocket clients
      const updatedOriginalJob = JobService.getById(jobId);
      if (updatedOriginalJob) {
        WSBroadcaster.broadcastJobUpdate(updatedOriginalJob);
      }

      // If the job has a config_key, load it and update with this single file
      let configKey = job.config_key || null;
      if (configKey) {
        const savedConfig = FileSelectionService.get(configKey);
        if (savedConfig?.config) {
          // Update the config with just this file and save as a new key
          const updatedConfigJson = JSON.stringify({
            ...savedConfig.config,
            selectedFiles: [job.input_file],
          });
          configKey = FileSelectionService.save(
            [job.input_file],
            updatedConfigJson,
          );
        }
      }

      // Broadcast updated status counts
      WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Job marked as retried',
          configKey,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    if (action === 'cancel') {
      // Get the job
      const job = JobService.getById(jobId);
      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // Only cancel pending or processing jobs
      if (job.status !== 'pending' && job.status !== 'processing') {
        return new Response(
          JSON.stringify({
            error: 'Only pending or processing jobs can be cancelled',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      // If the job is currently processing, kill it
      if (job.status === 'processing') {
        try {
          const processor = JobProcessor.getInstance();
          processor.cancelJob(jobId);
        } catch (error) {
          console.error('Failed to cancel job in processor:', error);
        }
      } else {
        // If pending, just update the status
        JobService.update(jobId, {
          status: 'cancelled',
          error_message: 'Job cancelled by user',
        });

        // Broadcast updated job to WebSocket clients
        const updatedJob = JobService.getById(jobId);
        if (updatedJob) {
          WSBroadcaster.broadcastJobUpdate(updatedJob);
        }
      }

      // Broadcast updated status counts
      WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Job cancelled',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Invalid action. Use action: "retry" or "cancel"',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    console.error('Error updating job:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to update job',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
}
