# Conversation Coach - Technical Architecture

**Purpose:** Dual-stream AI conversation practice (dialog partner + coach) with future voice integration

**Audience:** Claude Code, for context across sessions

## Core Architecture

```
React SPA (behind auth or invitation)
  ↓
Fastify Server
  ├── tRPC (CRUD operations)
  ├── WebSocket (dual AI streams)
  └── Google OAuth + Invitations
  ↓
PostgreSQL (Prisma ORM)
```

## Stack

### Backend
- Fastify 5 - Server + WebSocket
- tRPC 11 - Type-safe API
- Prisma 7 - ORM (runtime connection pattern)
- @fastify/oauth2 - Google OAuth
- @fastify/secure-session - Stateless encrypted cookies
- Anthropic SDK - AI streaming

### Frontend
- Vite 7 + React 19 + TypeScript 5
- TanStack Query 5 - Server state
- React Router 7 - Routing
- Tailwind CSS

### Landing
- Astro 5 - Static pages (SEO/link previews)

### Infrastructure
- pnpm workspaces
- PostgreSQL 17
- Cloud Run (3 services)
- GitHub Actions CI/CD

## Project Structure

```
packages/
├── database/        # Prisma schema + client
├── api/             # Fastify server
├── app/             # React SPA
└── landing/         # Astro pages
```

## Auth Model

### Google OAuth (primary)
- @fastify/oauth2 with Google OIDC
- Stateless sessions via encrypted cookies (7-day expiry)
- No server-side session store needed

### Invitations (guest access)
- Admin creates invitation with quota preset
- User accesses /invite/:token
- Can start conversations without login
- Progressive auth: nudge to link Google account

### Roles
```
GUEST      - Self-registered, default quota
USER       - Verified, standard quota
POWER_USER - Extended quota
ADMIN      - Full access
```

### Quota System
- JSON fields for flexibility: `quota`, `usage`
- Absolute token allocation (not daily limits)
- Inviter picks preset: "Short conversation (25k)", "Therapy session (50k)"
- Deduct on AI API response

## Data Models

See `docs/plans/schema-reference.md` for full Prisma schema.

Key models:
- **User** - Google OAuth identity, role
- **Invitation** - Token, quota JSON, usage JSON, expiration
- **QuotaPreset** - Admin-configurable templates
- **Scenario** - AI personas, system prompts
- **ConversationSession** - Links user/invitation to scenario
- **Message** - role (user/partner/coach), content
- **UsageLog** - Token tracking for analytics

## Dual AI Streaming

```typescript
class ConversationManager {
  partnerHistory: Message[]  // Partner sees partner conversation
  coachHistory: Message[]    // Coach sees BOTH conversations

  async streamDualResponses(ws, userMessage) {
    // Check quota
    // Stream partner response
    // Stream coach response (with partner context)
    // Deduct tokens, persist messages
  }
}
```

## WebSocket Flow

```
1. Connect: /ws/conversation/:sessionId
2. Auth: validate session cookie or invitation token
3. Load scenario + history
4. User message → dual AI streams → persist
5. Repeat
```

## URL Structure

```
/                    → Scenario list (auth or invitation required)
/login               → Google sign-in
/invite/:token       → Invitation landing
/conversation/:id    → Chat UI
/api/*               → Fastify backend
/ws/*                → WebSocket
```

Landing (Astro):
```
coach.example.com/   → Landing page (SSR)
coach.example.com/scenarios/:slug → Preview (SSR)
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Session
SESSION_KEY=<64-char-hex>  # openssl rand -hex 32

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# AI
ANTHROPIC_API_KEY=sk-ant-...
```

## Future: Voice

When adding voice (Deepgram STT + ElevenLabs TTS):
- Audio chunks via WebSocket
- Stream to STT → text to AI → TTS back
- Node handles this naturally
