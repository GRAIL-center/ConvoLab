# Conversation Coach

AI-powered conversation practice app with dual streaming (dialog partner + coach) and future voice integration.

## Architecture

See [conversation-coach-architecture.md](./conversation-coach-architecture.md) for detailed technical design decisions.

**Stack:**
- **Backend:** Fastify 5 + tRPC 11 + WebSockets (Node.js/TypeScript)
- **Database:** PostgreSQL 17 + Prisma 7 ORM
- **Frontend:** Vite 7 + React 19 + TanStack Query 5
- **Landing:** Astro 5 (static site generation)
- **Monorepo:** pnpm workspaces

## Project Structure

```
packages/
├── database/    # Prisma schema + generated types (shared)
├── api/         # Fastify server (tRPC + WebSockets)
├── app/         # React SPA (main application)
└── landing/     # Astro landing pages (public)
```

## For New Contributors

**Welcome!** This project is designed to be approachable whether you're an experienced developer or just getting started.

### Use AI Assistance!

We **strongly encourage** using AI coding assistants (Claude, GitHub Copilot, ChatGPT, etc.) to:
- Understand the codebase
- Prototype features quickly
- Learn new technologies
- Debug issues

**Disposable prototypes are valuable!** As Andrew Ng says, rapid experimentation is key. Don't worry about building the "perfect" solution - build quickly, learn, and iterate. It's totally fine to have multiple implementations of the same feature as experiments running in parallel.

### Questions?

- Check the [QUICKSTART.md](./QUICKSTART.md) for setup
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow
- Read [conversation-coach-architecture.md](./conversation-coach-architecture.md) for system design
- Package-specific READMEs in each `packages/*/README.md` folder

## Getting Started

**Quick start with Taskfile (recommended):**

```bash
# 1. Install Task (if not already installed)
brew install go-task/tap/go-task  # macOS
# or: https://taskfile.dev/installation/

# 2. Set up environment
task setup          # Creates .env file
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Start services and initialize database
task up:bg          # Start in background
task migrate        # Create tables + seed data

# 4. Open http://localhost:5173
task status         # Check everything is running
```

**Without Taskfile:**

```bash
cp .env.example .env            # Edit and add ANTHROPIC_API_KEY
docker compose up --build       # Start all services (first build takes 3-5 min)
docker compose exec api sh -c "cd packages/database && pnpm migrate"
```

> **Note:** This project uses modern `compose.yml` (not `docker-compose.yml`). Requires Docker Compose V2+.

See [QUICKSTART.md](./QUICKSTART.md) for detailed instructions and troubleshooting.

### Local Development (Without Docker)

If you prefer to run services locally:

1. Install Node.js 20+ and pnpm 9+
2. Start PostgreSQL: `docker compose up -d db`
3. Install dependencies: `pnpm install`
4. Copy `.env.example` to `.env` and configure
5. Generate Prisma client: `pnpm -F @workspace/database generate`
6. Run migrations: `pnpm db:migrate`
7. Start dev servers: `pnpm dev`

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed local development setup.

### Useful Commands

**With Taskfile (recommended):**

```bash
task                    # Show help and common workflows
task --list             # List all available tasks

# Daily development
task up                 # Start services (foreground)
task up:bg              # Start services (background)
task logs:api           # View API logs
task logs:app           # View app logs
task down               # Stop services

# Database
task migrate            # Run migrations
task db:studio          # Open Prisma Studio
task db:seed            # Re-seed sample data
task db:reset           # Fresh database (deletes all data!)

# Package management
task install:api -- <package>    # Install in API
task install:app -- <package>    # Install in app

# Cleanup
task clean              # Remove containers & data
task restart            # Restart all services
```

**Without Taskfile:**

```bash
# Docker commands
docker compose up --build                  # Start services
docker compose logs -f api                 # View API logs
docker compose exec api sh -c "cd packages/database && pnpm migrate"
docker compose exec api sh -c "cd packages/database && pnpm studio"
docker compose down                        # Stop services
docker compose down -v                     # Stop and remove volumes

# Local development (requires pnpm install)
pnpm dev                                   # Start API + App locally
pnpm db:migrate                            # Run migrations (needs local DB)
pnpm -F @workspace/api add <package>       # Add package to API
pnpm -F @workspace/app add <package>       # Add package to App
```

## Key Implementation Areas

### TODO: Core Features

- [ ] **Authentication** (Passport.js with email + SAML)
- [ ] **tRPC routers** (scenarios, sessions, users)
- [ ] **WebSocket handler** for dual AI streaming
- [ ] **Conversation manager** (partner + coach contexts)
- [ ] **React conversation UI** (dual chat streams)
- [ ] **Admin interface** (AdminJS or custom)

See architecture doc for detailed implementation guidance.

## Deployment

Target: Google Cloud Run (3 services)

```bash
# Deploy via GitHub Actions
git push origin main
```

See `.github/workflows/deploy.yml` (TODO: create)

## Recent Updates

**December 2024**: Major dependency modernization
- Upgraded to Prisma 7 (new connection pattern - see [database README](./packages/database/README.md))
- Upgraded to React 19 with improved type safety
- Upgraded to Astro 5 with static site generation
- Modernized Docker Compose configuration (`compose.yml`)

If you're pulling recent changes, run:
```bash
pnpm install
pnpm -F @workspace/database generate
```

## Migration from Django Template

Files to copy selectively from `django-react-template`:
- [ ] Frontend layout components
- [ ] TailwindCSS Purdue branding config
- [ ] Font imports and CSS
- [ ] GitHub Actions structure (adapt)

## License

See [LICENSE](./LICENSE)
