/**
 * The exchange as the coach and the live LAPP scorer are shown it.
 *
 * Both judge whether the participant listened to and acknowledged their
 * partner, so the partner turn being answered has to be in front of them. When
 * that line was missing the only partner utterance in context was the reply
 * that came afterwards, and an acknowledgement there was read as the
 * participant's own (3 Oct 2026: the participant raised grocery prices, the
 * partner answered "Yeah I feel that", and the coach praised the participant
 * for acknowledging the partner's point about prices).
 *
 * The two builders share these lines on purpose. The failure was positional, so
 * if the coach and the scorer ever labelled the same exchange differently, one
 * of them would be judging a different conversation from the other.
 */

/**
 * One exchange: the turn being judged and what it answered.
 *
 * The partner's reply is not part of it. Both jobs start as soon as the
 * participant sends (6 Oct 2026), so that the coach's note appears while the
 * partner is still answering rather than after; the reply does not exist yet.
 */
export interface ExchangeInput {
  turnNumber: number;
  /** The participant message being judged. */
  userMessage: string;
  /** The partner turn the participant was replying to, when it is known. */
  partnerTurnAnswered?: string;
}

/**
 * Every line says both who spoke and where it sits relative to the message
 * being judged, because position alone is what the model got wrong.
 *
 * When the answered turn is unknown the line is omitted rather than replaced
 * with a claim that the participant opened: a missing turn is not evidence of
 * one, and a wrong assertion there is the failure being fixed.
 */
function exchangeLines(input: ExchangeInput, verb: 'coach' | 'score'): string[] {
  const answered = input.partnerTurnAnswered?.trim();
  return [
    `Turn: ${input.turnNumber}`,
    ...(answered ? [`Partner said this first, and the user is replying to it: ${answered}`] : []),
    `User message (${verb} this one): ${input.userMessage}`,
  ];
}

/** The single user message handed to the coach model. */
export function buildCoachTranscript(input: ExchangeInput): string {
  return [...exchangeLines(input, 'coach'), 'Return only the coaching insight text.'].join('\n');
}

/** The single user message handed to the live LAPP scorer, plus its rubric. */
export function buildLappTranscript(input: ExchangeInput, rubric: readonly string[]): string {
  return [...exchangeLines(input, 'score'), ...rubric].join('\n');
}

/** A persisted main-thread turn, as the aside transcript needs to read it. */
export interface AsideTurn {
  role?: string | null;
  content?: string | null;
  messageType?: string | null;
  asideThreadId?: string | null;
}

/**
 * The conversation as the coach sees it when the participant asks an aside.
 *
 * The aside context used to be sent as chat messages mapped
 * `role === 'user' ? 'user' : 'assistant'`. That is wrong twice over. Coach
 * insights persist with messageType 'main', so the coach's own earlier notes
 * and the partner's turns both arrived as `assistant`: asked "what did she mean
 * by that?", the coach could not tell its own words from the partner's. And the
 * participant's turns and the aside question both arrived as `user`, so what
 * was said to the partner looked the same as what was being asked of the coach.
 *
 * A coach is a third party to this dialogue, not one of its two speakers, so
 * the transcript goes in as one labelled block instead of being forced into
 * two chat roles.
 */
export function renderAsideTranscript(
  messages: readonly AsideTurn[],
  options: { excludeThreadId?: string } = {}
): string {
  const lines: string[] = [];
  let participantTurn = 0;
  for (const message of messages) {
    const isAside = (message.messageType ?? 'main') === 'aside';
    if (isAside && options.excludeThreadId && message.asideThreadId === options.excludeThreadId) {
      continue;
    }
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (!content) continue;
    if (isAside) {
      // Earlier private exchanges stay in sequence rather than in a block of
      // their own, because an aside usually points at the moment it was asked
      // ("what did she mean by that?"). They never advance the turn counter:
      // a private question is not something the partner heard.
      if (message.role === 'user') {
        lines.push(`Participant asked you privately: ${content}`);
      } else if (message.role === 'coach') {
        lines.push(`You answered privately: ${content}`);
      }
      continue;
    }
    if (message.role === 'user') {
      participantTurn += 1;
      lines.push(`Participant (turn ${participantTurn}): ${content}`);
    } else if (message.role === 'partner') {
      lines.push(`Partner: ${content}`);
    } else if (message.role === 'coach') {
      lines.push(`You, the coach, told the participant: ${content}`);
    }
  }
  return lines.join('\n\n');
}

/**
 * The single user message handed to the coach for an aside question.
 *
 * `currentThreadId` drops the question now being asked: it is persisted and
 * pushed onto the session before the context is built, so without this it would
 * appear once in the transcript and again as the question below it.
 */
export function buildAsideTranscript(
  messages: readonly AsideTurn[],
  question: string,
  currentThreadId?: string
): string {
  const transcript = renderAsideTranscript(messages, { excludeThreadId: currentThreadId });
  return [
    'The participant is practising a conversation with the partner below. You are their coach: you are not a speaker in it, and the partner cannot see you.',
    'Lines marked privately are between you and the participant alone. Everything else was said out loud in the conversation.',
    '',
    transcript
      ? `CONVERSATION SO FAR:\n\n${transcript}`
      : 'CONVERSATION SO FAR: the conversation has not started yet.',
    '',
    `[ASIDE QUESTION] The participant is asking you privately: ${question}`,
  ].join('\n');
}
