import { Server } from 'bun';

// Import routes
import { setupRoutes } from './routes';
import { setupWebSocket, WSBroadcaster } from './websocket';
import { JobProcessor } from './job-processor';
import { Job } from '../src/types/database';

const PORT = parseInt(process.env.PORT || '3001', 10);

// Initialize job processor
const uploadsDir = process.env.UPLOAD_DIR || './uploads';
const outputsDir = process.env.OUTPUT_DIR || './outputs';

let processor: JobProcessor;

try {
  processor = JobProcessor.getInstance({
    uploadsDir,
    outputsDir,
    checkInterval: 60000, // Check every minute
  });

  // Set up event listeners for job processor to broadcast via WebSocket
  processor.on('job:start', (job: Job) => {
    console.log(`[JobProcessor] Job ${job.id} started`);
    WSBroadcaster.broadcastJobUpdate(job);
  });

  processor.on('job:progress', (job: Job, progress: any) => {
    console.log(`[JobProcessor] Job ${job.id} progress: ${progress.progress}%`);
    WSBroadcaster.broadcastJobProgress(job.id, progress.progress, {
      frame: progress.frame,
      fps: progress.fps,
    });
  });

  processor.on('job:complete', (job: Job) => {
    console.log(`[JobProcessor] Job ${job.id} completed`);
    WSBroadcaster.broadcastJobUpdate(job);
  });

  processor.on('job:fail', (job: Job) => {
    console.log(`[JobProcessor] Job ${job.id} failed`);
    WSBroadcaster.broadcastJobUpdate(job);
  });

  // Start the processor
  await processor.start();
  console.log('[JobProcessor] Initialized and started');
} catch (error) {
  console.error('[JobProcessor] Failed to initialize:', error);
  process.exit(1);
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

    // Handle HTTP routes
    return setupRoutes(req);
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
