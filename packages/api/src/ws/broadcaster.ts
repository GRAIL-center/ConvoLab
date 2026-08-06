import type { WebSocket } from 'ws';
import type { ServerMessage } from './protocol.js';

/**
 * In-memory broadcast hub for session observers.
 *
 * When a participant's conversation streams messages, observers
 * subscribed to that session receive the same deltas in real-time.
 */

// Map<sessionId, Set<WebSocket>>
const observers = new Map<string, Set<WebSocket>>();

/**
 * Subscribe an observer WebSocket to a session.
 */
export function subscribe(sessionId: string | number, ws: WebSocket): void {
  const key = String(sessionId);
  if (!observers.has(key)) {
    observers.set(key, new Set());
  }
  observers.get(key)!.add(ws);
}

/**
 * Unsubscribe an observer WebSocket from a session.
 */
export function unsubscribe(sessionId: string | number, ws: WebSocket): void {
  const key = String(sessionId);
  const sockets = observers.get(key);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) {
      observers.delete(key);
    }
  }
}

/**
 * Broadcast a message to all observers of a session.
 */
export function broadcast(sessionId: string | number, message: ServerMessage): void {
  const sockets = observers.get(String(sessionId));
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
export function getObserverCount(sessionId: string | number): number {
  return observers.get(String(sessionId))?.size ?? 0;
}
