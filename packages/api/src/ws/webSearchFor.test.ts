import { describe, expect, it, vi } from 'vitest';

vi.mock('../data/index.js', () => ({}));
vi.mock('../lib/telemetry.js', () => ({ TelemetryEvents: {}, track: vi.fn() }));

import { webSearchFor } from './conversation.js';

describe('webSearchFor', () => {
  const scenario = { partnerUseWebSearch: true, coachUseWebSearch: false };

  it('offers the partner search whenever the scenario enables it, whatever the participant said', () => {
    // Regression: a keyword gate withheld search from this message (no "news", "latest", ...),
    // so the partner said it had never heard of the case.
    expect(webSearchFor('partner', scenario)).toBe(true);
  });

  it('follows the per-role flag', () => {
    expect(webSearchFor('coach', scenario)).toBe(false);
    expect(webSearchFor('partner', { partnerUseWebSearch: false, coachUseWebSearch: true })).toBe(
      false
    );
    expect(webSearchFor('coach', { partnerUseWebSearch: false, coachUseWebSearch: true })).toBe(
      true
    );
  });

  it('is off without a scenario (custom-prompt sessions)', () => {
    expect(webSearchFor('partner', null)).toBe(false);
    expect(webSearchFor('coach', undefined)).toBe(false);
  });
});

describe('studySearchSettings', () => {
  it('offers a study partner search when the session snapshotted it', async () => {
    const { studySearchSettings } = await import('./conversation.js');
    const settings = studySearchSettings({ studyPartnerUseWebSearch: true });
    expect(webSearchFor('partner', settings)).toBe(true);
    expect(webSearchFor('coach', settings)).toBe(false);
  });

  it('keeps search off for a study session created before the snapshot existed', async () => {
    const { studySearchSettings } = await import('./conversation.js');
    expect(webSearchFor('partner', studySearchSettings({}))).toBe(false);
    expect(webSearchFor('partner', studySearchSettings({ studyPartnerUseWebSearch: null }))).toBe(
      false
    );
  });
});
