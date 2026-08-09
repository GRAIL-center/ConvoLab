# Bug Log

Running log of bugs found, their status, and fixes. Newest first within each
section. Intended for the GitHub wiki once someone creates its first page in
the web UI (GitHub won't let tooling create the initial page); until then it
lives here.

## Open

| # | Found | Bug | Impact | Notes |
|---|-------|-----|--------|-------|
| B1 | 2026-08-07 | `qualtricsWebhook` (functions/index.js) accepts any POST from anywhere, no shared-secret check, and logs raw payloads | Anyone with the URL can inject fake survey responses into `surveyResponses`; participant data in function logs | Fix drafted (timing-safe `X-Webhook-Secret` header check) but **on hold at Hanna's request until the survey design settles**. Re-apply when ready. |
| B2 | 2026-08-07 | Survey responses are never consumed: nothing in `packages/` reads the `surveyResponses` collection | The intended Qualtrics-response → persona assignment path doesn't exist | Needs design: how should a participant's survey answers map to scenario/persona? |
| B3 | 2026-08-07 | `$transaction` on the Firestore shim is non-atomic (documented tradeoff in `packages/database/index.ts`) | Concurrent account merge/login flows could interleave; acceptable at current load | Revisit before real load. |
| B4 | 2026-08-07 | Stored scenarios may still reference the deprecated `claude-sonnet-4-20250514` (old Prisma schema default) | Partner/coach calls on such scenarios will 404 once Anthropic retires the model | Audit Firestore `scenarios` collection; migrate stored `partnerModel`/`coachModel` to current models. |

## Fixed

| # | Found | Bug | Impact | Fix |
|---|-------|-----|--------|-----|
| F9 | 2026-08-09 | Pipeline partner/coach lanes truncate on thinking models: `maxTokens` 600/300 is shared with Gemini 3+ internal reasoning, so partner turns can cut mid-sentence (caught live by the quality gate on the free lane's first post-F7 run) | Truncated partner turns — would also hit production if a scenario used a Gemini 3+ partner | Lane caps raised to 1024/512 in `conversation.ts`; caps not targets, so non-thinking models unaffected |
| F8 | 2026-08-09 | Synthetic participant wrote bracket placeholders ("out there in [state]"): only the partner prompt knew Dale lives in rural Indiana | Polluted turns; caught live by the quality gate (first catch) | Participant persona now includes the location; no-placeholder rule broadened (`ddd6a63`) |
| F7 | 2026-08-08 | Free-lane synthetic participant turns truncated mid-sentence (~97 chars avg, 72% cut): Gemini 3's internal thinking consumes part of the CLI's 300-token participant budget even at `thinkingLevel: low`, and the CLI never checked completeness | The 4 free-lane conversations were unusable for DQI work | Participant `maxTokens` 300→800 (free tier caps requests, not tokens) + trim-to-last-sentence backstop in `synthetic.ts`. Found via team review of the corpus. |
| F1 | 2026-08-07 | Coach lane silently dropped truncated insights: `maxTokens: 220` often cuts mid-sentence, and `generateCoachInsight` discarded the whole message with only a server-side warn — no client event, no coaching that turn | Users intermittently got no coach feedback with no visible reason | Salvage back to the last complete sentence, drop only if nothing salvageable (`conversation.ts`, commit pending) |
| F2 | 2026-08-07 | Synthetic CLI could exit 0 mid-conversation without writing `--out`: the event-waiter timer was `unref`'d, so when coach never emitted `coach:done` the event loop drained and Node exited cleanly | Batch generator logged phantom successes; conversations lost | Ref the timer; batch script also verifies output file is non-empty (`d977a11`) |
| F3 | 2026-08-07 | Gemini 3+ models returned empty text in all conversation lanes: provider sent no thinking config, so internal thinking consumed the small per-lane `maxOutputTokens` (`finishReason: MAX_TOKENS`, empty text) | gemini-3.x unusable as partner/coach/scorer | Send `thinkingLevel: "low"` for `gemini-3+` models in `providers/google.ts` (`fe548b6`) |
| F4 | 2026-08-07 | Gemini→Claude fallback (`FALLBACK_PARTNER_MODEL`) pointed at deprecated `claude-sonnet-4-20250514` | During any Gemini outage/quota event the fallback itself would 404 once the model retires | Updated to `claude-sonnet-5` (`094497f`) |
| F5 | 2026-08-07 | `FakeFirestore` test double lacked `runTransaction`, so the atomic write path (`createMessageAndIncrementSession`, `completeSession`) was untestable against the double | Pipeline persistence untested end-to-end | Implemented buffered-write `runTransaction` on the double (`5a5902c`) |
| F6 | 2026-08-07 | `packages/app` typecheck broke on `.at()`: app tsconfig targeted ES2020 while it typechecks API sources using ES2022 APIs | CI "Lint & Typecheck" red on every PR | Bumped app tsconfig `target`/`lib` to ES2022 ([PR #86](https://github.com/GRAIL-center/ConvoLab/pull/86)) |

## Process

- Log every bug here when found (one row: date, symptom, impact), even if fixed
  in the same commit — the log is the searchable history.
- Fix as we go: small, verified fixes commit directly to `main`; anything
  risky or behavior-changing gets flagged to the team first.
