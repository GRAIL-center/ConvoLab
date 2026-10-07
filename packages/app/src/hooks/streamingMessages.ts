/**
 * Find and replace the in-flight bubble for one speaker.
 *
 * The partner and the coach used to stream strictly one after the other, so
 * "the last message" was always the one being streamed. Since the coach starts
 * as soon as the participant sends (6 Oct 2026), both can stream at once and
 * their deltas interleave; matching on the last message would then split the
 * partner's reply into fragments around the coach's bubble.
 */
export function lastStreamingIndex<T extends { role: string; isStreaming?: boolean }>(
  messages: readonly T[],
  role: string
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role && messages[i].isStreaming) return i;
  }
  return -1;
}

export function replaceAt<T>(messages: readonly T[], index: number, next: T): T[] {
  return [...messages.slice(0, index), next, ...messages.slice(index + 1)];
}

export function removeAt<T>(messages: readonly T[], index: number): T[] {
  return [...messages.slice(0, index), ...messages.slice(index + 1)];
}
