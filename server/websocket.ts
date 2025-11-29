import { ServerWebSocket } from 'bun';
import { Job } from '../src/types/database';
import { logger, captureException } from '../src/lib/sentry';

interface WebSocketData {
  id: string;
}

// Store active WebSocket connections
const clients = new Set<ServerWebSocket<WebSocketData>>();

export function setupWebSocket() {
  return {
    open(ws: ServerWebSocket<WebSocketData>) {
      logger.debug('[WebSocket] Client connected');
      clients.add(ws);

      // Send initial connection confirmation
      try {
        ws.send(
          JSON.stringify({
            type: 'connected',
            message: 'WebSocket connected',
          }),
        );
      } catch (error) {
        logger.error('[WebSocket] Error sending connection confirmation', {
          error: error instanceof Error ? error.message : String(error),
        });
        captureException(error);
      }
    },

    message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
      logger.debug('[WebSocket] Received message', {
        message: message.toString().substring(0, 100),
      });
    },

    close(ws: ServerWebSocket<WebSocketData>) {
      logger.debug('[WebSocket] Client disconnected');
      clients.delete(ws);
    },

    error(ws: ServerWebSocket<WebSocketData>, error: Error) {
      logger.error('[WebSocket] Error', {
        error: error.message,
        stack: error.stack,
      });
      captureException(error);
      clients.delete(ws);
    },
  };
}

// Broadcaster functions
export const WSBroadcaster = {
  broadcastJobCreated(job: Job) {
    const message = JSON.stringify({
      type: 'job:created',
      data: job,
    });

    clients.forEach((client) => {
      try {
        client.send(message);
      } catch (error) {
        logger.error('[WebSocket] Error sending job:created to client', {
          error: error instanceof Error ? error.message : String(error),
          jobId: job.id,
        });
        captureException(error);
        clients.delete(client);
      }
    });
  },

  broadcastJobUpdate(job: Job) {
    const message = JSON.stringify({
      type: 'job:updated',
      data: job,
    });

    clients.forEach((client) => {
      try {
        client.send(message);
      } catch (error) {
        logger.error('[WebSocket] Error sending job:updated to client', {
          error: error instanceof Error ? error.message : String(error),
          jobId: job.id,
        });
        captureException(error);
        clients.delete(client);
      }
    });
  },

  broadcastJobProgress(
    jobId: number,
    progress: number,
    progressData?: { frame: number; fps: number },
  ) {
    const message = JSON.stringify({
      type: 'job:progress',
      data: { jobId, progress, ...progressData },
    });

    clients.forEach((client) => {
      try {
        client.send(message);
      } catch (error) {
        logger.debug('[WebSocket] Error sending job:progress to client', {
          error: error instanceof Error ? error.message : String(error),
          jobId,
        });
        clients.delete(client);
      }
    });
  },

  broadcastStatusCounts(statusCounts: Record<string, number>) {
    const message = JSON.stringify({
      type: 'status-counts',
      data: statusCounts,
    });

    clients.forEach((client) => {
      try {
        client.send(message);
      } catch (error) {
        logger.error('[WebSocket] Error sending status-counts to client', {
          error: error instanceof Error ? error.message : String(error),
        });
        captureException(error);
        clients.delete(client);
      }
    });
  },

  broadcastJobsCleared() {
    const message = JSON.stringify({
      type: 'jobs:cleared',
      data: {},
    });

    clients.forEach((client) => {
      try {
        client.send(message);
      } catch (error) {
        logger.error('[WebSocket] Error sending jobs:cleared to client', {
          error: error instanceof Error ? error.message : String(error),
        });
        captureException(error);
        clients.delete(client);
      }
    });
  },

  getClientCount() {
    return clients.size;
  },

  broadcastFollowerStatus(
    followers: Array<{
      id: string;
      url: string;
      busy: boolean;
      dead: boolean;
      currentJob: { id: number; name: string; progress: number } | null;
    }>,
  ) {
    const message = JSON.stringify({
      type: 'followers:status',
      data: { followers },
    });

    clients.forEach((client) => {
      try {
        client.send(message);
      } catch (error) {
        logger.debug('[WebSocket] Error sending followers:status to client', {
          error: error instanceof Error ? error.message : String(error),
        });
        clients.delete(client);
      }
    });
  },
};
