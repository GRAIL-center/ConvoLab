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
  /** Enable web search grounding (currently only supported by Google/Gemini) */
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
  type: 'delta' | 'done' | 'error';
  content?: string;
  usage?: TokenUsage;
  error?: StreamError;
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
