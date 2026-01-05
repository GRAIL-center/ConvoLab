import type { TokenUsage } from '../llm/types.js';

/**
 * WebSocket Protocol Types
 *
 * Connection URL: /ws/conversation/:sessionId
 * Auth: Session cookie (automatic) or ?token=invitation_token
 */

// Server -> Client messages
export type ServerMessage =
  | { type: 'connected'; sessionId: number; scenario: ScenarioInfo }
  | { type: 'history'; messages: HistoryMessage[] }
  | { type: 'partner:delta'; content: string }
  | { type: 'partner:done'; messageId: number; usage: TokenUsage }
  | { type: 'coach:delta'; content: string }
  | { type: 'coach:done'; messageId: number; usage: TokenUsage }
  | { type: 'error'; code: ErrorCode; message: string; recoverable: boolean }
  | { type: 'quota:warning'; remaining: number; total: number }
  | { type: 'quota:exhausted' };

// Client -> Server messages
export type ClientMessage =
  | { type: 'message'; content: string }
  | { type: 'ping' }
  | { type: 'resume'; afterMessageId?: number };

export interface ScenarioInfo {
  id: number;
  name: string;
  description: string;
  partnerPersona: string;
}

export interface HistoryMessage {
  id: number;
  role: 'user' | 'partner' | 'coach';
  content: string;
  timestamp: string;
}

export type ErrorCode =
  | 'AUTH_FAILED'
  | 'SESSION_NOT_FOUND'
  | 'NO_SCENARIO'
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'INTERNAL_ERROR';

/**
 * Helper to send a message to WebSocket.
 */
export function send(ws: { send: (data: string) => void }, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

/**
 * Parse incoming client message.
 *
 * @returns The parsed message, or null if:
 *   - The data is not valid JSON
 *   - The parsed value is not an object
 *   - The object lacks a 'type' field
 */
export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || !parsed.type) {
      return null;
    }
    return parsed as ClientMessage;
  } catch {
    return null;
  }
}
