import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOOGLE_MODEL,
  DEFAULT_PARTNER_MODEL,
  providersFromEnv,
  resolveSessionModels,
} from './modelResolution.js';

/**
 * The resolver is what both the WebSocket handler (runtime) and study.enter
 * (the provenance snapshot) call, so these cases pin the behaviour the handler
 * had before it was extracted.
 */
const BOTH = { anthropic: true, google: true };
const GOOGLE_ONLY = { anthropic: false, google: true };
const ANTHROPIC_ONLY = { anthropic: true, google: false };

describe('resolveSessionModels', () => {
  it('no scenario, no env overrides: pinned Claude partner, Google coach and scorer', () => {
    expect(resolveSessionModels({ scenario: null, env: {}, providers: BOTH })).toEqual({
      partner: DEFAULT_PARTNER_MODEL,
      coach: DEFAULT_GOOGLE_MODEL,
      scorer: DEFAULT_GOOGLE_MODEL,
    });
  });

  it('no scenario, env overrides: COACH_MODEL and LAPP_SCORER_MODEL win', () => {
    const env = { COACH_MODEL: 'claude-haiku-4-5', LAPP_SCORER_MODEL: 'claude-sonnet-5' };
    expect(resolveSessionModels({ scenario: undefined, env, providers: BOTH })).toEqual({
      partner: DEFAULT_PARTNER_MODEL,
      coach: 'claude-haiku-4-5',
      scorer: 'claude-sonnet-5',
    });
  });

  it('treats an empty env override as unset (compose passes ${VAR:-})', () => {
    const env = { COACH_MODEL: '', LAPP_SCORER_MODEL: '' };
    const m = resolveSessionModels({ scenario: null, env, providers: BOTH });
    expect(m.coach).toBe(DEFAULT_GOOGLE_MODEL);
    expect(m.scorer).toBe(DEFAULT_GOOGLE_MODEL);
  });

  it('scenario present: its partner and coach models are used; scorer ignores the scenario', () => {
    const scenario = { partnerModel: 'claude-haiku-4-5', coachModel: 'google:gemini-2.5-pro' };
    expect(resolveSessionModels({ scenario, env: {}, providers: BOTH })).toEqual({
      partner: 'claude-haiku-4-5',
      coach: 'google:gemini-2.5-pro',
      scorer: DEFAULT_GOOGLE_MODEL,
    });
  });

  it('scenario with null models falls back to the (env-aware) defaults', () => {
    const scenario = { partnerModel: null, coachModel: null };
    const env = { COACH_MODEL: 'claude-haiku-4-5' };
    expect(resolveSessionModels({ scenario, env, providers: BOTH })).toEqual({
      partner: DEFAULT_PARTNER_MODEL,
      coach: 'claude-haiku-4-5',
      scorer: DEFAULT_GOOGLE_MODEL,
    });
  });

  it('Claude scenario models with only a Google key fall back to the role default', () => {
    const scenario = { partnerModel: 'claude-haiku-4-5', coachModel: 'claude-haiku-4-5' };
    expect(resolveSessionModels({ scenario, env: {}, providers: GOOGLE_ONLY })).toEqual({
      // The partner default is itself Claude, so it is returned unchanged.
      partner: DEFAULT_PARTNER_MODEL,
      coach: DEFAULT_GOOGLE_MODEL,
      scorer: DEFAULT_GOOGLE_MODEL,
    });
  });

  it('no Google key: Claude models stay as configured', () => {
    const scenario = { partnerModel: 'claude-haiku-4-5', coachModel: 'claude-haiku-4-5' };
    expect(resolveSessionModels({ scenario, env: {}, providers: ANTHROPIC_ONLY })).toEqual({
      partner: 'claude-haiku-4-5',
      coach: 'claude-haiku-4-5',
      scorer: DEFAULT_GOOGLE_MODEL,
    });
  });
});

describe('providersFromEnv', () => {
  it('reads the same keys the WebSocket handler checks', () => {
    expect(providersFromEnv({})).toEqual({ anthropic: false, google: false });
    expect(providersFromEnv({ ANTHROPIC_API_KEY: 'x', GOOGLE_AI_API_KEY: 'y' })).toEqual({
      anthropic: true,
      google: true,
    });
    expect(providersFromEnv({ GOOGLE_CLOUD_PROJECT: 'p' })).toEqual({
      anthropic: false,
      google: true,
    });
  });
});
