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
};

/** Session fields written by the study flow, read out of study.ts. */
function studyFieldsWrittenByApi(): Set<string> {
  const src = readFileSync(STUDY_ROUTER, 'utf8');
  const fields = new Set<string>();
  // Object-literal keys: `studyCondition: condition,` / `prolificPid: input.pid,`
  const re = /^\s*(study[A-Z]\w*|prolificPid|participantTurnCount)\s*:/gm;
  for (const m of src.matchAll(re)) fields.add(m[1]);
  return fields;
}

/** Firestore field names the exporter reads, from its STUDY_FIELDS map. */
function fieldsReadByExporter(): Set<string> {
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
      `study.ts writes ${unaccounted.join(', ')} but scripts/export_transcripts_firestore.py ` +
        'neither exports them nor lists them in DELIBERATELY_NOT_EXPORTED. Add them to ' +
        "STUDY_FIELDS, or record why they are excluded. Don't just delete this assertion: " +
        'an unexported arm or outcome field makes the RCT unanalysable.'
    ).toEqual([]);
  });

  it('never exports the raw Prolific PID', () => {
    expect(fieldsReadByExporter().has('prolificPid')).toBe(false);
    const src = readFileSync(EXPORTER, 'utf8');
    // It may appear inside survey_join_key(), but never as an exported value.
    expect(src).not.toMatch(/"prolific_pid"\s*:/);
    expect(src).toContain('survey_join_key');
  });

  it('keeps the arm assignment, which is the field the analysis cannot do without', () => {
    const exported = fieldsReadByExporter();
    expect(exported.has('studyCondition')).toBe(true);
    expect(exported.has('studySource')).toBe(true);
  });
});
