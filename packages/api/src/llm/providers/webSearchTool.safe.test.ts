import { describe, expect, it } from 'vitest';
import { webSearchTool } from './anthropic.js';

/**
 * The 2026 tool type is cast past the type system (SDK 0.71.2 only types the
 * 2025 one), so nothing here fails at compile time. A model sent a tool version
 * it does not support gets a 400 at runtime — and for claude-haiku-4-5 that
 * would land during the emergency fallback, i.e. exactly when the partner is
 * already failing and a second failure is most costly.
 */
describe('webSearchTool', () => {
  it('gives the dynamic-filtering tool to models that support it', () => {
    for (const model of [
      'claude-sonnet-5',
      'claude-sonnet-4-6',
      'claude-opus-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
    ]) {
      expect(webSearchTool(model).type, model).toBe('web_search_20260209');
    }
  });

  it('falls back to the basic tool for models without it', () => {
    // claude-haiku-4-5 is EMERGENCY_PARTNER_MODEL in ws/conversation.ts.
    for (const model of ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-1']) {
      expect(webSearchTool(model).type, model).toBe('web_search_20250305');
    }
  });

  it('tolerates provider-prefixed model strings', () => {
    expect(webSearchTool('anthropic:claude-sonnet-5').type).toBe('web_search_20260209');
  });

  it('defaults to the basic tool for anything unrecognised', () => {
    // Unknown model: a wrong-but-accepted tool beats a hard 400 mid-study.
    expect(webSearchTool('some-future-model').type).toBe('web_search_20250305');
  });

  it('always names the tool web_search', () => {
    expect(webSearchTool('claude-sonnet-5').name).toBe('web_search');
    expect(webSearchTool('claude-haiku-4-5').name).toBe('web_search');
  });
});
