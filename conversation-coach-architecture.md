# Conversation Coach App - Technical Architecture

**Purpose:** Dual-stream AI conversation practice app (dialog partner + coach contexts) with future voice integration

**Primary audience:** Claude Code, for context across multiple implementation sessions

## Core Architecture

**Node.js monolith** with separate Astro landing page for SSR/link previews.

```
React SPA (main app, behind login)
  ↓
Fastify Server
  ├── tRPC (REST-like CRUD)
  ├── WebSocket (real-time dual AI streams)
  └── Passport.js (auth: email + Purdue SAML)
  ↓
PostgreSQL (Prisma ORM)
```

**Why not Django:** Real-time WebSocket + future voice is more natural in Node. Type sharing across stack via TypeScript + Prisma is valuable. Single language for external collaborators.

**Why not TanStack Start/Next.js:** No framework needed - this is a login-walled interactive app where SSR adds complexity without benefit. Public pages handled separately.

## Technology Stack

### Backend (December 2024 - Modernized)
- **Fastify 5** - API server + WebSocket host (single process)
- **tRPC 11** - Type-safe API layer (CRUD operations)
- **Prisma 7** - ORM + type generation (chosen over Drizzle for better AI assistance, mature migrations, Prisma Studio)
  - **Note:** Prisma 7 uses new connection pattern - see [database README](./packages/database/README.md)
- **Passport.js** - Auth (local strategy + SAML strategy)
- **ws 8** - WebSocket library (native, simple)
- **Anthropic SDK 0.71** - Streaming AI responses

### Frontend (Main App)
- **Vite 7 + React 19 + TypeScript 5**
- **TanStack Query 5** - Server state management
- **React Router 7** - Client routing
- **Tailwind CSS 3/4** - Styling (reuse Purdue branding from template)
- **Native WebSocket client** - Real-time connection

### Landing Pages
- **Astro 5** - Static site generation for public pages (link previews, SEO)
- Can fetch from Fastify API for dynamic content

### Infrastructure
- **pnpm 10 workspaces** - Monorepo
- **PostgreSQL 17** - Primary database
- **Cloud Run** - Deployment (3 services: landing, app, api)
- **GitHub Actions** - CI/CD on GitHub.com (external collaborators)

## Project Structure

```
conversation-coach/
├── packages/
│   ├── database/           # Prisma schema + generated client
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── package.json
│   │   └── index.ts       # Export prisma client
│   │
│   ├── api/               # Fastify server
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routers/   # tRPC routers
│   │   │   │   ├── scenarios.ts
│   │   │   │   ├── sessions.ts
│   │   │   │   └── index.ts (combined AppRouter)
│   │   │   ├── websockets/
│   │   │   │   └── conversation.ts  # Dual AI streaming handler
│   │   │   ├── auth/
│   │   │   │   ├── passport.ts
│   │   │   │   └── strategies/
│   │   │   └── middleware/
│   │   ├── Dockerfile
│   │   └── package.json   # Depends on @workspace/database
│   │
│   ├── app/               # React SPA (main application)
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── api/       # tRPC client setup
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   └── contexts/  # Auth context
│   │   ├── Dockerfile
│   │   └── package.json   # Depends on @workspace/database
│   │
│   └── landing/           # Astro landing pages
│       ├── src/
│       │   └── pages/
│       │       ├── index.astro
│       │       └── scenarios/[slug].astro
│       ├── Dockerfile
│       └── package.json
│
├── pnpm-workspace.yaml
├── compose.yml            # Local development (Docker Compose V2)
├── Taskfile.yml          # Task automation for common commands
└── .github/workflows/
    └── deploy.yml         # Cloud Run deployment (TODO)
```

> **Note:** This project now uses `compose.yml` (Docker Compose V2 naming) instead of `docker-compose.yml`.

## Data Models

```prisma
// packages/database/prisma/schema.prisma

model User {
  id          Int       @id @default(autoincrement())
  email       String    @unique
  username    String
  passwordHash String?   // Null for SAML users
  isStaff     Boolean   @default(false)
  createdAt   DateTime  @default(now())

  sessions    ConversationSession[]
}

model Scenario {
  id                    Int     @id @default(autoincrement())
  name                  String
  description           String  @db.Text

  // AI configuration
  partnerPersona        String  // "Angry Uncle at Thanksgiving"
  partnerSystemPrompt   String  @db.Text
  coachSystemPrompt     String  @db.Text
  partnerModel          String  @default("claude-3-5-sonnet-20241022")
  coachModel            String  @default("claude-3-5-sonnet-20241022")

  sessions              ConversationSession[]
}

model ConversationSession {
  id              Int       @id @default(autoincrement())
  userId          Int
  scenarioId      Int
  status          String    @default("active") // active | completed | abandoned
  startedAt       DateTime  @default(now())
  endedAt         DateTime?
  totalMessages   Int       @default(0)
  durationSeconds Int?

  user            User      @relation(fields: [userId], references: [id])
  scenario        Scenario  @relation(fields: [scenarioId], references: [id])
  messages        Message[]
}

model Message {
  id          Int       @id @default(autoincrement())
  sessionId   Int
  role        String    // "user" | "partner" | "coach"
  content     String    @db.Text
  timestamp   DateTime  @default(now())
  audioUrl    String?   // For future voice integration
  metadata    Json?     // Token counts, latency, etc.

  session     ConversationSession @relation(fields: [sessionId], references: [id])
}
```

**Type sharing:** All packages import `@workspace/database` for types. Zero duplication.

## Prisma 7 Migration (December 2024)

Prisma 7 introduces breaking changes to how database connections work:

**Old pattern (Prisma 5-6)**:
```prisma
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // ❌ No longer supported
}
```

**New pattern (Prisma 7)**:
```prisma
// schema.prisma
datasource db {
  provider = "postgresql"  // ✓ No url field
}
```

```typescript
// index.ts - Connection passed at runtime
export const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,  // ✓ URL in constructor
});
```

```typescript
// prisma/prisma.config.ts - For migrations
import { defineConfig } from '@prisma/client';

export default defineConfig({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
```

**Benefits:**
- Better security (no hardcoded connection patterns)
- Enables Prisma Accelerate (optional caching/connection pooling)
- Multi-environment flexibility

See [packages/database/README.md](./packages/database/README.md) for full migration guide.

## Key Implementation Areas

### 1. Dual AI Streaming (Core Feature)

```typescript
// packages/api/src/websockets/conversation.ts
// Manages two concurrent AI streams with different context visibility

class ConversationManager {
  partnerHistory: Message[]  // Partner only sees partner conversation
  coachHistory: Message[]    // Coach sees BOTH conversations

  async streamDualResponses(ws: WebSocket, userMessage: string) {
    // Send user message to both AIs
    // Stream partner response (user sees)
    // Stream coach response (user sees)
    // Coach context includes partner's responses
    // Save both to database when complete
  }
}
```

**Surprising note:** Coach context construction is critical - must include partner conversation history for useful coaching.

### 2. Authentication

Two modes via environment variable:
- `AUTH_METHOD=email`: Passport local strategy
- `AUTH_METHOD=saml`: Passport SAML strategy (Purdue SSO)

Session-based auth (not JWT) - simpler for WebSocket authentication.

### 3. tRPC Router Structure

```typescript
// Standard CRUD operations
- scenarios.list/get/create/update/delete
- sessions.create/get/list
- messages.list (paginated history)
- users.me/update

// Frontend imports AppRouter type for full type safety
```

### 4. WebSocket Flow

```
1. User connects: /ws/{sessionId}
2. Authenticate via session cookie
3. Load session + scenario from DB
4. Initialize ConversationManager with history
5. User sends message → stream dual responses
6. Persist messages after streaming completes
7. Repeat until user disconnects
```

### 5. Link Preview Strategy

**Astro landing page** at root domain with proper Open Graph tags.

```
https://app.com/                 # Astro landing (SSR)
https://app.com/scenarios/...    # Astro (SSR, shareable links)
https://app.com/app/*            # React SPA (main app)
https://app.com/api/*            # Fastify backend
```

**Alternative considered:** Bot detection middleware serving meta tags. Rejected as more brittle; Astro landing page is cleaner separation.

## Deployment

**GitHub Actions → Cloud Run** (3 services):

```yaml
# .github/workflows/deploy.yml
jobs:
  test:
    - Run tests (gated deployment)

  deploy:
    needs: test
    strategy:
      matrix:
        service: [landing, app, api]
    - Deploy to Cloud Run
```

**Database migrations:** Run via Cloud Run Job before deployment, or in container startup script.

**Environment variables:**
- `AUTH_METHOD` - email | saml
- `DATABASE_URL` - PostgreSQL connection
- `ANTHROPIC_API_KEY` - AI API key
- `SAML_*` - SAML configuration (if AUTH_METHOD=saml)

## Future: Voice Integration

When adding voice (likely 6-12 months):

**Stack addition:**
- Deepgram SDK (STT streaming)
- ElevenLabs API (TTS streaming)
- Native WebRTC via `wrtc` or browser MediaStream API

**Architecture change:** Minimal - WebSocket handler gains audio processing:
```
User speaks → Audio chunks via WebSocket
→ Stream to Deepgram (STT)
→ Text to AI (existing flow)
→ AI response to ElevenLabs (TTS)
→ Audio chunks back to user
```

Node.js ecosystem handles this naturally. This was primary reason for Node-only over Django.

## Areas to Explore in Implementation

- **Admin UI:** AdminJS auto-generation vs custom React admin dashboard
- **Real-time optimizations:** Message queueing, rate limiting, concurrent session limits
- **Conversation analytics:** Metrics, coaching effectiveness, user progress tracking
- **Scenario authoring UX:** Non-technical users creating/editing system prompts
- **Multi-turn coaching:** Coach maintains state across multiple user messages
- **Conversation exports:** PDF transcripts, shareable links

## Migration from Django Template

**Keep:**
- Frontend components (layouts, Purdue branding, TailwindCSS config)
- Docker patterns (adapt docker-compose.yml)
- GitHub Actions structure (adapt deploy.yml)

**Replace entirely:**
- Backend (Django → Fastify)
- ORM (Django ORM → Prisma)
- Admin (Django admin → TBD: AdminJS or custom)

**Estimated timeline:** 3-4 weeks to feature parity with working dual AI streaming.
