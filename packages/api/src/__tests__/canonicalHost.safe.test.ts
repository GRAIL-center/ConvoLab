import { describe, expect, it } from 'vitest';
import { canonicalHost, canonicalRedirectTarget } from '../lib/canonicalHost.js';

const PROD = 'https://convolab.us';

describe('canonicalHost', () => {
  it('reads the host out of FRONTEND_URL', () => {
    expect(canonicalHost(PROD)).toBe('convolab.us');
    expect(canonicalHost('http://localhost:5173')).toBe('localhost:5173');
  });

  it('returns null when FRONTEND_URL is unset or unparseable', () => {
    expect(canonicalHost(undefined)).toBeNull();
    expect(canonicalHost('')).toBeNull();
    expect(canonicalHost('not a url')).toBeNull();
  });
});

describe('canonicalRedirectTarget', () => {
  it('redirects the www host to the canonical one, preserving the path and query', () => {
    expect(canonicalRedirectTarget('www.convolab.us', '/', PROD)).toBe('https://convolab.us/');
    expect(
      canonicalRedirectTarget('www.convolab.us', '/study?pid=abc&topic=Guns', PROD)
      // The study link carries the participant's assignment in the query, so
      // dropping it would strand them on a "study link problem" page.
    ).toBe('https://convolab.us/study?pid=abc&topic=Guns');
  });

  it('is case-insensitive on the host', () => {
    expect(canonicalRedirectTarget('WWW.ConvoLab.US', '/pilot', PROD)).toBe(
      'https://convolab.us/pilot'
    );
  });

  it('ignores a port on the host header', () => {
    expect(canonicalRedirectTarget('www.convolab.us:443', '/', PROD)).toBe('https://convolab.us/');
  });

  it('serves the canonical host itself without redirecting', () => {
    expect(canonicalRedirectTarget('convolab.us', '/', PROD)).toBeNull();
  });

  it('serves any other host rather than bouncing it', () => {
    // A Cloud Run *.run.app URL, a health check hitting the container directly,
    // or localhost must never be redirected to production.
    for (const host of [
      'convolab-api-t4tn3ogqla-uc.a.run.app',
      'localhost:3000',
      '127.0.0.1:8080',
      'staging.convolab.us',
      'convolab.us.evil.test',
      'wwwconvolab.us',
    ]) {
      expect(canonicalRedirectTarget(host, '/', PROD), host).toBeNull();
    }
  });

  it('does nothing when FRONTEND_URL is unset, so local dev is unaffected', () => {
    expect(canonicalRedirectTarget('www.convolab.us', '/', undefined)).toBeNull();
  });

  it('does nothing when there is no host header', () => {
    expect(canonicalRedirectTarget(undefined, '/', PROD)).toBeNull();
  });

  it('works for a non-production canonical host too', () => {
    expect(canonicalRedirectTarget('www.example.org', '/x', 'https://example.org')).toBe(
      'https://example.org/x'
    );
  });
});
