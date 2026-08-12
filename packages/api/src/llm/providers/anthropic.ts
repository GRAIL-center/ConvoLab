import Anthropic from '@anthropic-ai/sdk';
import type { LLMMessage, LLMProvider, StreamChunk, StreamParams } from '../types.js';

let anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ANTHROPIC_API_KEY environment variable');
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',

  async *streamCompletion(params: StreamParams): AsyncIterable<StreamChunk> {
    try {
      const tools = params.useWebSearch
        ? [{ type: 'web_search_20250305' as const, name: 'web_search' as const }]
        : undefined;

      // Cache the persona system prompt. It is built once per (scenario, role)
      // from static scenario fields (conversation.ts buildSystemPrompt), so it
      // is byte-identical on every turn of a conversation — the prefix-match
      // requirement for caching. Caching does not change model output, so this
      // is study-safe; it cuts cost and, more importantly, the per-turn input
      // token count that drives 429s on the pinned-Claude partner.
      //
      // Prompts under the model's minimum cacheable prefix (1024 tokens for
      // claude-sonnet-5) silently do not cache — no error, and cache_*_tokens
      // stay 0. The partisan study personas are ~4.3-4.8k tokens so they
      // cache; angry-uncle-thanksgiving and difficult-coworker are far below
      // the floor and will not.
      const stream = getClient().messages.stream({
        model: params.model,
        system: [
          {
            type: 'text',
            text: params.systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content.trim(), // Trim to avoid "trailing whitespace" error
        })),
        max_tokens: params.maxTokens ?? 1024,
        ...(tools ? { tools } : {}),
      });

      // Wire up abort signal to cancel the stream
      if (params.signal) {
        params.signal.addEventListener(
          'abort',
          () => {
            stream.abort();
          },
          { once: true }
        );
      }

      for await (const event of stream) {
        // Check if aborted before yielding
        if (params.signal?.aborted) {
          yield {
            type: 'error',
            error: {
              code: 'ABORTED',
              message: 'Stream was cancelled',
              retryable: false,
            },
          };
          return;
        }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'delta', content: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      // input_tokens is only the UNCACHED remainder — the three fields are
      // disjoint and the whole prompt is their sum. Report the sum so quota
      // accounting is unchanged by caching, and surface the cache fields
      // separately so a hit rate can actually be verified.
      const cacheRead = final.usage.cache_read_input_tokens ?? 0;
      const cacheCreation = final.usage.cache_creation_input_tokens ?? 0;
      yield {
        type: 'done',
        usage: {
          inputTokens: final.usage.input_tokens + cacheRead + cacheCreation,
          outputTokens: final.usage.output_tokens,
          cacheReadInputTokens: cacheRead,
          cacheCreationInputTokens: cacheCreation,
        },
      };
    } catch (error) {
      // Handle abort errors gracefully
      if (params.signal?.aborted) {
        yield {
          type: 'error',
          error: {
            code: 'ABORTED',
            message: 'Stream was cancelled',
            retryable: false,
          },
        };
        return;
      }
      const err = error as Error & { status?: number };
      // Transient statuses -> the caller retries the SAME model (no provider swap),
      // which the pinned-Claude study partner depends on for reliability: rate limit
      // (429), overloaded (529), service unavailable (503), server error (500),
      // request timeout (408). Client errors (400/401/403/404) stay non-retryable.
      const retryable =
        err.status === 429 ||
        err.status === 529 ||
        err.status === 503 ||
        err.status === 500 ||
        err.status === 408;
      yield {
        type: 'error',
        error: {
          code: err.status ? `HTTP_${err.status}` : 'UNKNOWN',
          message: err.message || 'Unknown error',
          retryable,
        },
      };
    }
  },

  async countTokens(messages: LLMMessage[]): Promise<number> {
    const response = await getClient().messages.countTokens({
      model: 'claude-sonnet-4-20250514',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return response.input_tokens;
  },
};
