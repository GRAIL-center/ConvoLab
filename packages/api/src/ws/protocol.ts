import type { TokenUsage } from '../llm/types.js';

export type EntityId = string | number;

/**
 * WebSocket Protocol Types
 *
 * Connection URL: /ws/conversation/:sessionId
 * Auth: Session cookie (automatic) or ?token=invitation_token
 */

// Server -> Client messages
export type ServerMessage =
  | { type: 'connected'; sessionId: EntityId; scenario: ScenarioInfo; study?: StudyInfo }
  | { type: 'history'; messages: HistoryMessage[] }
  | { type: 'partner:delta'; content: string }
  | { type: 'partner:retry' }
  | { type: 'partner:done'; messageId: EntityId; usage: TokenUsage; content: string }
  | { type: 'exchange:complete' }
  | { type: 'coach:delta'; content: string }
  | { type: 'coach:retry' }
  | { type: 'coach:done'; messageId: EntityId; usage: TokenUsage; content: string }
  | { type: 'aside:delta'; threadId: string; content: string }
  | { type: 'aside:done'; threadId: string; messageId: EntityId; usage: TokenUsage }
  | { type: 'aside:error'; threadId: string; error: string }
  | { type: 'error'; code: ErrorCode; message: string; recoverable: boolean }
  | { type: 'quota:warning'; remaining: number; total: number }
  | { type: 'quota:exhausted' }
  | {
      type: 'score:update';
      userMessageId: EntityId;
      turnNumber: number;
      scores: { l: number; a: number; p: number; pe: number };
      tone: 'constructive' | 'warm' | 'neutral' | 'tense';
    };

// Client -> Server messages
export type ClientMessage =
  | { type: 'message'; content: string }
  | { type: 'ping' }
  | { type: 'resume'; afterMessageId?: EntityId }
  | { type: 'aside:start'; content: string; threadId: string }
  | { type: 'aside:cancel'; threadId: string };

export interface ScenarioInfo {
  id: EntityId;
  name: string;
  description: string;
  partnerPersona: string;
  isCustom?: boolean;
}

export interface StudyInfo {
  source: 'qualtrics_prolific';
  topic: string;
  condition: 0 | 1;
  coachEnabled: boolean;
  participantTurnCount: number;
  softCapSeconds: number;
  hardStopSeconds: number;
  minParticipantTurns: number;
  /**
   * Seconds already elapsed on the server-anchored conversation clock at the
   * moment this payload was sent. The client adds its own wall-clock delta on
   * top, so the timer survives a page refresh and is immune to a skewed client
   * clock. 0 for sessions that predate the anchor being persisted.
   */
  elapsedSecondsAtConnect: number;
}

export interface HistoryMessage {
  id: EntityId;
  role: 'user' | 'partner' | 'coach';
  content: string;
  timestamp: string;
  messageType?: 'main' | 'aside';
  asideThreadId?: string;
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
