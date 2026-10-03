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

/** One exchange: the turn being judged, what it answered, and what followed. */
export interface ExchangeInput {
  turnNumber: number;
  /** The participant message being judged. */
  userMessage: string;
  /** The partner's reply to it, which arrives before either job runs. */
  partnerMessage: string;
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
    `Partner reply that came after, for context only: ${input.partnerMessage}`,
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
