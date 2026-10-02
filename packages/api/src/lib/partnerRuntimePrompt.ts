/**
 * Runtime instructions appended to every partner system prompt, after the
 * persona (and, for a study session, after buildStudyPrompt's study block).
 *
 * Moved out of ws/conversation.ts so the appended text can be tested without
 * loading the WebSocket handler (the policy text verbatim; the fact context now
 * carries the real date). conversation.ts is the only caller.
 */

/**
 * Runtime factual context, dated with the day the reply is generated. It said
 * "Today is August 6, 2026" as a literal until 25 Sep 2026, so every session
 * after that day told the model the wrong date. The date is rendered in UTC so
 * the text does not depend on the server's time zone.
 */
export function buildFactContext(now: Date = new Date()): string {
  const today = now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `
Runtime factual context:
- Today is ${today}.
- The current U.S. president is Donald J. Trump, sworn in on January 20, 2025.
- For current-events or "right now" factual questions, use web search/grounding when available and let current evidence override stale model memory.
- Do not claim Joe Biden is the current U.S. president unless current search evidence explicitly says that.
`;
}

/**
 * Reply-length policy for every partner turn.
 *
 * This lives here, not in the persona prompts, for two reasons. It applies
 * identically to all personas by construction, so a left/right verbosity gap
 * cannot creep back in when one side's persona is revised and the other's is
 * not — partner ideology is a randomised factor, and a systematic verbosity
 * difference between the arms would be indistinguishable from an ideology
 * effect. And it ships with a deploy rather than needing a re-seed, so changing
 * it does not depend on remembering a second step.
 *
 * It is appended last, after the persona, so it wins over any length guidance
 * a supplied persona document carries — and it says so explicitly rather than
 * leaving the model to reconcile two rules.
 *
 * The 1-3 sentence target was measured, not guessed: 97 real pilot turns had a
 * median of 53 words with half of all replies inside a narrow 40-66 word band,
 * which read as both too long and too scripted.
 *
 * The words-per-sentence and words-per-reply lines were added after a second
 * measurement on 26 Sep 2026 over 36 real sessions: 3-sentence replies ran 55
 * to 70 words, about 20 to 23 words per sentence, so the sentence rule was met
 * while replies still read long. Spoken conversation runs 10 to 15 words per
 * sentence.
 */
export const PARTNER_RESPONSE_POLICY = `RESPONSE LENGTH:
- Vary how long your replies are. Replies that are all the same size read as scripted, and that matters more than any single reply being well-argued.
- Most replies should be 1-3 sentences. A single line is often the strongest answer.
- Keep sentences short, usually under 15 words. Talk the way people talk, not the way essays read.
- Most replies should be under 40 words in total. Never go past 60.
- Use 4 sentences only when you are directly challenged, correcting a misreading, or the point genuinely needs it. Do not go past 4.
- Do not make every point you could make in one turn. Leave something for the next one.
- Short does not mean shallow, and it does not mean backing down.
- This supersedes any length guidance earlier in your instructions, including any "3-6 sentences" rule. Where they disagree, follow this.

Do not ask follow-up questions.`;

/**
 * The final partner system prompt: whatever the session carries (a scenario's
 * partnerSystemPrompt, or a study session's customPartnerPrompt from
 * buildStudyPrompt) with the fact context and the response-length policy last.
 */
export function buildPartnerSystemPrompt(basePrompt: string, now: Date = new Date()): string {
  return `${basePrompt}\n\n${buildFactContext(now)}\n${PARTNER_RESPONSE_POLICY}`;
}
