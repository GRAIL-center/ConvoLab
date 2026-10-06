import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMMessage,
  LLMProvider,
  StreamChunk,
  StreamParams,
  WebSearchTrace,
} from '../types.js';

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

/**
 * The partner's web-search tool: the basic `web_search_20250305`, capped at
 * MAX_SEARCHES_PER_REPLY searches per reply.
 *
 * The 2026 dynamic-filtering variant was used until 6 Oct 2026. It runs a code
 * step after every search, and once the partner was told to check result dates
 * (partnerRuntimePrompt) that made a news question take 15 to 45 s and 120k to
 * 143k input tokens. The basic tool, measured on the same questions and the
 * same personas: 5 to 10 s and about 45k tokens, with every topic current. Its
 * known weakness, pasting article wording into the reply, no longer reaches the
 * participant because a turn that searches is rewritten (searchBackground).
 *
 * Uncapped, the date check made the partner search 4 to 9 times per question.
 */
export const MAX_SEARCHES_PER_REPLY = 2;

export function webSearchTool(_model: string) {
  return {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: MAX_SEARCHES_PER_REPLY,
  } as const;
}

/**
 * Pull the searches out of a finished response. The 2026 tool runs searches
 * from inside code execution, but each one still appears as its own
 * `server_tool_use` block named web_search, followed by a
 * `web_search_tool_result` listing the pages returned (or an error object).
 */
export function extractWebSearch(content: readonly unknown[]): WebSearchTrace {
  const queries: string[] = [];
  const sources: WebSearchTrace['sources'] = [];
  const seen = new Set<string>();
  for (const block of content as {
    type?: string;
    name?: string;
    input?: unknown;
    content?: unknown;
  }[]) {
    if (block?.type === 'server_tool_use' && block.name === 'web_search') {
      const query = (block.input as { query?: unknown } | undefined)?.query;
      if (typeof query === 'string') queries.push(query);
    } else if (block?.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content as { type?: string; url?: unknown; title?: unknown }[]) {
        if (r?.type !== 'web_search_result' || typeof r.url !== 'string' || seen.has(r.url))
          continue;
        seen.add(r.url);
        sources.push(typeof r.title === 'string' ? { url: r.url, title: r.title } : { url: r.url });
      }
    }
  }
  return { queries, sources };
}

/**
 * What the reply-writing call is told the partner just found out.
 *
 * Replies written straight from search results read like wire copy (6 Oct
 * 2026: "Renee Nicole Good, a 37-year-old US citizen, was killed when an ICE
 * agent shot into her vehicle..."), because the model writes sentences meant to
 * be cited back to the article, and no instruction moved it off that. So a
 * turn that searches is answered twice: the searching call is never shown, and
 * a second call without the tool writes the reply from this background in the
 * persona's own voice. The headlines and their dates are included because the
 * searching call sometimes ends without any text, and because the dates are
 * what tell the partner whether something is current.
 */
export function searchBackground(content: readonly unknown[]): string {
  const blocks = content as { type?: string; text?: string; content?: unknown }[];
  const notes = blocks
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim();
  const seen = new Set<string>();
  const found: string[] = [];
  for (const block of blocks) {
    if (block?.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const r of block.content as { type?: string; title?: unknown; page_age?: unknown }[]) {
      if (r?.type !== 'web_search_result' || typeof r.title !== 'string' || seen.has(r.title))
        continue;
      seen.add(r.title);
      found.push(typeof r.page_age === 'string' ? `- ${r.title} (${r.page_age})` : `- ${r.title}`);
    }
  }
  return [
    'Background you just looked up for this reply. Treat it only as things you happen to know: never repeat its wording, and say nothing you would not say out loud. Check the dates against today before calling anything current.',
    `What you jotted down while looking: ${notes || '(nothing)'}`,
    found.length
      ? `Headlines you saw:\n${found.slice(0, 12).join('\n')}`
      : 'Headlines you saw: (none)',
  ].join('\n');
}

export const anthropicProvider: LLMProvider = {
  id: 'anthropic',

  async *streamCompletion(params: StreamParams): AsyncIterable<StreamChunk> {
    try {
      const tools = params.useWebSearch ? [webSearchTool(params.model)] : undefined;

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

      // Once the model starts a search, what it has written is not the reply:
      // reset the bubble and stop streaming this call (see searchBackground).
      let searched = false;
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
        if (
          !searched &&
          event.type === 'content_block_start' &&
          event.content_block.type === 'server_tool_use'
        ) {
          searched = true;
          yield { type: 'reset' };
        }
        if (
          !searched &&
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { type: 'delta', content: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      let replyUsage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
      if (searched) {
        const reply = getClient().messages.stream({
          model: params.model,
          system: [
            { type: 'text', text: params.systemPrompt, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: searchBackground(final.content) },
          ],
          messages: params.messages.map((m) => ({ role: m.role, content: m.content.trim() })),
          max_tokens: params.maxTokens ?? 1024,
        });
        if (params.signal) {
          params.signal.addEventListener('abort', () => reply.abort(), { once: true });
        }
        for await (const event of reply) {
          if (params.signal?.aborted) {
            yield {
              type: 'error',
              error: { code: 'ABORTED', message: 'Stream was cancelled', retryable: false },
            };
            return;
          }
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'delta', content: event.delta.text };
          }
        }
        const written = await reply.finalMessage();
        replyUsage = {
          input: written.usage.input_tokens,
          output: written.usage.output_tokens,
          cacheRead: written.usage.cache_read_input_tokens ?? 0,
          cacheCreation: written.usage.cache_creation_input_tokens ?? 0,
        };
      }
      // input_tokens is only the UNCACHED remainder — the three fields are
      // disjoint and the whole prompt is their sum. Report the sum so quota
      // accounting is unchanged by caching, and surface the cache fields
      // separately so a hit rate can actually be verified.
      const cacheRead = (final.usage.cache_read_input_tokens ?? 0) + replyUsage.cacheRead;
      const cacheCreation =
        (final.usage.cache_creation_input_tokens ?? 0) + replyUsage.cacheCreation;
      yield {
        type: 'done',
        usage: {
          inputTokens: final.usage.input_tokens + replyUsage.input + cacheRead + cacheCreation,
          outputTokens: final.usage.output_tokens + replyUsage.output,
          cacheReadInputTokens: cacheRead,
          cacheCreationInputTokens: cacheCreation,
        },
        ...(params.useWebSearch ? { search: extractWebSearch(final.content) } : {}),
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
      model: 'claude-sonnet-5',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return response.input_tokens;
  },
};
