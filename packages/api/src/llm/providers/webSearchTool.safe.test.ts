import { describe, expect, it } from 'vitest';
import { MAX_SEARCHES_PER_REPLY, webSearchTool } from './anthropic.js';

describe('webSearchTool', () => {
  // The basic tool for every model since 6 Oct 2026: the dynamic-filtering
  // variant took 15 to 45 s and up to 143k tokens per news question.
  it('gives every model the basic tool', () => {
    for (const model of ['claude-sonnet-5', 'anthropic:claude-sonnet-5', 'claude-haiku-4-5', 'x']) {
      expect(webSearchTool(model).type, model).toBe('web_search_20250305');
      expect(webSearchTool(model).name, model).toBe('web_search');
    }
  });

  it('caps searches per reply at two', () => {
    expect(MAX_SEARCHES_PER_REPLY).toBe(2);
    expect(webSearchTool('claude-sonnet-5').max_uses).toBe(2);
  });
});
