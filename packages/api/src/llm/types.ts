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
}

export interface StreamChunk {
  type: 'delta' | 'done' | 'error';
  content?: string;
  usage?: TokenUsage;
  error?: StreamError;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
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
