import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMMessage, LLMProvider, StreamChunk, StreamParams } from '../types.js';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY is not set');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export const googleProvider: LLMProvider = {
  id: 'google',

  async *streamCompletion(params: StreamParams): AsyncIterable<StreamChunk> {
    try {
      const model = getClient().getGenerativeModel({
        model: params.model,
        systemInstruction: params.systemPrompt,
      });

      // Convert messages to Gemini format
      const contents = params.messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

      const result = await model.generateContentStream({
        contents,
        generationConfig: {
          maxOutputTokens: params.maxTokens ?? 1024,
        },
      });

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of result.stream) {
        const text = chunk.text();
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
    // Google has a countTokens API but requires a model instance
    // Estimate based on ~4 chars per token for now
    const text = messages.map((m) => m.content).join(' ');
    return Math.ceil(text.length / 4);
  },
};
