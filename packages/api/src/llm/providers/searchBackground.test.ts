import { describe, expect, it } from 'vitest';
import { searchBackground } from './anthropic.js';

describe('searchBackground', () => {
  it('passes the notes and the dated headlines, not the article text', () => {
    const bg = searchBackground([
      { type: 'text', text: 'Let me look that up.' },
      { type: 'server_tool_use', name: 'web_search', input: { query: 'q' } },
      {
        type: 'web_search_tool_result',
        content: [
          {
            type: 'web_search_result',
            url: 'https://a',
            title: 'Judge blocks fee',
            page_age: 'October 2, 2026',
            encrypted_content: 'xyz',
          },
          {
            type: 'web_search_result',
            url: 'https://b',
            title: 'Judge blocks fee',
            page_age: 'October 2, 2026',
          },
          { type: 'web_search_result', url: 'https://c', title: 'Old shutdown story' },
        ],
      },
      { type: 'text', text: 'A judge blocked the fee.' },
    ]);
    expect(bg).toContain('Let me look that up.A judge blocked the fee.');
    expect(bg).toContain('- Judge blocks fee (October 2, 2026)');
    expect(bg.match(/Judge blocks fee/g)).toHaveLength(1);
    expect(bg).toContain('- Old shutdown story');
    expect(bg).not.toContain('xyz');
  });

  it('still gives headlines when the searching call wrote nothing', () => {
    const bg = searchBackground([
      { type: 'server_tool_use', name: 'web_search', input: { query: 'q' } },
      {
        type: 'web_search_tool_result',
        content: [{ type: 'web_search_result', url: 'https://a', title: 'T' }],
      },
    ]);
    expect(bg).toContain('(nothing)');
    expect(bg).toContain('- T');
  });
});
