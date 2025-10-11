import path from 'path';
import { ConversionOptions } from '../../src/types/conversion';
import {
  createFFmpegJobs,
  generateFFmpegCommand,
} from '../../src/lib/ffmpeg-command';
import { JobService } from '../db-service';
import { JobProcessor } from '../job-processor';
import { WSBroadcaster } from '../websocket';

/**
 * GET /api/jobs - Fetch all jobs
 */
export async function jobsHandler(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (req.method === 'GET') {
    try {
      const jobs = JobService.getAll();
      return new Response(JSON.stringify({ jobs }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
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
      const jobConfigs = createFFmpegJobs(resolvedOptions);

      // Create database entries for each job
      const createdJobIds: number[] = [];

      for (const config of jobConfigs) {
        // Generate FFmpeg command for storage
        const ffmpegCommand = generateFFmpegCommand(config);

        // Create job in database
        const jobId = JobService.create({
          name: config.jobName,
          input_file: config.inputFile,
          output_file: config.outputFile,
          ffmpeg_command: ffmpegCommand.displayCommand,
          queue_position: null, // Auto-assigned by database
        });

        createdJobIds.push(jobId);

        // Broadcast new job to WebSocket clients
        const job = JobService.getById(jobId);
        if (job) {
          WSBroadcaster.broadcastJobCreated(job);
        }
      }

      // Get or initialize job processor
      const uploadsDir = process.env.UPLOAD_DIR || './uploads';
      const outputsDir = process.env.OUTPUT_DIR || './outputs';

      let processor: JobProcessor;
      try {
        processor = JobProcessor.getInstance();
      } catch {
        // If not initialized, initialize it now
        processor = JobProcessor.getInstance({
          uploadsDir,
          outputsDir,
          checkInterval: 60000, // Check every minute
        });
        await processor.start();
      }

      // Trigger immediate job processing
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

    const body = await req.json();
    const { action } = body;

    if (action === 'retry') {
      // Get the job to verify it's in a failed state
      const job = JobService.getById(jobId);
      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      if (job.status !== 'failed') {
        return new Response(
          JSON.stringify({ error: 'Only failed jobs can be retried' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      // Reset job to pending state
      JobService.update(jobId, {
        status: 'pending',
        progress: 0,
        error_message: null,
      });

      // Broadcast updated job to WebSocket clients
      const updatedJob = JobService.getById(jobId);
      if (updatedJob) {
        WSBroadcaster.broadcastJobUpdate(updatedJob);
      }

      // Trigger job processor
      try {
        const processor = JobProcessor.getInstance();
        processor.trigger();
      } catch (error) {
        console.error('Failed to trigger job processor:', error);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Job queued for retry',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use action: "retry"' }),
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
