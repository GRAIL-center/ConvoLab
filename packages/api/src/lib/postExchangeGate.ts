export interface PostExchangeGateInput {
  /** True when the partner sent a fixed opening message before the participant wrote. */
  partnerOpens: boolean;
  /** Participant main-thread turns including the one just sent; 1 on the first turn. */
  participantTurnCount: number;
}

/**
 * Whether the coach and the live LAPP scorer may run after this exchange.
 *
 * The rule used to be "not on the first exchange": the participant opens cold,
 * so there is nothing to react to yet and coaching their opening line would
 * shape the thing being measured before they have said anything of their own.
 *
 * When the partner opens, the participant's first turn is already a response,
 * so the coach and live scorer are eligible from turn 1. Decision 23 Sep 2026:
 * coach timing follows partnerOpens, no separate flag.
 */
export function shouldRunPostExchangeJobs({
  partnerOpens,
  participantTurnCount,
}: PostExchangeGateInput): boolean {
  return partnerOpens || participantTurnCount > 1;
}

/** The minimum shape of a persisted message this module needs to read. */
export interface GateMessage {
  // Every field is optional because the persisted message type is an untyped
  // Firestore record; a message missing a role is simply walked past.
  id?: string | number | null;
  role?: string | null;
  content?: string | null;
  messageType?: string | null;
}

/**
 * The main-thread partner turn the participant was replying to, i.e. the last
 * partner message BEFORE the participant message identified by `userMessageId`.
 *
 * The coach and the live scorer are asked to judge whether the participant
 * listened to and acknowledged their partner, so they need the turn that was
 * being answered. Without it the only partner line in their context is the
 * reply that came after, and an acknowledgement in that reply reads as the
 * participant's own (reported 3 Oct 2026: the participant raised grocery
 * prices, the partner said "Yeah I feel that", and the coach congratulated the
 * participant for acknowledging the partner's point about prices).
 *
 * Anchoring on `userMessageId` rather than "the last partner message" matters,
 * because by the time an exchange is coached the partner's reply to it is
 * already in `messages` and would otherwise be handed back as the turn the
 * participant answered.
 *
 * Asides are skipped: a coaching-arm participant may ask the coach a question
 * mid-exchange, and that is not part of the dialogue being judged. Two
 * participant turns in a row yield undefined rather than reaching further back,
 * so this never claims a turn was answered when it was not.
 */
export function precedingPartnerTurn(
  messages: readonly GateMessage[],
  userMessageId: string | number
): string | undefined {
  const index = messages.findIndex(
    (message) =>
      message.id !== undefined &&
      message.id !== null &&
      String(message.id) === String(userMessageId)
  );
  if (index < 0) return undefined;

  for (let i = index - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || (message.messageType ?? 'main') !== 'main') continue;
    if (message.role === 'user') return undefined;
    if (message.role === 'partner') {
      const content = typeof message.content === 'string' ? message.content.trim() : '';
      return content || undefined;
    }
  }
  return undefined;
}
