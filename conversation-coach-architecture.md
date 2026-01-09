# Conversation Coach - Technical Architecture

**Purpose:** Dual-stream AI conversation practice (dialog partner + coach) with research observation tools.

**Audience:** Claude Code, for context across sessions.

## Core Architecture

```
React SPA
  │
  ├── tRPC (CRUD operations)
  └── WebSocket (dual AI streams)
  │
Fastify Server
  ├── Vercel AI SDK (multi-provider LLM)
  ├── Google OAuth + Invitations
  └── Broadcaster (live observation)
  │
PostgreSQL (Prisma ORM)
```

## Stack

### Backend
- Fastify 5 - Server + WebSocket
- tRPC 11 - Type-safe API
- Prisma 7 - ORM (runtime connection pattern)
- Vercel AI SDK - Multi-provider LLM (Anthropic, OpenAI, Google)
- @fastify/oauth2 - Google OAuth
- @fastify/secure-session - Stateless encrypted cookies

### Frontend
- Vite 7 + React 19 + TypeScript 5
- TanStack Query 5 - Server state
- React Router 7 - Routing
- Tailwind CSS

### Infrastructure
- pnpm workspaces
- PostgreSQL 17
- Docker Compose (dev)

## Project Structure

```
packages/
├── database/        # Prisma schema + client
├── api/             # Fastify server
├── app/             # React SPA
└── landing/         # Astro pages (may consolidate into app)
docs/
├── plans/           # Future implementation plans
└── plans/completed/ # Historical plans with design rationale
```

## Auth Model

### Google OAuth
- @fastify/oauth2 with Google OIDC
- Stateless encrypted cookie sessions (7-day expiry)

### Invitations (guest access)
- STAFF+ creates invitation with quota preset
- User accesses `/invite/:token` → anonymous User created
- Can start conversations without login
- Progressive auth: can link Google account later

### Roles

| Role | Description |
|------|-------------|
| GUEST | Anonymous via invitation |
| USER | Authenticated via OAuth |
| STAFF | Researchers (create invitations, observe sessions) |
| ADMIN | Full access (manage users, assign STAFF) |

### Quota System
- Inviter picks from preset token allocations
- Absolute quota per invitation (not daily)
- Tracked via UsageLog, deducted on AI response

## Dual AI Streaming

```
User message
    │
    ├──▶ Partner AI (sees partner conversation only)
    │         │
    │         ▼
    │    partner:delta → partner:done
    │
    └──▶ Coach AI (sees BOTH conversations)
              │
              ▼
         coach:delta → coach:done
```

Partner and coach stream sequentially. Both persisted as Messages with role `partner` or `coach`.

## WebSocket Protocol

### Conversation (`/ws/conversation/:sessionId`)
```
Client → Server:
  { type: "message", content: "..." }

Server → Client:
  { type: "history", messages: [...] }
  { type: "partner:delta", content: "..." }
  { type: "partner:done", messageId: 123 }
  { type: "coach:delta", content: "..." }
  { type: "coach:done", messageId: 124 }
  { type: "error", error: "..." }
```

### Observer (`/ws/observe/:sessionId`)
Read-only stream for researchers. Same delta/done messages, no send capability.

## Research Tools

### Live Observation
- Researcher creates invitation → gets QR code
- Participant scans → claims invitation → starts conversation
- Researcher sees "Watch Live" → observes messages in real-time
- In-memory broadcaster pushes deltas to all observers

### Observation Notes
- Attached to invitation (participant-level)
- Optionally linked to specific session
- STAFF+ can add notes while observing or reviewing

### Admin UI (`/admin/*`)
- User management, role assignment
- Telemetry dashboard

### Research UI (`/research/*`)
- Invitation management with QR codes
- Live observation
- Session review with notes

## Custom Scenarios

Users can describe their own conversation partner instead of picking a predefined scenario:

1. Invitation created with `allowCustomScenario: true`
2. User submits description (e.g., "my critical mother-in-law")
3. Elaboration AI (Sonnet) generates partner/coach prompts
4. Session proceeds with generated prompts

Custom prompts stored on ConversationSession, not Scenario.

## Data Models

See `docs/plans/schema-reference.md` for full Prisma schema.

Key models:
- **User** - OAuth identity, role
- **ExternalIdentity** - OAuth provider links (supports multiple per user)
- **Invitation** - Token, quota, usage, expiration
- **QuotaPreset** - Admin-configurable quota templates
- **Scenario** - Predefined AI personas + prompts
- **ConversationSession** - Links user/invitation to scenario (or custom prompts)
- **Message** - role (user/partner/coach), content
- **UsageLog** - Token tracking per stream
- **ObservationNote** - Researcher notes on sessions
- **TelemetryEvent** - Analytics events

## URL Structure

```
/                           → Home (scenario list or active sessions)
/login                      → Google sign-in
/invite/:token              → Invitation landing
/conversation/:sessionId    → Chat UI

/admin/users                → User management
/admin/telemetry            → Analytics dashboard

/research/invitations       → Invitation list + create
/research/invitations/:id   → Detail + QR code + observe

/api/*                      → tRPC endpoints
/ws/*                       → WebSocket endpoints
```

## Environment Variables

See `.env.example` for full list. Key vars:
- `DATABASE_URL` - PostgreSQL connection
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - OAuth
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` - LLM providers
- `ADMIN_EMAILS` - Bootstrap admin users on OAuth login

## Future

- **Coach aside** - Private Q&A with coach mid-conversation
- **Voice integration** - Deepgram STT + ElevenLabs TTS
- **Runtime model discovery** - Dynamic model selection by tier
