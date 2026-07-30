import { beforeEach, describe, expect, it, vi } from 'vitest';

const { completeSession, track } = vi.hoisted(() => ({
  completeSession: vi.fn(),
  track: vi.fn(),
}));

vi.mock('../data/index.js', () => ({
  completeSession,
  createLappScore: vi.fn(),
  createMessage: vi.fn(),
  getLappScoresForSession: vi.fn().mockResolvedValue([]),
  getMessagesForSession: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/telemetry.js', () => ({
  TelemetryEvents: {
    CONVERSATION_ENDED: 'conversation_ended',
    MESSAGE_SENT: 'message_sent',
  },
  track,
}));

import { ConversationManager } from './conversation.js';

describe('ConversationManager session completion', () => {
  beforeEach(() => {
    completeSession.mockReset();
    track.mockReset();
  });

  it('tracks only the WebSocket close that atomically completes the session', async () => {
    completeSession
      .mockResolvedValueOnce({
        completed: true,
        endedAt: new Date('2026-07-30T12:01:00.000Z'),
        durationSeconds: 60,
      })
      .mockResolvedValueOnce({
        completed: false,
        endedAt: new Date('2026-07-30T12:01:00.000Z'),
        durationSeconds: 60,
      });

    const manager = new ConversationManager(
      { send: vi.fn() } as never,
      {} as never,
      {
        id: 42,
        startedAt: new Date('2026-07-30T12:00:00.000Z'),
        messages: [],
        scenario: { slug: 'practice' },
        invitation: null,
        invitationId: null,
        userId: 'user-1',
        customPartnerPersona: null,
      } as never,
      { error: vi.fn() } as never
    );

    await manager.onClose('disconnect');
    await manager.onClose('idle_timeout');

    expect(completeSession).toHaveBeenNthCalledWith(1, '42', expect.any(Date));
    expect(completeSession).toHaveBeenNthCalledWith(2, '42', expect.any(Date));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      expect.anything(),
      'conversation_ended',
      expect.objectContaining({
        reason: 'disconnect',
        durationMs: 60_000,
        totalMessages: 0,
      }),
      { userId: 'user-1', sessionId: 42 }
    );
  });
});
