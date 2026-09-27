import { createHash } from 'node:crypto';

/**
 * Content hashing for seeded reference data (scenarios and quota presets).
 *
 * Startup reconciliation (`reconcileReferenceData`) compares the hash of what
 * the repo would seed against the `contentHash` stored on the Firestore
 * document, and rewrites the document only when they differ. The hash must
 * therefore cover every field the seed writes, and nothing else: the
 * bookkeeping fields (`contentHash`, `seedVersion`, `seededAt`) and fields the
 * seed does not own (ids, `createdAt`, anything added by hand) stay out.
 *
 * The field lists are explicit rather than "every key of the seed object" so
 * the hash input is reviewable, and `computeContentHash` throws if a seeded
 * object carries a key that is not listed, so adding a new seeded field without
 * adding it here fails at seed time instead of silently never propagating.
 */

/** Every field a seeded scenario document is allowed to carry. */
export const SCENARIO_HASH_FIELDS = [
  'slug',
  'name',
  'description',
  'audience',
  'partnerPersona',
  'partnerSystemPrompt',
  'coachSystemPrompt',
  'partnerModel',
  'coachModel',
  'partnerUseWebSearch',
  'coachUseWebSearch',
  'isActive',
] as const;

/** Every field a seeded quota preset document is allowed to carry. */
export const QUOTA_PRESET_HASH_FIELDS = [
  'name',
  'label',
  'description',
  'quota',
  'isDefault',
  'sortOrder',
] as const;

/** Written by the seed alongside the content; never part of the hash. */
export const SEED_BOOKKEEPING_FIELDS = ['contentHash', 'seedVersion', 'seededAt'] as const;

/** JSON with object keys sorted at every depth, so key order cannot move the hash. */
function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * sha256 (hex) over the listed fields, in list order. A field the object does
 * not set hashes as null, so adding an optional field to the list later does
 * not change the hash of seeds that leave it unset.
 */
export function computeContentHash(
  doc: Record<string, unknown>,
  fields: readonly string[]
): string {
  const unlisted = Object.keys(doc).filter(
    (key) => !fields.includes(key) && !(SEED_BOOKKEEPING_FIELDS as readonly string[]).includes(key)
  );
  if (unlisted.length > 0) {
    throw new Error(
      `computeContentHash: seeded field(s) ${unlisted.join(', ')} are not in the hash field list. ` +
        'Add them to SCENARIO_HASH_FIELDS / QUOTA_PRESET_HASH_FIELDS in seed/referenceHash.ts.'
    );
  }
  const payload = canonicalJson(fields.map((field) => [field, doc[field] ?? null]));
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * The commit the running code was built from. Cloud Run gets `GIT_SHA` from
 * cloudbuild.yaml; `_TAG` is accepted for a manual run that exports it.
 */
export function currentSeedVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.GIT_SHA?.trim() || env._TAG?.trim() || 'unknown';
}

/** Length and sha256 of a string value: enough to see it changed, never its text. */
export interface StringDigest {
  length: number;
  sha256: string;
}

export interface FieldDiff {
  field: string;
  /**
   * `overwrite`: the seed writes this field, so the stored value is replaced.
   * `kept`: the seed leaves it unset and updates merge, so the stored value
   * survives (e.g. a hand-set `coachModel` on a scenario that seeds none).
   */
  effect: 'overwrite' | 'kept';
  /** Present only for string values (either side). Never the text itself. */
  old?: StringDigest | null;
  new?: StringDigest | null;
}

function digest(value: unknown): StringDigest | null {
  if (typeof value !== 'string') return null;
  return { length: value.length, sha256: createHash('sha256').update(value).digest('hex') };
}

/**
 * The hashed fields whose stored value differs from the seeded one. Field
 * names only, plus length and sha256 for string values, so it is safe to print
 * against production without leaking prompt text.
 */
export function diffSeededFields(
  stored: Record<string, unknown>,
  seeded: Record<string, unknown>,
  fields: readonly string[]
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of fields) {
    const before = stored[field];
    const after = seeded[field];
    if (canonicalJson(before) === canonicalJson(after)) continue;
    const diff: FieldDiff = {
      field,
      effect: after === undefined || after === null ? 'kept' : 'overwrite',
    };
    if (typeof before === 'string' || typeof after === 'string') {
      diff.old = digest(before);
      diff.new = digest(after);
    }
    diffs.push(diff);
  }
  return diffs;
}
