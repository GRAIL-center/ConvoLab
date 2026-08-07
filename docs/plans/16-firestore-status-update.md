# Firestore Migration — Status Update (2026-08-06)

Summary for the team of what's been audited, fixed, and is still open on `firestore-pr`. Full technical detail with file:line references is in `docs/plans/15-firestore-shim-gaps.md`; this is the short version.

## Latest status after local Docker testing

The Firestore-backed local app now supports the core user flow without Cloud
SQL/Postgres:

- Google OAuth, `auth.me`, scenario listing, scenario selection, conversation
  creation, message persistence, partner replies, automatic coach insights,
  LAPP scoring, and the home-page "Your Conversations" list have been exercised
  against live local Docker + Firestore/Vertex configuration.
- `session.listMine` now returns Firestore-safe summaries instead of Prisma
  relation shapes: scenario info is fetched explicitly, `startedAt` is
  normalized to ISO strings, and message count comes from the denormalized
  `ConversationSession.totalMessages` counter with a Firestore count fallback
  for older docs.
- Conversation messages are persisted through `createMessageAndIncrementSession`,
  which writes the message and increments `totalMessages` in a Firestore
  transaction. If the home page shows sessions, the conversations are saving;
  localhost is not supposed to lose them unless it is pointed at a different
  Firestore project or credentials than the deployed app.
- The automatic coach path is isolated from the partner path. Partner streaming
  is the only blocking step; after `partner:done`, the server sends
  `exchange:complete` and then runs coach and LAPP jobs in the background.
- Coach output is never persisted as a partial. The server collects the full
  coach response privately and only emits/persists `coach:done` if the response
  looks complete. Ask-Coach aside responses now also reject cut-off output
  instead of saving fragments.
- LAPP scoring is Vertex/Gemini first using structured JSON. If Vertex returns
  malformed JSON, the API logs the failure and uses a local fallback score so
  the live metrics panel does not stay empty.
- Gemini 2.5 Flash now runs with `thinkingConfig: { thinkingBudget: 0 }` for
  the app's low-latency calls. This fixed the observed `MAX_TOKENS` issue where
  coach and scorer calls returned only a few visible words because dynamic
  thinking consumed the output budget.
- Partner web search grounding is now selective. Scenarios can still enable it,
  but runtime only uses search for current/factual-looking prompts such as
  "who is president", "what year is it", or "latest/recent" queries. Normal
  dialogue turns skip search to reduce latency.

Verification run in Docker:

```bash
docker compose exec api pnpm -F @workspace/api type-check
docker compose exec api pnpm -F @workspace/api test:run src/ws/conversation.atomic.test.ts
```

Known caveat: `packages/app` type-check still has pre-existing tRPC type
inference errors unrelated to the Firestore/session-summary changes.

## What we found

`firestore-pr` already replaced Prisma everywhere — `@workspace/database`'s `prisma` export is now a generic Firestore shim with a Prisma-shaped API, and every router routes through it. The problem is the shim doesn't actually implement most of the query API it exposes: `findMany`/`count` silently ignored `where`/`orderBy`/`select`, `aggregate()` was a hardcoded stub always returning zero, and `findUnique` only supported plain `{ id }` lookups. That's not a "not migrated yet" gap, it's live breakage: Google OAuth login threw on the compound-key lookup it needs, quota enforcement always reported zero usage (invitations effectively had unlimited quota), and the "don't demote the last admin" guard could be bypassed because `count({ where: { role: 'ADMIN' } })` returned the total user count instead.

## What's fixed and tested

- Real `where` (equality, `gte`/`lte`/`gt`/`lt`/`in`, JSON-path filters), `orderBy`, `select`, and `distinct` support in `findMany`.
- `count()` and `aggregate()` (`_sum`) now actually filter and compute, instead of ignoring input / returning a stub.
- `findUnique` now handles compound-unique keys (fixes the OAuth lookup) and plain scalar unique fields like `Invitation.token` (fixes invitation claim/lookup).
- Added `updateMany()` to the shim (didn't exist before at all).
- String-coercion for the four models with `Int` primary keys (Scenario, ConversationSession, Message, LappScore) — Firestore doc IDs have to be strings, and numeric IDs were being passed straight to `.doc()`.
- New `deleteUserCascade()` helper wired into the guest-logout cleanup flow, replicating the schema's `onDelete: Cascade`/`SetNull` relations (`ContactMethod`, `ExternalIdentity`, `Feedback`, `TelemetryEvent`) since Firestore has no FK cascade behavior of its own.
- Fixed `invitation.list`, `invitation.getByToken` (the claim flow), and `observation.list` — all three used Prisma's `include` for relational joins, which the shim now correctly rejects instead of silently dropping. Replaced with explicit batched lookups.
- One deliberate behavior change worth flagging: unsupported query shapes (`include`, `OR`/`AND`/`NOT`) now **throw** instead of silently returning wrong or leaked data. A couple of endpoints that leaned on `include` will error until they're updated to fetch relations explicitly — safer than the alternative (they were leaking cross-user data before), but it does mean "throws now" for a few call sites that used to "return wrong data quietly."
- 24 automated tests, all against an in-memory fake Firestore — no real project touched during development.

All of this is in `firestore-shim-fixes.patch` at the repo root, plus already applied directly to a couple of infra files (see below).

## Update: Google login now works end-to-end

Got `firestore-pr` running in Docker and live-tested the login flow. Found and fixed three more real bugs beyond what static typechecking predicted:

- **`$transaction` implemented.** Not atomic — Firestore's real transactions require all reads before any writes, and the actual call sites (`mergeUsers()`, the OAuth email upsert) interleave them, so this runs the callback sequentially against the normal client instead. No rollback, no isolation under concurrent writes, but correct for the current low-concurrency use (login, account merge). Documented as a tradeoff in the code, not hidden.
- **`NOT` filter support added.** The OAuth handler clears the `primary` flag on other emails via `NOT: { value: ... }`, which the shim rejected outright alongside `OR`/`AND`. This would have thrown on *every* login, new or returning, the moment `$transaction` started working — found by testing live, not by typecheck. Now supports simple single-field negation; still throws on anything more complex.
- **Three `include` usages in `auth/handlers.ts` fixed.** These didn't surface in the first test (brand-new user) because the surrounding `if` checks short-circuit past them when the looked-up record doesn't exist — they'd have broken on a second login or an anonymous-session merge instead. Also caught a latent bug in `upsert()`: it wasn't using the compound-key-aware where resolver, so the ContactMethod upsert in this same handler would always have created a duplicate instead of updating.

29 shim tests now passing (up from 24), `packages/api` typecheck clean for the auth code path specifically.

## Composite indexes

Live testing also surfaced two `FAILED_PRECONDITION: The query requires an index` errors — not shim bugs, just real Firestore behavior: any query that combines an inequality filter with other fields, or filters on one field while sorting by another, needs a composite index that Firestore doesn't create automatically. Created via the console links in the error messages for now (`contactMethods` on `primary, type, userId, value`; `scenarios` on `isActive, name`), and declared them in a new `firestore.indexes.json` at the repo root, wired into `firebase.json`, so future indexes get checked into git and deployed with `firebase deploy --only firestore:indexes` instead of discovered one at a time in the browser. Expect a couple more of these as more of the app gets exercised (session creation, admin views) — same pattern, just add the new index to `firestore.indexes.json` and deploy.

## What's still open

- `user.ts` (admin user list/detail) and `telemetry.ts` (event list) still have
  tRPC/frontend typing cleanup and Firestore-query edge cases to finish before
  treating the admin dashboards as production-ready.
- Keep deploying/checking Firestore composite indexes. Current local-dev code
  uses simple equality reads and in-memory sorting in a few places to avoid
  blocking on index build time, but larger usage should rely on
  `firestore.indexes.json` and `firebase deploy --only firestore:indexes`.
- Legacy Prisma schema/migration files remain because the project still uses
  schema-derived model types/generation. They are not the runtime database.

## Getting the branch running locally at all

Separately from the shim work, we hit five infrastructure issues just getting `firestore-pr` to run in Docker — worth knowing about since they suggest nobody's run this branch end-to-end before:

1. `packages/api/Dockerfile` was still on `node:20-slim`; `pnpm@11.9.0` (pinned in `package.json`) requires Node 22.13+. Fixed.
2. `packages/api`'s `dev:docker` script still ran `prisma migrate deploy` against Postgres, which `compose.yml` explicitly removed ("DB fully migrated to Firestore"). Fixed.
3. `server.ts` imported `isDatabaseEmpty`/`seedReferenceData`/`seedTestData` from the wrong path, and those functions (which do exist, in `packages/database/seed/seedDatabase.ts`) were never actually exported anywhere importable. Fixed.
4. `lib/firestore.ts`'s `getFirestore()` was missing its `export` keyword, breaking tRPC context creation. Fixed.
5. `compose.yml` never mounted GCP credentials into the `api` container, so any real Firestore call crashed with "Could not load the default credentials." Just fixed (mounts host `gcloud` ADC in) — not yet fully verified end-to-end.

All five are applied directly to the working tree on `firestore-pr` locally; worth committing once confirmed working.

## Where things stand right now

Local Docker environment is up, seeding/health-check pass, currently verifying the Google login flow works end to end after the credentials fix. Next: confirm login, apply `firestore-shim-fixes.patch`, then scope the `$transaction` work.
