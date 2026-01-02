import type { Prisma, PrismaClient } from '@workspace/database';

/**
 * Track a telemetry event.
 *
 * @example
 * await track(prisma, "conversation_started", { scenarioId: 1 }, { userId: "abc" });
 */
export async function track(
  prisma: PrismaClient,
  name: string,
  properties: Record<string, unknown> = {},
  options: { userId?: string; sessionId?: number } = {}
): Promise<void> {
  try {
    await prisma.telemetryEvent.create({
      data: {
        name,
        properties: properties as Prisma.InputJsonValue,
        userId: options.userId,
        sessionId: options.sessionId,
      },
    });
  } catch (error) {
    // Telemetry should never break the app - log and continue
    console.error('[telemetry] Failed to track event:', name, error);
  }
}

/**
 * Create a tracker bound to a specific user context.
 * Useful in request handlers where userId is known.
 *
 * @example
 * const track = createTracker(prisma, ctx.user?.id);
 * await track("message_sent", { length: 150 }, sessionId);
 */
export function createTracker(prisma: PrismaClient, userId?: string) {
  return (name: string, properties?: Record<string, unknown>, sessionId?: number) =>
    track(prisma, name, properties, { userId, sessionId });
}

/**
 * Standard event names for type safety and consistency.
 */
export const TelemetryEvents = {
  // Conversation lifecycle
  CONVERSATION_STARTED: 'conversation_started',
  MESSAGE_SENT: 'message_sent',
  CONVERSATION_ENDED: 'conversation_ended',

  // Streaming & models
  STREAM_COMPLETED: 'stream_completed',
  STREAM_ERROR: 'stream_error',
  RECONNECTION: 'reconnection',

  // Quota
  QUOTA_WARNING: 'quota_warning',
  QUOTA_EXHAUSTED: 'quota_exhausted',

  // Invitations
  INVITATION_CREATED: 'invitation_created',
  INVITATION_CLAIMED: 'invitation_claimed',
  QR_SCANNED: 'qr_scanned',

  // Research
  OBSERVATION_NOTE_ADDED: 'observation_note_added',

  // Auth
  USER_AUTHENTICATED: 'user_authenticated',
  USER_MERGED: 'user_merged',

  // Landing
  PAGE_VIEWED: 'page_viewed',
  CTA_CLICKED: 'cta_clicked',
} as const;

export type TelemetryEventName = (typeof TelemetryEvents)[keyof typeof TelemetryEvents];
