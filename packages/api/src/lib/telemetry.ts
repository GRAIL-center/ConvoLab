// Telemetry disabled – no‑op implementations

export async function track(
  _prisma: unknown,
  _name: string,
  _properties: Record<string, unknown> = {},
  _options: { userId?: string; sessionId?: number } = {}
): Promise<void> {
  // Intentionally empty – telemetry is disabled for this deployment
}

export function createTracker(_prisma: any, _userId?: string) {
  return (
    _name: string,
    _properties?: Record<string, unknown>,
    _sessionId?: number
  ) => track(_prisma, _name, _properties, { userId: _userId, sessionId: _sessionId });
}

// Keep event names for type safety – they are unused when telemetry is disabled
export const TelemetryEvents = {
  CONVERSATION_STARTED: 'conversation_started',
  MESSAGE_SENT: 'message_sent',
  CONVERSATION_ENDED: 'conversation_ended',
  STREAM_COMPLETED: 'stream_completed',
  STREAM_ERROR: 'stream_error',
  RECONNECTION: 'reconnection',
  QUOTA_WARNING: 'quota_warning',
  QUOTA_EXHAUSTED: 'quota_exhausted',
  INVITATION_CREATED: 'invitation_created',
  INVITATION_CLAIMED: 'invitation_claimed',
  QR_SCANNED: 'qr_scanned',
  OBSERVATION_NOTE_ADDED: 'observation_note_added',
  USER_AUTHENTICATED: 'user_authenticated',
  USER_MERGED: 'user_merged',
  AI_REFUSAL: 'ai_refusal',
  PAGE_VIEWED: 'page_viewed',
  CTA_CLICKED: 'cta_clicked',
} as const;

type TelemetryEventName = (typeof TelemetryEvents)[keyof typeof TelemetryEvents];

