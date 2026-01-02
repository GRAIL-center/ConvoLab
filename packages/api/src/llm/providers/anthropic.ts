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
      const stream = getClient().messages.stream({
        model: params.model,
        system: params.systemPrompt,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: params.maxTokens ?? 1024,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
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
    } catch (error) {
      const err = error as Error & { status?: number };
      const retryable = err.status === 429 || err.status === 529 || err.status === 500;
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
