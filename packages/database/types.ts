/**
 * Application-level type definitions for database fields.
 * These TypeScript string unions provide type safety beyond what Prisma schema enforces.
 * The Prisma schema uses String fields; these types are enforced at the application layer.
 */

/** Who sent the message in a conversation */
export type MessageRole = 'user' | 'partner' | 'coach';

/** Which AI stream generated the usage */
export type StreamType = 'partner' | 'coach';

/** Conversation session lifecycle state */
export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned';

/** Type guards for runtime validation */
export const MessageRoles = ['user', 'partner', 'coach'] as const;
export const StreamTypes = ['partner', 'coach'] as const;
export const SessionStatuses = ['active', 'paused', 'completed', 'abandoned'] as const;

export function isMessageRole(value: string): value is MessageRole {
  return MessageRoles.includes(value as MessageRole);
}

export function isStreamType(value: string): value is StreamType {
  return StreamTypes.includes(value as StreamType);
}

export function isSessionStatus(value: string): value is SessionStatus {
  return SessionStatuses.includes(value as SessionStatus);
}
