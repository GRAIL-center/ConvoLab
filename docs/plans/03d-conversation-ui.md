# Phase 3d: Conversation UI

Frontend for dual-stream conversation.

## Flow

1. User on `/invite/:token` clicks "Start Conversation"
2. `invitation.claim` creates `ConversationSession`, returns `sessionId`
3. Redirect to `/conversation/:sessionId`
4. WebSocket connects, conversation begins
5. User can "Leave" (not end) - session stays ACTIVE, can return via Home

## Changes Required

### Backend

**invitation.claim mutation** - create session, return ID:
```typescript
const session = await ctx.db.conversationSession.create({
  data: {
    scenarioId: invitation.scenarioId!,
    userId: user.id,
    invitationId: invitation.id,
    status: 'ACTIVE',
  },
});
return { ...existing, sessionId: session.id };
```

**session.listMine** - new tRPC endpoint for Home page:
```typescript
return ctx.db.conversationSession.findMany({
  where: { userId: ctx.user.id },
  include: { scenario: true, _count: { select: { messages: true } } },
  orderBy: { updatedAt: 'desc' },
});
```

### Frontend

**New route**: `/conversation/:sessionId` → `Conversation.tsx`

**Invite.tsx** - redirect after claim:
```typescript
onSuccess: (data) => navigate(`/conversation/${data.sessionId}`)
```

**Home.tsx** - add `<YourSessions />` above scenario list

**New components**:
- `pages/Conversation.tsx` - main page, manages WebSocket + state
- `hooks/useConversationSocket.ts` - WebSocket lifecycle
- `components/conversation/MessageList.tsx`
- `components/conversation/MessageInput.tsx`
- `components/YourSessions.tsx`

## Conversation Page Layout

```
┌─────────────────────────────────────────┐
│ Angry Uncle at Thanksgiving    [Leave]  │
│ Talking with: Your opinionated uncle    │
├─────────────────────────────────────────┤
│ [Partner] "Well I think..."             │
│                                         │
│ [You] "I hear you're frustrated..."     │
│                                         │
│ [Coach] Try asking what specifically... │
│                                         │
│ [Partner] ▌ streaming...                │
├─────────────────────────────────────────┤
│ [________________] [Send]               │
│ 1,234 / 25,000 tokens                   │
└─────────────────────────────────────────┘
```

Header: scenario name + partner persona ("Talking with: {partnerPersona}")

Coach messages inline (same message list), styled differently. All messages (user, partner, coach) persisted to DB for analysis.

## Message Persistence

All roles saved to `Message` table:
- `role: 'user' | 'partner' | 'coach'`
- `content`, `tokenUsage`, `createdAt`
- Linked to `ConversationSession`

WebSocket handler already does this per 03b spec.

## Implementation Order

1. Update `invitation.claim` → create session, return ID
2. Add route, basic `Conversation.tsx` with WebSocket hook
3. Message list + input (no styling)
4. Coach messages inline
5. `YourSessions` component + `session.listMine` endpoint
6. Styling, quota bar, leave button

## Decisions

- "Leave conversation" keeps session ACTIVE, user can return
- Header shows both scenario name and partner persona
- Coach messages persisted to DB (not ephemeral)
- Coach displayed inline in message thread (not sidebar)

## To Do

- [ ] Show hamburger/avatar menu button in conversation header (currently no way to access UserMenu from conversation page)
