# Phase 6: User Testing Features

**Status**: Complete

Support guerrilla user testing with live observation and QR code sharing.

## Data Model

**Key insight**: Invitations = Participants

| Concept | What it represents | Notes |
|---------|-------------------|-------|
| Invitation | One participant | Created by researcher, given to one person |
| Sessions | Conversation chunks | Multiple sessions = same participant, different sittings |

Researcher's view: Invitation detail shows the complete participant journey - all sessions as one scrollable timeline with session break dividers.

## User Flow

### Creating & Sharing
1. Researcher creates invitation at `/research/invitations`
2. Clicks invitation → InvitationDetail page with large QR code
3. Hands device to participant OR they scan QR from second device

### Participant Claims
4. Participant scans QR → `/invite/:token` → claims → starts conversation
5. Researcher's page auto-updates: QR shrinks, "Watch Live" button appears

### Live Observation
6. Researcher taps "Watch Live" → sees messages streaming in real-time
7. Can take observation notes while watching
8. Read-only view (no message input)

### Post-Session Review
9. InvitationDetail shows full conversation timeline
10. Multiple sessions appear with dividers
11. Notes attached to invitation (participant-level)

## Database

Already exists in schema:
```prisma
model ObservationNote {
  id           String   @id @default(cuid())
  invitationId String
  invitation   Invitation @relation(...)
  sessionId    Int?
  session      ConversationSession? @relation(...)
  researcherId String
  researcher   User     @relation(...)
  content      String   @db.Text
  timestamp    DateTime @default(now())
}
```

## Backend Changes

### WebSocket Observer System

**packages/api/src/ws/broadcaster.ts** (new)
- In-memory broadcast hub: `Map<sessionId, Set<WebSocket>>`
- `broadcast(sessionId, message)` - push to all observers
- `subscribe(sessionId, ws)` / `unsubscribe(sessionId, ws)`

**packages/api/src/ws/observer.ts** (new)
- `ObserverManager` class for read-only session streaming
- Auth: require STAFF+ via session cookie
- On connect: send history, subscribe to broadcasts
- Handle disconnect gracefully

**packages/api/src/ws/conversation.ts** (modify)
- After sending delta to participant, also `broadcast()` to observers

**packages/api/src/ws/handler.ts** (modify)
- Add route: `/ws/observe/:sessionId`

### tRPC Endpoints

**packages/api/src/trpc/routers/observation.ts** (new)
```typescript
observationRouter {
  create: staffProcedure (add note to invitation)
  list: staffProcedure (notes for invitation/session)
  delete: staffProcedure (own notes only)
}
```

**packages/api/src/trpc/routers/invitation.ts** (modify)
```typescript
detail: staffProcedure
  // Returns invitation + all sessions + all messages + notes
  // Used for both polling (pre-claim) and full history view
```

## Frontend Changes

### Routes

```
/research/invitations                    → InvitationList (existing)
/research/invitations/:invitationId      → InvitationDetail (new)
/research/invitations/:invitationId/observe → ObserveSession (new)
```

### New Pages

**packages/app/src/pages/research/InvitationDetail.tsx**
- Large QR code (shrinks after claim)
- Status polling every 3s until claimed
- "Watch Live" button when session active
- Full conversation timeline with session dividers
- Notes panel (view + add)

**packages/app/src/pages/research/ObserveSession.tsx**
- Header: scenario info, live indicator
- Message list (reuses MessageBubble)
- Notes input at bottom
- Mobile-first layout

### New Hooks

**packages/app/src/hooks/useObserverSocket.ts**
- Similar to useConversationSocket but read-only
- Handles history, deltas, done messages
- Reconnection logic

### New Components

**packages/app/src/components/QRCode.tsx**
- Wrapper around `qrcode.react`
- Configurable size, colors

## Dependencies

```bash
pnpm -F @workspace/app add qrcode.react
```

## Depends On

- Phase 4 (Invitation system) ✓
- Phase 5 (Frontend auth) ✓
- Phase 3b (WebSocket streaming) ✓

## Design Decisions

- **In-memory broadcast**: Simple, works for guerrilla testing. Upgrade to Redis for scale.
- **Polling for claim**: 3s interval. Could upgrade to WebSocket push later.
- **Mobile-first**: Large touch targets, vertical layouts.
- **All STAFF see all**: No ownership filtering for now.
