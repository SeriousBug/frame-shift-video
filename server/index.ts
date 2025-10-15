import { Server } from 'bun';

// Import routes
import { setupRoutes } from './routes';
import { setupWebSocket, WSBroadcaster } from './websocket';
import { JobProcessor } from './job-processor';
import { Job } from '../src/types/database';
import { serveStatic } from './static';
import { FileSelectionService, JobService } from './db-service';
import { cleanupAllTempFiles } from './temp-file-service';

const PORT = parseInt(process.env.PORT || '3001', 10);
const DIST_DIR = process.env.DIST_DIR || './dist';

// Validate FFMPEG_THREADS environment variable if set
if (process.env.FFMPEG_THREADS) {
  const threads = parseInt(process.env.FFMPEG_THREADS, 10);
  if (isNaN(threads) || threads <= 0) {
    console.error(
      `[Config] Invalid FFMPEG_THREADS value: "${process.env.FFMPEG_THREADS}". Must be a positive integer.`,
    );
    process.exit(1);
  }
  console.log(`[Config] FFmpeg will use ${threads} threads for encoding`);
}

// Clean up temporary files from previous runs BEFORE starting job processor
// This must happen before the processor starts to avoid deleting files from new conversions
const baseDir = process.env.FRAME_SHIFT_HOME || process.env.HOME || '/';
try {
  const deletedCount = await cleanupAllTempFiles(baseDir);
  console.log(
    `[Startup] Temporary file cleanup complete: ${deletedCount} file(s) deleted`,
  );
} catch (error) {
  console.error('[Startup] Failed to clean up temporary files:', error);
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
    console.log(`[JobProcessor] Job ${job.id} started`);
    WSBroadcaster.broadcastJobUpdate(job);
    WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());
  });

  processor.on('job:progress', (job: Job, progress: any) => {
    console.log(`[JobProcessor] Job ${job.id} progress: ${progress.progress}%`);
    WSBroadcaster.broadcastJobProgress(job.id, progress.progress, {
      frame: progress.frame,
      fps: progress.fps,
    });
    // Note: Status counts don't change during progress, only when job status changes
  });

  processor.on('job:complete', (job: Job) => {
    console.log(`[JobProcessor] Job ${job.id} completed`);
    WSBroadcaster.broadcastJobUpdate(job);
    WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());
  });

  processor.on('job:fail', (job: Job) => {
    console.log(`[JobProcessor] Job ${job.id} failed`);
    WSBroadcaster.broadcastJobUpdate(job);
    WSBroadcaster.broadcastStatusCounts(JobService.getStatusCounts());
  });

  // Start the processor
  await processor.start();
  console.log('[JobProcessor] Initialized and started');
} catch (error) {
  console.error('[JobProcessor] Failed to initialize:', error);
  process.exit(1);
}

// Run file selections cleanup on startup and schedule daily cleanup
try {
  const deletedCount = FileSelectionService.cleanup();
  console.log(
    `[FileSelections] Cleanup complete: ${deletedCount} old entries deleted`,
  );

  // Run cleanup daily (every 24 hours)
  setInterval(
    () => {
      const count = FileSelectionService.cleanup();
      console.log(
        `[FileSelections] Daily cleanup: ${count} old entries deleted`,
      );
    },
    24 * 60 * 60 * 1000,
  );
} catch (error) {
  console.error('[FileSelections] Cleanup failed:', error);
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

console.log(`🚀 Server running at http://localhost:${PORT}`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  if (processor) {
    processor.stop();
  }
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  if (processor) {
    processor.stop();
  }
  server.stop();
  process.exit(0);
});
