# Quick Start Guide

Get the Conversation Coach app running locally with Docker Compose.

## Prerequisites

- **Docker Desktop** (or Docker + Docker Compose V2)
- **Git**
- **Recommended:** [Task](https://taskfile.dev/installation/) (optional but makes commands easier)

That's it! Everything else runs in containers.

> **Note:** This project uses modern `compose.yml` (Docker Compose V2). If you have an older Docker installation, you may need to update.

---

**⚡ Quick Path (with Taskfile):**

```bash
brew install go-task/tap/go-task  # Install Task (macOS)
task setup                        # Create .env
# Edit .env and add ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
task up:bg                        # Start services (auto-migrates)
task status                       # Verify running
# Open http://localhost:5173
```

**Manual Path (without Taskfile):** Continue reading below.

---

## Steps

### 1. Configure Environment

```bash
cp .env.example .env
```

**Edit `.env` and add your Anthropic API key:**
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Other defaults are fine for Docker-based development.

### 2. Start All Services

```bash
docker compose up --build
```

This will:
- Start PostgreSQL 17 database
- Build and start the API server (Fastify 5 + tRPC 11)
- Build and start the React 19 app (Vite 7)
- **Auto-run database migrations** on API startup
- Enable hot reloading (edit code and see changes live!)

**First-time setup takes 3-5 minutes** to build images and install dependencies.

### 3. Open in Browser

- **React app:** http://localhost:5173
- **API health check:** http://localhost:3000/health

## Development Workflow

### View Logs

```bash
# All services
docker compose logs -f

# Just API
docker compose logs -f api

# Just app
docker compose logs -f app
```

### Run Commands in Containers

```bash
# Database operations
docker compose exec api sh -c "cd packages/database && pnpm studio"  # Prisma Studio
docker compose exec api sh -c "cd packages/database && pnpm migrate"  # Run migrations
docker compose exec api sh -c "cd packages/database && pnpm seed"    # Re-seed data

# Install packages
docker compose exec api sh -c "pnpm -F @workspace/api add <package>"
docker compose exec app sh -c "pnpm -F @workspace/app add <package>"

# Restart services after package changes
docker compose restart api
docker compose restart app
```

### Stop Services

```bash
docker compose down       # Stop all services
docker compose down -v    # Stop and remove volumes (fresh database)
```

### Rebuild After Changes

```bash
# Rebuild specific service
docker compose up --build api

# Rebuild all services
docker compose up --build
```

## Hot Reloading

Both API and app support hot reloading:
- **API:** Edit files in `packages/api/src/` - server auto-restarts
- **App:** Edit files in `packages/app/src/` - browser auto-refreshes
- **Database schema:** After editing `schema.prisma`, run migrations in container

## Troubleshooting

**"Port already in use"**
```bash
# Stop all containers
docker compose down

# Check what's using the port
lsof -i :5432  # Database
lsof -i :3000  # API
lsof -i :5173  # App
```

**"Can't connect to database"**
```bash
# Check database is running
docker compose ps

# View database logs
docker compose logs db

# Restart database
docker compose restart db
```

**Prisma errors**
```bash
# Regenerate Prisma Client (needed after pulling Prisma 7 upgrade)
docker compose exec api sh -c "cd packages/database && pnpm generate"

# Reset database (WARNING: deletes all data)
docker compose down -v
docker compose up -d db
docker compose exec api sh -c "cd packages/database && pnpm migrate"
```

**"Prisma schema validation error" after upgrading**

This project uses Prisma 7 with a new connection pattern. If you pulled recent changes:
```bash
pnpm install
pnpm -F @workspace/database generate
docker compose restart api
```

See [packages/database/README.md](./packages/database/README.md) for Prisma 7 migration details.

**Need to rebuild from scratch**
```bash
docker compose down -v
docker system prune -af
docker compose up --build
```

## Local Development (Without Docker)

If you prefer to run services locally:

1. Install Node.js 20+ and pnpm
2. Start PostgreSQL: `docker compose up -d db`
3. Install dependencies: `pnpm install`
4. Run migrations: `pnpm db:migrate`
5. Start dev servers: `pnpm dev`

See original README for details.

## What's Next?

Auth is done. Core features still need implementation:

1. **tRPC routers** - CRUD endpoints in `packages/api/src/trpc/routers/`
2. **Invitation system** - Magic links with quotas
3. **WebSocket handler** - Dual AI streaming in `packages/api/src/websockets/`
4. **React UI** - Conversation interface in `packages/app/src/`

See [docs/plans/](./docs/plans/) for implementation phases.

## Project Structure

```
packages/
├── database/           # Prisma 7 schema + types (shared across services)
├── api/                # Fastify 5 + tRPC 11 server
├── app/                # React 19 + Vite 7 SPA
└── landing/            # Astro 5 landing pages (static)
```

All services share types via `@workspace/database` for full type safety.

See package-specific READMEs for detailed documentation:
- [Database Package](./packages/database/README.md) - Prisma 7 setup and schema
- [API Package](./packages/api/README.md) - tRPC routes and WebSocket handlers
- [App Package](./packages/app/README.md) - React components and state
- [Landing Package](./packages/landing/README.md) - Astro pages
