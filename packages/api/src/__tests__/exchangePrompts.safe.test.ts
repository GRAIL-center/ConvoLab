import { describe, expect, it } from 'vitest';
import { buildCoachTranscript, buildLappTranscript } from '../lib/exchangePrompts.js';
import { precedingPartnerTurn } from '../lib/postExchangeGate.js';

// The exchange that exposed the bug on 3 Oct 2026. The participant raised
// grocery prices; the partner agreed; the coach told the participant they had
// acknowledged the partner's point about prices.
const PARTNER_OPENER = 'Not much, just got back from dropping my kids at school. How about you?';
const USER_TURN = 'times are tough in Somerville. Bought a gallon of milk for $8 the other day';
const PARTNER_REPLY = 'Yeah I feel that. Grocery prices have been brutal everywhere.';

describe('buildCoachTranscript', () => {
  it('shows the partner turn the user was replying to, before the user message', () => {
    const transcript = buildCoachTranscript({
      turnNumber: 2,
      userMessage: USER_TURN,
      partnerMessage: PARTNER_REPLY,
      partnerTurnAnswered: PARTNER_OPENER,
    });

    expect(transcript).toContain(PARTNER_OPENER);
    expect(transcript.indexOf(PARTNER_OPENER)).toBeLessThan(transcript.indexOf(USER_TURN));
  });

  it('marks the later partner reply as context, not as the turn being coached', () => {
    const transcript = buildCoachTranscript({
      turnNumber: 2,
      userMessage: USER_TURN,
      partnerMessage: PARTNER_REPLY,
      partnerTurnAnswered: PARTNER_OPENER,
    });

    const replyLine = transcript.split('\n').find((line) => line.includes(PARTNER_REPLY));
    expect(replyLine).toMatch(/came after/);
    expect(replyLine).toMatch(/context only/);
    const userLine = transcript.split('\n').find((line) => line.includes(USER_TURN));
    expect(userLine).toMatch(/coach this one/);
  });

  it('omits the answered turn rather than claiming the user opened, when it is unknown', () => {
    const transcript = buildCoachTranscript({
      turnNumber: 4,
      userMessage: USER_TURN,
      partnerMessage: PARTNER_REPLY,
    });

    expect(transcript).not.toMatch(/replying to/);
    expect(transcript).not.toMatch(/opening the conversation/);
    expect(transcript).toContain(USER_TURN);
  });

  it('treats a blank answered turn as absent', () => {
    expect(
      buildCoachTranscript({
        turnNumber: 2,
        userMessage: USER_TURN,
        partnerMessage: PARTNER_REPLY,
        partnerTurnAnswered: '   ',
      })
    ).not.toMatch(/replying to/);
  });
});

const RUBRIC = ['Use 0-5 integer scores for:', 'l = listen/reflect the partner concern'] as const;

describe('buildLappTranscript', () => {
  it('shows the partner turn being answered, which is what l and a are scored against', () => {
    const transcript = buildLappTranscript(
      {
        turnNumber: 2,
        userMessage: USER_TURN,
        partnerMessage: PARTNER_REPLY,
        partnerTurnAnswered: PARTNER_OPENER,
      },
      RUBRIC
    );

    expect(transcript).toContain(PARTNER_OPENER);
    expect(transcript.indexOf(PARTNER_OPENER)).toBeLessThan(transcript.indexOf(USER_TURN));
  });

  it('marks the user message as the one to score and the later reply as context', () => {
    const lines = buildLappTranscript(
      {
        turnNumber: 2,
        userMessage: USER_TURN,
        partnerMessage: PARTNER_REPLY,
        partnerTurnAnswered: PARTNER_OPENER,
      },
      RUBRIC
    ).split('\n');

    expect(lines.find((line) => line.includes(USER_TURN))).toMatch(/score this one/);
    expect(lines.find((line) => line.includes(PARTNER_REPLY))).toMatch(/context only/);
  });

  it('puts the rubric after the exchange', () => {
    const transcript = buildLappTranscript(
      { turnNumber: 2, userMessage: USER_TURN, partnerMessage: PARTNER_REPLY },
      RUBRIC
    );
    expect(transcript.indexOf(USER_TURN)).toBeLessThan(transcript.indexOf(RUBRIC[0]));
    expect(transcript.endsWith(RUBRIC[RUBRIC.length - 1])).toBe(true);
  });

  it('labels the same exchange the same way the coach sees it', () => {
    const input = {
      turnNumber: 3,
      userMessage: USER_TURN,
      partnerMessage: PARTNER_REPLY,
      partnerTurnAnswered: PARTNER_OPENER,
    };
    const shared = (text: string) =>
      text.split('\n').filter((line) => !line.includes('this one') && line.trim() !== '');

    const coachLines = shared(buildCoachTranscript(input)).filter(
      (line) => !line.startsWith('Return only')
    );
    const lappLines = shared(buildLappTranscript(input, RUBRIC)).filter(
      (line) => !RUBRIC.includes(line as (typeof RUBRIC)[number])
    );
    expect(coachLines).toEqual(lappLines);
  });
});

describe('precedingPartnerTurn', () => {
  const msg = (
    id: string,
    role: string,
    content: string,
    messageType: 'main' | 'aside' = 'main'
  ) => ({ id, role, content, messageType });

  it('returns the partner turn immediately before the coached message', () => {
    const messages = [
      msg('1', 'partner', PARTNER_OPENER),
      msg('2', 'user', USER_TURN),
      msg('3', 'partner', PARTNER_REPLY),
    ];
    expect(precedingPartnerTurn(messages, '2')).toBe(PARTNER_OPENER);
  });

  it('never returns the partner reply that followed the coached message', () => {
    const messages = [
      msg('1', 'user', 'I think the city should fund the bus line.'),
      msg('2', 'partner', 'Buses are a waste of money.'),
      msg('3', 'user', USER_TURN),
      msg('4', 'partner', PARTNER_REPLY),
    ];
    expect(precedingPartnerTurn(messages, '3')).toBe('Buses are a waste of money.');
  });

  it('skips coach asides between the partner turn and the reply to it', () => {
    const messages = [
      msg('1', 'partner', PARTNER_OPENER),
      msg('2', 'user', 'How should I answer that?', 'aside'),
      msg('3', 'coach', 'Try asking a question back.', 'aside'),
      msg('4', 'user', USER_TURN),
    ];
    expect(precedingPartnerTurn(messages, '4')).toBe(PARTNER_OPENER);
  });

  it('returns undefined when the participant opened the conversation', () => {
    const messages = [msg('1', 'user', USER_TURN), msg('2', 'partner', PARTNER_REPLY)];
    expect(precedingPartnerTurn(messages, '1')).toBe(undefined);
  });

  it('returns undefined on two participant turns in a row rather than reaching further back', () => {
    const messages = [
      msg('1', 'partner', PARTNER_OPENER),
      msg('2', 'user', 'One more thing.'),
      msg('3', 'user', USER_TURN),
    ];
    expect(precedingPartnerTurn(messages, '3')).toBe(undefined);
  });

  it('returns undefined when the message id is not in the transcript', () => {
    expect(precedingPartnerTurn([msg('1', 'partner', PARTNER_OPENER)], 'nope')).toBe(undefined);
  });

  it('matches ids across string and number storage', () => {
    const messages = [
      { id: 1, role: 'partner', content: PARTNER_OPENER },
      { id: 2, role: 'user', content: USER_TURN },
    ];
    expect(precedingPartnerTurn(messages, '2')).toBe(PARTNER_OPENER);
  });

  it('treats a blank partner turn as absent', () => {
    const messages = [msg('1', 'partner', '   '), msg('2', 'user', USER_TURN)];
    expect(precedingPartnerTurn(messages, '2')).toBe(undefined);
  });
});
