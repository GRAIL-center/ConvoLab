import type { WebSocket } from 'ws';
import type { ServerMessage } from './protocol.js';

/**
 * In-memory broadcast hub for session observers.
 *
 * When a participant's conversation streams messages, observers
 * subscribed to that session receive the same deltas in real-time.
 */

// Map<sessionId, Set<WebSocket>>
const observers = new Map<number, Set<WebSocket>>();

/**
 * Subscribe an observer WebSocket to a session.
 */
export function subscribe(sessionId: number, ws: WebSocket): void {
  if (!observers.has(sessionId)) {
    observers.set(sessionId, new Set());
  }
  observers.get(sessionId)!.add(ws);
}

/**
 * Unsubscribe an observer WebSocket from a session.
 */
export function unsubscribe(sessionId: number, ws: WebSocket): void {
  const sockets = observers.get(sessionId);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) {
      observers.delete(sessionId);
    }
  }
}

/**
 * Broadcast a message to all observers of a session.
 */
export function broadcast(sessionId: number, message: ServerMessage): void {
  const sockets = observers.get(sessionId);
  if (!sockets || sockets.size === 0) return;

  const data = JSON.stringify(message);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

/**
 * Get the number of active observers for a session.
 */
export function getObserverCount(sessionId: number): number {
  return observers.get(sessionId)?.size ?? 0;
}
