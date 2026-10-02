// Shared detector for a competing reply-length rule in a prompt. Used by
// packages/api/src/__tests__/partnerReplyLength.safe.test.ts (final runtime
// prompts) and packages/database/src/__tests__/personaPrompts.test.ts (the
// persona .txt files), so both check with the same patterns.

// A competing length rule: "3-6 sentences", "4 to 6 sentences", "three to five
// sentences", or a paragraph count/size used as a length target.
const NUM_WORD = '(?:one|two|three|four|five|six|seven|eight)';
export const COMPETING_LENGTH_RULES: RegExp[] = [
  /\b\d\s*(?:-|to|–)\s*\d\s*sentences?\b/i,
  new RegExp(`\\b${NUM_WORD}\\s*(?:-|to|–)\\s*${NUM_WORD}\\s+sentences?\\b`, 'i'),
  new RegExp(
    `\\b(?:\\d+|${NUM_WORD}|a single|a couple of|a few|several|multiple|short|brief)` +
      `(?:\\s*(?:-|to|–|or)\\s*(?:\\d+|${NUM_WORD}))?\\s+(?:short\\s+|brief\\s+)?paragraphs?\\b`,
    'i'
  ),
  /\bparagraphs?\s+(?:long|max(?:imum)?|at most|or (?:less|fewer))\b/i,
];

export function competingLengthRules(label: string, text: string): string[] {
  return text
    .split('\n')
    .flatMap((line, i) =>
      COMPETING_LENGTH_RULES.some((re) => re.test(line))
        ? [`${label}:${i + 1}: ${line.trim()}`]
        : []
    );
}
