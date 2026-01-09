# Conversation Coach

AI-powered conversation practice with dual streaming (dialog partner + coach).

## Quick Start

```bash
docker compose up --build
```

Then open http://localhost:5173 — the app will guide you through configuration.

> After pulling new changes, use `docker compose up --build -V` to rebuild and reset volumes.

<details>
<summary>Alternative: configure first, then run</summary>

```bash
cp .env.example .env
# Edit .env: add ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
docker compose up --build
```

Or with [Task](https://taskfile.dev):
```bash
task setup    # Creates .env
task up:bg    # Start containers in background
```

</details>

See [QUICKSTART.md](./QUICKSTART.md) for detailed instructions including Google OAuth setup.

## Architecture

See [conversation-coach-architecture.md](./conversation-coach-architecture.md) for details.

**Stack:**
- **Backend:** Fastify 5 + tRPC 11 + WebSocket
- **Database:** PostgreSQL 17 + Prisma 7
- **Frontend:** Vite 7 + React 19 + TanStack Query 5
- **Landing:** Astro 5
- **Auth:** Google OAuth + invitation links
- **Monorepo:** pnpm workspaces
- **Linting:** Biome

## Project Structure

```
packages/
├── database/    # Prisma schema + types
├── api/         # Fastify server
├── app/         # React SPA
└── landing/     # Astro pages
docs/
└── plans/       # Implementation phases
```

## For Contributors

Use AI assistants freely. Rapid prototyping > perfect code. Multiple experimental implementations are welcome.

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Dev workflow
- [docs/plans/](./docs/plans/) - Implementation phases

## Implementation Status

### Done
- [x] Full-stack foundation (Docker, Prisma, tRPC, Google OAuth, auto-migrations)
- [x] Multi-provider LLM streaming (Anthropic, OpenAI, Google via WebSocket)
- [x] Invitation system (magic links with token quotas)
- [x] Conversation practice (dual AI partner + coach, custom scenarios)
- [x] Research tools (QR codes, live observation, notes, admin UI, telemetry)

### Future
- [ ] Coach aside (private Q&A with coach mid-conversation)
- [ ] Voice integration
- [ ] Consolidate landing page into React app
- [ ] Runtime model discovery (dynamic model selection)

## Useful Commands

Run `task --list` for all commands, or see [QUICKSTART.md](./QUICKSTART.md) for details.
