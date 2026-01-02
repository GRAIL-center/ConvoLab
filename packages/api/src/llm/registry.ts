import { anthropicProvider } from './providers/anthropic.js';
import { googleProvider } from './providers/google.js';
import { openaiProvider } from './providers/openai.js';
import type { LLMProvider, StreamParams } from './types.js';

/**
 * Parse model string into provider and model name.
 * Format: "provider:model" or just "model" (defaults to anthropic)
 *
 * Examples:
 *   "anthropic:claude-sonnet-4-20250514" -> { provider: "anthropic", model: "claude-sonnet-4-20250514" }
 *   "claude-sonnet-4-20250514" -> { provider: "anthropic", model: "claude-sonnet-4-20250514" }
 *   "openai:gpt-4o" -> { provider: "openai", model: "gpt-4o" }
 */
export function parseModel(modelString: string): { provider: string; model: string } {
  const colonIndex = modelString.indexOf(':');
  if (colonIndex === -1) {
    // No provider prefix - default to anthropic
    return { provider: 'anthropic', model: modelString };
  }
  const provider = modelString.slice(0, colonIndex);
  const model = modelString.slice(colonIndex + 1);
  return { provider, model };
}

const providers = new Map<string, LLMProvider>([
  ['anthropic', anthropicProvider],
  ['openai', openaiProvider],
  ['google', googleProvider],
  // Future: ['ollama', ollamaProvider]
]);

/**
 * Get the LLM provider for a model string.
 */
export function getProvider(modelString: string): LLMProvider {
  const { provider } = parseModel(modelString);
  const impl = providers.get(provider);
  if (!impl) {
    throw new Error(`Unknown LLM provider: ${provider}`);
  }
  return impl;
}

/**
 * Stream completion using the appropriate provider for the model.
 */
export async function* streamCompletion(
  modelString: string,
  params: Omit<StreamParams, 'model'>
): AsyncIterable<import('./types.js').StreamChunk> {
  const { provider, model } = parseModel(modelString);
  const impl = providers.get(provider);
  if (!impl) {
    throw new Error(`Unknown LLM provider: ${provider}`);
  }
  yield* impl.streamCompletion({ ...params, model });
}

export type { LLMProvider, StreamParams } from './types.js';
