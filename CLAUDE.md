# Claude Code Context

## What This Project Is

AI conversation practice app focused on cross-partisan political dialogue: user talks to a simulated "dialog partner" (e.g., a MAGA-aligned relative) while a "coach" AI provides real-time guidance. A third agent, the LAPP scorer, rates each user turn.

**Three agents, not two:**
- **Partner** – sees only its own conversation. Default `google:gemini-2.0-flash`, Claude fallback.
- **Coach** – sees both conversations (grouped exchanges + its own prior feedback, so it doesn't parrot the partner). Default Claude Sonnet. Supports "coach aside" (private mid-conversation Q&A).
- **LAPP scorer** – `runLappScorer()` in `packages/api/src/ws/conversation.ts` calls claude-haiku after each exchange, scores the user's turn 1–5 on Listen / Acknowledge / Pivot / Perspective plus a tone label, persists a `LappScore`, and pushes `score:update` to the client (radar chart in `LappMetricsPanel.tsx`).

Asymmetric context is built in `buildContext(role)` in `conversation.ts`.

## Datastore: Firestore via a Prisma-shaped shim

The app runs on **Firestore**. `packages/database` exports a shim that presents the Prisma API surface, so call sites read like Prisma code but hit Firestore. The Prisma schema is retained as a type reference only — no Postgres, no migrations.

Key facts:
- Data-access modules: `packages/api/src/data/{atomic,sessions,messages,users,lappScores}.ts`
- `$transaction` on the shim is **non-atomic by design** (documented tradeoff; revisit before real load)
- Partial shims fail invisibly: code type-checks and compiles, breaks at runtime on unimplemented features. Test by actually running flows — and log in *twice* (first-run tests hide defects behind empty-state short-circuits)
- Tests use an in-memory `fakeFirestore.ts` double; CI runs only `vitest.safe.config.ts` and `vitest.atomic.config.ts`. Never point tests at a real project
- `firebase.json`, `firestore.indexes.json`, and `functions/` (plain-JS Cloud Functions, outside the workspace) handle Firebase config
- ⚠️ `functions/index.js` `qualtricsWebhook` has no auth/shared-secret check

Set `FIRESTORE_PROJECT_ID` for API/runtime access; local dev uses Application Default Credentials. Postgres is fully gone — dead remnants (Taskfile db block, `db:*` scripts, QUICKSTART.md) were removed 7 Aug 2026; do not resurrect them.

## Auth Model

Progressive auth with OAuth + invitations:

- **Anonymous users**: User record with no ExternalIdentity, role=GUEST. Created when opening invitation link.
- **Authenticated users**: User with ExternalIdentity (Google, etc.), role>=USER
- **ExternalIdentity**: Supports multiple OAuth accounts per user.
- **ContactMethod**: email/phone/whatsapp contact info. Not used for auth.
- **Merge**: If anonymous user authenticates with OAuth already linked elsewhere, data auto-merges into existing user. Frontend gets `mergedFrom` flag.
- **Admin bootstrap**: `ADMIN_EMAILS` env var grants `role=ADMIN` on OAuth login. Idempotent; removing email does NOT revoke.

Auth code: `packages/api/src/auth/handlers.ts`

### Role Permissions
| Role | Create Invitations | Observation Notes | Designate STAFF |
|------|-------------------|-------------------|-----------------|
| ADMIN | ✓ | ✓ | ✓ |
| STAFF | ✓ | ✓ | ✗ |
| USER | ✗ | ✗ | ✗ |
| GUEST | ✗ | ✗ | ✗ |

STAFF = researchers who run user testing sessions. ADMIN = full system access.

## Invitation Model
- Opening invitation creates anonymous User immediately (for session continuity)
- Single-user, multi-session; absolute token quota (once exhausted, it's gone)
- Quota stored as JSON: `{ tokens: 25000, label: "Short conversation" }`
- Inviter picks from admin-defined quota presets
- User can link OAuth later without losing session data

## Working Style

- **No time estimates**: Just describe what needs doing.
- **Disposable prototypes welcome.**
- **Concise docs**: Primary audience is Claude Code. No boilerplate.
- **AI-assisted coding is the norm.**

## Technical Notes

### Git Remote
Single remote: `origin → github.com/GRAIL-center`. (The old `purdue` remote is gone.)

**PR workflow**: `git push origin <branch>` then `gh pr create`.

### Monorepo Structure
```
packages/
├── database/  → @workspace/database (Firestore shim + Prisma-shaped types)
├── api/       → @workspace/api (Fastify 5 + tRPC 11 + WebSocket)
├── app/       → @workspace/app (React 19 + Vite 7)
└── landing/   → @workspace/landing (Astro 5)
functions/     → Firebase Cloud Functions (plain JS, outside workspace)
```

`bridge/` is empty dead scaffolding. `e2e/` and `playwright-report/` are abandoned March artifacts — Playwright is not installed; there is no e2e suite to maintain.

### Running It
Docker Compose is the primary path:
```bash
gcloud auth application-default login   # api container talks to real Firestore
docker compose up --build               # api :3000, app :5173
```
`packages/database` changes need `docker compose restart api` (bind mount doesn't cover it). `Taskfile.yml` wraps common commands.

### Ports & Routing
Everything through frontend origin. Vite proxies `/api/*` and `/ws/*` to API.

| Service | Dev Port | URL |
|---------|----------|-----|
| Frontend | 5173 | `http://localhost:5173` |
| API | 3000 | Accessed via Vite proxy |

Google OAuth configured for `http://localhost:5173` origin. Callback at `/api/auth/google/callback` (proxied). Production: same single-origin pattern on Firebase/Cloud Run.

### tRPC Pattern
TanStack React Query integration (`@trpc/tanstack-react-query`) with `useTRPC()` + `queryOptions()`:

```typescript
const trpc = useTRPC();
const { data } = useQuery(trpc.auth.me.queryOptions());
```

tRPC endpoint: `/trpc`. Procedures: `publicProcedure`, `protectedProcedure`, `adminProcedure`.

### Linting & Formatting
Biome for both. Run `pnpm check`.

### Synthetic Conversations (DQI training data)
`pnpm -F @workspace/api synthetic` drives the real partner/coach/LAPP pipeline with an LLM-simulated participant and persists full sessions exactly as the app would. It refuses to run unless `FIRESTORE_EMULATOR_HOST` is set (`firebase emulators:start --only firestore`, port 8080 per firebase.json) so synthetic data never lands in the real project. `--fake-llm` switches all agents to the deterministic offline `fake:` provider (no API keys needed); `--out file.jsonl` also writes records in the same schema as the `export_transcripts*.py` scripts. `LAPP_SCORER_MODEL` env var overrides the scorer model. Covered end-to-end by `packages/api/src/cli/synthetic.test.ts` against the fake Firestore double.

## Orientation Docs

- `docs/plans/16-firestore-status-update.md` — freshest migration status write-up
- `docs/plans/15-firestore-shim-gaps.md` — technical audit with file:line detail
- `docs/plans/` — implementation phases (07 landing, 08 model discovery, 12 coach aside — the latter two shipped or partially shipped; check code before trusting a plan doc)

## Don't Forget

- Never point tests or scripts at a real Firestore project; the fake double is the only test target
- Seeding is not yet ported to Firestore (TODOs in `packages/api/src/db/firestoreHelpers.ts`)
- Composite indexes may need `firebase deploy --only firestore:indexes` after editing `firestore.indexes.json`
- The Prisma schema/migration files remain as schema-derived type scaffolding (`pnpm -F @workspace/database generate` after schema changes); don't remove them until the generated types are replaced. Historical schema reference: `docs/plans/schema-reference.md`
