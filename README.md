# Conversation Coach

AI-powered conversation practice with dual streaming (dialog partner + coach).

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
task up:bg          # Start containers in background
```

> **Tip:** If you skip any configuration, the app will show a setup guide when you open it, walking you through what's needed.

See [QUICKSTART.md](./QUICKSTART.md) for detailed setup instructions including Google OAuth configuration.

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
- [x] Project structure + Docker setup
- [x] Prisma schema (auth + conversations)
- [x] Taskfile automation
- [x] Google OAuth + sessions
- [x] Auto-migrate on Docker startup
- [x] tRPC foundation (auth, scenario, session, invitation routers)
- [x] Invitation system (magic links with quotas)
- [x] LLM provider abstraction (Anthropic, OpenAI, Google)
- [x] WebSocket streaming (dual AI: partner + coach)
- [x] Conversation UI
- [x] Custom scenarios (user-defined conversation partners)
- [x] Telemetry

### Future
- [ ] User testing features (QR codes, researcher observations)
- [ ] Admin/research UI improvements
- [ ] Coach aside (private Q&A with coach)
- [ ] Voice integration

## Useful Commands

Run `task --list` for all commands, or see [QUICKSTART.md](./QUICKSTART.md) for details.
