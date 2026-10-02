import { describe, expect, it } from 'vitest';
import {
  findAdvisories,
  findBlockers,
  isWhitespaceOnlyChange,
  normaliseBody,
  PROMPT_SECTIONS,
  PromptsDocError,
  splitPromptsDoc,
  unifiedDiff,
} from '../../scripts/promptsDoc.js';
import {
  FEMALE_MAGA_PROMPT,
  FEMALE_PROGRESSIVE_PROMPT,
  MALE_MAGA_PROMPT,
  MALE_PROGRESSIVE_PROMPT,
} from '../../seed/prompts/personaPrompts.js';

// Mimics Google Docs' text/markdown export: title paragraph, ATX headings,
// bold labels, backslash escapes, smart quotes, CRLF, trailing spaces, runs
// of blank lines, a stray length rule, and a non-persona section at the end.
const EXPORT = [
  '# Prompts and Testing v2',
  '',
  'Working notes for the team.',
  '',
  '# No Apologies Right',
  '',
  '## Male',
  '',
  '**ROLE:**  ',
  '',
  'You are Mark’s “persona” \\- a voter.',
  '',
  '',
  '',
  '',
  'Use \\*asterisks\\*, snake\\_case and 1\\. numbering literally.',
  'Keep replies to 2\\-3 sentences.',
  '',
  '## Female',
  '',
  'Draft v3 (do not copy this line)',
  '',
  'ROLE:',
  '',
  'You are Megan — a voter from Montréal.\r',
  '',
  '# Leftward Progressiveness',
  '',
  '## Male Left',
  '',
  'ROLE:',
  '',
  'You are Mark, a progressive.',
  '',
  '### A deeper heading kept as text',
  '',
  'More __bold__ and *italic* words.',
  '',
  '## Female Left',
  '',
  'ROLE:',
  '',
  'You are Megan, a progressive.',
  '',
  '# Testing',
  '',
  'Test transcripts that must not reach a prompt.',
  '',
].join('\r\n');

const byFile = (markdown: string) =>
  Object.fromEntries(splitPromptsDoc(markdown).prompts.map((p) => [p.file, p]));

describe('splitPromptsDoc', () => {
  it('maps the four sections to their files in doc order', () => {
    const { prompts } = splitPromptsDoc(EXPORT);
    expect(prompts.map((p) => [p.group, p.heading, p.file])).toEqual(
      PROMPT_SECTIONS.map((s) => [s.group, s.heading, s.file])
    );
  });

  it('starts each prompt at ROLE: and stops at the next heading of its level', () => {
    const prompts = byFile(EXPORT);
    for (const p of Object.values(prompts)) expect(p.text.startsWith('ROLE:')).toBe(true);
    expect(prompts['femaleProgressive.txt'].text).toBe('ROLE:\n\nYou are Megan, a progressive.');
    expect(prompts['maleProgressive.txt'].text).toBe(
      'ROLE:\n\nYou are Mark, a progressive.\n\nA deeper heading kept as text\n\nMore bold and italic words.'
    );
  });

  it('reports lines dropped before ROLE: and non-persona top-level headings', () => {
    const result = splitPromptsDoc(EXPORT);
    expect(result.prompts.find((p) => p.file === 'femaleMaga.txt')?.droppedLinesBeforeRole).toBe(1);
    expect(result.ignoredHeadings).toEqual(['Prompts and Testing v2', 'Testing']);
    const all = result.prompts.map((p) => p.text).join('\n');
    expect(all).not.toContain('Test transcripts');
    expect(all).not.toContain('Draft v3');
  });

  it('normalises escapes, bold, smart quotes, CRLF, trailing spaces and blank runs', () => {
    expect(byFile(EXPORT)['maleMaga.txt'].text).toBe(
      [
        'ROLE:',
        '',
        'You are Mark\'s "persona" - a voter.',
        '',
        '',
        'Use *asterisks*, snake_case and 1. numbering literally.',
        'Keep replies to 2-3 sentences.',
      ].join('\n')
    );
  });

  it('keeps dashes and other non-ASCII characters unchanged', () => {
    expect(byFile(EXPORT)['femaleMaga.txt'].text).toBe(
      'ROLE:\n\nYou are Megan — a voter from Montréal.'
    );
  });

  it('matches headings case- and space-insensitively but not renamed', () => {
    expect(() => splitPromptsDoc(EXPORT.replace('## Male Left', '##   male   LEFT'))).not.toThrow();
  });

  it('refuses a renamed sub-heading', () => {
    expect(() =>
      splitPromptsDoc(EXPORT.replace('## Female Left', '## Female Progressive'))
    ).toThrow(
      /Heading "Female Left" not found \(was it renamed\?\)/
    );
  });

  it('refuses a missing group heading', () => {
    const missing = EXPORT.replace('# No Apologies Right', '# No Apologies');
    expect(() => splitPromptsDoc(missing)).toThrow(PromptsDocError);
    expect(() => splitPromptsDoc(missing)).toThrow(/Heading "No Apologies Right" not found/);
  });

  it('refuses a missing sub-heading', () => {
    expect(() => splitPromptsDoc(EXPORT.replace('## Female\r\n', ''))).toThrow(
      /Heading "Female" not found/
    );
  });

  it('refuses a section without ROLE:', () => {
    const noRole = EXPORT.replace('ROLE:\r\n\r\nYou are Megan, a progressive.', 'You are Megan.');
    expect(() => splitPromptsDoc(noRole)).toThrow(
      /Section "Leftward Progressiveness \/ Female Left" has no line starting with "ROLE:"/
    );
  });

  it('refuses duplicated or reordered groups', () => {
    expect(() => splitPromptsDoc(`${EXPORT}\r\n# No Apologies Right\r\n`)).toThrow(
      /appears 2 times/
    );
    const [head, rest] = EXPORT.split('# No Apologies Right');
    const [right, left] = rest.split('# Leftward Progressiveness');
    const [leftBody, testing] = left.split('# Testing');
    const swapped = `${head}# Leftward Progressiveness${leftBody}# No Apologies Right${right}# Testing${testing}`;
    expect(() => splitPromptsDoc(swapped)).toThrow(/Headings out of order/);
  });

  it('accepts every heading at one level, as the live export has, ended by another heading', () => {
    const flat = [
      '# No Apologies Right  ',
      '# Male  ',
      'ROLE:',
      'a',
      '# Female  ',
      'ROLE:',
      'b',
      '# Leftward Progressiveness',
      '# Male Left',
      'ROLE:',
      'c',
      '# Female Left',
      'ROLE:',
      'd',
      '# Testing',
      'not a prompt',
    ].join('\n');
    const result = splitPromptsDoc(flat);
    expect(result.prompts.map((p) => p.text)).toEqual(['ROLE:\na', 'ROLE:\nb', 'ROLE:\nc', 'ROLE:\nd']);
    expect(result.ignoredHeadings).toEqual(['Testing']);
  });

  it('accepts bold and plain-line headings', () => {
    const mixed = [
      '**No Apologies Right**',
      'Male',
      'ROLE:',
      'a',
      '  female  ',
      'ROLE:',
      'b',
      '## **Leftward Progressiveness**',
      '__Male Left__',
      'ROLE:',
      'c',
      'Female Left',
      'ROLE:',
      'd',
    ].join('\n');
    expect(splitPromptsDoc(mixed).prompts.map((p) => [p.file, p.text])).toEqual([
      ['maleMaga.txt', 'ROLE:\na'],
      ['femaleMaga.txt', 'ROLE:\nb'],
      ['maleProgressive.txt', 'ROLE:\nc'],
      ['femaleProgressive.txt', 'ROLE:\nd'],
    ]);
  });

  it('refuses a heading line repeated inside a prompt rather than guessing', () => {
    const repeated = EXPORT.replace('You are Mark, a progressive.', 'You are Mark.\r\n\r\nMale');
    expect(() => splitPromptsDoc(repeated)).toThrow(/Heading "Male" appears 2 times/);
  });

  it('splits the text/plain export by exact heading names', () => {
    const plain = EXPORT.replace(/^#+ /gm, '')
      .replace(/\*\*ROLE:\*\*/, 'ROLE:')
      .replace(/\\/g, '')
      .split('Testing\r\n')[0];
    const prompts = Object.fromEntries(
      splitPromptsDoc(plain, { format: 'plain' }).prompts.map((p) => [p.file, p.text])
    );
    expect(prompts['femaleProgressive.txt']).toBe('ROLE:\n\nYou are Megan, a progressive.');
    expect(prompts['maleMaga.txt']).toContain('Use *asterisks*, snake_case');
  });

  it.each([
    ['maleMaga.txt', MALE_MAGA_PROMPT],
    ['femaleMaga.txt', FEMALE_MAGA_PROMPT],
    ['maleProgressive.txt', MALE_PROGRESSIVE_PROMPT],
    ['femaleProgressive.txt', FEMALE_PROGRESSIVE_PROMPT],
  ])('round-trips the current %s text through the splitter unchanged', (file, current) => {
    const doc = PROMPT_SECTIONS.map((s, i) => {
      const groupHeading = i === 0 || PROMPT_SECTIONS[i - 1].group !== s.group;
      const body = s.file === file ? current : 'ROLE:\n\nplaceholder';
      return `${groupHeading ? `# ${s.group}\n\n` : ''}## ${s.heading}\n\n${body}\n`;
    }).join('\n');
    expect(byFile(doc)[file].text).toBe(current);
  });
});

describe('isWhitespaceOnlyChange', () => {
  it('ignores line wrapping and spacing but not wording', () => {
    expect(isWhitespaceOnlyChange('a long\nline  here.\n\nNext', 'a long line here.\nNext')).toBe(
      true
    );
    expect(isWhitespaceOnlyChange('a long line', 'a longer line')).toBe(false);
    expect(isWhitespaceOnlyChange('ab', 'a b')).toBe(false);
  });
});

describe('normaliseBody', () => {
  it('collapses 3+ blank lines to 2 and trims outer blank lines', () => {
    expect(normaliseBody('\n\na\n\n\n\n\n\nb\n\n')).toBe('a\n\n\nb');
    expect(normaliseBody('a\n\n\nb')).toBe('a\n\n\nb');
  });

  it('leaves text alone when markdown stripping is off', () => {
    expect(normaliseBody('**x** \\* y  ', { markdown: false })).toBe('**x** \\* y');
  });
});

describe('findAdvisories', () => {
  it('reports dashes, other non-ASCII, and sentence-count rules with line numbers', () => {
    const text = [
      'ROLE:',
      'An em — dash and an en – dash.',
      'Café with nbsp.',
      'Reply in 2-3 sentences.',
      'Use one or two sentences at most.',
      'Complete sentences are fine.',
    ].join('\n');
    const found = findAdvisories(text).map((a) => [a.kind, a.line]);
    expect(found).toEqual([
      ['dash', 2],
      ['dash', 2],
      ['non-ascii', 3],
      ['non-ascii', 3],
      ['length-rule', 4],
      ['length-rule', 5],
    ]);
  });

  it('flags the stray length rule in the fixture export', () => {
    const maleMaga = byFile(EXPORT)['maleMaga.txt'];
    expect(findAdvisories(maleMaga.text)).toEqual([
      expect.objectContaining({ kind: 'length-rule', line: 7 }),
    ]);
  });

  it('finds nothing to review in the current prompts', () => {
    for (const prompt of [
      MALE_MAGA_PROMPT,
      FEMALE_MAGA_PROMPT,
      MALE_PROGRESSIVE_PROMPT,
      FEMALE_PROGRESSIVE_PROMPT,
    ]) {
      expect(findAdvisories(prompt).filter((a) => a.kind !== 'length-rule')).toEqual([]);
    }
  });
});

describe('findBlockers', () => {
  it('blocks dashes and competing length rules with file:line', () => {
    const text = ['ROLE:', 'A dash \u2014 here.', 'Reply in 2-3 sentences.', 'Fine line.'].join(
      '\n'
    );
    expect(findBlockers('maleMaga.txt', text)).toEqual([
      'maleMaga.txt:2: em or en dash (use a plain hyphen)',
      'maleMaga.txt:3: competing reply-length rule (runtime policy owns length)',
    ]);
  });

  it('blocks the fixture export (dash in femaleMaga, length rule in maleMaga)', () => {
    const blockers = splitPromptsDoc(EXPORT).prompts.flatMap((p) => findBlockers(p.file, p.text));
    expect(blockers).toEqual([
      'maleMaga.txt:7: competing reply-length rule (runtime policy owns length)',
      'femaleMaga.txt:3: em or en dash (use a plain hyphen)',
    ]);
  });

  it('passes the current prompts', () => {
    for (const prompt of [
      MALE_MAGA_PROMPT,
      FEMALE_MAGA_PROMPT,
      MALE_PROGRESSIVE_PROMPT,
      FEMALE_PROGRESSIVE_PROMPT,
    ]) {
      expect(findBlockers('x.txt', prompt)).toEqual([]);
    }
  });
});

describe('unifiedDiff', () => {
  it('is empty for equal text', () => {
    expect(unifiedDiff('a\nb', 'a\nb', 'a/x', 'b/x')).toBe('');
  });

  it('produces a unified hunk with context', () => {
    const diff = unifiedDiff('1\n2\n3\n4\n5', '1\n2\nthree\n4\n5\n6', 'a/x', 'b/x', 1);
    expect(diff).toBe(
      ['--- a/x', '+++ b/x', '@@ -2,4 +2,5 @@', ' 2', '-3', '+three', ' 4', ' 5', '+6', ''].join(
        '\n'
      )
    );
  });

  it('diffs against an empty (new) file', () => {
    expect(unifiedDiff('', 'a\nb', '/dev/null', 'b/x')).toBe(
      '--- /dev/null\n+++ b/x\n@@ -0,0 +1,2 @@\n+a\n+b\n'
    );
  });
});
