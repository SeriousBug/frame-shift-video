import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { ConversionOptions } from '@/types/conversion';
import { createFFmpegJobs, generateFFmpegCommand } from '@/lib/ffmpeg-command';
import { JobService } from '@/lib/db-service';
import { JobProcessor } from '@/lib/job-processor';

/**
 * GET /api/jobs - Fetch all jobs
 */
export async function GET() {
  try {
    const jobs = JobService.getAll();
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch jobs',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/jobs - Create new conversion jobs
 */
export async function POST(request: NextRequest) {
  try {
    const options: ConversionOptions = await request.json();

    // Validate that files are selected
    if (!options.selectedFiles || options.selectedFiles.length === 0) {
      return NextResponse.json(
        { error: 'No files selected for conversion' },
        { status: 400 },
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
        return NextResponse.json(
          {
            error: 'Access denied',
            details: `File path ${file} is outside allowed directory`,
          },
          { status: 403 },
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

    return NextResponse.json({
      success: true,
      message: `Created ${createdJobIds.length} conversion job(s)`,
      jobIds: createdJobIds,
    });
  } catch (error) {
    console.error('Error creating jobs:', error);
    return NextResponse.json(
      {
        error: 'Failed to create conversion jobs',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
