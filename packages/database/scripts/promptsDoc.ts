/**
 * Pure helpers for `pnpm prompts:pull` (see ./pullPrompts.ts).
 *
 * The four study persona prompts are authored in a shared Google Doc
 * ("Prompts and Testing v2"). This module turns that doc's markdown export
 * into the four `seed/prompts/*.txt` files. It never touches the network or
 * the filesystem, so every rule here is unit-tested in
 * src/__tests__/promptsDoc.test.ts.
 *
 * The splitter is deliberately strict: if the doc's headings are missing,
 * renamed, duplicated or reordered, or a section has no `ROLE:` line, it
 * throws a PromptsDocError naming the problem instead of guessing.
 */

import { competingLengthRules } from '../src/__tests__/competingLengthRules.js';

export const DEFAULT_PROMPTS_DOC_ID = '10Mp_1XCP0DgeDgL_ov88ToX3shsqD2E0o13XWUT5FOI';

export interface PromptSectionSpec {
  group: string;
  heading: string;
  file: string;
}

/** The four sections, in the order they must appear in the doc. */
export const PROMPT_SECTIONS: readonly PromptSectionSpec[] = [
  { group: 'No Apologies Right', heading: 'Male', file: 'maleMaga.txt' },
  { group: 'No Apologies Right', heading: 'Female', file: 'femaleMaga.txt' },
  { group: 'Leftward Progressiveness', heading: 'Male Left', file: 'maleProgressive.txt' },
  { group: 'Leftward Progressiveness', heading: 'Female Left', file: 'femaleProgressive.txt' },
];

export class PromptsDocError extends Error {
  override name = 'PromptsDocError';
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const SINGLE_QUOTES = /[‘’‚‛′]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;

/** Smart quotes/apostrophes to ASCII. Nothing else is transliterated. */
export function asciiQuotes(text: string): string {
  return text.replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"');
}

/** CRLF / CR to LF. */
export function unixLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

// Markdown's escapable characters: ASCII punctuation.
const MARKDOWN_ESCAPE = /\\([!-/:-@[-`{-~])/g;

/**
 * Strips the markdown syntax that the Docs export adds to one line of body
 * text: heading markers, bold/italic markers, backslash escapes, and the
 * trailing backslash the export uses for a manual line break.
 */
function stripMarkdownLine(line: string): string {
  let out = line.replace(/^#{1,6}\s+/, '');
  // Bold/italic markers made of unescaped `*` or `_` runs wrapping text,
  // e.g. `**ROLE:**`, `*emphasis*`, `__label__`. Escaped `\*` stays literal.
  out = out.replace(/(?<!\\)(\*{1,3}|_{1,3})(?=\S)(.+?)(?<=\S)(?<!\\)\1/g, '$2');
  out = out.replace(/\\$/, '');
  out = out.replace(MARKDOWN_ESCAPE, '$1');
  return out;
}

/**
 * Normalises one section body (markdown) into plain prompt text: markdown
 * stripped, smart quotes to ASCII, trailing spaces removed, 3+ blank lines
 * collapsed to 2 (i.e. at most two consecutive empty lines), outer blank
 * lines trimmed. Paragraph structure is otherwise kept as exported.
 */
export function normaliseBody(markdown: string, options: { markdown?: boolean } = {}): string {
  const strip = options.markdown === false ? (line: string) => line : stripMarkdownLine;
  const lines = unixLineEndings(markdown)
    .split('\n')
    .map((line) => asciiQuotes(strip(line)).replace(/[ \t]+$/, ''));
  return lines
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/^\n+|\n+$/g, '');
}

/**
 * The same text-level normalisation, for comparing an existing prompt (for
 * example the TypeScript constants) against a pulled one. It does not strip
 * markdown, because stored prompts are already plain text.
 */
export function normaliseStoredPrompt(text: string): string {
  return asciiQuotes(unixLineEndings(text))
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/^\n+|\n+$/g, '');
}

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

/** Heading text compared case-insensitively with markdown and spacing removed. */
function headingKey(text: string): string {
  return asciiQuotes(stripMarkdownLine(text)).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** One of the six known headings, found by name. */
interface KnownHeading {
  /** Index into KNOWN_HEADINGS (doc order). */
  order: number;
  lineIndex: number;
  /** `#` count, or 0 when the heading is a plain line (text export). */
  level: number;
}

/** Any other markdown heading, e.g. a trailing "# Testing" section. */
interface OtherHeading {
  text: string;
  lineIndex: number;
  level: number;
}

/**
 * The six headings in the order they must appear: group, its two
 * sub-headings, group, its two sub-headings.
 */
const KNOWN_HEADINGS: readonly { text: string; spec?: PromptSectionSpec }[] =
  PROMPT_SECTIONS.flatMap((spec, i) =>
    i === 0 || PROMPT_SECTIONS[i - 1].group !== spec.group
      ? [{ text: spec.group }, { text: spec.heading, spec }]
      : [{ text: spec.heading, spec }]
  );

/**
 * A line is a known heading when, after removing `#` markers, `**`/`__`
 * wrapping and surrounding spaces, it is exactly one of the six known
 * heading strings (case-insensitive). This accepts the markdown export
 * (`# Male`, `## Male`, `**Male**`) and the text export (`Male` on its own
 * line) alike.
 */
function classifyLines(lines: string[]): { known: KnownHeading[]; other: OtherHeading[] } {
  const known: KnownHeading[] = [];
  const other: OtherHeading[] = [];
  const keys = KNOWN_HEADINGS.map((h) => headingKey(h.text));
  lines.forEach((line, lineIndex) => {
    const marker = /^\s*(#{1,6})\s+/.exec(line);
    const level = marker ? marker[1].length : 0;
    const content = line
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/\s+#+\s*$/, '')
      .trim();
    const order = keys.indexOf(headingKey(content));
    if (order !== -1 && content !== '') {
      known.push({ order, lineIndex, level });
    } else if (marker) {
      const text = asciiQuotes(stripMarkdownLine(content)).replace(/\s+/g, ' ').trim();
      if (text) other.push({ text, lineIndex, level });
    }
  });
  return { known, other };
}

export interface SplitPrompt {
  file: string;
  group: string;
  heading: string;
  /** Normalised prompt text, starting at `ROLE:`, no trailing newline. */
  text: string;
  /** Non-empty lines between the sub-heading and `ROLE:` that were dropped. */
  droppedLinesBeforeRole: number;
}

export interface SplitResult {
  prompts: SplitPrompt[];
  /** Other markdown headings that ended a section or sit outside the prompts. */
  ignoredHeadings: string[];
}

/**
 * Splits the doc export into the four prompts. Throws PromptsDocError when
 * the six known headings are not each present exactly once, in order, or a
 * section has no `ROLE:` line.
 *
 * A section runs from its sub-heading to the next known heading, or to the
 * next other markdown heading at the same or a shallower level (a plain-line
 * sub-heading counts as the deepest level, so any `#` heading ends it). With
 * a text export, other headings have no markers and cannot be seen, so the
 * last section may run on past its real end: review the diff.
 *
 * `format: 'plain'` skips markdown stripping inside the prompt text, so a
 * literal `*` or `\` in a text export is kept.
 */
export function splitPromptsDoc(
  exported: string,
  options: { format?: 'markdown' | 'plain' } = {}
): SplitResult {
  const plain = options.format === 'plain';
  const lines = unixLineEndings(exported.replace(/^﻿/, '')).split('\n');
  const { known, other } = classifyLines(lines);

  const names = KNOWN_HEADINGS.map((h) => `"${h.text}"`);
  const found = known.map((h) => names[h.order]);
  KNOWN_HEADINGS.forEach((h, order) => {
    const count = known.filter((k) => k.order === order).length;
    if (count === 0) {
      throw new PromptsDocError(
        `Heading "${h.text}" not found (was it renamed?). Expected, in order: ${names.join(
          ', '
        )}. Found: ${found.join(', ') || '(none)'}.`
      );
    }
    if (count > 1) {
      throw new PromptsDocError(`Heading "${h.text}" appears ${count} times; expected once.`);
    }
  });
  if (known.some((h, i) => h.order !== i)) {
    throw new PromptsDocError(
      `Headings out of order. Expected: ${names.join(', ')}. Found: ${found.join(', ')}.`
    );
  }

  const inPrompt = new Set<number>();
  const prompts: SplitPrompt[] = [];
  known.forEach((heading, i) => {
    const spec = KNOWN_HEADINGS[heading.order].spec;
    if (!spec) return; // a group heading
    const level = heading.level === 0 ? 6 : heading.level;
    const nextKnown = known[i + 1]?.lineIndex ?? lines.length;
    const end = Math.min(
      nextKnown,
      other.find((o) => o.lineIndex > heading.lineIndex && o.level <= level)?.lineIndex ??
        lines.length
    );
    const body = lines.slice(heading.lineIndex + 1, end);
    const roleIndex = body.findIndex((line) => /^ROLE:/.test(stripMarkdownLine(line).trim()));
    if (roleIndex === -1) {
      throw new PromptsDocError(
        `Section "${spec.group} / ${spec.heading}" has no line starting with "ROLE:".`
      );
    }
    for (let x = heading.lineIndex + 1; x < end; x++) inPrompt.add(x);
    prompts.push({
      file: spec.file,
      group: spec.group,
      heading: spec.heading,
      text: normaliseBody(body.slice(roleIndex).join('\n'), { markdown: !plain }),
      droppedLinesBeforeRole: body.slice(0, roleIndex).filter((line) => line.trim() !== '').length,
    });
  });

  const ignoredHeadings = other.filter((o) => !inPrompt.has(o.lineIndex)).map((o) => o.text);
  return { prompts, ignoredHeadings };
}

/** True when the two texts differ only in whitespace (runs collapsed to one space). */
export function isWhitespaceOnlyChange(a: string, b: string): boolean {
  const collapse = (t: string) => t.replace(/\s+/g, ' ').trim();
  return collapse(a) === collapse(b);
}

// ---------------------------------------------------------------------------
// Advisories (reported, never auto-fixed)
// ---------------------------------------------------------------------------

export type AdvisoryKind = 'dash' | 'non-ascii' | 'length-rule';

export interface Advisory {
  kind: AdvisoryKind;
  /** 1-based line number within the prompt text. */
  line: number;
  message: string;
}

const NUMBER_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|single|couple|few)\b/i;

function codepoint(ch: string): string {
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Finds things a human should look at but the pull must not change:
 * em/en dashes, any other non-ASCII character, and sentence-count length
 * rules ("2-3 sentences"), which belong to the runtime policy rather than
 * the persona prompt.
 */
export function findAdvisories(text: string): Advisory[] {
  const advisories: Advisory[] = [];
  text.split('\n').forEach((lineText, i) => {
    const line = i + 1;
    for (const ch of new Set(lineText.match(/[\u0080-\u{10FFFF}]/gu) ?? [])) {
      if (ch === '—' || ch === '–') {
        const name = ch === '—' ? 'em dash' : 'en dash';
        advisories.push({ kind: 'dash', line, message: `${name} (${codepoint(ch)})` });
      } else {
        advisories.push({
          kind: 'non-ascii',
          line,
          message: `non-ASCII character ${codepoint(ch)} ${JSON.stringify(ch)}`,
        });
      }
    }
    for (const match of lineText.matchAll(/\bsentences?\b/gi)) {
      const start = Math.max(0, match.index - 40);
      const window = lineText.slice(start, match.index + match[0].length + 40);
      if (/\d/.test(window) || NUMBER_WORDS.test(window)) {
        advisories.push({
          kind: 'length-rule',
          line,
          message: `possible length rule: ${JSON.stringify(window.trim())}`,
        });
      }
    }
  });
  return advisories;
}

/**
 * Problems that would make src/__tests__/personaPrompts.test.ts fail, so the
 * pull refuses to write: em/en dashes, and a competing reply-length rule
 * (same detector as that test). Each entry is `file:line: reason`.
 */
export function findBlockers(file: string, text: string): string[] {
  const dashes = text
    .split('\n')
    .flatMap((line, i) =>
      /[\u2013\u2014]/.test(line) ? [`${file}:${i + 1}: em or en dash (use a plain hyphen)`] : []
    );
  const lengthRules = competingLengthRules(file, text).map(
    (hit) =>
      `${hit.slice(0, hit.indexOf(': '))}: competing reply-length rule (runtime policy owns length)`
  );
  return [...dashes, ...lengthRules];
}

// ---------------------------------------------------------------------------
// Unified diff (line-based, LCS; prompts are a few hundred lines)
// ---------------------------------------------------------------------------

type Op = { type: ' ' | '-' | '+'; text: string };

function diffOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: ' ', text: a[i++] });
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: '-', text: a[i++] });
    } else {
      ops.push({ type: '+', text: b[j++] });
    }
  }
  while (i < n) ops.push({ type: '-', text: a[i++] });
  while (j < m) ops.push({ type: '+', text: b[j++] });
  return ops;
}

/** Returns a unified diff, or '' when the texts are equal. */
export function unifiedDiff(
  oldText: string,
  newText: string,
  oldLabel: string,
  newLabel: string,
  context = 3
): string {
  if (oldText === newText) return '';
  const a = oldText === '' ? [] : oldText.split('\n');
  const b = newText === '' ? [] : newText.split('\n');
  const ops = diffOps(a, b);
  const out = [`--- ${oldLabel}`, `+++ ${newLabel}`];
  const changed = ops.map((op) => op.type !== ' ');
  let k = 0;
  while (k < ops.length) {
    if (!changed[k]) {
      k++;
      continue;
    }
    const start = Math.max(0, k - context);
    let end = k;
    // Extend the hunk while the next change is within 2*context lines.
    while (end < ops.length) {
      if (changed[end]) {
        end++;
        continue;
      }
      let next = end;
      while (next < ops.length && !changed[next]) next++;
      if (next < ops.length && next - end <= 2 * context) end = next;
      else break;
    }
    const stop = Math.min(ops.length, end + context);
    // Line numbers at hunk start.
    let oldLine = 1;
    let newLine = 1;
    for (let x = 0; x < start; x++) {
      if (ops[x].type !== '+') oldLine++;
      if (ops[x].type !== '-') newLine++;
    }
    const hunk = ops.slice(start, stop);
    const oldCount = hunk.filter((op) => op.type !== '+').length;
    const newCount = hunk.filter((op) => op.type !== '-').length;
    out.push(
      `@@ -${oldCount ? oldLine : oldLine - 1},${oldCount} +${newCount ? newLine : newLine - 1},${newCount} @@`
    );
    for (const op of hunk) out.push(`${op.type}${op.text}`);
    k = stop;
  }
  return `${out.join('\n')}\n`;
}

/** 1-based number of the first line that differs, or null when equal. */
export function firstDifferingLine(a: string, b: string): number | null {
  if (a === b) return null;
  const al = a.split('\n');
  const bl = b.split('\n');
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) return i + 1;
  }
  return null;
}
