import { ServerWebSocket } from 'bun';
import { Job } from '../src/types/database';

interface WebSocketData {
  id: string;
}

// Store active WebSocket connections
const clients = new Set<ServerWebSocket<WebSocketData>>();

export function setupWebSocket() {
  return {
    open(ws: ServerWebSocket<WebSocketData>) {
      console.log('[WebSocket] Client connected');
      clients.add(ws);

      // Send initial connection confirmation
      ws.send(
        JSON.stringify({
          type: 'connected',
          message: 'WebSocket connected',
        }),
      );
    },

    message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
      console.log('[WebSocket] Received message:', message);
    },

    close(ws: ServerWebSocket<WebSocketData>) {
      console.log('[WebSocket] Client disconnected');
      clients.delete(ws);
    },

    error(ws: ServerWebSocket<WebSocketData>, error: Error) {
      console.error('[WebSocket] Error:', error);
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
        console.error('[WebSocket] Error sending to client:', error);
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
        console.error('[WebSocket] Error sending to client:', error);
        clients.delete(client);
      }
    });
  },

  broadcastJobProgress(jobId: number, progress: number) {
    const message = JSON.stringify({
      type: 'job:progress',
      data: { jobId, progress },
    });

    clients.forEach((client) => {
      try {
        client.send(message);
      } catch (error) {
        console.error('[WebSocket] Error sending to client:', error);
        clients.delete(client);
      }
    });
  },

  getClientCount() {
    return clients.size;
  },
};
