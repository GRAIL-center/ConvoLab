#!/usr/bin/env tsx

/**
 * LLM Compare Tool
 *
 * Send the same prompt to all available providers and compare responses.
 *
 * Usage:
 *   pnpm -F @workspace/api llm:compare "What is the capital of France?"
 *   task llm:compare -- "What is the capital of France?"
 */

import { resolve } from 'node:path';
import { config } from 'dotenv';

// Load .env from repo root
config({ path: resolve(import.meta.dirname, '../../../../.env') });

import { streamCompletion } from './registry.js';

interface ProviderConfig {
  name: string;
  envVars: string[];
  model: string;
  modelLabel: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'anthropic',
    envVars: ['ANTHROPIC_API_KEY'],
    model: 'anthropic:claude-haiku-4-5',
    modelLabel: 'Claude Haiku 4.5',
  },
  {
    name: 'openai',
    envVars: ['OPENAI_API_KEY'],
    model: 'openai:gpt-4o-mini',
    modelLabel: 'GPT-4o Mini',
  },
  {
    name: 'google',
    envVars: ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_AI_API_KEY'],
    model: 'google:gemini-2.5-flash',
    modelLabel: 'Gemini 2.0 Flash',
  },
];

interface Result {
  provider: string;
  model: string;
  response: string;
  tokens: { input: number; output: number };
  durationMs: number;
  error?: string;
}

async function queryProvider(config: ProviderConfig, prompt: string): Promise<Result> {
  const start = Date.now();

  try {
    let response = '';
    let tokens = { input: 0, output: 0 };

    for await (const chunk of streamCompletion(config.model, {
      systemPrompt: 'You are a helpful assistant. Be concise but complete.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1024,
    })) {
      if (chunk.type === 'delta' && chunk.content) {
        response += chunk.content;
      } else if (chunk.type === 'done' && chunk.usage) {
        tokens = { input: chunk.usage.inputTokens, output: chunk.usage.outputTokens };
      } else if (chunk.type === 'error' && chunk.error) {
        throw new Error(chunk.error.message);
      }
    }

    return {
      provider: config.name,
      model: config.modelLabel,
      response: response.trim(),
      tokens,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      provider: config.name,
      model: config.modelLabel,
      response: '',
      tokens: { input: 0, output: 0 },
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatResponse(result: Result): string {
  const header = `┌─ ${result.provider} (${result.model}) ─ ${result.durationMs}ms`;
  const tokenInfo = result.error ? '' : ` ─ ${result.tokens.input}/${result.tokens.output} tokens`;

  const lines: string[] = [];
  lines.push(header + tokenInfo);
  lines.push('│');

  if (result.error) {
    lines.push(`│ ❌ Error: ${result.error}`);
  } else {
    // Word wrap the response at ~70 chars
    const words = result.response.split(' ');
    let currentLine = '│ ';
    for (const word of words) {
      if (currentLine.length + word.length > 75) {
        lines.push(currentLine);
        currentLine = `│ ${word} `;
      } else {
        currentLine += `${word} `;
      }
    }
    if (currentLine.trim() !== '│') {
      lines.push(currentLine);
    }
  }

  lines.push(`└${'─'.repeat(70)}`);
  return lines.join('\n');
}

async function main() {
  const prompt = process.argv.slice(2).join(' ');

  if (!prompt) {
    console.error('Usage: llm:compare "Your prompt here"');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm -F @workspace/api llm:compare "What is 2+2?"');
    console.error('  task llm:compare -- "Explain quantum computing in one sentence"');
    process.exit(1);
  }

  // Find available providers
  const availableProviders = PROVIDERS.filter((p) =>
    p.envVars.some((envVar) => !!process.env[envVar])
  );

  if (availableProviders.length === 0) {
    console.error('No AI provider credentials found. Set at least one of:');
    for (const p of PROVIDERS) {
      console.error(`  - ${p.envVars.join(' or ')}`);
    }
    process.exit(1);
  }

  console.log('\n📝 Prompt:', prompt);
  console.log(`\n🔄 Querying ${availableProviders.length} provider(s)...\n`);

  // Query all providers in parallel
  const results = await Promise.all(availableProviders.map((p) => queryProvider(p, prompt)));

  // Display results
  for (const result of results) {
    console.log(formatResponse(result));
    console.log('');
  }

  // Summary
  const successful = results.filter((r) => !r.error);
  const totalTokens = successful.reduce((acc, r) => acc + r.tokens.input + r.tokens.output, 0);
  const avgTime = Math.round(
    successful.reduce((acc, r) => acc + r.durationMs, 0) / successful.length
  );

  console.log('─'.repeat(72));
  console.log(
    `✓ ${successful.length}/${results.length} succeeded | ${totalTokens} total tokens | ${avgTime}ms avg`
  );
  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
