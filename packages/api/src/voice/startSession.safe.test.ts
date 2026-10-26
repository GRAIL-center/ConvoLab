import { Modality } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { voiceExchangeSchema } from './contract.js';
import { createVoiceGrant, type TokenMinter, type VoiceSessionSource } from './startSession.js';

const NOW = new Date('2026-10-17T14:00:00.000Z');

function studySession(overrides: Partial<VoiceSessionSource> = {}): VoiceSessionSource {
  return {
    scenario: null,
    customPartnerPrompt: 'You are Megan, a conservative from Ohio.',
    customCoachPrompt: 'Coach the participant.',
    studyPartnerGender: 'female',
    studyPartnerUseWebSearch: true,
    ...overrides,
  };
}

function fakeMinter() {
  return vi.fn<TokenMinter>().mockResolvedValue('auth_tokens/ephemeral-123');
}

describe('createVoiceGrant', () => {
  it('locks persona, voice, transcription and audio output into the token', async () => {
    const mint = fakeMinter();
    const grant = await createVoiceGrant(studySession(), [], { mint, now: NOW });

    expect(grant.token).toBe('auth_tokens/ephemeral-123');
    const { config, model } = mint.mock.calls[0][0];
    expect(model).toBe(grant.model);
    expect(config.responseModalities).toEqual([Modality.AUDIO]);
    expect(config.inputAudioTranscription).toEqual({});
    expect(config.outputAudioTranscription).toEqual({});
    expect(config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe('Kore');
    const instruction = (config.systemInstruction as { parts: { text: string }[] }).parts[0].text;
    expect(instruction).toContain('You are Megan, a conservative from Ohio.');
    expect(instruction).toContain('SPOKEN CONVERSATION');
    expect(config.tools).toEqual([{ googleSearch: {} }]);
  });

  it('gives both ideologies of the same gender the same voice', async () => {
    const left = await createVoiceGrant(
      studySession({ customPartnerPrompt: 'You are a progressive.', studyPartnerGender: 'male' }),
      [],
      { mint: fakeMinter(), now: NOW }
    );
    const right = await createVoiceGrant(
      studySession({ customPartnerPrompt: 'You are a populist.', studyPartnerGender: 'male' }),
      [],
      { mint: fakeMinter(), now: NOW }
    );
    expect(left.voiceName).toBe(right.voiceName);
    expect(left.voiceSessionVersion).not.toBe(right.voiceSessionVersion);
  });

  it('takes the gender from a public partisan scenario slug', async () => {
    const grant = await createVoiceGrant(
      {
        scenario: {
          slug: 'populist-right-male',
          description: 'x',
          partnerSystemPrompt: 'You are Dale.',
        },
      },
      [],
      { mint: fakeMinter(), now: NOW }
    );
    expect(grant.voiceName).toBe('Charon');
  });

  it('rebuilds the conversation so far from the stored record, main thread only', async () => {
    const mint = fakeMinter();
    await createVoiceGrant(
      studySession(),
      [
        { role: 'partner', content: 'Hi, I am Megan.' },
        { role: 'user', content: 'Hello Megan.' },
        { role: 'coach', content: 'Nice opener.' },
        { role: 'user', content: 'secret aside', messageType: 'aside' },
      ],
      { mint, now: NOW }
    );
    const config = mint.mock.calls[0][0].config;
    const instruction = (config.systemInstruction as { parts: { text: string }[] }).parts[0].text;
    expect(instruction).toContain('You: Hi, I am Megan.\nThem: Hello Megan.');
    expect(instruction).not.toContain('Nice opener.');
    expect(instruction).not.toContain('secret aside');
  });

  it('keeps the version stable as history grows', async () => {
    const a = await createVoiceGrant(studySession(), [], { mint: fakeMinter(), now: NOW });
    const b = await createVoiceGrant(studySession(), [{ role: 'user', content: 'Hello.' }], {
      mint: fakeMinter(),
      now: NOW,
    });
    expect(a.voiceSessionVersion).toBe(b.voiceSessionVersion);
  });

  it('issues short-lived tokens', async () => {
    const mint = fakeMinter();
    const grant = await createVoiceGrant(studySession(), [], { mint, now: NOW });
    expect(new Date(grant.newSessionExpiresAt).getTime() - NOW.getTime()).toBeLessThanOrEqual(
      60_000
    );
    expect(new Date(grant.expiresAt).getTime() - NOW.getTime()).toBeLessThanOrEqual(30 * 60_000);
  });

  it('offers no search when the session does not', async () => {
    const mint = fakeMinter();
    await createVoiceGrant(studySession({ studyPartnerUseWebSearch: false }), [], {
      mint,
      now: NOW,
    });
    expect(mint.mock.calls[0][0].config.tools).toBeUndefined();
  });
});

describe('voiceExchangeSchema', () => {
  const valid = {
    exchangeId: 'ex-00000001',
    participant: {
      transcript: 'Hello.',
      startedAt: '2026-10-17T13:59:50.000Z',
      endedAt: '2026-10-17T13:59:53.000Z',
    },
    partner: {
      deliveredText: '',
      generatedText: 'Well, I think',
      interrupted: true,
      playbackCompleted: false,
      startedAt: '2026-10-17T13:59:54.000Z',
      endedAt: '2026-10-17T13:59:54.500Z',
    },
    voiceSessionVersion: 'v',
  };

  it('accepts a partner turn interrupted before any audio played', () => {
    expect(voiceExchangeSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an empty participant transcript', () => {
    const bad = { ...valid, participant: { ...valid.participant, transcript: '   ' } };
    expect(voiceExchangeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects exchange ids that could escape a document path', () => {
    expect(voiceExchangeSchema.safeParse({ ...valid, exchangeId: '../../users/x' }).success).toBe(
      false
    );
  });
});
