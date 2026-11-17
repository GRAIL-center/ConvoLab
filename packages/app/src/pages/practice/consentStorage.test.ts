import { describe, expect, it } from 'vitest';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  consentCopy,
  hasAcceptedConsent,
  recordConsent,
} from './consentStorage';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('first-use consent storage', () => {
  it('is not accepted on a first visit', () => {
    expect(hasAcceptedConsent(memoryStorage())).toBe(false);
  });

  it('is accepted after recording, with the date and wording version', () => {
    const store = memoryStorage();
    expect(recordConsent(store, new Date('2026-11-17T12:00:00Z'))).toBe(true);
    expect(hasAcceptedConsent(store)).toBe(true);
    expect(JSON.parse(store.data[CONSENT_STORAGE_KEY])).toEqual({
      version: CONSENT_VERSION,
      acceptedAt: '2026-11-17T12:00:00.000Z',
      adult: true,
    });
  });

  it('asks again when the wording version changes', () => {
    const store = memoryStorage({
      [CONSENT_STORAGE_KEY]: JSON.stringify({ version: 'older', adult: true }),
    });
    expect(hasAcceptedConsent(store)).toBe(false);
  });

  it('treats unreadable or missing storage as not accepted', () => {
    expect(hasAcceptedConsent(undefined)).toBe(false);
    expect(hasAcceptedConsent(memoryStorage({ [CONSENT_STORAGE_KEY]: '{bad' }))).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(hasAcceptedConsent(throwing)).toBe(false);
    expect(recordConsent(throwing)).toBe(false);
  });
});

describe('first-use consent copy', () => {
  it('uses no em or en dashes', () => {
    for (const text of Object.values(consentCopy)) {
      expect(text).not.toMatch(/[–—]/);
    }
  });
});
