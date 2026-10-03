import { describe, expect, it } from 'vitest';
import {
  buildAsideTranscript,
  buildCoachTranscript,
  buildLappTranscript,
} from '../lib/exchangePrompts.js';
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

describe('buildAsideTranscript', () => {
  const main = (role: string, content: string) => ({ role, content, messageType: 'main' });
  const aside = (role: string, content: string, asideThreadId: string) => ({
    role,
    content,
    messageType: 'aside',
    asideThreadId,
  });

  const CONVERSATION = [
    main('partner', PARTNER_OPENER),
    main('user', USER_TURN),
    main('partner', PARTNER_REPLY),
    main('coach', 'Try asking what led them to that view.'),
  ];

  it('attributes the partner and the coach to different speakers', () => {
    const transcript = buildAsideTranscript(CONVERSATION, 'what did she mean by that?');

    const partnerLine = transcript.split('\n').find((line) => line.includes(PARTNER_REPLY));
    const coachLine = transcript
      .split('\n')
      .find((line) => line.includes('Try asking what led them'));

    expect(partnerLine).toMatch(/^Partner:/);
    expect(coachLine).toMatch(/^You, the coach/);
    expect(partnerLine).not.toEqual(coachLine);
  });

  it('separates what the participant said to the partner from what they ask the coach', () => {
    const transcript = buildAsideTranscript(CONVERSATION, 'how should I respond?');

    expect(transcript).toMatch(/Participant \(turn 1\): /);
    expect(transcript.split('\n').find((line) => line.includes(USER_TURN))).toMatch(
      /^Participant \(turn 1\)/
    );
    expect(transcript).toContain('[ASIDE QUESTION]');
    expect(transcript.indexOf(USER_TURN)).toBeLessThan(transcript.indexOf('[ASIDE QUESTION]'));
  });

  it('numbers participant turns in order', () => {
    const transcript = buildAsideTranscript(
      [...CONVERSATION, main('user', 'Second thing I said.')],
      'q'
    );
    expect(transcript).toMatch(/Participant \(turn 2\): Second thing I said\./);
  });

  it('keeps earlier asides, marked as private and distinct from spoken turns', () => {
    const transcript = buildAsideTranscript(
      [
        ...CONVERSATION,
        aside('user', 'An earlier private question.', 't1'),
        aside('coach', 'An earlier private answer.', 't1'),
      ],
      'and how should I respond?',
      't2'
    );

    expect(transcript).toMatch(/Participant asked you privately: An earlier private question\./);
    expect(transcript).toMatch(/You answered privately: An earlier private answer\./);
  });

  it('keeps asides in sequence with the turns they followed', () => {
    const transcript = buildAsideTranscript(
      [
        main('partner', PARTNER_OPENER),
        aside('user', 'What did she mean by that?', 't1'),
        aside('coach', 'She is testing the water.', 't1'),
        main('user', USER_TURN),
      ],
      'next question',
      't2'
    );

    expect(transcript.indexOf(PARTNER_OPENER)).toBeLessThan(
      transcript.indexOf('What did she mean by that?')
    );
    expect(transcript.indexOf('She is testing the water.')).toBeLessThan(
      transcript.indexOf(USER_TURN)
    );
  });

  it('does not repeat the question being asked now', () => {
    const question = 'how should I respond?';
    const transcript = buildAsideTranscript(
      [...CONVERSATION, aside('user', question, 't9')],
      question,
      't9'
    );

    expect(transcript.split(question).length - 1).toBe(1);
    expect(transcript).not.toMatch(/Participant asked you privately: how should I respond\?/);
  });

  it('does not count private questions as spoken turns', () => {
    const transcript = buildAsideTranscript(
      [
        main('user', USER_TURN),
        aside('user', 'A private question.', 't1'),
        aside('coach', 'A private answer.', 't1'),
        main('user', 'Second thing I said out loud.'),
      ],
      'q',
      't2'
    );

    expect(transcript).toMatch(/Participant \(turn 2\): Second thing I said out loud\./);
    expect(transcript).not.toMatch(/Participant \(turn 3\)/);
  });

  it('tells the coach which lines were private', () => {
    expect(buildAsideTranscript(CONVERSATION, 'q', 't1')).toMatch(/said out loud/);
  });

  it('tells the coach it is not a speaker in the conversation', () => {
    expect(buildAsideTranscript(CONVERSATION, 'q')).toMatch(/not a speaker/);
  });

  it('says so plainly when nothing has been said yet', () => {
    const transcript = buildAsideTranscript([], 'what should I open with?');
    expect(transcript).toMatch(/has not started yet/);
    expect(transcript).toContain('what should I open with?');
  });

  it('skips blank turns rather than emitting an empty speaker line', () => {
    const transcript = buildAsideTranscript([main('partner', '   '), main('user', USER_TURN)], 'q');
    expect(transcript).not.toMatch(/Partner:\s*$/m);
    expect(transcript).toMatch(/Participant \(turn 1\)/);
  });
});
