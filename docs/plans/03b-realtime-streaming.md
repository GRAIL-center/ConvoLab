# Phase 3b: Real-Time Streaming

WebSocket protocol for dual AI streams (partner + coach) with multi-provider LLM support.

## Architecture Overview

```
Browser                    API Server                   LLM Providers
   │                           │                             │
   │──── WS connect ──────────▶│                             │
   │◀─── history + ready ──────│                             │
   │                           │                             │
   │──── user message ────────▶│                             │
   │                           │──── stream partner ────────▶│
   │◀─── partner:delta ────────│◀─── SSE chunks ────────────│
   │◀─── partner:done ─────────│                             │
   │                           │──── stream coach ──────────▶│
   │◀─── coach:delta ──────────│◀─── SSE chunks ────────────│
   │◀─── coach:done ───────────│                             │
   │                           │                             │
   │──── disconnect ──────────▶│                             │
```

## WebSocket Protocol

### Connection

```
URL: /ws/conversation/:sessionId
Auth: Session cookie (automatic) or ?token=invitation_token
```

### Message Types (Server → Client)

```typescript
type ServerMessage =
  | { type: 'connected'; sessionId: number; scenario: ScenarioInfo }
  | { type: 'history'; messages: Message[] }
  | { type: 'partner:delta'; content: string }
  | { type: 'partner:done'; messageId: number; usage: TokenUsage }
  | { type: 'coach:delta'; content: string }
  | { type: 'coach:done'; messageId: number; usage: TokenUsage }
  | { type: 'error'; code: ErrorCode; message: string; recoverable: boolean }
  | { type: 'quota:warning'; remaining: number; total: number }
  | { type: 'quota:exhausted' }

type TokenUsage = { input: number; output: number }
type ErrorCode = 'AUTH_FAILED' | 'SESSION_NOT_FOUND' | 'QUOTA_EXHAUSTED'
               | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'INTERNAL_ERROR'
```

### Message Types (Client → Server)

```typescript
type ClientMessage =
  | { type: 'message'; content: string }
  | { type: 'ping' }
  | { type: 'resume'; afterMessageId?: number }  // Reconnection
```

### Connection Lifecycle

1. **Connect**: Client opens WebSocket with session ID
2. **Auth**: Server validates cookie/token, loads session from DB
3. **Ready**: Server sends `connected` + `history` messages
4. **Active**: Client sends messages, server streams responses
5. **Close**: Clean disconnect or timeout after 30min idle

## Dual-Stream Flow

### Context Separation

```typescript
// Partner sees only the partner conversation
const partnerContext = messages.filter(m => m.role !== 'coach');

// Coach sees everything (full situational awareness)
const coachContext = messages; // All roles: user, partner, coach
```

### Stream Ordering

**Sequential, not parallel.** Partner responds first, then coach.

Rationale:
- Coach advice is more useful after seeing partner's response
- Simpler error handling (one stream at a time)
- Lower peak load on LLM APIs

```typescript
async function handleUserMessage(ws: WebSocket, content: string, session: Session) {
  const userMsg = await persistMessage(session.id, 'user', content);

  // 1. Stream partner response
  const partnerContent = await streamToClient(ws, 'partner', {
    provider: session.scenario.partnerModel,
    system: session.scenario.partnerSystemPrompt,
    messages: getPartnerContext(session),
  });
  const partnerMsg = await persistMessage(session.id, 'partner', partnerContent);

  // 2. Stream coach response (now has partner's response in context)
  const coachContent = await streamToClient(ws, 'coach', {
    provider: session.scenario.coachModel,
    system: session.scenario.coachSystemPrompt,
    messages: getCoachContext(session), // Includes partner's response
  });
  const coachMsg = await persistMessage(session.id, 'coach', coachContent);

  // 3. Log usage, check quota
  await logUsage(session, partnerMsg.usage, coachMsg.usage);
  await checkQuotaWarning(ws, session);
}
```

## LLM Provider Interface

### Abstraction Layer

```typescript
// packages/api/src/llm/types.ts
interface LLMProvider {
  id: string;  // 'anthropic' | 'openai' | 'google' | 'ollama'

  streamCompletion(params: StreamParams): AsyncIterable<StreamChunk>;
  countTokens(messages: LLMMessage[]): Promise<number>;
}

interface StreamParams {
  model: string;
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens?: number;
}

interface StreamChunk {
  type: 'delta' | 'done' | 'error';
  content?: string;
  usage?: { inputTokens: number; outputTokens: number };
  error?: { code: string; message: string; retryable: boolean };
}

interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}
```

### Model String Format

Store as `provider:model` in Scenario:

```
anthropic:claude-sonnet-4-20250514
openai:gpt-4o
google:gemini-1.5-pro
ollama:llama3.1:70b
```

Parse at runtime:

```typescript
function parseModel(modelString: string): { provider: string; model: string } {
  const [provider, ...rest] = modelString.split(':');
  return { provider, model: rest.join(':') };
}
```

### Provider Implementations

```typescript
// packages/api/src/llm/providers/anthropic.ts
export const anthropicProvider: LLMProvider = {
  id: 'anthropic',

  async *streamCompletion(params) {
    const stream = await anthropic.messages.stream({
      model: params.model,
      system: params.systemPrompt,
      messages: params.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: params.maxTokens ?? 1024,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        yield { type: 'delta', content: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    yield {
      type: 'done',
      usage: {
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      },
    };
  },

  async countTokens(messages) {
    // Use Anthropic's token counting API or estimate
    const response = await anthropic.messages.countTokens({
      model: 'claude-sonnet-4-20250514',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });
    return response.input_tokens;
  },
};
```

Similar implementations for OpenAI (`openai.chat.completions.create({ stream: true })`), Google (`model.generateContentStream()`), and OpenAI-compatible APIs.

### Provider Registry

```typescript
// packages/api/src/llm/registry.ts
const providers = new Map<string, LLMProvider>([
  ['anthropic', anthropicProvider],
  ['openai', openaiProvider],
  ['google', googleProvider],
  ['ollama', ollamaProvider],
]);

export function getProvider(modelString: string): LLMProvider {
  const { provider } = parseModel(modelString);
  const impl = providers.get(provider);
  if (!impl) throw new Error(`Unknown provider: ${provider}`);
  return impl;
}
```

## Error Handling

### Client-Side Reconnection

```typescript
class ConversationSocket {
  private ws: WebSocket | null = null;
  private lastMessageId: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(sessionId: number) {
    this.ws = new WebSocket(`/ws/conversation/${sessionId}`);

    this.ws.onclose = (event) => {
      if (event.code !== 1000) { // Not clean close
        this.scheduleReconnect(sessionId);
      }
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'partner:done' || msg.type === 'coach:done') {
        this.lastMessageId = msg.messageId;
      }
      // ... handle other messages
    };
  }

  private scheduleReconnect(sessionId: number) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onFatalError('Connection lost');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    setTimeout(() => {
      this.connect(sessionId);
      // Request messages since last known
      this.ws?.send(JSON.stringify({
        type: 'resume',
        afterMessageId: this.lastMessageId
      }));
    }, delay);
  }
}
```

### Server-Side Error Recovery

```typescript
async function streamToClient(
  ws: WebSocket,
  streamType: 'partner' | 'coach',
  params: StreamParams
): Promise<string> {
  const provider = getProvider(params.provider);
  let content = '';
  let retries = 0;
  const maxRetries = 2;

  while (retries <= maxRetries) {
    try {
      for await (const chunk of provider.streamCompletion(params)) {
        if (chunk.type === 'delta') {
          content += chunk.content;
          ws.send(JSON.stringify({ type: `${streamType}:delta`, content: chunk.content }));
        } else if (chunk.type === 'done') {
          ws.send(JSON.stringify({
            type: `${streamType}:done`,
            usage: chunk.usage
          }));
          return content;
        } else if (chunk.type === 'error' && chunk.error?.retryable) {
          throw new RetryableError(chunk.error.message);
        }
      }
    } catch (err) {
      if (err instanceof RetryableError && retries < maxRetries) {
        retries++;
        await sleep(1000 * retries);
        continue;
      }

      ws.send(JSON.stringify({
        type: 'error',
        code: 'PROVIDER_ERROR',
        message: 'AI service temporarily unavailable',
        recoverable: true,
      }));
      throw err;
    }
  }

  return content;
}
```

### Partial Message Handling

If stream fails mid-response:

```typescript
// Store partial content with incomplete flag
await db.message.create({
  data: {
    sessionId,
    role: streamType,
    content: partialContent,
    metadata: { complete: false, error: errorCode },
  },
});

// Client shows partial with indicator
// "[AI response interrupted - tap to retry]"
```

## Token Tracking & Quota

### Usage Logging

```typescript
async function logUsage(
  session: Session,
  partnerUsage: TokenUsage,
  coachUsage: TokenUsage
) {
  await db.usageLog.createMany({
    data: [
      {
        sessionId: session.id,
        userId: session.userId,
        invitationId: session.invitationId,
        model: session.scenario.partnerModel,
        streamType: 'partner',
        inputTokens: partnerUsage.input,
        outputTokens: partnerUsage.output,
      },
      {
        sessionId: session.id,
        userId: session.userId,
        invitationId: session.invitationId,
        model: session.scenario.coachModel,
        streamType: 'coach',
        inputTokens: coachUsage.input,
        outputTokens: coachUsage.output,
      },
    ],
  });
}
```

### Quota Checking

```typescript
async function checkQuotaWarning(ws: WebSocket, session: Session) {
  if (!session.invitationId) return; // No quota for authenticated users (for now)

  const invitation = await db.invitation.findUnique({
    where: { id: session.invitationId },
  });

  const quota = invitation.quota as { tokens: number };
  const usage = await db.usageLog.aggregate({
    where: { invitationId: session.invitationId },
    _sum: { inputTokens: true, outputTokens: true },
  });

  const used = (usage._sum.inputTokens ?? 0) + (usage._sum.outputTokens ?? 0);
  const remaining = quota.tokens - used;

  if (remaining <= 0) {
    ws.send(JSON.stringify({ type: 'quota:exhausted' }));
  } else if (remaining < quota.tokens * 0.2) {
    ws.send(JSON.stringify({
      type: 'quota:warning',
      remaining,
      total: quota.tokens
    }));
  }
}
```

### Pre-Flight Quota Check

Before starting streams, verify quota isn't already exhausted:

```typescript
async function handleUserMessage(ws: WebSocket, content: string, session: Session) {
  // Check quota BEFORE making LLM calls
  if (session.invitationId) {
    const hasQuota = await checkRemainingQuota(session.invitationId);
    if (!hasQuota) {
      ws.send(JSON.stringify({ type: 'quota:exhausted' }));
      return;
    }
  }

  // ... proceed with streams
}
```

## Implementation Files

### New Files

```
packages/api/src/
├── llm/
│   ├── types.ts              # LLMProvider interface, StreamChunk, etc.
│   ├── registry.ts           # Provider registry + parseModel
│   └── providers/
│       ├── anthropic.ts
│       ├── openai.ts
│       ├── google.ts
│       └── ollama.ts
├── ws/
│   ├── handler.ts            # WebSocket upgrade + connection handling
│   ├── protocol.ts           # Message type definitions
│   └── conversation.ts       # ConversationManager class
```

### Modify

```
packages/api/src/server.ts    # Register WebSocket handler
packages/api/package.json     # Add @anthropic-ai/sdk, openai, @google/generative-ai
```

## Dependencies

- Phase 3 (tRPC foundation) - for shared context/auth patterns
- Scenario seeding - need at least one scenario to test

## Testing Strategy

1. **Unit**: Provider implementations with mocked SDK responses
2. **Integration**: WebSocket connection lifecycle with test DB
3. **Manual**: Full flow with real LLM (use cheap model like `claude-haiku`)

## Open Questions

- [ ] Should coach wait for user to read partner response before appearing?
- [ ] Typing indicators during AI generation?
- [ ] Message edit/regenerate support?
- [ ] Audio message support (future voice integration)?
