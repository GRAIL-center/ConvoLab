# Phase 15: Firestore Shim Gaps & Remaining Prisma-Shaped Flows

Audit of `firestore-pr` (commit `2d87dd0`) requested by Hanna: find flows outside the core
conversation path still coupled to Prisma, and think through Firestore schema design for
Users, Invitations, Sessions, Scenarios, Feedback, Telemetry.

## Status (updated 2026-08-06): shim bugs #1–#4 and #6 fixed; cascade-delete and two `include`
callers also fixed; `packages/api` typecheck run for real; `$transaction`, `NOT`, and the OAuth
handler's three `include` usages now fixed too — Google login should work end-to-end for both
new and returning users

**2026-08-06 addendum after Firestore/Vertex live debugging:**

- Core local Docker flow is now confirmed against Firestore/Vertex: OAuth,
  scenario list/selection, session creation, partner replies, automatic coach
  insights, LAPP scoring, and session cards on the home page.
- `ConversationSession.totalMessages` is now incremented by
  `createMessageAndIncrementSession()`, and `session.listMine` reads that
  denormalized counter with a Firestore count fallback for older docs. Home-page
  cards no longer depend on Prisma `_count`/`include` shapes.
- `session.listMine` explicitly fetches scenario display info and normalizes
  Firestore timestamps to ISO strings. This fixed the `0 messages` /
  `Invalid Date` cards that made saved conversations look missing.
- The WebSocket conversation path now isolates partner, coach, and LAPP timing:
  partner is the only blocking stream; coach and LAPP run as background jobs
  after `exchange:complete`.
- Coach output is persisted only after a complete response is collected. Partial
  automatic coach output is dropped; Ask-Coach aside fragments are rejected
  instead of saved.
- Gemini 2.5 Flash dynamic thinking is disabled for low-latency calls with
  `thinkingConfig: { thinkingBudget: 0 }`, fixing truncated coach/scorer output.
- Partner web search is now conditional on current/factual-looking prompts to
  avoid paying search latency on ordinary dialogue turns.

`firestore-shim-fixes.patch` (repo root, regenerated) now contains three rounds of changes:

**Round 1 — the shim itself** (`packages/database/index.ts`): real `where`/`orderBy`/`select`/
`distinct` support in `findMany`, `where`-filtered `count()`, a real (client-side) `_sum` in
`aggregate()`, `findUnique` support for compound-unique keys *and* single scalar unique fields
(e.g. `where: { token }}`, needed for `invitation.getByToken`/claim — found while testing round 2),
central `String(id)` coercion for Int-keyed models, and a new `updateMany()` (mirrors the existing
`deleteMany()` pattern — needed for the fixes below). `include` and `OR`/`AND`/`NOT` throw
explicitly instead of silently returning wrong data. 23 unit tests in
`packages/database/src/__tests__/`, all against an in-memory fake Firestore, no real project ever
touched.

**Round 2 — the two things asked about, plus what testing them required:**
- **Cascade delete**: new `packages/api/src/data/users.ts` → `deleteUserCascade()`. Deletes
  `ContactMethod`/`ExternalIdentity` (schema's actual `onDelete: Cascade` relations) and nulls out
  `Feedback.userId`/`TelemetryEvent.userId` (schema's `onDelete: SetNull` relations), then deletes
  the `User` doc. Wired into `routes/auth.ts`'s guest-logout cleanup — the one real `.delete()`
  call site. Deliberately scoped to what that caller needs (a `GUEST` with zero sessions); doesn't
  touch `ConversationSession`/`Invitation`/`ObservationNote` relations, which had no `onDelete` in
  the Prisma schema and shouldn't be silently orphaned or nulled by a generic helper. 1 test
  (`packages/api/src/data/__tests__/users.safe.test.ts`), run via a **separate**
  `vitest.safe.config.ts` with no `setupFiles` — the project's real `vitest.config.ts` wires every
  test to `src/__tests__/setup.ts`, which deletes every row of every collection against whatever
  Firestore project `.env`'s `FIRESTORE_PROJECT_ID` points at. That harness was never touched or
  run.
- **`invitation.list` / `observation.list`**: `include` dropped, replaced with explicit batch
  fetches (scenario/linkedUser by id, session counts via `conversationSession.findMany({ where: {
  invitationId: { in: [...] } } })`, researcher lookups deduped by id) — see the code comments for
  why scenario/user lookups use per-id `findUnique` rather than a batched `in` query (Firestore's
  `in` filters a stored field, not the document id, and there's no guarantee `id` is duplicated as
  a field).
- Also fixed along the way since it's the same call path: `invitation.getByToken`/claim
  (`getValidInvitation`) also used `include` and was completely broken, not just `list`.
  `routes/auth.ts`'s guest-check also used `select: { _count: { select: { sessions: true } } }`
  (Prisma relation-count shorthand the shim never implemented) — replaced with
  `conversationSession.count({ where: { userId } })`, and its `invitation.updateMany(...)` call
  needed the new shim `updateMany()`.

**Ran `packages/api`'s real `tsc --noEmit`** (installed deps standalone, built `packages/database`'s
dist) rather than skipping it as before. This surfaced a **much bigger set of pre-existing gaps
that this patch does not fix** — important to be clear these were already broken on `firestore-pr`,
not introduced by this patch:

- **`$transaction` doesn't exist on the shim at all.** `auth/handlers.ts`'s `mergeUsers()` (the
  anonymous→authenticated user merge) and the tail of `handleGoogleAuth()` (upserting the primary
  email `ContactMethod`) both call `prisma.$transaction(async (tx) => {...})`. This means **Google
  OAuth login still doesn't work end-to-end** even after the compound-key `findUnique` fix — it
  fails on `$transaction` before it'd ever reach that code path. Also uses `include` in three more
  places and Prisma's nested-write syntax (`user.create({ data: { externalIdentities: { create:
  {...} } } })`), which the shim's generic `create()` doesn't understand either (it would write the
  literal nested object as a field).
- **`user.ts`** (admin list + detail) and **`telemetry.ts`** (event list) also use `include` with
  per-relation `select`, `_count`, cursor pagination (`cursor: { id }, skip: 1`), and `OR` filters
  with `mode: 'insensitive'` string `contains` — none of which the shim supports. Not touched in
  this pass.
- **`invitation.detail`** (the researcher-facing session/message timeline view) has even deeper
  nesting — invitation → sessions → messages, plus `linkedUser` and `observationNotes` — also not
  touched.
- A handful of things that are broken independent of the shim entirely and pre-date both patches:
  `packages/api/src/server.ts` imports `isDatabaseEmpty`/`seedReferenceData`/`seedTestData` from
  `db/firestoreHelpers`, none of which that file exports; `trpc/context.ts` imports `getFirestore`
  from `lib/firestore.ts`, which never exports it (missing `export` keyword). Neither is related to
  the Firestore migration — this package likely hasn't typechecked cleanly since before the switch
  off Prisma, because `@workspace/database`'s `dist/` (which `packages/api/tsconfig.json` points
  at) never successfully built until this patch worked around the `@prisma/client` re-export issue
  for testing purposes.

**Round 3 — `$transaction`, `NOT`, and the OAuth handler's `include` usages (confirmed live via
Docker as the actual blockers, not just predicted from typecheck):**
- **`$transaction`** added to the `prisma` export. It is **not atomic** — Firestore's
  `runTransaction()` requires all reads before any writes, but `mergeUsers()` and the OAuth
  handler's email-upsert both interleave reads and writes, so restructuring every call site to
  satisfy that constraint was out of scope here. Instead `$transaction(callback)` just runs
  `callback(prisma)` directly: each operation still succeeds/fails independently, but there's no
  rollback and no isolation under concurrent writes. Fine for the current use (login and account
  merge — both low-concurrency, human-triggered), documented in code as a known tradeoff, not
  hidden.
- **`applyWhere` now supports simple `NOT: { field: value }` field-negation** (maps to Firestore's
  `!=`), discovered live: `handleGoogleAuth`'s final transaction clears the `primary` flag on every
  other email `ContactMethod` via `NOT: { value: userInfo.email }`, which the shim previously
  rejected unconditionally along with `OR`/`AND`. This would have thrown on **every single login**,
  new or returning, immediately after `$transaction` started working — not a theoretical gap, the
  next thing that would have broken in her live test. Nested/compound `NOT` shapes still throw.
- **The three `include` usages in `auth/handlers.ts`** (existing-identity lookup, session-user
  merge check, ContactMethod-by-email lookup) replaced with explicit follow-up `findUnique`/
  `findMany` calls, same pattern as `invitation.ts`/`observation.ts`. These didn't show up in her
  first test because it was a brand-new user — the surrounding `if` checks short-circuit past the
  `include`d property access when the looked-up record doesn't exist yet. They *would* have broken
  on her second login, or on an anonymous-session merge. `upsert()`'s non-id branch also had a
  latent bug fixed in this round: it used raw `applyWhere` instead of the compound-key-aware
  resolver, so the `ContactMethod` `type_value` upsert in the same handler would have queried on a
  literal nonexistent field and always created a duplicate instead of updating.
- 29 shim unit tests total (2 new, covering `NOT` support and the compound/nested-NOT rejection
  case), all passing against the in-memory fake. `packages/api` typecheck clean for
  `handlers.ts`/`routes/auth.ts` (previously had 4 `$transaction`-related errors plus the 3
  `include` errors and 1 implicit-any — all resolved).

**What's still genuinely open:** `user.ts`, `telemetry.ts`, and `invitation.detail` (deeper
`include`/`_count`/cursor-pagination usage) — unchanged from round 2, not touched.

To apply: `git checkout firestore-pr && git apply firestore-shim-fixes.patch`, then
`cd packages/database && npm install && npm test` and
`cd packages/api && npm install && npx vitest run --config vitest.safe.config.ts`.

## Important correction to the premise

There is no real Prisma/Postgres client left in the codebase on this branch. `@workspace/database`'s
`prisma` export (`packages/database/index.ts`) is now a **generic Firestore shim** with a
Prisma-shaped API (`findUnique`, `findMany`, `create`, `update`, `upsert`, `count`, `aggregate`)
that every model — including `user`, `invitation`, `scenario`, `telemetryEvent`, `observationNote`,
`quotaPreset` — routes through. So "still uses `prisma.X`" no longer means "still hits Postgres."

The real problem is that **the shim doesn't implement most of the Prisma API it exposes**. Every
router that was already switched to Firestore compiles fine and looks migrated, but several will
misbehave or crash in production because the shim silently ignores or fakes core query features.
This is a bigger risk than the remaining call sites, so it's listed first.

## Critical shim bugs (affect every model, not just the "unmigrated" routers)

1. **`findMany` ignores `where`, `orderBy`, `select`, `distinct`, and pagination args entirely**
   (`packages/database/index.ts` `findMany()` takes `_args` and never reads it). Any router calling
   `findMany` with a filter now fetches the **entire collection**, unfiltered and unsorted, every time.
2. **`count()` ignores `where`** — always returns the size of the whole collection.
3. **`aggregate()` is a hardcoded stub** returning `{ _sum: {}, _count: {} }` regardless of input.
4. **`findUnique` only supports a single `where: { id }` lookup.** Compound/unique-key lookups
   (Prisma's `where: { provider_externalId: {...} }` pattern) resolve `args.where.id` as `undefined`
   and call `.doc(undefined)`.
5. **No cascade delete.** Deleting a `User` or `ConversationSession` doc doesn't touch their
   `ExternalIdentity`, `ContactMethod`, `Message`, `LappScore`, etc. — those were `onDelete: Cascade`
   in Prisma; Firestore needs this handled explicitly (batch delete or Cloud Function trigger).
6. **Int-keyed models need string doc IDs.** `Scenario`, `ConversationSession`, `Message`, `LappScore`
   use `Int @id` in `schema.prisma`. Firestore document IDs must be strings. `packages/api/src/data/*`
   coerces with `String(id)` on write, but router-level calls (e.g. `scenario.findUnique({ where: { id: input.scenarioId } })`
   in `scenario.ts`) pass the raw Zod-parsed `number` straight into `.doc()`, which the Firestore
   Node SDK rejects.

### Concrete breakage this causes right now

- **Google OAuth login is broken.** `auth/handlers.ts:108` does
  `prisma.externalIdentity.findUnique({ where: { provider_externalId: { provider, externalId } } })`.
  Per bug #4 this throws/returns null unconditionally — nobody can sign in with Google on this branch.
- **Quota enforcement is silently disabled.** `lib/quota.ts` → `getUsageForInvitation()` calls
  `prisma.usageLog.aggregate(...)`, which per bug #3 always returns 0 usage. Every invitation reports
  unlimited remaining quota.
- **Admin lockout check can be bypassed.** `trpc/routers/user.ts:165` computes
  `adminCount = await ctx.prisma.user.count({ where: { role: 'ADMIN' } })` to block demoting the last
  admin. Per bug #2 this returns the total user count, not the admin count, so the guard almost never
  fires — the last admin can be demoted, locking the team out (no auto-revoke path per the admin
  bootstrap doc in `CLAUDE.md`).
- **`invitation.list` leaks all researchers' invitations.** `trpc/routers/invitation.ts:415` filters
  `where: { createdById: ctx.user.id }` — per bug #1 this returns every invitation from every user,
  with `scenario`/`linkedUser`/`_count.sessions` joins silently missing (Prisma `include` isn't
  supported either), likely breaking the UI that reads `inv._count.sessions`.
- **`observation.list` leaks all researchers' notes** across invitations the same way
  (`trpc/routers/observation.ts`), plus the `researcher` join used for display is missing.
- **Telemetry dashboard is non-functional**, not just slow: `telemetry.ts`'s `summary` and `list`
  endpoints use `count`, `findMany` with `where`/`select`/`distinct`, none of which the shim honors.
  This is currently masked because `lib/telemetry.ts`'s `track()` is itself a no-op ("telemetry is
  disabled for this deployment"), so nothing is being written to read back yet — but both sides need
  fixing before telemetry can be turned on.
- **`getMessagesForSession` (already "completed," worth flagging anyway)**: `data/messages.ts` does
  `prisma.message.findMany()` with no args and filters client-side in JS — every conversation load
  fetches every message ever written, across all users. This will get expensive and slow fast.

**Recommendation:** before doing more per-router migration, either (a) implement real `where`/`orderBy`/
`select`/`count`/`aggregate` support in the shim (moderate effort, keeps the Prisma-shaped call sites
as-is), or (b) restructure the hottest paths as native Firestore subcollection queries and drop the
shim for those models (see design notes below — this is the more idiomatic Firestore approach and
avoids re-implementing a query planner).

## Remaining/broken flows by model

### Users
- `auth/handlers.ts` — OAuth login/merge flow, broken per bug #4 (see above). Also does cascade-style
  reads (`user.findUnique({ include: { externalIdentities: true } })`) — shim ignores `include`, so
  `sessionUser.externalIdentities` will be `undefined`, not `[]`, breaking the anonymous-merge check.
- `routes/auth.ts:98` — `prisma.user.delete()` on an anonymous user during merge cleanup; no cascade
  (bug #5), so their `ContactMethod`/`ExternalIdentity` rows would orphan if any exist.
- `trpc/routers/user.ts` — admin list (`findMany`, line 22, likely has `where`/`orderBy` too — same
  bug #1), role update, admin-count lockout check (bug #2, see above).
- `ws/observer.ts:109` — `verifyObserverAccess`, simple `findUnique({ where: { id } })`. This one's fine.

### Invitations
- `trpc/routers/invitation.ts` — creation (id-based, fine), `list` (broken, see above),
  `getPresets` (`quotaPreset.findMany({ orderBy })`, unsorted per bug #1).
- `trpc/routers/session.ts` (staff quick-start) — `quotaPreset.findUnique`, `scenario.findUnique`,
  `invitation.create`. Id-keyed lookups are fine except the Int-id coercion issue (bug #6) on scenario.

### Sessions (outside core path)
- `trpc/routers/observation.ts` — session-scoping check on create (`findUnique`, fine) but `list` is
  broken (bug #1) and leaks cross-invitation notes.
- `lib/quota.ts` — quota status check, broken via bug #3.
- `ws/conversation.ts:935` — `this.prisma.usageLog.create()` for aside-thread usage logging. Create is
  fine structurally, but feeds into the broken `aggregate()`.

### Scenarios
- `trpc/routers/scenario.ts` — `list` (`findMany` with `where: { isActive: true }`, `select`,
  `orderBy`) is fully broken by bug #1: it will return **inactive scenarios too**, with every field
  instead of the selected subset, unsorted. `get` has the Int-id coercion issue (bug #6).

### Feedback
- `trpc/routers/feedback.ts` — the one router that **doesn't** use the shim at all; it calls
  `ctx.firestore` (raw `@google-cloud/firestore`) directly with hand-rolled cursor pagination and
  `orderBy`. It actually works correctly, but it's inconsistent with every other router and doesn't
  go through `packages/api/src/data/`. Lowest priority, but worth aligning on one pattern.

### Telemetry
- `trpc/routers/telemetry.ts` — `summary`, `list`, `eventTypes` all broken (bug #1/#2, see above).
  Currently invisible because writes are disabled via `track()`'s no-op.

## Firestore design notes (for whichever routers get real migration work)

- **`Invitation.usage`**: stop relying on `aggregate()` over `UsageLog` for quota checks even after
  the shim is fixed — Firestore aggregation queries still cost reads and add latency on a hot path
  (checked on every message). Denormalize a running `usage: { inputTokens, outputTokens }` counter
  directly on the `Invitation` doc, updated with `FieldValue.increment()` in the same write as each
  `UsageLog` create. Same idea for `ConversationSession.totalMessages`, which Prisma tracked
  automatically but Firestore won't — needs an explicit increment on each message write.
- **Messages / LappScores**: move from a flat top-level collection filtered client-side to
  `conversationSessions/{sessionId}/messages` and `.../lappScores` subcollections. "All messages for
  this session" becomes a subcollection read with no filter needed at all, sidesteps bug #1 entirely,
  and caps read cost to that session instead of the whole table.
- **ObservationNotes**: queries are always scoped by `invitationId` (optionally `sessionId`). Subcollection
  under `invitations/{id}/observationNotes` avoids needing a composite index for the common case;
  add a `researcherId` field on the doc if "my notes across invitations" is ever needed (would then
  need a collection-group query + index on `researcherId`).
- **TelemetryEvents / UsageLogs**: these are genuinely cross-user for the admin dashboard, so keep them
  as flat top-level collections rather than subcollections. Once the shim (or direct Firestore calls)
  support real filtering, add composite indexes for the actual query shapes in `telemetry.ts`:
  `(name, createdAt)`, `(createdAt)` alone for the total-count query, and `(userId, createdAt)` /
  `(invitationId, timestamp)` for `UsageLog` (mirrors the existing Prisma `@@index` list almost exactly).
- **Users/Invitations admin lists**: `invitation.list` and `user.list` are per-admin/staff scoped
  (`createdById`, or full list for admins). Flat collections with a composite index on
  `(createdById, createdAt)` cover this; no subcollection needed since invitations aren't nested under
  a single parent in the UI.
- **Scenarios/QuotaPresets**: small, mostly-static reference data (seeded via `seedDatabase.ts`).
  Fine as flat collections; just needs a single-field index on `isActive` (Firestore auto-creates
  single-field indexes, so this one's actually free) and `sortOrder` for presets.

## Suggested order of work

1. Fix or replace the shim's `findMany`/`count`/`aggregate`/compound-key `findUnique` — this unblocks
   Google login and quota enforcement, which are both currently broken on `firestore-pr`, not just
   "not yet migrated."
2. Add the `String(id)` coercion at call sites for Int-keyed models, or centralize it inside the shim
   so callers don't have to remember it.
3. Deploy Firestore composite indexes before real usage grows. The current local-dev code can avoid
   some index failures by sorting small result sets in memory, but production should deploy
   `firestore.indexes.json` with:
   `npx -y firebase-tools@latest deploy --only firestore:indexes --project convolab-490517`.
4. Migrate messages/lappScores to subcollections while touching that code anyway (kills two birds:
   fixes bug #1 exposure and the "fetch entire collection" cost problem in `data/messages.ts`).
5. Decide on cascade-delete strategy for User/Session deletes (explicit batch delete helper, or a
   Cloud Function trigger) before relying on delete flows in production.
6. Align `feedback.ts` with the `packages/api/src/data/` pattern once the shim is trustworthy — not
   urgent since it currently works.
