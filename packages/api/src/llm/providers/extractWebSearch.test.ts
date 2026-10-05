import { describe, expect, it } from 'vitest';
import { extractWebSearch } from './anthropic.js';

describe('extractWebSearch', () => {
  it('reads queries and sources from a dynamic-filtering response', () => {
    // Shape observed from claude-sonnet-5 with web_search_20260209 on 5 Oct 2026:
    // the search runs inside code execution but still gets its own blocks.
    const content = [
      { type: 'thinking', thinking: '' },
      { type: 'server_tool_use', name: 'code_execution', input: { code: 'await web_search(...)' } },
      {
        type: 'server_tool_use',
        name: 'web_search',
        input: { query: 'Cornell Chi Phi investigation' },
      },
      {
        type: 'web_search_tool_result',
        content: [
          { type: 'web_search_result', url: 'https://a.example/1', title: 'First' },
          { type: 'web_search_result', url: 'https://b.example/2' },
          { type: 'web_search_result', url: 'https://a.example/1', title: 'First again' },
        ],
      },
      { type: 'code_execution_tool_result', content: { type: 'code_execution_result' } },
      { type: 'text', text: 'Reply.' },
    ];
    expect(extractWebSearch(content)).toEqual({
      queries: ['Cornell Chi Phi investigation'],
      sources: [{ url: 'https://a.example/1', title: 'First' }, { url: 'https://b.example/2' }],
    });
  });

  it('returns empty arrays when the model did not search', () => {
    expect(extractWebSearch([{ type: 'text', text: 'Hi.' }])).toEqual({ queries: [], sources: [] });
  });

  it('ignores a search error result', () => {
    const content = [
      { type: 'server_tool_use', name: 'web_search', input: { query: 'q' } },
      {
        type: 'web_search_tool_result',
        content: { type: 'web_search_tool_result_error', error_code: 'unavailable' },
      },
    ];
    expect(extractWebSearch(content)).toEqual({ queries: ['q'], sources: [] });
  });
});
