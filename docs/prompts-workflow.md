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

## Current workflow

1. **Edit the source document.** The prompt text is written and agreed there
   first.
2. **Copy the text into the .txt file.** Paste the full prompt over the old
   contents. Keep the first line `ROLE:`, and leave no blank line or trailing
   newline at the end of the file. Use plain hyphens, not em or en dashes. Do
   not add a reply-length rule (the runtime policy owns reply length).
3. **Open a PR.** The diff shows exactly which wording changed. Run
   `pnpm -F @workspace/database test`; `personaPrompts.test.ts` checks the
   rules above and that the male and female prompts in each ideology still
   differ only in name and pronouns. Add a dated entry to
   `docs/study-changelog.md`.
4. **Deploy.** Merge to `main`; Cloud Build builds the image. The database
   build copies the .txt files into `dist/`, where the compiled seed reads
   them.
5. **Nothing else: the deploy reconciles.** When the new revision starts, the
   API runs `reconcileReferenceData()` before it accepts connections (see
   "Deploy-time reconcile" below). The changed scenarios, and only those, are
   rewritten; the Cloud Run log shows one `reference_seed_upserted` line per
   scenario with its slug, the old and new `contentHash` and the changed
   field names. New sessions pick up the new text; study sessions already in
   progress keep the prompt they started with.

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

## Planned changes

- **Pull command** (replaces step 2): _placeholder._ A command that fetches
  the prompt text from the source document and writes the .txt files.
