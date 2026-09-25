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
  role?: string | null;
  content?: string | null;
  messageType?: string | null;
}

/**
 * The partner's opening statement, i.e. the main-thread partner message that
 * comes BEFORE the participant has said anything.
 *
 * Order matters, which is why this walks the transcript instead of taking the
 * first partner message it can find. By the time a turn is scored the
 * partner's reply to that turn is already in `messages`, so "first partner
 * message" would hand back the reply itself on a session that has no opener,
 * and the coach would be told the partner opened with something it said in
 * response to the participant. Stopping at the first main user message makes
 * that impossible: if the participant spoke first, there is no opener.
 *
 * Asides are skipped. A coaching-arm participant may ask the coach a question
 * before writing anything to the partner, and that is not the start of the
 * conversation.
 */
export function openingPartnerMessage(messages: readonly GateMessage[]): string | undefined {
  for (const message of messages) {
    if ((message.messageType ?? 'main') !== 'main') continue;
    if (message.role === 'user') return undefined;
    if (message.role === 'partner') {
      const content = typeof message.content === 'string' ? message.content.trim() : '';
      return content || undefined;
    }
  }
  return undefined;
}
