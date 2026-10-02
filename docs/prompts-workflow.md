# Persona prompt workflow

How a change to a study persona prompt gets from the source document to
participants. Applies to the four persona prompts in
`packages/database/seed/prompts/`:

| File | Pilot scenario | Public-app copy |
| --- | --- | --- |
| `maleProgressive.txt` | `progressive-left-male` (Mark Johnson) | `general-progressive-male` (Joshua Moore) |
| `femaleProgressive.txt` | `progressive-left-female` (Megan Johnson) | `general-progressive-female` (Emily Davis) |
| `maleMaga.txt` | `populist-right-male` (Mark Johnson) | `general-populist-male` (Ryan Taylor) |
| `femaleMaga.txt` | `populist-right-female` (Megan Johnson) | `general-populist-female` (Ashley Brown) |

The public-app copies are generated at seed time by renaming the pilot text,
so edit only the pilot names (Mark Johnson, Megan Johnson) in these files.

## Where prompts are edited: GitHub, not the Google Doc (decided 27 Sep 2026)

The `.txt` files in this directory are the source of record. Edit them in
GitHub (web editor or a branch) and open a pull request; do not edit the
Google Doc "Prompts and Testing v2", which is now the drafting history for
V1 to V3 and nothing more. Two copies of the same text drift apart. Do not
edit persona text in Firestore or the admin interface either.

## Current workflow

1. **Edit the `.txt` file** in GitHub or a branch. `ROLE:` stays the first
   line. Change only the wording that should change.
2. **Open a PR against `main`.** CI runs `personaPrompts.test.ts` (no em or
   en dash, no reply-length rule inside a persona, `ROLE:` first, one
   trailing newline, male and female versions identical apart from names and
   pronouns), plus lint, type-checks and the rest. A reviewer reads the text
   diff. Add a dated entry to `docs/study-changelog.md` for a wording change.
   The first PR that changes prompt wording must also delete
   `packages/database/src/__tests__/seededPromptsUnchanged.test.ts`; its
   header says so.
3. **Merge and deploy.** Cloud Build builds the image; the database build
   copies the .txt files into `dist/`, where the compiled seed reads them.
4. **The deploy reconciles.** No manual re-seed. When the new revision
   starts, the API runs `reconcileReferenceData()` before it accepts
   connections (see "Deploy-time reconcile" below); changed scenarios, and
   only those, are rewritten, and the Cloud Run log shows one
   `reference_seed_upserted` line per scenario. New sessions pick up the new
   text; study sessions already in progress keep the prompt they started
   with.
5. **Optional: confirm.**
   `FIRESTORE_PROJECT_ID=convolab-490517 pnpm -F @workspace/database seed:reference --dry-run`
   shows what a reconcile would write, without writing.

## Importing from a document (not part of the normal workflow)

If a round of prompt writing happens in a document again, `pnpm prompts:pull
--from-file <downloaded .md>` (or `pnpm prompts:pull` via the Drive API, see
"Pulling the prompts from the doc" below) imports it into the .txt files and
labels each change `whitespace only` or `wording changed`, refusing to write
text that would fail the prompt checks. Agree with the PI first, and treat the
result like any other PR. Note that the current files carry line breaks from
the old PDF exports while the doc has none, so an import re-wraps all four
files even when the wording is unchanged.

## Deploy-time reconcile

- **What runs.** At every API start, `reconcileReferenceData()`
  (`packages/database/seed/seedDatabase.ts`) compares each seeded scenario
  (by slug) and quota preset (by name) with Firestore using a `contentHash`,
  a sha256 over the seeded fields listed in
  `packages/database/seed/referenceHash.ts`. Missing documents are created,
  changed ones updated, equal ones skipped; a run with nothing to do logs
  `reference_seed_unchanged`. Written documents also carry `seedVersion` (the
  commit, from `GIT_SHA`, set by `cloudbuild.yaml`) and `seededAt`.
- **What it never does.** It never deletes, and it reads and writes only the
  `scenarios` and `quotaPresets` collections. Updates merge: fields the seed
  does not set (including a hand-set `coachModel`) are left as they are.
- **Failure.** A reconcile error is logged (`reference_seed_failed`) and the
  site keeps serving the stored prompts. The server waits at most 5 seconds
  before listening; a slower reconcile finishes in the background.
- **Regular-app sessions.** These reference the scenario by id and reload it
  when the WebSocket connects, so an in-progress regular-app conversation
  uses the new prompt from its first turn after reconnecting. Study sessions
  are unaffected.
- **Off switch.** `SEED_REFERENCE_ON_START=false` disables it.
- **Check before a deploy (dry run).** To see what the next reconcile would
  write without writing anything:
  `FIRESTORE_PROJECT_ID=convolab-490517 pnpm -F @workspace/database seed:reference --dry-run`
  (or `RECONCILE_DRY_RUN=1`). It prints, per scenario and preset, `create`,
  `update` or `unchanged`, and for `update` the differing fields with string
  lengths and sha256 only, never prompt text.
- **Manual run.** The same command without `--dry-run` performs the
  reconcile immediately, without a deploy. It refuses to run without an
  explicit `FIRESTORE_PROJECT_ID`.

## Pulling the prompts from the doc

The source document is the shared Google Doc **"Prompts and Testing v2"**
(owned by Nebras). `pnpm prompts:pull` maps its sections to the files:

| Doc section | File |
| --- | --- |
| No Apologies Right / Male | `maleMaga.txt` |
| No Apologies Right / Female | `femaleMaga.txt` |
| Leftward Progressiveness / Male Left | `maleProgressive.txt` |
| Leftward Progressiveness / Female Left | `femaleProgressive.txt` |

### Recommended: pull from a downloaded file (no sign-in)

1. Open the doc and choose **File > Download > Markdown (.md)** (a plain-text
   export also works). Save it outside the repo.
2. Run:

   ```sh
   pnpm prompts:pull --from-file ~/Downloads/Prompts\ and\ Testing\ v2.md --dry-run
   pnpm prompts:pull --from-file ~/Downloads/Prompts\ and\ Testing\ v2.md
   ```

`PROMPTS_SOURCE.json` then records `source: "file"`, the file's name and its
sha256 (a download carries no modification time). A `.md`/`.markdown` file
has its markdown escaping stripped; any other extension is read as plain text.

### Alternative: pull straight from the Drive API

For people who have set up the Drive scope. The doc must be shared (at least
Viewer) with the Google account you sign in with. Sign in once:

```sh
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/cloud-platform
```

This replaces your Application Default Credentials; keeping `cloud-platform`
in the list keeps local Vertex and Firestore access working. No token is
stored in the repo. If Google refuses the sign-in for the Drive scope ("This
app is blocked"), `gcloud auth application-default login --help` says that
scopes outside Google Cloud need your own OAuth client: create a Desktop OAuth
client ID and add `--client-id-file=client_secret.json` (keep that file out of
the repo).

Instead of ADC you can pass a token for a single run:
`GOOGLE_DOC_ACCESS_TOKEN=<token> pnpm prompts:pull`. If Drive answers
"API not enabled" for a Google-owned project, set
`GOOGLE_DOC_QUOTA_PROJECT=<your project id>`. `PROMPTS_DOC_ID` overrides the
doc id. `PROMPTS_SOURCE.json` then records `source: "drive"`, the doc id,
title and `modifiedTime`.

### Modes and output

```sh
pnpm prompts:pull [--from-file <path>]            # write changed files, print diffs
pnpm prompts:pull [--from-file <path>] --dry-run  # print diffs only
pnpm prompts:pull [--from-file <path>] --check    # write nothing; exit 1 if behind the doc
```

The command finds the six headings (No Apologies Right, Male, Female,
Leftward Progressiveness, Male Left, Female Left) by name, whether they appear
as `#` headings, bold lines or plain lines, and takes each prompt from its
`ROLE:` line up to the next heading. It writes each file as the prompt plus
exactly one trailing newline and records each file's sha256 in
`packages/database/seed/prompts/PROMPTS_SOURCE.json`.

Each file is reported as `unchanged`, `whitespace only` (identical once every
run of spaces and line breaks is collapsed: only line wrapping moved, the
study text is the same) or `wording changed`, followed by its diff. `--check`
exits 1 in both changed cases and says which.

The first pull after 27 Sep 2026 is expected to be `whitespace only` for all
four files: the .txt files still carry the PDF line breaks (about every 95
characters) and the doc has none. That pull will fail the byte-exact
`exactDigest` check in `src/__tests__/seededPromptsUnchanged.test.ts`, a
migration guard; that PR should delete that test, as its header says.

It stops, writing nothing:

- with exit code 2 if a heading is missing, renamed, duplicated (including a
  heading-only line inside a prompt) or out of order, or a section has no
  `ROLE:` line (fix the doc, or the section table in
  `packages/database/scripts/promptsDoc.ts`);
- with exit code 3 (`BLOCKED` lines, with file and line number) if the text
  has an em or en dash or a competing reply-length rule, the same checks as
  `personaPrompts.test.ts`. Fix the doc and re-run.

It normalises the text: smart quotes to ASCII, Windows line endings, trailing
spaces, markdown escaping and `#`/`**` markers, and runs of 3+ blank lines. It
does not change, but prints `REVIEW` lines for, any other non-ASCII character
and any "sentences" with a number nearby.
