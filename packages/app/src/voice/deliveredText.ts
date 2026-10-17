/**
 * How much of the partner's reply the participant actually heard.
 *
 * Gemini's output transcription carries no word timings, so this is an
 * estimate: the share of the received audio that played, applied to the
 * transcript received so far, cut back to the last whole word. It is the
 * agreed method until the research team picks another; `playedMs` is stored
 * beside it so the estimate can be redone later.
 */
export function estimateDeliveredText(
  generatedText: string,
  playedMs: number,
  receivedMs: number
): string {
  const text = generatedText.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (receivedMs <= 0 || playedMs >= receivedMs) return text;
  if (playedMs <= 0) return '';

  const target = Math.floor(text.length * (playedMs / receivedMs));
  if (target >= text.length) return text;
  // A word counts as heard only once it has played to its end: cut at the
  // last space at or before the target, unless the target lands on a word end.
  if (text[target] === ' ') return text.slice(0, target).trim();
  const lastSpace = text.lastIndexOf(' ', target);
  return lastSpace <= 0 ? '' : text.slice(0, lastSpace).trim();
}
