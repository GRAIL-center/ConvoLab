# Claude Code Context

## What This Project Is

Dual-stream AI conversation practice app: user talks to a simulated "dialog partner" (angry uncle, difficult ex, etc.) while a "coach" AI provides real-time guidance. The coach sees both conversations; the partner only sees its own.

## Key Context From Recent Sessions

### Auth Model
Progressive auth with OAuth + invitations:

- **Anonymous users**: User record with no ExternalIdentity, role=GUEST. Created when opening invitation link.
- **Authenticated users**: User with ExternalIdentity (Google, etc.), role>=USER
- **ExternalIdentity**: Separate table. Supports multiple OAuth accounts per user (e.g., personal + work Google).
- **ContactMethod**: Separate table for email/phone/whatsapp. One primary per type. Not used for auth, just contact info.
- **Merge**: If anonymous user authenticates with OAuth already linked elsewhere, their data auto-merges into existing user. Frontend gets `mergedFrom` flag to show notification.

Auth code: `packages/api/src/routes/auth.ts`

### Implementation Plans Live in `docs/plans/`
Remaining phases:
- `03-trpc-foundation.md` - Next
- `04-invitation-system.md`
- `05-frontend-auth.md` - Partially done (UserMenu exists)
- `06-user-testing.md`
- `schema-reference.md` - Current Prisma schema

### Invitation Model
- Opening invitation creates anonymous User immediately (for session continuity)
- Single-user, multi-session (one person can have multiple conversations)
- Absolute token quota (not daily limits) - once exhausted, it's gone
- Quota stored as JSON: `{ tokens: 25000, label: "Short conversation" }`
- User can link OAuth later without losing session data

### Quota Presets
Inviter picks from admin-defined presets like:
- "Quick chat" (10k tokens)
- "Short conversation" (25k tokens)
- "Therapy session" (50k tokens)

Exact values TBD through experimentation.

## Short-Term Goal: User Testing

Facilitate small-scale guerrilla user testing ("quad + Starbucks gift cards" approach):

- **QR codes** for invitation links - easy to share in person
- **Researcher observation UI** - take notes while watching someone try it
- Link observation notes to specific sessions

Priority: Get something testable in front of real users quickly.

## Working Style

- **No time estimates**: Don't say "this will take 2 weeks". Just describe what needs doing.
- **Disposable prototypes welcome**: Multiple experimental implementations are fine.
- **Concise docs**: Primary audience is Claude Code. No boilerplate.
- **AI-assisted coding is the norm**: This project embraces it fully.

## Technical Notes

### Two Git Remotes
```bash
origin  → github.itap.purdue.edu (Purdue internal)
github  → github.com/GRAIL-center (public)
```
Push to both: `git push origin <branch> && git push github <branch>`

### Monorepo Structure
```
packages/
├── database/  → @workspace/database (Prisma, shared types)
├── api/       → @workspace/api (Fastify + tRPC)
├── app/       → @workspace/app (React + Vite)
└── landing/   → @workspace/landing (Astro)
```

### Prisma 7 Pattern
No URL in schema. Connection passed at runtime:
```typescript
new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
```

### Session Storage
Stateless encrypted cookies via `@fastify/secure-session`. No Redis, no database sessions. 7-day expiry.

### Ports & Routing
Everything through frontend origin. Vite proxies `/api/*` and `/ws/*` to API.

| Service | Dev Port | URL |
|---------|----------|-----|
| Frontend | 5173 | `http://localhost:5173` |
| API | 3000 | Accessed via Vite proxy |

Google OAuth configured for `http://localhost:5173` origin. Callback at `/api/auth/google/callback` (proxied).

Production: same pattern - single origin, path-based routing to services.

### Linting & Formatting
Biome for both linting and formatting. Run `pnpm check` to lint + format.

## Don't Forget

- Run `pnpm -F @workspace/database generate` after schema changes
- The `docs/plans/schema-reference.md` has the full target Prisma schema
- Current branch is `realtime-typesafe`, not `main`
