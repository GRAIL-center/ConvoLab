import { GoogleGenAI } from '@google/genai';
import type { LLMMessage, LLMProvider, StreamChunk, StreamParams } from '../types.js';

let genAI: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY is not set');
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

export const googleProvider: LLMProvider = {
  id: 'google',

  async *streamCompletion(params: StreamParams): AsyncIterable<StreamChunk> {
    try {
      const client = getClient();

      // Convert messages to Gemini format
      const contents = params.messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

      // Configure tools (web search grounding if enabled)
      const tools = params.useWebSearch ? [{ googleSearch: {} }] : undefined;

      console.log(
        '[Google Provider] useWebSearch:',
        params.useWebSearch,
        'tools:',
        JSON.stringify(tools)
      );

      const response = await client.models.generateContentStream({
        model: params.model,
        contents,
        config: {
          systemInstruction: params.systemPrompt,
          maxOutputTokens: params.maxTokens ?? 1024,
          tools,
        },
      });

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of response) {
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
        const text = chunk.text;
        if (text) {
          yield { type: 'delta', content: text };
        }

        // Usage metadata comes with chunks
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
          outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
        }
      }

      yield {
        type: 'done',
        usage: { inputTokens, outputTokens },
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
    // Estimate based on ~4 chars per token for now
    const text = messages.map((m) => m.content).join(' ');
    return Math.ceil(text.length / 4);
  },
};
