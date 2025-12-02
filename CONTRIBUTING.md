# Contributing to Conversation Coach

Thank you for contributing! This guide covers development setup, coding standards, and workflow.

## Welcome! 🎉

**New to web development or this stack?** Perfect! This project is a learning opportunity. We encourage:

### AI-Assisted Development

**Use AI coding assistants liberally!** Tools like Claude, GitHub Copilot, ChatGPT, and Cursor are fantastic for:
- Understanding unfamiliar code patterns
- Generating boilerplate code
- Learning new frameworks (React, Fastify, Prisma, etc.)
- Debugging and troubleshooting
- Exploring different implementation approaches

**Example prompts you might use:**
- "Explain how this tRPC router works"
- "Help me create a React component that displays conversation messages"
- "Debug this Prisma query error"
- "Show me how to add WebSocket support to Fastify"

### Disposable Prototypes

As Andrew Ng advocates: **disposable prototypes are incredibly valuable!**

Don't be afraid to:
- Build multiple versions of the same feature
- Experiment with different approaches in parallel
- Create quick prototypes to test ideas
- Throw away code that doesn't work

**It's perfectly fine to have 3 developers working on 3 different implementations of the same feature!** We'll learn what works best through experimentation.

### Learning by Doing

- Start with small changes
- Break features into tiny pieces
- Ask questions in PRs
- Learn from code reviews
- Iterate quickly

## Getting Started

### Prerequisites

- **Docker Desktop** (Docker Compose V2)
- **Node.js 20+** (if developing locally without Docker)
- **pnpm 9+** (install via `npm install -g pnpm`)
- **Task** (optional, recommended): `brew install go-task/tap/go-task`

### Quick Setup

```bash
# Clone the repository
git clone <repository-url>
cd conversation-coach

# Set up environment
task setup  # or: cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start services
task up:bg  # or: docker compose up -d --build

# Run migrations
task migrate  # or: docker compose exec api sh -c "cd packages/database && pnpm migrate"

# Verify everything works
task status  # or: docker compose ps
```

Open http://localhost:5173 to see the app.

## Development Workflows

### Docker Development (Recommended)

**Pros**: No local Node.js setup, matches production environment, isolated dependencies

```bash
# Start services
task up:bg

# View logs
task logs:api
task logs:app

# Run commands in containers
docker compose exec api sh -c "pnpm -F @workspace/api add <package>"
docker compose restart api

# Stop services
task down
```

### Local Development (Without Docker)

**Pros**: Faster hot reloading, easier debugging, familiar IDE integration

```bash
# Install dependencies
pnpm install

# Start only the database in Docker
task local:db:up  # or: docker compose up -d db

# Generate Prisma client
pnpm -F @workspace/database generate

# Run migrations
task local:migrate  # or: pnpm db:migrate

# Start dev servers
task local:dev  # or: pnpm dev
```

This runs API and app locally while using Docker for PostgreSQL.

### Hybrid Approach

Run some services in Docker, others locally:

```bash
# Start only database and API in Docker
docker compose up -d db api

# Run app locally for fast iteration
cd packages/app
pnpm dev
```

## Project Structure

```
packages/
├── database/    # Shared Prisma schema and types
├── api/         # Fastify backend + tRPC + WebSockets
├── app/         # React frontend
└── landing/     # Astro landing pages
```

All packages share types via `@workspace/database` - changes to the database schema automatically propagate.

## Making Changes

### Database Schema Changes

1. Edit `packages/database/prisma/schema.prisma`
2. Generate Prisma client:
   ```bash
   pnpm -F @workspace/database generate
   ```
3. Create migration:
   ```bash
   task migrate  # or: pnpm db:migrate
   ```
4. Types are now updated across all packages!

### Adding API Endpoints (tRPC)

1. Create or edit router in `packages/api/src/routers/`
2. Import types from `@workspace/database`
3. Export router in `packages/api/src/routers/index.ts`
4. Frontend automatically gets type-safe access

Example:
```typescript
// packages/api/src/routers/scenarios.ts
import { router, publicProcedure } from '../trpc';
import { prisma } from '@workspace/database';
import { z } from 'zod';

export const scenariosRouter = router({
  list: publicProcedure.query(async () => {
    return prisma.scenario.findMany({ where: { isActive: true } });
  }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return prisma.scenario.findUnique({ where: { id: input.id } });
    }),
});
```

### Adding React Components

1. Create component in `packages/app/src/components/`
2. Use tRPC hooks from `~/trpc`
3. Follow existing Tailwind patterns

Example:
```typescript
// packages/app/src/components/ScenarioList.tsx
import { trpc } from '~/trpc';

export function ScenarioList() {
  const { data: scenarios, isLoading } = trpc.scenarios.list.useQuery();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {scenarios?.map((scenario) => (
        <div key={scenario.id}>{scenario.name}</div>
      ))}
    </div>
  );
}
```

### Installing Packages

**In Docker:**
```bash
# API package
task install:api -- fastify-plugin
# or: docker compose exec api pnpm -F @workspace/api add fastify-plugin

# App package
task install:app -- zustand
# or: docker compose exec app pnpm -F @workspace/app add zustand

# Restart service after installing
task restart:api  # or: docker compose restart api
```

**Locally:**
```bash
pnpm -F @workspace/api add <package>
pnpm -F @workspace/app add <package>
pnpm -F @workspace/database add -D <package>
```

## Code Style

### TypeScript

- Use TypeScript strict mode (enabled by default)
- Prefer `interface` over `type` for object shapes
- Use Prisma-generated types, don't duplicate
- Avoid `any` - use `unknown` if type is truly unknown

### React

- Functional components with hooks
- Use TanStack Query for server state (via tRPC)
- Use React state for local UI state
- Prefer composition over prop drilling

### File Naming

- React components: `PascalCase.tsx`
- Utilities: `camelCase.ts`
- API routes: `camelCase.ts`
- Types: Co-locate with usage or import from `@workspace/database`

### Formatting

This project uses your IDE's default TypeScript formatting. Be consistent with existing code style.

## Testing (TODO)

Testing infrastructure is not yet set up. When implemented:

```bash
# Run all tests
task test  # or: pnpm test

# Run API tests
pnpm -F @workspace/api test

# Run app tests
pnpm -F @workspace/app test
```

## Common Tasks

### Viewing the Database

**Prisma Studio** (visual interface):
```bash
task db:studio  # or: docker compose exec api sh -c "cd packages/database && pnpm studio"
```

Opens at http://localhost:5555

**Direct SQL**:
```bash
docker compose exec db psql -U postgres -d conversation_coach
```

### Resetting the Database

**WARNING: This deletes all data!**

```bash
task db:reset
# or:
docker compose down -v
docker compose up -d db
task migrate
```

### Debugging

**API logs**:
```bash
task logs:api
# or: docker compose logs -f api
```

**App logs**:
```bash
task logs:app
# or: docker compose logs -f app
```

**Interactive shell**:
```bash
task shell:api  # or: docker compose exec api sh
task shell:app  # or: docker compose exec app sh
```

### Building for Production

```bash
# Build all packages
pnpm build

# Build specific package
pnpm -F @workspace/api build
pnpm -F @workspace/app build
pnpm -F @workspace/landing build
```

## Git Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `chore/` - Maintenance tasks

Example: `feature/websocket-dual-streaming`

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add dual AI streaming to conversation handler
fix: resolve Prisma connection error on startup
docs: update CONTRIBUTING with local dev setup
refactor: extract auth middleware to separate file
chore: upgrade dependencies to latest versions
```

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Test locally (run builds, check functionality)
4. Push to GitHub and open a pull request
5. Request review from maintainers
6. Address feedback
7. Merge when approved

## Environment Variables

### Required

- `ANTHROPIC_API_KEY` - Get from https://console.anthropic.com/
- `DATABASE_URL` - Automatically set by Docker Compose

### Optional

- `SESSION_KEY` - 64-char hex for encrypted sessions
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `FRONTEND_URL` - Frontend URL for CORS

See `.env.example` for full list.

## Troubleshooting

### "Port already in use"

```bash
# Find what's using the port
lsof -i :5432  # Database
lsof -i :3000  # API
lsof -i :5173  # App

# Stop all containers
docker compose down
```

### "Prisma Client not generated"

```bash
pnpm -F @workspace/database generate
docker compose restart api
```

### "Can't connect to database"

```bash
# Check database is running
docker compose ps

# View database logs
docker compose logs db

# Restart database
docker compose restart db
```

### Changes not reflecting

**API changes:**
```bash
docker compose restart api
```

**App changes**: Should hot-reload automatically. If not:
```bash
docker compose restart app
```

**Prisma schema changes:**
```bash
pnpm -F @workspace/database generate
docker compose restart api
```

### Docker build issues

```bash
# Clean rebuild
docker compose down -v
docker system prune -af
docker compose up --build
```

## Package-Specific Documentation

- [Database Package](./packages/database/README.md) - Prisma schema and migrations
- [API Package](./packages/api/README.md) - Backend routes and WebSockets
- [App Package](./packages/app/README.md) - Frontend components
- [Landing Package](./packages/landing/README.md) - Astro landing pages

## Architecture & Design

See [conversation-coach-architecture.md](./conversation-coach-architecture.md) for:
- System architecture and design decisions
- Implementation guidance for key features
- Deployment strategy
- Future roadmap

## Getting Help

- **Documentation**: Start with [QUICKSTART.md](./QUICKSTART.md)
- **Architecture**: See [conversation-coach-architecture.md](./conversation-coach-architecture.md)
- **Taskfile**: Run `task --list` to see all available commands
- **Issues**: Check existing issues or create a new one

## Code of Conduct

Be respectful, collaborative, and constructive. This is an educational project - help others learn!
