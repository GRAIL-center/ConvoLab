import { describe, expect, it } from 'vitest';
import { asFirestore, InMemoryFirestore } from '../__tests__/inMemoryTransactionFirestore.js';
import type { VoiceExchange } from '../voice/contract.js';
import { SessionEndedError, storeVoiceExchange, voiceMessageIds } from './voiceExchanges.js';

const RECEIVED_AT = new Date('2026-10-17T14:00:00.000Z');

function exchange(overrides: Partial<VoiceExchange> = {}): VoiceExchange {
  return {
    exchangeId: 'ex-00000001',
    participant: {
      transcript: 'I do not support that policy.',
      startedAt: '2026-10-17T13:59:50.000Z',
      endedAt: '2026-10-17T13:59:53.000Z',
    },
    partner: {
      deliveredText: 'I understand your concern, but',
      generatedText:
        'I understand your concern, but this proposal could reduce costs for working families.',
      interrupted: true,
      playbackCompleted: false,
      playedMs: 1800,
      startedAt: '2026-10-17T13:59:54.000Z',
      endedAt: '2026-10-17T13:59:56.000Z',
    },
    voiceSessionVersion: 'voice-v1@model@Kore@abc',
    ...overrides,
  };
}

function seededFake(session: Record<string, unknown> = {}) {
  const fake = new InMemoryFirestore();
  fake.seed('conversationSessions/s1', { status: 'ACTIVE', totalMessages: 1, ...session });
  return fake;
}

describe('storeVoiceExchange', () => {
  it('stores both turns and bumps the counter by two in one write', async () => {
    const fake = seededFake({ voiceSessionVersion: 'granted-v' });
    const result = await storeVoiceExchange('s1', exchange(), RECEIVED_AT, asFirestore(fake));
    const ids = voiceMessageIds('s1', 'ex-00000001');

    expect(result).toMatchObject({
      duplicate: false,
      userMessageId: ids.user,
      partnerMessageId: ids.partner,
    });
    expect(fake.read('conversationSessions/s1')?.totalMessages).toBe(3);
    expect(fake.read(`messages/${ids.user}`)).toMatchObject({
      role: 'user',
      content: 'I do not support that policy.',
      sessionId: 's1',
      messageType: 'main',
      metadata: { modality: 'voice', grantedVoiceSessionVersion: 'granted-v' },
    });
  });

  it('stores what the participant heard as the partner message, the rest as diagnostics', async () => {
    const fake = seededFake();
    await storeVoiceExchange('s1', exchange(), RECEIVED_AT, asFirestore(fake));
    const partner = fake.read(`messages/${voiceMessageIds('s1', 'ex-00000001').partner}`);

    expect(partner?.content).toBe('I understand your concern, but');
    expect(partner?.metadata).toMatchObject({
      generatedText: expect.stringContaining('working families'),
      interrupted: true,
      playbackCompleted: false,
      playedMs: 1800,
    });
  });

  it('orders the pair user-then-partner on server time', async () => {
    const fake = seededFake();
    const result = await storeVoiceExchange('s1', exchange(), RECEIVED_AT, asFirestore(fake));
    expect(result.partnerTimestamp.getTime()).toBeGreaterThan(result.userTimestamp.getTime());
  });

  it('writes nothing new when the same exchange is resent, even concurrently', async () => {
    const fake = seededFake();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        storeVoiceExchange('s1', exchange(), RECEIVED_AT, asFirestore(fake))
      )
    );

    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(fake.countCollection('messages')).toBe(2);
    expect(fake.read('conversationSessions/s1')?.totalMessages).toBe(3);
  });

  it('acknowledges a resend of an exchange stored before the session ended', async () => {
    const fake = seededFake();
    await storeVoiceExchange('s1', exchange(), RECEIVED_AT, asFirestore(fake));
    fake.seed('conversationSessions/s1', {
      status: 'COMPLETED',
      endedAt: new Date(),
      totalMessages: 3,
    });

    const again = await storeVoiceExchange('s1', exchange(), RECEIVED_AT, asFirestore(fake));
    expect(again.duplicate).toBe(true);
  });

  it('refuses a new exchange on a completed session', async () => {
    const fake = seededFake({ status: 'COMPLETED', endedAt: new Date() });
    await expect(
      storeVoiceExchange('s1', exchange(), RECEIVED_AT, asFirestore(fake))
    ).rejects.toBeInstanceOf(SessionEndedError);
    expect(fake.countCollection('messages')).toBe(0);
  });

  it('leaves no half-exchange when the commit fails', async () => {
    const fake = seededFake();
    fake.failCommit = true;
    await expect(
      storeVoiceExchange('s1', exchange(), RECEIVED_AT, asFirestore(fake))
    ).rejects.toThrow('injected commit failure');
    expect(fake.countCollection('messages')).toBe(0);
    expect(fake.read('conversationSessions/s1')?.totalMessages).toBe(1);
  });
});
