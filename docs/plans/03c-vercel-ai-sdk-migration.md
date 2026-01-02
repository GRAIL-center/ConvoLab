# Phase 3c: Migrate to Vercel AI SDK

Replace custom LLM abstraction with Vercel AI SDK for unified multi-provider support.

## Why Migrate

- **Less code**: Vercel AI SDK provides the abstraction we built manually
- **More providers**: 18+ providers out of the box (Anthropic, OpenAI, Google, xAI, etc.)
- **Better maintained**: 2M+ weekly downloads, active development
- **Streaming built-in**: First-class streaming support with usage tracking
- **Token counting**: Built-in for supported providers

## Current State

```
packages/api/src/llm/
├── types.ts              # LLMProvider interface
├── registry.ts           # Provider registry + parseModel
├── providers/
│   ├── anthropic.ts      # @anthropic-ai/sdk wrapper
│   └── openai.ts         # openai SDK wrapper
└── smoke-test.ts
```

Dependencies: `@anthropic-ai/sdk`, `openai`

## Target State

```
packages/api/src/llm/
├── providers.ts          # Provider instances + model string parsing
├── stream.ts             # Unified streaming wrapper for WebSocket
└── smoke-test.ts         # Updated tests
```

Dependencies: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`

## Package Changes

```bash
# Remove
pnpm -F @workspace/api remove @anthropic-ai/sdk openai

# Add
pnpm -F @workspace/api add ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google
```

## Implementation

### providers.ts

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';

const providers = {
  anthropic: (model: string) => anthropic(model),
  openai: (model: string) => openai(model),
  google: (model: string) => google(model),
} as const;

type ProviderKey = keyof typeof providers;

/**
 * Parse "provider:model" string and return the model instance.
 * Default provider is anthropic if no prefix.
 */
export function getModel(modelString: string): LanguageModelV1 {
  const colonIndex = modelString.indexOf(':');
  if (colonIndex === -1) {
    return providers.anthropic(modelString);
  }

  const providerKey = modelString.slice(0, colonIndex) as ProviderKey;
  const modelName = modelString.slice(colonIndex + 1);

  const providerFn = providers[providerKey];
  if (!providerFn) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }

  return providerFn(modelName);
}
```

### stream.ts

```typescript
import { streamText } from 'ai';
import type { WebSocket } from 'ws';
import { getModel } from './providers.js';

interface StreamParams {
  model: string;           // "anthropic:claude-sonnet-4-20250514"
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
}

interface StreamResult {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Stream LLM response to WebSocket client.
 * Returns final content and token usage.
 */
export async function streamToWebSocket(
  ws: WebSocket,
  streamType: 'partner' | 'coach',
  params: StreamParams
): Promise<StreamResult> {
  const result = streamText({
    model: getModel(params.model),
    system: params.systemPrompt,
    messages: params.messages,
    maxTokens: params.maxTokens ?? 1024,
  });

  let content = '';

  for await (const chunk of result.textStream) {
    content += chunk;
    ws.send(JSON.stringify({ type: `${streamType}:delta`, content: chunk }));
  }

  const usage = await result.usage;

  ws.send(JSON.stringify({
    type: `${streamType}:done`,
    usage: {
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
    },
  }));

  return {
    content,
    usage: {
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
    },
  };
}
```

### Token Counting

Vercel AI SDK doesn't expose a standalone token counting API, but `streamText` returns usage in the response. For pre-flight quota checks, options:

1. **Estimate**: ~4 chars per token (current OpenAI fallback)
2. **Use provider SDK directly**: Keep `@anthropic-ai/sdk` just for `countTokens`
3. **Skip pre-flight**: Check quota after response, cut off if exceeded

Recommendation: Option 1 for MVP, refine later based on actual usage patterns.

## Model String Format

No change - keep `provider:model` format:

```
anthropic:claude-sonnet-4-20250514
openai:gpt-4o
google:gemini-2.5-flash
```

## Error Handling

Vercel AI SDK throws typed errors. Wrap in try/catch:

```typescript
import { APICallError } from 'ai';

try {
  await streamToWebSocket(ws, 'partner', params);
} catch (err) {
  if (err instanceof APICallError) {
    const retryable = err.statusCode === 429 || err.statusCode >= 500;
    ws.send(JSON.stringify({
      type: 'error',
      code: `HTTP_${err.statusCode}`,
      message: err.message,
      recoverable: retryable,
    }));
  }
  throw err;
}
```

## Migration Steps

1. Add new dependencies
2. Create `providers.ts` with model factory
3. Create `stream.ts` with WebSocket streaming helper
4. Update `ws/conversation.ts` to use new `streamToWebSocket`
5. Update smoke test
6. Remove old provider files and dependencies
7. Test with all three providers

## Environment Variables

Same as before - SDKs auto-detect from env:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=...
```

## Files to Delete

```
packages/api/src/llm/types.ts
packages/api/src/llm/registry.ts
packages/api/src/llm/providers/anthropic.ts
packages/api/src/llm/providers/openai.ts
```

## Dependencies

- Phase 3b WebSocket implementation (uses the streaming interface)

## Testing

1. Update smoke test to use new API
2. Test each provider with a simple prompt
3. Verify streaming works through WebSocket
4. Check usage/token counts are reported correctly
