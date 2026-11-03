/**
 * The newest open conversation socket for each session, on this instance.
 *
 * A reply can outlive the socket that asked for it: Cloud Run cut every
 * WebSocket at its request timeout (300 s until 3 Nov 2026), the browser
 * reconnected within a second or two, and the partner's reply, still being
 * generated on the old connection, was persisted but never reached the
 * screen until a reload. ConversationManager sends through `socketFor`, so a
 * message whose own socket has closed goes to the session's newest socket.
 *
 * Per instance only: a reconnect that lands on another Cloud Run instance is
 * not found here, and the reply then reaches the participant on their next
 * history load, as before.
 */

const OPEN = 1; // WebSocket.OPEN

interface SocketLike {
  readyState: number;
  send: (data: string) => void;
}

const latest = new Map<string, SocketLike>();

export function registerSocket(sessionId: string, socket: SocketLike): void {
  latest.set(sessionId, socket);
}

export function unregisterSocket(sessionId: string, socket: SocketLike): void {
  if (latest.get(sessionId) === socket) latest.delete(sessionId);
}

/** The socket a message for this session should go to right now. */
export function socketFor(sessionId: string, original: SocketLike): SocketLike {
  if (original.readyState === OPEN) return original;
  const newest = latest.get(sessionId);
  return newest && newest.readyState === OPEN ? newest : original;
}
