import { NextRequest, NextResponse } from 'next/server';
import { JobService } from '@/lib/db-service';
import { JobProcessor } from '@/lib/job-processor';

/**
 * PATCH /api/jobs/[id] - Update job (e.g., retry failed job)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'retry') {
      // Get the job to verify it's in a failed state
      const job = JobService.getById(jobId);
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      if (job.status !== 'failed') {
        return NextResponse.json(
          { error: 'Only failed jobs can be retried' },
          { status: 400 },
        );
      }

      // Reset job to pending state
      JobService.update(jobId, {
        status: 'pending',
        progress: 0,
        error_message: null,
      });

      // Trigger job processor
      try {
        const processor = JobProcessor.getInstance();
        processor.trigger();
      } catch (error) {
        console.error('Failed to trigger job processor:', error);
      }

      return NextResponse.json({
        success: true,
        message: 'Job queued for retry',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use action: "retry"' },
      { status: 400 },
    );
  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      {
        error: 'Failed to update job',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
