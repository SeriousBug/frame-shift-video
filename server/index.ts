import { Server } from 'bun';

// Initialize Sentry as early as possible
import { initializeServerMonitoring, logger } from '../src/lib/sentry';
await initializeServerMonitoring();

// Import routes
import { setupRoutes } from './routes';
import { setupWebSocket, WSBroadcaster } from './websocket';
import { JobProcessor } from './job-processor';
import { Job } from '../src/types/database';
import { serveStatic } from './static';
import { FileSelectionService, JobService } from './db-service';
import { cleanupAllTempFiles } from './temp-file-service';
import { captureException } from '../src/lib/sentry';

const PORT = parseInt(process.env.PORT || '3001', 10);
const DIST_DIR = process.env.DIST_DIR || './dist';

// Validate FFMPEG_THREADS environment variable if set
if (process.env.FFMPEG_THREADS) {
  const threads = parseInt(process.env.FFMPEG_THREADS, 10);
  if (isNaN(threads) || threads <= 0) {
    logger.error('[Config] Invalid FFMPEG_THREADS value', {
      value: process.env.FFMPEG_THREADS,
    });
    process.exit(1);
  }
  logger.info('[Config] FFmpeg threads configured', { threads });
}

// Clean up temporary files from previous runs BEFORE starting job processor
// This must happen before the processor starts to avoid deleting files from new conversions
const baseDir = process.env.FRAME_SHIFT_HOME || process.env.HOME || '/';
try {
  const deletedCount = await cleanupAllTempFiles(baseDir);
  logger.info('[Startup] Temporary file cleanup complete', { deletedCount });
} catch (error) {
  logger.error('[Startup] Failed to clean up temporary files', {
    error: error instanceof Error ? error.message : String(error),
  });
  captureException(error);
  // Don't exit - continue with startup even if cleanup fails
}

// Initialize job processor
let processor: JobProcessor;

try {
  processor = JobProcessor.getInstance({
    checkInterval: 60000, // Check every minute
  });

  // Set up event listeners for job processor to broadcast via WebSocket
  processor.on('job:start', (job: Job) => {
    logger.info('[JobProcessor] Job started', { jobId: job.id });
    WSBroadcaster.broadcastJobUpdate(job);
    WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());
  });

  processor.on('job:progress', (job: Job, progress: any) => {
    logger.debug`[JobProcessor] Job ${job.id} progress: ${progress.progress}%`;
    WSBroadcaster.broadcastJobProgress(job.id, progress.progress, {
      frame: progress.frame,
      fps: progress.fps,
    });
    // Note: Status counts don't change during progress, only when job status changes
  });

  processor.on('job:complete', (job: Job) => {
    logger.info('[JobProcessor] Job completed', { jobId: job.id });
    WSBroadcaster.broadcastJobUpdate(job);
    WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());
  });

  processor.on('job:fail', (job: Job) => {
    logger.error('[JobProcessor] Job failed', {
      jobId: job.id,
      error: job.error,
    });
    WSBroadcaster.broadcastJobUpdate(job);
    WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());
  });

  // Start the processor
  await processor.start();
  logger.info('[JobProcessor] Initialized and started');
} catch (error) {
  logger.fatal('[JobProcessor] Failed to initialize', {
    error: error instanceof Error ? error.message : String(error),
  });
  captureException(error);
  process.exit(1);
}

// Run file selections cleanup on startup and schedule daily cleanup
try {
  const deletedCount = FileSelectionService.cleanup();
  logger.info('[FileSelections] Cleanup complete', { deletedCount });

  // Run cleanup daily (every 24 hours)
  setInterval(
    () => {
      try {
        const count = FileSelectionService.cleanup();
        logger.info('[FileSelections] Daily cleanup', { deletedCount: count });
      } catch (error) {
        logger.error('[FileSelections] Daily cleanup failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        captureException(error);
      }
    },
    24 * 60 * 60 * 1000,
  );
} catch (error) {
  logger.error('[FileSelections] Cleanup failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  captureException(error);
}

// Create the HTTP server
const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade
    if (url.pathname === '/api/ws') {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        logger.error('[WebSocket] Upgrade failed');
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
      return undefined;
    }

    // Handle API routes
    if (url.pathname.startsWith('/api')) {
      return setupRoutes(req);
    }

    // Serve static files for non-API routes
    return serveStatic(req, DIST_DIR);
  },
  websocket: setupWebSocket(),
});

logger.info('[Server] Started successfully', { port: PORT });

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('[Server] Shutting down (SIGINT)');
  if (processor) {
    processor.stop();
  }
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('[Server] Shutting down (SIGTERM)');
  if (processor) {
    processor.stop();
  }
  server.stop();
  process.exit(0);
});

// Catch unhandled errors
process.on('uncaughtException', (error) => {
  logger.fatal('[Process] Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  captureException(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal('[Process] Unhandled rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  captureException(reason);
  process.exit(1);
});
