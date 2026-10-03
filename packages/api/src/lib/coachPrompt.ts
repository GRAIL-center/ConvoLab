/** Inputs the coach needs to see one exchange in order. */
export interface CoachTranscriptInput {
  turnNumber: number;
  /** The participant message being coached. */
  userMessage: string;
  /** The partner's reply to it, which arrives before the coach runs. */
  partnerMessage: string;
  /** The partner turn the participant was replying to, when it is known. */
  partnerTurnAnswered?: string;
}

/**
 * The single user message handed to the coach model.
 *
 * The coach is asked to judge whether the participant listened to and
 * acknowledged their partner, so the partner turn being answered has to be in
 * front of it. When that line was missing the only partner utterance in context
 * was the reply that came afterwards, and an acknowledgement there was read as
 * the participant's own (3 Oct 2026: the participant raised grocery prices, the
 * partner answered "Yeah I feel that", and the coach praised the participant
 * for acknowledging the partner's point about prices).
 *
 * Each line says both who spoke and where it sits relative to the message being
 * coached, because position alone is what the model got wrong.
 *
 * When the answered turn is unknown the line is omitted rather than replaced
 * with a claim that the participant opened: a missing turn is not evidence of
 * one, and a wrong assertion here is the failure being fixed.
 */
export function buildCoachTranscript(input: CoachTranscriptInput): string {
  const answered = input.partnerTurnAnswered?.trim();
  return [
    `Turn: ${input.turnNumber}`,
    ...(answered ? [`Partner said this first, and the user is replying to it: ${answered}`] : []),
    `User message (coach this one): ${input.userMessage}`,
    `Partner reply that came after, for context only: ${input.partnerMessage}`,
    'Return only the coaching insight text.',
  ].join('\n');
}
