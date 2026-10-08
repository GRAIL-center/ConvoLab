import { describe, expect, it } from 'vitest';
import { joinBase, toWebSocketUrl, trimTrailingSlash } from './apiUrl';

describe('trimTrailingSlash', () => {
  it('drops trailing slashes and whitespace', () => {
    expect(trimTrailingSlash(' https://convolab.us// ')).toBe('https://convolab.us');
  });

  it('leaves an empty base empty', () => {
    expect(trimTrailingSlash('')).toBe('');
  });
});

describe('joinBase', () => {
  it('keeps paths relative when no base is set (web)', () => {
    expect(joinBase('', '/trpc')).toBe('/trpc');
  });

  it('prefixes the API origin when one is set (native)', () => {
    expect(joinBase('https://convolab.us', '/api/auth/google?next=%2Fhome')).toBe(
      'https://convolab.us/api/auth/google?next=%2Fhome'
    );
  });
});

describe('toWebSocketUrl', () => {
  it('maps https to wss', () => {
    expect(toWebSocketUrl('https://convolab.us', '/ws/conversation/abc')).toBe(
      'wss://convolab.us/ws/conversation/abc'
    );
  });

  it('maps http to ws and keeps the port', () => {
    expect(toWebSocketUrl('http://localhost:5173', '/ws/observe/1')).toBe(
      'ws://localhost:5173/ws/observe/1'
    );
  });
});
