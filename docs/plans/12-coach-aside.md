# Phase 12: Coach Aside

Allow users to have private side conversations with the coach during a practice session. Users can ask questions like "What should I say next?" or "Why did they respond that way?" without interrupting the main conversation flow.

## Relationship to Inline Coach

The existing coach provides **automatic inline feedback** after each partner response (per Phase 3d). This aside feature adds **user-initiated private questions** as a separate interaction:

| Aspect | Inline Coach | Aside Coach |
|--------|--------------|-------------|
| Trigger | Automatic after partner | User clicks "Ask Coach" |
| UI | Same message thread | Slide-out panel |
| Context | Sees all messages | Sees all messages + aside history |
| Timing | Sequential after partner | Sequential (main flow must be idle) |
| Purpose | Proactive feedback | Reactive Q&A |

Both use the same underlying coach model and system prompt (with aside suffix).

**Serial execution**: User can only open aside when main flow is idle (partner + coach streams complete). This keeps the UX simple, especially on mobile where tracking multiple streams with a keyboard open is overwhelming.

**Future: Interrupt feature** (separate phase) could allow aside during active streams by first aborting/pausing the current stream. See "Related: Interrupt Feature" section below.

## User Flow

1. User is in active conversation with partner (coach feedback appearing inline)
2. Main flow completes (partner + inline coach done)
3. User clicks "Ask Coach" button → slide-out panel opens from right
4. User types aside question → coach responds with full conversation context
5. User can ask follow-up questions in the aside
6. User closes panel → returns to main conversation, can send next message

## Database Changes

### Message (new fields)

```prisma
model Message {
  // ... existing fields ...

  messageType   String  @default("main")  // "main" | "aside"
  asideThreadId String?                   // UUID grouping aside Q&A pairs

  @@index([sessionId, messageType])
  @@index([asideThreadId])
}
```

**Rationale:**
- `messageType` distinguishes inline coach feedback (`"main"`) from aside responses (`"aside"`)
- `asideThreadId` groups aside exchanges (UUID generated when user asks)
- Single table keeps context-building queries simple

### UsageLog (extend streamType)

```prisma
model UsageLog {
  streamType String // "partner" | "coach" | "aside"
}
```

## WebSocket Protocol Changes

### Client → Server

```typescript
// Start aside conversation
{ type: 'aside:start', content: string, threadId: string }

// Cancel aside (user closes panel mid-stream)
{ type: 'aside:cancel', threadId: string }
```

### Server → Client

```typescript
// Streaming aside response
{ type: 'aside:delta', threadId: string, content: string }
{ type: 'aside:done', threadId: string, messageId: number }
{ type: 'aside:error', threadId: string, error: string }
```

## API Changes

### packages/api/src/ws/conversation.ts

Add to `ConversationManager`:

```typescript
private activeAsides: Map<string, AbortController> = new Map();

async handleAsideStart(threadId: string, question: string) {
  const controller = new AbortController();
  this.activeAsides.set(threadId, controller);

  // Build context: ALL messages (main + previous asides)
  const fullHistory = await this.getFullSessionHistory();

  // Save user's aside question
  await this.saveMessage({
    role: 'user',
    content: question,
    messageType: 'aside',
    asideThreadId: threadId
  });

  // Stream coach response with aside-specific instructions
  const stream = await this.streamCompletion({
    model: this.scenario.coachModel,
    system: this.scenario.coachSystemPrompt + ASIDE_INSTRUCTIONS,
    messages: [
      ...this.formatHistoryForCoach(fullHistory),
      { role: 'user', content: `[ASIDE QUESTION]: ${question}` }
    ],
    signal: controller.signal
  });

  // ... stream handling, save response with messageType: 'aside'
}

handleAsideCancel(threadId: string) {
  this.activeAsides.get(threadId)?.abort();
  this.activeAsides.delete(threadId);
}
```

### packages/api/src/ws/protocol.ts

Add message types:
- `AsideStartMessage`
- `AsideCancelMessage`
- `AsideDeltaMessage`
- `AsideDoneMessage`
- `AsideErrorMessage`

## Frontend Changes

### packages/app/src/hooks/useConversationSocket.ts

Extend state:

```typescript
interface ConversationState {
  // ... existing ...
  asideThreads: Map<string, AsideThread>;
  activeAsideId: string | null;
}

interface AsideThread {
  id: string;
  messages: Message[];
  streaming: boolean;
  buffer: string;
}
```

New callbacks: `startAside(question)`, `cancelAside(threadId)`

New reducer actions: `ASIDE_START`, `ASIDE_DELTA`, `ASIDE_DONE`, `ASIDE_ERROR`, `ASIDE_CANCEL`

### packages/app/src/components/conversation/AsidePanel.tsx (new)

Slide-out panel component:
- 400px width on desktop, full-screen on mobile
- Shows aside message history
- Input for follow-up questions
- Close button (sends cancel if streaming)

### packages/app/src/components/conversation/AsideButton.tsx (new)

Floating action button near message input:
- Opens aside panel
- Disabled while main flow is active (partner/coach streaming)
- Disabled while aside is streaming
- Tooltip: "Ask coach privately"

### packages/app/src/pages/Conversation.tsx

- Add `AsidePanel` and `AsideButton` components
- Manage panel open/close state
- Connect to aside callbacks from hook

## UI Design: Slide-Out Panel

**Why slide-out panel:**
- Maintains visual context of main conversation
- Clear spatial separation without losing context
- Natural UX pattern (Slack threads, Gmail side panels)
- Can be dismissed when not needed

**Specifications:**
- Width: 400px desktop, 100% mobile (<768px)
- Animation: 200ms slide from right
- Main conversation dimmed slightly but visible
- Trigger: Floating "Ask Coach" button

## Aside System Prompt Suffix

```typescript
const ASIDE_INSTRUCTIONS = `

When responding to an aside question (marked with [ASIDE QUESTION]):
- You are stepping out of the main coaching flow to answer a specific question
- Reference specific parts of the conversation when relevant
- Keep responses focused and concise
- Do not continue the main coaching narrative
`;
```

## Design Decisions

- **Full context**: Coach sees entire conversation history when answering aside
- **Serial execution**: Aside only available when main flow is idle (simpler UX, mobile-friendly)
- **Persisted**: Aside messages saved for research review
- **Multiplexed**: Uses existing WebSocket, no separate connection
- **Single aside**: Only one aside active at a time (button disabled while streaming)
- **Partial saves**: If user cancels mid-stream, partial response saved with `metadata: { incomplete: true }`

## Edge Cases

- **Cancel mid-stream**: AbortController stops LLM, partial response saved
- **WebSocket disconnect**: Aside state reloaded from DB on reconnect
- **Quota**: Aside tokens count against invitation quota (same as coach)
- **Button disabled during main stream**: "Ask Coach" only enabled when idle

## Depends On

- Phase 3b (Streaming infrastructure)
- Phase 3d (Conversation UI)

## Related: Interrupt Feature (Future)

A separate feature could allow interrupting active streams. Potential interrupt types:

1. **Stop partner** - "I've heard enough" → aborts partner stream, user can respond immediately
2. **Meta/reset** - "This isn't realistic" → flags turn as unrealistic, possibly regenerates
3. **Quick coach aside** - "Hold on, let me ask coach" → pauses main flow, opens aside, resumes after

This is more complex than serial aside because it involves:
- Aborting active LLM streams
- UI for different interrupt types
- Possibly regenerating/retrying turns
- State management for paused conversations

Worth its own phase if researchers find the serial aside too limiting.
