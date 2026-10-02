/**
 * `pnpm prompts:pull` — pull the four study persona prompts from the shared
 * Google Doc into packages/database/seed/prompts/*.txt.
 *
 *   pnpm prompts:pull            write changed files, print their diffs
 *   pnpm prompts:pull --dry-run  print diffs, write nothing
 *   pnpm prompts:pull --check    write nothing; exit 1 if anything would change
 *   --from-file <path>           read a downloaded export instead of the Drive API
 *                                (File > Download > Markdown, or any text export)
 *
 * Auth (no token is ever stored in the repo):
 *   - GOOGLE_DOC_ACCESS_TOKEN, if set, is used as the OAuth bearer token.
 *   - Otherwise Application Default Credentials with the drive.readonly scope.
 *     One-time sign-in, with the Google account the doc is shared with:
 *       gcloud auth application-default login \
 *         --scopes=https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/cloud-platform
 *   - GOOGLE_DOC_QUOTA_PROJECT (optional) is sent as x-goog-user-project.
 *
 * PROMPTS_DOC_ID overrides the doc id. See docs/prompts-workflow.md.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GoogleAuth } from 'google-auth-library';
import {
  DEFAULT_PROMPTS_DOC_ID,
  findAdvisories,
  findBlockers,
  isWhitespaceOnlyChange,
  PromptsDocError,
  type SplitResult,
  splitPromptsDoc,
  unifiedDiff,
} from './promptsDoc.js';

export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');
export const PROMPTS_DIR = join(PACKAGE_ROOT, 'seed/prompts');
const MANIFEST_PATH = join(PROMPTS_DIR, 'PROMPTS_SOURCE.json');

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = process.env.GOOGLE_DOC_ACCESS_TOKEN?.trim();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else {
    const client = await new GoogleAuth({ scopes: [DRIVE_READONLY_SCOPE] }).getClient();
    const fromAdc = await client.getRequestHeaders();
    fromAdc.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
  }
  const quotaProject = process.env.GOOGLE_DOC_QUOTA_PROJECT?.trim();
  if (quotaProject) headers['x-goog-user-project'] = quotaProject;
  return headers;
}

async function driveGet(url: string, headers: Record<string, string>): Promise<Response> {
  const response = await fetch(url, { headers });
  if (response.ok) return response;
  const body = await response.text();
  let detail = body.slice(0, 300);
  try {
    detail = JSON.parse(body).error?.message ?? detail;
  } catch {
    // not JSON; keep the raw prefix
  }
  throw new HttpError(response.status, `Drive API ${response.status}: ${detail}`);
}

export interface FetchedDoc {
  docId: string;
  title: string;
  modifiedTime: string;
  format: 'markdown' | 'plain';
  text: string;
}

export async function fetchPromptsDoc(docId: string): Promise<FetchedDoc> {
  const headers = await authHeaders();
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(docId)}`;
  const meta = (await (
    await driveGet(`${base}?fields=modifiedTime,name&supportsAllDrives=true`, headers)
  ).json()) as { name: string; modifiedTime: string };

  const exportUrl = (mime: string) => `${base}/export?mimeType=${encodeURIComponent(mime)}`;
  let format: FetchedDoc['format'] = 'markdown';
  let text: string;
  try {
    text = await (await driveGet(exportUrl('text/markdown'), headers)).text();
  } catch (error) {
    // 400 = export format rejected. Auth/sharing errors are not retried.
    if (!(error instanceof HttpError) || error.status !== 400) throw error;
    console.warn(`Markdown export rejected (${error.message}); falling back to text/plain.`);
    format = 'plain';
    text = await (await driveGet(exportUrl('text/plain'), headers)).text();
  }
  return { docId, title: meta.name, modifiedTime: meta.modifiedTime, format, text };
}

const sha256 = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');

/** Where the text came from, as recorded in PROMPTS_SOURCE.json. */
type SourceRecord =
  | { source: 'drive'; docId: string; title: string; modifiedTime: string }
  | { source: 'file'; file: string; fileSha256: string };

type Manifest = SourceRecord & {
  pulledAt: string;
  files: Record<string, { sha256: string }>;
};

function readManifest(): Manifest | null {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

/** The manifest minus pulledAt, to decide whether it needs rewriting. */
function manifestKey(manifest: Partial<Manifest> | null): string {
  if (!manifest) return '';
  const { pulledAt: _pulledAt, ...rest } = manifest;
  return JSON.stringify(rest);
}

export function reportSplit(split: SplitResult): void {
  if (split.ignoredHeadings.length > 0) {
    console.log(`Ignored other headings: ${split.ignoredHeadings.join(', ')}`);
  }
  for (const prompt of split.prompts) {
    if (prompt.droppedLinesBeforeRole > 0) {
      console.log(
        `NOTE ${prompt.file}: dropped ${prompt.droppedLinesBeforeRole} non-empty line(s) between "${prompt.heading}" and ROLE:`
      );
    }
    // Dashes are blockers (see findBlockers), not just review items.
    for (const advisory of findAdvisories(prompt.text).filter((a) => a.kind !== 'dash')) {
      console.log(`REVIEW ${prompt.file}:${advisory.line} [${advisory.kind}] ${advisory.message}`);
    }
  }
}

interface Options {
  check: boolean;
  dryRun: boolean;
  fromFile: string | null;
}

function parseArgs(argv: string[]): Options | string {
  const options: Options = { check: false, dryRun: false, fromFile: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--check') options.check = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--from-file' || arg.startsWith('--from-file=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      if (!value) return '--from-file needs a path.';
      options.fromFile = value;
    } else return `Unknown argument: ${arg}. Use --from-file <path>, --check or --dry-run.`;
  }
  return options;
}

async function loadSource(
  options: Options
): Promise<{ text: string; format: 'markdown' | 'plain'; record: SourceRecord }> {
  if (options.fromFile) {
    // pnpm runs this script from packages/database; resolve relative paths
    // against the directory the user ran `pnpm prompts:pull` from.
    const path = resolve(process.env.INIT_CWD ?? process.cwd(), options.fromFile);
    const raw = readFileSync(path);
    const format = /\.(md|markdown)$/i.test(path) ? 'markdown' : 'plain';
    console.log(`File ${path} (${format}), sha256 ${sha256(raw)}`);
    return {
      text: raw.toString('utf8'),
      format,
      record: { source: 'file', file: basename(path), fileSha256: sha256(raw) },
    };
  }
  const docId = process.env.PROMPTS_DOC_ID?.trim() || DEFAULT_PROMPTS_DOC_ID;
  const doc = await fetchPromptsDoc(docId);
  console.log(`Doc "${doc.title}" (${doc.docId}), modifiedTime ${doc.modifiedTime}`);
  if (doc.format === 'plain') {
    console.warn('WARNING: plain-text export; review the end of the last prompt closely.');
  }
  return {
    text: doc.text,
    format: doc.format,
    record: {
      source: 'drive',
      docId: doc.docId,
      title: doc.title,
      modifiedTime: doc.modifiedTime,
    },
  };
}

async function main(argv: string[]): Promise<number> {
  const options = parseArgs(argv);
  if (typeof options === 'string') {
    console.error(options);
    return 2;
  }
  const { check, dryRun } = options;
  const write = !check && !dryRun;

  const source = await loadSource(options);
  const split = splitPromptsDoc(source.text, { format: source.format });
  reportSplit(split);

  // Refuse to write anything that personaPrompts.test.ts would reject.
  const blockers = split.prompts.flatMap((prompt) => findBlockers(prompt.file, prompt.text));
  for (const blocker of blockers) console.error(`BLOCKED ${blocker}`);

  let whitespaceOnly = 0;
  let wordingChanged = 0;
  const hashes: Manifest['files'] = {};
  for (const prompt of split.prompts) {
    const path = join(PROMPTS_DIR, prompt.file);
    const label = relative(REPO_ROOT, path);
    const old = existsSync(path) ? readFileSync(path, 'utf8') : null;
    // Each file is the prompt plus exactly one trailing newline; the loader
    // (seed/prompts/personaPrompts.ts) strips that one newline.
    const next = `${prompt.text}\n`;
    hashes[prompt.file] = { sha256: sha256(next) };
    if (old === next) {
      console.log(`${prompt.file}: unchanged`);
      continue;
    }
    const oldText = (old ?? '').replace(/\n$/, '');
    // Whitespace only = identical once every whitespace run is one space,
    // i.e. the study text is the same and only line breaks/spacing moved.
    const kind =
      old !== null && isWhitespaceOnlyChange(oldText, prompt.text)
        ? 'whitespace only'
        : 'wording changed';
    if (kind === 'whitespace only') whitespaceOnly++;
    else wordingChanged++;
    console.log(`${prompt.file}: ${old === null ? 'new file' : kind}`);
    const diff = unifiedDiff(
      oldText,
      prompt.text,
      old === null ? '/dev/null' : `a/${label}`,
      `b/${label}`
    );
    process.stdout.write(diff || '  (only the trailing newline changes)\n');
    if (write && blockers.length === 0) writeFileSync(path, next);
  }
  const changed = whitespaceOnly + wordingChanged;

  if (blockers.length > 0) {
    console.error(
      `${blockers.length} problem(s) in the doc text; nothing written. Fix the doc and re-run.`
    );
    return 3;
  }

  if (write) {
    const manifest: Manifest = {
      ...source.record,
      pulledAt: new Date().toISOString(),
      files: hashes,
    };
    if (changed > 0 || manifestKey(readManifest()) !== manifestKey(manifest)) {
      writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`Recorded source in ${relative(REPO_ROOT, MANIFEST_PATH)}`);
    }
  }

  const summary = `whitespace only: ${whitespaceOnly}, wording changed: ${wordingChanged}`;
  if (changed === 0) console.log('All four prompts match the doc.');
  else if (check) console.log(`${changed} prompt file(s) differ from the doc (${summary}).`);
  else if (dryRun)
    console.log(`${changed} prompt file(s) would change (${summary}); dry run, nothing written.`);
  else
    console.log(
      `${changed} prompt file(s) updated (${summary}). Review with git diff, then commit.`
    );
  return check && changed > 0 ? 1 : 0;
}

function explain(error: unknown): string {
  if (error instanceof PromptsDocError) return `Doc structure problem: ${error.message}`;
  if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
    return `${error.message}\nCheck that the doc is shared with your Google account and that your credentials carry the drive.readonly scope (see docs/prompts-workflow.md).`;
  }
  if (error instanceof HttpError && error.status === 404) {
    return `${error.message}\nDoc not found: check PROMPTS_DOC_ID and that the doc is shared with your account.`;
  }
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`prompts:pull: ${explain(error)}`);
      process.exit(2);
    }
  );
}
