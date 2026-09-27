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
5. **Re-seed.** A deploy alone does not change what participants see. Run
   `FIRESTORE_PROJECT_ID=convolab-490517 pnpm -F @workspace/database seed:reference`
   to upsert the scenario records. New sessions pick up the new text;
   sessions already in progress keep the prompt they started with.

## Planned changes

- **Pull command** (replaces step 2): _placeholder._ A command that fetches
  the prompt text from the source document and writes the .txt files.
- **Deploy-time upsert** (replaces step 5): _placeholder._ The scenario
  records are updated as part of the deploy, so no manual re-seed is needed.
