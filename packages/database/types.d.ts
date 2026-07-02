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
export declare const MessageRoles: readonly ["user", "partner", "coach"];
export declare const StreamTypes: readonly ["partner", "coach"];
export declare function isMessageRole(value: string): value is MessageRole;
export declare function isStreamType(value: string): value is StreamType;
//# sourceMappingURL=types.d.ts.map