# Database Package

Shared Prisma schema and database client for the Conversation Coach monorepo.

## Overview

This package contains:
- **Prisma schema** (`prisma/schema.prisma`) - Database models
- **Prisma client** (`index.ts`) - Configured PrismaClient instance
- **Migrations** (`prisma/migrations/`) - Database migration history
- **Seed data** (`prisma/seed.ts`) - Sample data for development

All other packages import types and the Prisma client from `@workspace/database`.

## Prisma 7 Configuration

This project uses **Prisma 7** with its new connection pattern.

### How it Works

**Schema (no URL)**:
```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  // Note: No url field - connection passed at runtime
}
```

**Client (URL in constructor)**:
```typescript
// index.ts
export const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,  // Connection passed here
});
```

**Migrations (config file)**:
```typescript
// prisma/prisma.config.ts
import { defineConfig } from '@prisma/client';

export default defineConfig({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
```

### Why This Change?

Prisma 7's new pattern:
- Improves security (no hardcoded connection strings)
- Enables environment-specific URLs without schema changes
- Supports Prisma Accelerate (connection pooling/caching)
- Better for multi-environment deployments

## Database Schema

### Models

**User** - Authentication and user management
- `id` - Primary key
- `email` - Unique email address
- `username` - Display name
- `passwordHash` - Hashed password (null for SAML users)
- `isStaff` - Admin flag
- `sessions` - One-to-many relationship with ConversationSession

**Scenario** - Conversation templates
- `id` - Primary key
- `name` - Display name (e.g., "Angry Uncle at Thanksgiving")
- `slug` - URL-friendly identifier
- `description` - Scenario description
- `partnerPersona` - Character description for AI
- `partnerSystemPrompt` - System prompt for conversation partner AI
- `coachSystemPrompt` - System prompt for coaching AI
- `partnerModel` - Anthropic model ID for partner
- `coachModel` - Anthropic model ID for coach
- `isActive` - Enable/disable scenario
- `sessions` - One-to-many relationship with ConversationSession

**ConversationSession** - User conversation instances
- `id` - Primary key
- `userId` - Foreign key to User
- `scenarioId` - Foreign key to Scenario
- `status` - "active" | "completed" | "abandoned"
- `startedAt` - Session start timestamp
- `endedAt` - Session end timestamp (nullable)
- `totalMessages` - Message count
- `durationSeconds` - Total duration (nullable)
- `messages` - One-to-many relationship with Message

**Message** - Individual conversation messages
- `id` - Primary key
- `sessionId` - Foreign key to ConversationSession
- `role` - "user" | "partner" | "coach"
- `content` - Message text
- `timestamp` - Message timestamp
- `audioUrl` - Voice recording URL (future, nullable)
- `metadata` - JSON metadata (tokens, latency, etc.)

## Common Commands

### Generate Prisma Client

Run after schema changes:

```bash
# From root
pnpm -F @workspace/database generate

# In Docker
docker compose exec api sh -c "cd packages/database && pnpm generate"

# With Task
task migrate  # Includes generation
```

### Create Migration

After editing the schema:

```bash
# Development (prompts for name)
pnpm -F @workspace/database migrate

# In Docker
docker compose exec api sh -c "cd packages/database && pnpm migrate"

# Production (no prompts)
pnpm -F @workspace/database migrate:deploy
```

### Seed Database

Add sample data:

```bash
# From root
pnpm db:seed

# In Docker
docker compose exec api sh -c "cd packages/database && pnpm seed"

# With Task
task db:seed
```

Current seed data:
- Test user: `test@example.com` / `password123`
- Two sample scenarios (Angry Uncle, Difficult Coworker)

### Open Prisma Studio

Visual database browser:

```bash
# From root
pnpm db:studio

# In Docker
docker compose exec api sh -c "cd packages/database && pnpm studio"

# With Task
task db:studio
```

Opens at http://localhost:5555

### Reset Database

**WARNING: Deletes all data!**

```bash
# With Task (recommended - handles restart)
task db:reset

# Manual
docker compose down -v
docker compose up -d db
pnpm -F @workspace/database migrate
```

## Usage in Other Packages

### Importing the Client

```typescript
// Import configured Prisma client
import { prisma } from '@workspace/database';

// Use in API routes
const users = await prisma.user.findMany();
```

### Importing Types

```typescript
// Import generated types
import { User, Scenario, ConversationSession, Message } from '@workspace/database';

// TypeScript automatically knows the shape
function greetUser(user: User) {
  console.log(`Hello, ${user.username}!`);
}
```

### Type-safe Queries

Prisma provides full type safety:

```typescript
import { prisma } from '@workspace/database';

// TypeScript knows what fields exist
const user = await prisma.user.findUnique({
  where: { email: 'test@example.com' },
  include: {
    sessions: {
      include: {
        scenario: true,
        messages: true,
      },
    },
  },
});

// user is fully typed, including nested relations
if (user) {
  console.log(user.username);  // ✓ TypeScript knows this exists
  console.log(user.sessions[0].scenario.name);  // ✓ Fully typed
}
```

## Migration Guide from Prisma 6

If upgrading an existing Prisma 6 project:

### 1. Update Package Versions

```bash
pnpm -F @workspace/database add @prisma/client@^7.0.0
pnpm -F @workspace/database add -D prisma@^7.0.0
```

### 2. Remove URL from Schema

```diff
 datasource db {
   provider = "postgresql"
-  url      = env("DATABASE_URL")
 }
```

### 3. Create Migration Config

Create `prisma/prisma.config.ts`:

```typescript
import { defineConfig } from '@prisma/client';

export default defineConfig({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
```

### 4. Update Client Instantiation

```diff
 export const prisma = new PrismaClient({
   log: ['query', 'error', 'warn'],
+  datasourceUrl: process.env.DATABASE_URL,
 });
```

### 5. Regenerate Client

```bash
pnpm -F @workspace/database generate
```

## Troubleshooting

### "datasource property 'url' is no longer supported"

You're using Prisma 7 but have the old schema pattern. Remove the `url` field from your datasource:

```diff
 datasource db {
   provider = "postgresql"
-  url      = env("DATABASE_URL")
 }
```

### "Prisma Client not found"

Generate the client:

```bash
pnpm -F @workspace/database generate
```

### "Can't reach database server"

Check your `DATABASE_URL` environment variable:

```bash
# Verify it's set
echo $DATABASE_URL

# Check database is running
docker compose ps db
docker compose logs db
```

### Migration Conflicts

If you have uncommitted migrations:

```bash
# Reset to a clean state (WARNING: loses data)
docker compose down -v
docker compose up -d db
pnpm -F @workspace/database migrate
```

### Seed Script Errors

The seed script needs `tsx` to run TypeScript:

```bash
pnpm -F @workspace/database add -D tsx
```

## Development Tips

### Schema Changes Workflow

1. Edit `prisma/schema.prisma`
2. Generate client: `pnpm -F @workspace/database generate`
3. Create migration: `pnpm -F @workspace/database migrate`
4. Restart API server to pick up changes

Types automatically propagate to all packages!

### Testing Schema Changes

Use Prisma Studio to verify schema changes:

```bash
task db:studio
```

### Performance Optimization

Prisma 7 supports connection pooling via Prisma Accelerate (optional):

```typescript
export const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
  // Optional: Add Accelerate URL for pooling
  // accelerateUrl: process.env.ACCELERATE_URL,
});
```

## Resources

- [Prisma 7 Docs](https://www.prisma.io/docs)
- [Prisma 7 Migration Guide](https://www.prisma.io/docs/guides/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Prisma Client API](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)

## Questions?

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.
