# Conversation Coach

AI-powered conversation practice with dual streaming (dialog partner + coach).

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

## Quick Start

```bash
cp .env.example .env
# Edit .env: add ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

docker compose up --build  # Auto-migrates on startup

# Open http://localhost:5173
```

**With Task (optional):**
```bash
brew install go-task/tap/go-task
task setup          # Creates .env
# Edit .env: add your API keys
task up:bg          # Start containers in background
```

## For Contributors

Use AI assistants freely. Rapid prototyping > perfect code. Multiple experimental implementations are welcome.

- [QUICKSTART.md](./QUICKSTART.md) - Setup details
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Dev workflow
- [docs/plans/](./docs/plans/) - Implementation phases

## Implementation Status

### Done
- [x] Project structure + Docker setup
- [x] Prisma schema (auth + conversations)
- [x] Taskfile automation
- [x] Google OAuth + sessions
- [x] Auto-migrate on Docker startup
- [x] tRPC foundation (auth, scenario routers)

### In Progress
- [ ] Invitation system (magic links with quotas)
- [ ] WebSocket handler (dual AI streaming)

### Future
- [ ] Conversation UI
- [ ] User testing (QR codes, researcher observations)
- [ ] Admin interface
- [ ] Voice integration

## Useful Commands

Run `task --list` for all commands, or see [QUICKSTART.md](./QUICKSTART.md) for details.
