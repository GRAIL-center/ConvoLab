/**
 * LLM Provider abstraction layer.
 * Allows switching between Anthropic, OpenAI, Google, etc.
 */

export interface LLMProvider {
  id: string; // 'anthropic' | 'openai' | 'google' | 'ollama'

  streamCompletion(params: StreamParams): AsyncIterable<StreamChunk>;
  countTokens?(messages: LLMMessage[]): Promise<number>;
}

export interface StreamParams {
  model: string;
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens?: number;
  /** Offer the model web search (Anthropic web_search tool, Gemini googleSearch grounding) */
  useWebSearch?: boolean;
  /** AbortSignal for cancelling in-progress streams */
  signal?: AbortSignal;
  /** Provider-specific response MIME type, e.g. application/json for Gemini structured output */
  responseMimeType?: string;
  /**
   * Sampling temperature. Provider-specific; currently applied by Google/Gemini.
   * Set 0 for deterministic, reproducible output (e.g. the LAPP scorer).
   */
  temperature?: number;
  /**
   * Provider-specific JSON schema to constrain structured output.
   * Google/Gemini: passed as `responseSchema` alongside responseMimeType=application/json.
   */
  responseSchema?: unknown;
}

export interface StreamChunk {
  /**
   * 'reset': discard every delta so far. Sent when the partner turns out to be
   * searching, because the text it wrote before the search is not its reply.
   */
  type: 'delta' | 'done' | 'error' | 'reset';
  content?: string;
  usage?: TokenUsage;
  error?: StreamError;
  /** On 'done', when web search was offered: what the model searched for and what came back. */
  search?: WebSearchTrace;
}

/**
 * What a turn did with web search. Empty arrays mean search was offered and
 * the model chose not to use it. Recorded on partner messages so the analysis
 * can report how often the partner searched, by arm.
 */
export interface WebSearchTrace {
  queries: string[];
  sources: { url: string; title?: string }[];
}

export interface TokenUsage {
  /**
   * Total prompt tokens, including any served from or written to the prompt
   * cache. Quota accounting (lib/quota.ts) sums input+output, so this stays a
   * whole-prompt figure rather than the provider's uncached remainder —
   * enabling caching must not silently widen a participant's token quota.
   */
  inputTokens: number;
  outputTokens: number;
  /** Prompt tokens served from cache this request (billed at ~0.1x). */
  cacheReadInputTokens?: number;
  /** Prompt tokens written to cache this request (billed at ~1.25x). */
  cacheCreationInputTokens?: number;
}

export interface StreamError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Map our message roles to LLM roles.
 * - user -> user
 * - partner -> assistant (from partner's perspective)
 * - coach -> (excluded from partner context, or assistant from coach perspective)
 */
export type MessageRole = 'user' | 'partner' | 'coach';
