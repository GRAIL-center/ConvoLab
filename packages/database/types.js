/**
 * Application-level type definitions for database fields.
 * These TypeScript string unions provide type safety beyond what Prisma schema enforces.
 * The Prisma schema uses String fields; these types are enforced at the application layer.
 */
/** Type guards for runtime validation */
export const MessageRoles = ['user', 'partner', 'coach'];
export const StreamTypes = ['partner', 'coach'];
export function isMessageRole(value) {
    return MessageRoles.includes(value);
}
export function isStreamType(value) {
    return StreamTypes.includes(value);
}
//# sourceMappingURL=types.js.map