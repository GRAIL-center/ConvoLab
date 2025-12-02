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
# 1. Install Task (optional but recommended)
brew install go-task/tap/go-task

# 2. Setup
task setup          # Creates .env
# Edit .env: add ANTHROPIC_API_KEY

# 3. Start
task up:bg          # Start containers
task migrate        # Create tables + seed

# 4. Open http://localhost:5173
```

**Without Task:**
```bash
cp .env.example .env
docker compose up --build
docker compose exec api sh -c "cd packages/database && pnpm migrate"
```

## For Contributors

Use AI assistants freely. Rapid prototyping > perfect code. Multiple experimental implementations are welcome.

- [QUICKSTART.md](./QUICKSTART.md) - Setup details
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Dev workflow
- [docs/plans/](./docs/plans/) - Implementation phases

## Implementation Status

### Done
- [x] Project structure + Docker setup
- [x] Prisma schema (basic)
- [x] Taskfile automation

### In Progress
- [ ] Auth (Google OAuth + invitations)
- [ ] tRPC routers
- [ ] WebSocket handler (dual AI streaming)

### Future
- [ ] Conversation UI
- [ ] User testing (QR codes, researcher observations)
- [ ] Admin interface
- [ ] Voice integration

## Useful Commands

Run `task --list` for all commands, or see [QUICKSTART.md](./QUICKSTART.md) for details.
