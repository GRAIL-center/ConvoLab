import { describe, expect, it } from 'vitest';
import { assessRecaptchaToken, decideRecaptcha } from './recaptcha.js';

// Pure decision tests only: nothing here reaches the network.
describe('decideRecaptcha', () => {
  it('accepts a valid token with no score (checkbox keys)', () => {
    const d = decideRecaptcha(
      { kind: 'assessment', assessment: { tokenProperties: { valid: true } } },
      true
    );
    expect(d).toMatchObject({ verified: true, reason: 'valid' });
  });

  it('accepts a valid token with a score at the threshold', () => {
    const d = decideRecaptcha(
      {
        kind: 'assessment',
        assessment: { tokenProperties: { valid: true }, riskAnalysis: { score: 0.5 } },
      },
      true
    );
    expect(d.verified).toBe(true);
  });

  it('rejects a valid token with a low score', () => {
    const d = decideRecaptcha(
      {
        kind: 'assessment',
        assessment: { tokenProperties: { valid: true }, riskAnalysis: { score: 0.3 } },
      },
      true
    );
    expect(d).toMatchObject({ verified: false, reason: 'low-score', score: 0.3 });
  });

  it('rejects an invalid token and surfaces invalidReason, in dev as well as production', () => {
    for (const isProduction of [true, false]) {
      const d = decideRecaptcha(
        {
          kind: 'assessment',
          assessment: { tokenProperties: { valid: false, invalidReason: 'EXPIRED' } },
        },
        isProduction
      );
      expect(d).toMatchObject({
        verified: false,
        reason: 'invalid-token',
        invalidReason: 'EXPIRED',
      });
    }
  });

  it('rejects an assessment with no tokenProperties', () => {
    expect(decideRecaptcha({ kind: 'assessment', assessment: {} }, false).verified).toBe(false);
  });

  it('fails closed on an error in production', () => {
    const d = decideRecaptcha({ kind: 'error', detail: 'HTTP 403' }, true);
    expect(d).toMatchObject({ verified: false, reason: 'error' });
  });

  it('fails closed on missing credentials in production', () => {
    const d = decideRecaptcha({ kind: 'unconfigured', detail: 'no credentials' }, true);
    expect(d).toMatchObject({ verified: false, reason: 'unconfigured' });
  });

  it('allows missing credentials outside production (local dev)', () => {
    const d = decideRecaptcha({ kind: 'unconfigured', detail: 'no credentials' }, false);
    expect(d).toMatchObject({ verified: true, reason: 'unconfigured-dev-allow' });
  });
});

describe('assessRecaptchaToken (paths that return before any network call)', () => {
  it('reports unconfigured outside production when RECAPTCHA_SITE_KEY is unset', async () => {
    const outcome = await assessRecaptchaToken('local-dev', { NODE_ENV: 'development' });
    expect(outcome.kind).toBe('unconfigured');
  });

  it('reports unconfigured in production when no project id is set', async () => {
    const outcome = await assessRecaptchaToken('tok', { NODE_ENV: 'production' });
    expect(outcome.kind).toBe('unconfigured');
    expect(decideRecaptcha(outcome, true).verified).toBe(false);
  });
});
