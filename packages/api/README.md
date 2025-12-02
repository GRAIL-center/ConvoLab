# API Package

Fastify backend with tRPC, WebSocket, and Google OAuth.

## Stack

- Fastify 5 - Server
- tRPC 11 - Type-safe API
- @fastify/oauth2 - Google OAuth
- @fastify/secure-session - Encrypted cookies
- Anthropic SDK - AI streaming
- ws - WebSocket

## Structure

```
src/
├── server.ts       # Entry point
├── plugins/        # Fastify plugins (session, oauth)
├── routes/         # HTTP routes (auth callbacks)
├── trpc/           # tRPC setup
│   ├── context.ts
│   ├── procedures.ts
│   └── routers/
├── websockets/     # WebSocket handlers
└── lib/            # Utilities (quota, tokens)
```

## Running

**Docker (recommended):**
```bash
docker compose up
docker compose logs -f api
```

**Local:**
```bash
docker compose up -d db
pnpm install
pnpm -F @workspace/api dev
```

API: http://localhost:3000

## Environment

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/conversation_coach
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

## Endpoints

### Health
```
GET /health → { status: "ok" }
```

### Auth
```
GET  /api/auth/google          → Redirect to Google
GET  /api/auth/google/callback → Handle OAuth callback
POST /api/auth/logout          → Clear session
GET  /api/auth/me              → Current user
```

### tRPC
```
/trpc/* → tRPC procedures
```

### WebSocket
```
ws://localhost:3000/ws/conversation/:sessionId
```

## Development

**Add package:**
```bash
pnpm -F @workspace/api add <package>
```

**View logs:**
```bash
docker compose logs -f api
```

## Implementation

See `docs/plans/` for phase-by-phase implementation guides.
