import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storeVoiceExchange } = vi.hoisted(() => ({ storeVoiceExchange: vi.fn() }));

vi.mock('../data/index.js', () => ({
  completeSession: vi.fn(),
  createLappScore: vi.fn(),
  createMessage: vi.fn(),
  getLappScoresForSession: vi.fn().mockResolvedValue([]),
  getMessagesForSession: vi.fn().mockResolvedValue([]),
}));

vi.mock('../data/voiceExchanges.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/voiceExchanges.js')>()),
  storeVoiceExchange,
}));

vi.mock('../lib/telemetry.js', () => ({
  TelemetryEvents: { MESSAGE_SENT: 'message_sent', CONVERSATION_ENDED: 'conversation_ended' },
  track: vi.fn(),
}));

import { SessionEndedError } from '../data/voiceExchanges.js';
import { ConversationManager } from './conversation.js';

const EXCHANGE = {
  exchangeId: 'ex-00000002',
  participant: {
    transcript: 'Why do you think that?',
    startedAt: '2026-10-17T13:59:50.000Z',
    endedAt: '2026-10-17T13:59:53.000Z',
  },
  partner: {
    deliveredText: 'Because prices went up.',
    generatedText: 'Because prices went up.',
    interrupted: false,
    playbackCompleted: true,
    startedAt: '2026-10-17T13:59:54.000Z',
    endedAt: '2026-10-17T13:59:56.000Z',
  },
  voiceSessionVersion: 'v',
};

function stored(duplicate = false) {
  return {
    userMessageId: 'u2',
    partnerMessageId: 'p2',
    duplicate,
    userTimestamp: new Date('2026-10-17T14:00:00.000Z'),
    partnerTimestamp: new Date('2026-10-17T14:00:00.001Z'),
  };
}

function setup(messages: unknown[] = [], transcriber = vi.fn()) {
  const sent: Array<Record<string, unknown>> = [];
  const manager = new ConversationManager(
    { send: (data: string) => sent.push(JSON.parse(data)) } as never,
    {} as never,
    {
      id: 's1',
      messages,
      scenario: null,
      customPartnerPrompt: 'p',
      customCoachPrompt: 'c',
      invitationId: null,
      userId: 'user-1',
    } as never,
    { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    { transcriber }
  );
  const jobs = vi
    .spyOn(
      manager as unknown as { runPostExchangeJobs: () => Promise<void> },
      'runPostExchangeJobs'
    )
    .mockResolvedValue();
  return { manager, sent, jobs };
}

// A first voice exchange already stored, so the next one passes the turn-1 gate.
const PRIOR = [
  { id: 'u1', role: 'user', content: 'Hi.', messageType: 'main' },
  { id: 'p1', role: 'partner', content: 'Hello there.', messageType: 'main' },
];

describe('ConversationManager.handleVoiceExchange', () => {
  beforeEach(() => storeVoiceExchange.mockReset());

  it('stores, acknowledges, and coaches against what the participant heard', async () => {
    storeVoiceExchange.mockResolvedValueOnce(stored());
    const { manager, sent, jobs } = setup([...PRIOR]);

    await manager.handleVoiceExchange(EXCHANGE);

    expect(sent).toContainEqual({
      type: 'voice:exchange:ack',
      exchangeId: 'ex-00000002',
      userMessageId: 'u2',
      partnerMessageId: 'p2',
      duplicate: false,
    });
    expect(jobs).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessageId: 'u2',
        userMessage: 'Why do you think that?',
        turnNumber: 2,
        partnerTurnAnswered: 'Hello there.',
      })
    );
  });

  it('skips the coach on the first exchange, as for typed turns', async () => {
    storeVoiceExchange.mockResolvedValueOnce(stored());
    const { manager, jobs } = setup();
    await manager.handleVoiceExchange(EXCHANGE);
    expect(jobs).not.toHaveBeenCalled();
  });

  it('acknowledges a resend without coaching or scoring it again', async () => {
    storeVoiceExchange.mockResolvedValueOnce(stored(true));
    const { manager, sent, jobs } = setup([...PRIOR]);

    await manager.handleVoiceExchange(EXCHANGE);

    expect(sent).toContainEqual(
      expect.objectContaining({ type: 'voice:exchange:ack', duplicate: true })
    );
    expect(jobs).not.toHaveBeenCalled();
  });

  it('rejects a malformed exchange without touching storage', async () => {
    const { manager, sent } = setup();
    await manager.handleVoiceExchange({ ...EXCHANGE, participant: { transcript: '' } });

    expect(storeVoiceExchange).not.toHaveBeenCalled();
    expect(sent).toContainEqual({
      type: 'voice:exchange:rejected',
      exchangeId: 'ex-00000002',
      reason: 'invalid',
      retryable: false,
    });
  });

  it('tells the client a storage failure is worth retrying', async () => {
    storeVoiceExchange.mockRejectedValueOnce(new Error('unavailable'));
    const { manager, sent, jobs } = setup([...PRIOR]);

    await manager.handleVoiceExchange(EXCHANGE);

    expect(sent).toContainEqual(
      expect.objectContaining({
        type: 'voice:exchange:rejected',
        reason: 'storage_failed',
        retryable: true,
      })
    );
    expect(jobs).not.toHaveBeenCalled();
  });

  it('stores the server transcription, not the client text, for a transcriptId it issued', async () => {
    storeVoiceExchange.mockResolvedValue(stored());
    const { manager, sent } = setup(
      [...PRIOR],
      vi.fn().mockResolvedValue({ text: 'Why do you think so?', model: 'gemini-test' })
    );

    await manager.handleVoiceTranscribe({
      type: 'voice:transcribe',
      requestId: 'req-0001',
      audio: 'AAAA',
    });
    const reply = sent.find((m) => m.type === 'voice:transcript');
    expect(reply).toMatchObject({ requestId: 'req-0001', text: 'Why do you think so?' });

    await manager.handleVoiceExchange({
      ...EXCHANGE,
      participant: {
        ...EXCHANGE.participant,
        transcript: 'Tampered text',
        transcriptId: reply?.transcriptId,
        liveTranscript: 'Why do you thing that',
      },
    });
    expect(storeVoiceExchange).toHaveBeenLastCalledWith(
      's1',
      expect.objectContaining({
        transcriptSource: 'server',
        transcriptModel: 'gemini-test',
        participant: expect.objectContaining({
          transcript: 'Why do you think so?',
          liveTranscript: 'Why do you thing that',
        }),
      })
    );
  });

  it('gives the transcriber the recent turns, the unsaved previous exchange and the Live hint', async () => {
    const transcriber = vi.fn().mockResolvedValue({ text: 'their names?', model: 'gemini-test' });
    const { manager } = setup([...PRIOR], transcriber);

    await manager.handleVoiceTranscribe({
      type: 'voice:transcribe',
      requestId: 'req-0001',
      audio: 'AAAA',
      context: {
        hint: 'AND WHAT THEY IN',
        // The partner line repeats a stored one; only the new participant line is added.
        previous: {
          participant: 'How many kids do you have? And what are',
          partner: 'Hello there.',
        },
      },
    });

    expect(transcriber).toHaveBeenCalledWith(expect.any(Buffer), {
      context: [
        { speaker: 'Participant', text: 'Hi.' },
        { speaker: 'Partner', text: 'Hello there.' },
        { speaker: 'Participant', text: 'How many kids do you have? And what are' },
      ],
      hint: 'AND WHAT THEY IN',
    });
  });

  it('marks client text naming an unknown transcriptId as unverified', async () => {
    storeVoiceExchange.mockResolvedValueOnce(stored());
    const { manager } = setup([...PRIOR]);
    await manager.handleVoiceExchange({
      ...EXCHANGE,
      participant: { ...EXCHANGE.participant, transcriptId: 'from-another-connection' },
    });
    expect(storeVoiceExchange).toHaveBeenLastCalledWith(
      's1',
      expect.objectContaining({
        transcriptSource: 'unverified',
        participant: expect.objectContaining({ transcript: 'Why do you think that?' }),
      })
    );
  });

  it('answers voice:transcript:failed when transcription errors or hears nothing', async () => {
    const { manager, sent } = setup(
      [],
      vi
        .fn()
        .mockRejectedValueOnce(new Error('quota'))
        .mockResolvedValueOnce({ text: '', model: 'gemini-test' })
    );
    await manager.handleVoiceTranscribe({
      type: 'voice:transcribe',
      requestId: 'req-0001',
      audio: 'AAAA',
    });
    await manager.handleVoiceTranscribe({
      type: 'voice:transcribe',
      requestId: 'req-0002',
      audio: 'AAAA',
    });
    expect(sent).toEqual([
      { type: 'voice:transcript:failed', requestId: 'req-0001' },
      { type: 'voice:transcript:failed', requestId: 'req-0002' },
    ]);
  });

  it('rejects exchanges after the session has ended, not retryable', async () => {
    storeVoiceExchange.mockRejectedValueOnce(new SessionEndedError());
    const { manager, sent } = setup([...PRIOR]);

    await manager.handleVoiceExchange(EXCHANGE);

    expect(sent).toContainEqual(
      expect.objectContaining({
        type: 'voice:exchange:rejected',
        reason: 'session_ended',
        retryable: false,
      })
    );
  });
});
