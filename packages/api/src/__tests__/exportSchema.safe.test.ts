import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the seam between the study flow and the transcript exporter.
 *
 * These live in different languages and different halves of the project, so
 * nothing connects them at compile time. That seam has already failed once:
 * the Qualtrics study flow landed on 10 Aug 2026 writing condition, arm label,
 * ideology and Prolific PID onto every session, and the exporter — last touched
 * 7 Aug — knew about none of it. An export would have produced transcripts with
 * no way to tell treatment from control and no way to reach the survey data,
 * and nobody would have found out until analysis.
 *
 * So: every study field the API writes must be either exported or consciously
 * excluded. Adding a field to study.ts and not deciding about it fails here.
 */

const REPO = resolve(import.meta.dirname, '../../../..');
const STUDY_ROUTER = resolve(REPO, 'packages/api/src/trpc/routers/study.ts');
// study.ts is not the only writer: the WebSocket layer stamps the conversation
// clock anchor onto the session too. Scanning only the router left that field
// unexported and invisible to this guard, which is the exact failure this file
// exists to prevent, so both writers are scanned.
const WS_CONVERSATION = resolve(REPO, 'packages/api/src/ws/conversation.ts');
const EXPORTER = resolve(REPO, 'scripts/export_transcripts_firestore.py');

/**
 * Fields the exporter must NOT carry, each with the reason. Excluding a field
 * has to be a decision someone wrote down, not an oversight.
 */
const DELIBERATELY_NOT_EXPORTED: Record<string, string> = {
  // A Prolific PID is a direct identifier and the IRB protocol forbids it in
  // the export. It leaves only as survey_join_key = sha256(salt + pid), which
  // is what the Qualtrics join uses.
  prolificPid: 'direct identifier; exported only as the salted survey_join_key',
  // "Study topic: Immigration (own topic)" — a display string assembled from
  // studyTopic and studyOwnTopic, both of which are exported on their own.
  customDescription: 'redundant display string; studyTopic and studyOwnTopic carry the content',
  // The per-session snapshot of the partner persona prompt, ~30k characters.
  // Exporting it would multiply the file size by roughly an order of magnitude
  // and repeat the same four documents across every transcript. The prompts are
  // versioned in git and hashed into the frozen-pipeline archive instead.
  customPartnerPrompt: 'persona prompt snapshot; versioned in git and hashed into the OSF archive',
  customCoachPrompt: 'coach prompt snapshot; versioned in git and hashed into the OSF archive',
};

/**
 * Every top-level key of the `createSession({ ... })` object literal in the
 * study router, i.e. everything the study flow stamps onto a session at
 * creation.
 *
 * This used to be a name pattern (`study*` plus two hand-listed exceptions),
 * which silently ignored any field not named that way. `qualtricsResponseId`
 * — the link to the pre-survey row — was written on 10 Aug 2026 and went
 * unexported and undocumented for six weeks because the pattern never saw it.
 * Reading the call site instead means a new field cannot hide behind its name.
 */
function fieldsWrittenAtSessionCreation(src: string): Set<string> {
  const call = 'createSession({';
  const start = src.indexOf(call);
  if (start === -1) throw new Error('createSession({ ... }) not found in the study router');
  let depth = 0;
  let end = -1;
  for (let i = start + call.length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('createSession({ ... }) is not brace-balanced');
  const block = src.slice(start, end);
  const fields = new Set<string>();
  // Top-level keys only: they sit at one fixed indent inside the literal, so a
  // nested object's keys (indented further) are not mistaken for session fields.
  for (const m of block.matchAll(/^ {6}(\w+)\s*:/gm)) fields.add(m[1]);
  return fields;
}

/** Session fields written by the study flow, across every file that writes them. */
function studyFieldsWrittenByApi(): Set<string> {
  const studySrc = readFileSync(STUDY_ROUTER, 'utf8');
  const fields = fieldsWrittenAtSessionCreation(studySrc);
  // Fields stamped later rather than at creation live in `updateSession({...})`
  // calls in both files (studyConversationStartedAt, studyRedirectedAt, ...).
  // Those are reliably `study`-prefixed, so the name pattern still earns its
  // keep for them.
  for (const src of [studySrc, readFileSync(WS_CONVERSATION, 'utf8')]) {
    for (const m of src.matchAll(/^\s*(study[A-Z]\w*|participantTurnCount)\s*:/gm)) {
      fields.add(m[1]);
    }
  }
  return fields;
}

/**
 * Firestore field names the exporter reads: the keys of its STUDY_FIELDS map,
 * plus anything it pulls directly with `s.get("field")` for the top level of
 * the record (status, userId, customPartnerPersona, ...). Counting only
 * STUDY_FIELDS would report a field as unexported when the exporter does in
 * fact carry it, just outside the study block.
 */
function fieldsReadByExporter(): Set<string> {
  const src = readFileSync(EXPORTER, 'utf8');
  const block = /STUDY_FIELDS\s*=\s*\{([\s\S]*?)\n\}/.exec(src);
  if (!block) throw new Error('STUDY_FIELDS not found in the exporter');
  const fields = new Set<string>();
  for (const m of block[1].matchAll(/"([A-Za-z]+)"\s*:/g)) fields.add(m[1]);
  for (const m of src.matchAll(/s\.get\(\s*["'](\w+)["']/g)) fields.add(m[1]);
  return fields;
}

/** Only the STUDY_FIELDS keys, for assertions about the study block itself. */
function studyBlockFields(): Set<string> {
  const src = readFileSync(EXPORTER, 'utf8');
  const block = /STUDY_FIELDS\s*=\s*\{([\s\S]*?)\n\}/.exec(src);
  if (!block) throw new Error('STUDY_FIELDS not found in the exporter');
  const fields = new Set<string>();
  for (const m of block[1].matchAll(/"([A-Za-z]+)"\s*:/g)) fields.add(m[1]);
  return fields;
}

describe('study field export coverage', () => {
  it('finds fields on both sides (guards against the regexes silently matching nothing)', () => {
    expect(studyFieldsWrittenByApi().size).toBeGreaterThan(5);
    expect(fieldsReadByExporter().size).toBeGreaterThan(5);
  });

  it('exports every study field the API writes, or excludes it on purpose', () => {
    const written = studyFieldsWrittenByApi();
    const exported = fieldsReadByExporter();
    const unaccounted = [...written].filter(
      (f) => !exported.has(f) && !(f in DELIBERATELY_NOT_EXPORTED)
    );
    expect(
      unaccounted,
      `the API writes ${unaccounted.join(', ')} but scripts/export_transcripts_firestore.py ` +
        'neither exports them nor lists them in DELIBERATELY_NOT_EXPORTED. Add them to ' +
        "STUDY_FIELDS, or record why they are excluded. Don't just delete this assertion: " +
        'an unexported arm or outcome field makes the RCT unanalysable.'
    ).toEqual([]);
  });

  it('never exports the raw Prolific PID', () => {
    expect(studyBlockFields().has('prolificPid')).toBe(false);
    const src = readFileSync(EXPORTER, 'utf8');
    // It may appear inside survey_join_key(), but never as an exported value.
    expect(src).not.toMatch(/"prolific_pid"\s*:/);
    expect(src).toContain('survey_join_key');
  });

  it('keeps the pre-survey link, which is how a transcript reaches the survey row', () => {
    // AppSessionID = session_id carries the app-to-post-survey join; this is the
    // app-to-PRE-survey join, and without it a transcript cannot reach the
    // pre-treatment measures except by going via the post-survey.
    expect(studyBlockFields().has('qualtricsResponseId')).toBe(true);
  });

  it('keeps the arm assignment, which is the field the analysis cannot do without', () => {
    const exported = studyBlockFields();
    expect(exported.has('studyCondition')).toBe(true);
    expect(exported.has('studySource')).toBe(true);
  });
});
