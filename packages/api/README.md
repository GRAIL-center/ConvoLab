# API Package

Fastify backend server with tRPC API and WebSocket support for the Conversation Coach application.

## Overview

This package provides:
- **Fastify 5** server with TypeScript
- **tRPC 11** type-safe API layer
- **WebSocket** support for real-time AI streaming (TODO)
- **Authentication** via Passport.js (TODO)
- **Database access** via Prisma (shared from `@workspace/database`)

## Stack

- **Fastify 5**: High-performance web framework
- **tRPC 11**: End-to-end type-safe API
- **Passport.js**: Authentication (email + SAML)
- **Anthropic SDK 0.71**: AI streaming
- **ws 8**: WebSocket library
- **Zod 4**: Schema validation

## Project Structure

```
packages/api/src/
├── server.ts          # Fastify entry point
├── trpc.ts            # tRPC setup and context
├── routers/           # tRPC API endpoints (TODO)
│   ├── scenarios.ts
│   ├── sessions.ts
│   ├── users.ts
│   └── index.ts
├── websockets/        # WebSocket handlers (TODO)
│   └── conversation.ts
├── auth/              # Passport.js auth (TODO)
│   ├── strategies/
│   └── middleware.ts
└── services/          # Business logic (TODO)
    └── ai.ts
```

## Running the Server

### In Docker (Recommended)

```bash
# Start all services
docker compose up

# View API logs
docker compose logs -f api

# Restart after code changes
docker compose restart api
```

The API runs on **http://localhost:3000**

### Locally

```bash
# Start database in Docker
docker compose up -d db

# Install dependencies (from root)
pnpm install

# Run dev server
pnpm -F @workspace/api dev
```

## Environment Variables

Required in `.env`:

```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/conversation_coach"

# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Frontend (for CORS)
FRONTEND_URL=http://localhost:5173

# Auth
AUTH_METHOD=email  # or "saml"
SESSION_SECRET=your-secret-key

# SAML (optional, if AUTH_METHOD=saml)
# SAML_ENTRY_POINT=...
# SAML_ISSUER=...
# SAML_CERT=...
```

## API Endpoints

### Health Check

```bash
curl http://localhost:3000/health
# Response: { "status": "ok" }
```

### tRPC Endpoints (TODO)

Once implemented, tRPC routes will be available at `/trpc/*`:

**Scenarios**:
- `scenarios.list` - Get available scenarios
- `scenarios.get` - Get scenario by ID

**Sessions**:
- `sessions.create` - Start new conversation
- `sessions.list` - Get user's sessions
- `sessions.get` - Get session with messages

**Users**:
- `users.me` - Get current user info

Example usage (from frontend):
```typescript
const scenarios = await trpc.scenarios.list.query();
```

### WebSocket Endpoints (TODO)

Real-time conversation streaming:

```
ws://localhost:3000/ws/conversation/:sessionId
```

## Development

### Adding a New tRPC Route

1. Create router file:

```typescript
// src/routers/scenarios.ts
import { router, publicProcedure } from '../trpc';
import { prisma } from '@workspace/database';
import { z } from 'zod';

export const scenariosRouter = router({
  list: publicProcedure.query(async () => {
    return prisma.scenario.findMany({
      where: { isActive: true },
    });
  }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return prisma.scenario.findUnique({
        where: { id: input.id },
      });
    }),
});
```

2. Export in `src/routers/index.ts`:

```typescript
import { router } from '../trpc';
import { scenariosRouter } from './scenarios';

export const appRouter = router({
  scenarios: scenariosRouter,
  // ... other routers
});

export type AppRouter = typeof appRouter;
```

3. Frontend automatically gets types!

### Installing Packages

```bash
# From root
pnpm -F @workspace/api add <package>

# In Docker
docker compose exec api pnpm -F @workspace/api add <package>
docker compose restart api
```

### Debugging

**View logs**:
```bash
docker compose logs -f api
```

**Interactive shell**:
```bash
docker compose exec api sh
```

**Connect to running process** (local dev):
```bash
# Add debugger; statement in code
# Start with Node inspector:
node --inspect src/server.ts
```

## Key Implementation Areas (TODO)

### 1. Authentication

**Location**: `src/auth/`

Set up Passport.js with two strategies:
- Local strategy (email/password)
- SAML strategy (Purdue SSO)

Toggle via `AUTH_METHOD` environment variable.

### 2. WebSocket Handler

**Location**: `src/websockets/conversation.ts`

Implement dual AI streaming:
1. Accept user message via WebSocket
2. Save message to database
3. Start two parallel Anthropic API streams:
   - Partner AI (responds in character)
   - Coach AI (provides feedback)
4. Forward both streams to client in real-time
5. Save AI responses when complete

### 3. tRPC Routers

**Location**: `src/routers/`

Implement CRUD endpoints for:
- Scenarios (list, get, create, update, delete)
- Sessions (create, get, list)
- Messages (list with pagination)
- Users (me, update)

### 4. Business Logic

**Location**: `src/services/`

Extract complex logic into services:
- AI service (manage Anthropic API calls)
- Conversation service (maintain context)
- Auth service (user management)

## Testing (TODO)

```bash
# Run tests
pnpm -F @workspace/api test

# In Docker
docker compose exec api pnpm test
```

## Building for Production

```bash
# Compile TypeScript
pnpm -F @workspace/api build

# Run compiled output
pnpm -F @workspace/api start
```

Output goes to `dist/` directory.

## Type Safety

The API is fully type-safe end-to-end:

```typescript
// API definition
export const scenariosRouter = router({
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return prisma.scenario.findUnique({ where: { id: input.id } });
    }),
});

// Frontend usage (automatic types!)
const scenario = await trpc.scenarios.get.query({ id: 1 });
//    ^? Scenario | null (TypeScript knows the shape!)
```

No manual type definitions needed!

## Performance Considerations

### Connection Pooling

Prisma handles connection pooling automatically. For high-traffic deployments, consider [Prisma Accelerate](https://www.prisma.io/accelerate).

### Rate Limiting (TODO)

Add rate limiting for API endpoints:

```typescript
import rateLimit from '@fastify/rate-limit';

fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});
```

### CORS Configuration

CORS is configured to allow the frontend:

```typescript
fastify.register(cors, {
  origin: process.env.FRONTEND_URL,
  credentials: true,
});
```

Update `FRONTEND_URL` for production.

## Troubleshooting

### "Can't connect to database"

Check `DATABASE_URL` in `.env`:

```bash
# Verify database is running
docker compose ps db

# Check connection
docker compose exec db psql -U postgres -d conversation_coach
```

### "Port 3000 already in use"

```bash
# Find what's using the port
lsof -i :3000

# Stop conflicting service or change PORT in .env
```

### "Prisma Client not generated"

```bash
pnpm -F @workspace/database generate
docker compose restart api
```

### Hot reload not working

Restart the API container:

```bash
docker compose restart api
```

## Resources

- [Fastify Documentation](https://fastify.dev/)
- [tRPC Documentation](https://trpc.io/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Anthropic API Docs](https://docs.anthropic.com/)
- [Passport.js Guide](https://www.passportjs.org/)

## Next Steps

Priority implementation order:
1. Set up authentication (Passport.js)
2. Implement tRPC routers (CRUD endpoints)
3. Build WebSocket handler (dual AI streaming)
4. Add rate limiting and security hardening
5. Create admin interface (AdminJS or custom)

See [conversation-coach-architecture.md](../../conversation-coach-architecture.md) for detailed implementation guidance.
