/**
 * Application-level type definitions for database fields.
 * These TypeScript string unions provide type safety beyond what Prisma schema enforces.
 * The Prisma schema uses String fields; these types are enforced at the application layer.
 */

/** Who sent the message in a conversation */
export type MessageRole = 'user' | 'partner' | 'coach';

/** Which AI stream generated the usage */
export type StreamType = 'partner' | 'coach';

/** Type guards for runtime validation */
export const MessageRoles = ['user', 'partner', 'coach'] as const;
export const StreamTypes = ['partner', 'coach'] as const;

export function isMessageRole(value: string): value is MessageRole {
  return MessageRoles.includes(value as MessageRole);
}

export function isStreamType(value: string): value is StreamType {
  return StreamTypes.includes(value as StreamType);
}
