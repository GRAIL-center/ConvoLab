import OpenAI from 'openai';
import type { LLMMessage, LLMProvider, StreamChunk, StreamParams } from '../types.js';

let openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

export const openaiProvider: LLMProvider = {
  id: 'openai',

  async *streamCompletion(params: StreamParams): AsyncIterable<StreamChunk> {
    try {
      const stream = await getClient().chat.completions.create({
        model: params.model,
        messages: [
          { role: 'system', content: params.systemPrompt },
          ...params.messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
        max_tokens: params.maxTokens ?? 1024,
        stream: true,
        stream_options: { include_usage: true },
      });

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          yield { type: 'delta', content: delta.content };
        }

        // Usage comes in the final chunk
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }

      yield {
        type: 'done',
        usage: { inputTokens, outputTokens },
      };
    } catch (error) {
      const err = error as Error & { status?: number };
      const retryable = err.status === 429 || err.status === 500 || err.status === 503;
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
    // OpenAI doesn't have a token counting API, estimate based on ~4 chars per token
    const text = messages.map((m) => m.content).join(' ');
    return Math.ceil(text.length / 4);
  },
};
