# Claude Code Context

## What This Project Is

Dual-stream AI conversation practice app: user talks to a simulated "dialog partner" (angry uncle, difficult ex, etc.) while a "coach" AI provides real-time guidance. The coach sees both conversations; the partner only sees its own.

## Key Context From Recent Sessions

### Auth Pivot (December 2024)
**Original plan**: Passport.js with email/password + Purdue SAML SSO.
**New plan**: Google OAuth + invitation links with quotas.

**Why**: Purdue IT is in a multi-year security lockdown after major incidents. SAML integration would take months of administrative hurdles. Cloud-first prototyping is faster.

The docs have been updated but git history still has SAML/Passport references. Ignore those.

### Implementation Plans Live in `docs/plans/`
Not in the architecture doc. The phase files are the source of truth:
- `00-doc-cleanup.md` - Done
- `01-database-schema.md` - Next
- `02-session-oauth.md`
- `03-trpc-foundation.md`
- `04-invitation-system.md`
- `05-frontend-auth.md`
- `schema-reference.md` - Full Prisma schema for copy/paste

### Invitation Model (Not "Magic Links")
- Single-user, multi-session (one person can have multiple conversations)
- Absolute token quota (not daily limits) - once exhausted, it's gone
- Quota stored as JSON for flexibility: `{ tokens: 25000, label: "Short conversation" }`
- Progressive auth: guests can use invitations without login, but get nudged to link Google account
- Eventually can require auth for invitation to keep working

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

## Don't Forget

- Run `pnpm -F @workspace/database generate` after schema changes
- The `docs/plans/schema-reference.md` has the full target Prisma schema
- Current branch is `realtime-typesafe`, not `main`
