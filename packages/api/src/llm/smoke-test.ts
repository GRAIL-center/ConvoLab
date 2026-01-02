#!/usr/bin/env tsx
/**
 * LLM Provider Smoke Test
 *
 * Tests each available provider with a cheap/fast model.
 * Requires at least one API key to be configured.
 *
 * Usage: pnpm -F @workspace/api test:llm
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from repo root
config({ path: resolve(import.meta.dirname, '../../../../.env') });

import { streamCompletion } from './registry.js';

interface ProviderConfig {
  name: string;
  envVar: string;
  testModel: string;
  modelLabel: string;
}

// Cheap, fast models for testing
const PROVIDERS: ProviderConfig[] = [
  {
    name: 'anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    testModel: 'anthropic:claude-haiku-4-5',
    modelLabel: 'Claude Haiku 4.5',
  },
  {
    name: 'openai',
    envVar: 'OPENAI_API_KEY',
    testModel: 'openai:gpt-4o-mini',
    modelLabel: 'GPT-4o Mini',
  },
  {
    name: 'google',
    envVar: 'GOOGLE_AI_API_KEY',
    testModel: 'google:gemini-2.0-flash',
    modelLabel: 'Gemini 2.0 Flash',
  },
  // Future: ollama
];

interface TestResult {
  provider: string;
  model: string;
  success: boolean;
  response?: string;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
  durationMs: number;
}

async function testProvider(config: ProviderConfig): Promise<TestResult> {
  const start = Date.now();

  try {
    let response = '';
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    for await (const chunk of streamCompletion(config.testModel, {
      systemPrompt: 'You are a helpful assistant. Be very brief.',
      messages: [{ role: 'user', content: 'Say "Hello" and nothing else.' }],
      maxTokens: 50,
    })) {
      if (chunk.type === 'delta' && chunk.content) {
        response += chunk.content;
      } else if (chunk.type === 'done' && chunk.usage) {
        usage = chunk.usage;
      } else if (chunk.type === 'error' && chunk.error) {
        throw new Error(chunk.error.message);
      }
    }

    return {
      provider: config.name,
      model: config.modelLabel,
      success: true,
      response: response.trim(),
      usage,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      provider: config.name,
      model: config.modelLabel,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}

async function main() {
  console.log('\n🔬 LLM Provider Smoke Test\n');
  console.log('Checking available providers...\n');

  // Check which providers have API keys
  const availableProviders = PROVIDERS.filter((p) => {
    const hasKey = !!process.env[p.envVar];
    const status = hasKey ? '✓' : '✗';
    const keyPreview = hasKey ? `${process.env[p.envVar]?.slice(0, 8)}...` : '(not set)';
    console.log(`  ${status} ${p.envVar}: ${keyPreview}`);
    return hasKey;
  });

  console.log();

  if (availableProviders.length === 0) {
    console.error('❌ No API keys found. Set at least one of:');
    for (const p of PROVIDERS) {
      console.error(`   - ${p.envVar}`);
    }
    process.exit(1);
  }

  console.log(`Testing ${availableProviders.length} provider(s)...\n`);

  // Test each available provider
  const results: TestResult[] = [];

  for (const provider of availableProviders) {
    process.stdout.write(`  Testing ${provider.name} (${provider.modelLabel})... `);

    const result = await testProvider(provider);
    results.push(result);

    if (result.success) {
      console.log(`✓ ${result.durationMs}ms`);
      console.log(`    Response: "${result.response}"`);
      if (result.usage) {
        console.log(
          `    Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`
        );
      }
    } else {
      console.log(`✗ FAILED`);
      console.log(`    Error: ${result.error}`);
    }
    console.log();
  }

  // Summary
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log('─'.repeat(50));
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log('✅ All available providers working!\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
