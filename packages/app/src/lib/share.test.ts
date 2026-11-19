import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ isNative: false, share: vi.fn(), impact: vi.fn() }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.isNative },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: native.share } }));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: native.impact },
  ImpactStyle: { Light: 'LIGHT' },
}));

import { lightTap } from './haptics';
import { canShare, shareLink } from './share';

const link = { title: 'ConvoLab', text: 'hi', url: 'https://convolab.us/' };

beforeEach(() => {
  native.isNative = false;
  native.share.mockReset().mockResolvedValue({});
  native.impact.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shareLink in the installed app', () => {
  beforeEach(() => {
    native.isNative = true;
  });

  it('opens the native share sheet', async () => {
    expect(canShare()).toBe(true);
    expect(await shareLink(link)).toBe('shared');
    expect(native.share).toHaveBeenCalledWith({ ...link, dialogTitle: 'ConvoLab' });
  });

  it('treats closing the sheet as cancelled, not failed', async () => {
    native.share.mockRejectedValue(new Error('Share canceled'));
    expect(await shareLink(link)).toBe('cancelled');
  });

  it('reports other errors as failed', async () => {
    native.share.mockRejectedValue(new Error('boom'));
    expect(await shareLink(link)).toBe('failed');
  });
});

describe('shareLink on the website', () => {
  it('uses the browser share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    expect(canShare()).toBe(true);
    expect(await shareLink(link)).toBe('shared');
    expect(share).toHaveBeenCalledWith(link);
    expect(native.share).not.toHaveBeenCalled();
  });

  it('counts an AbortError as cancelled', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(abort) });
    expect(await shareLink(link)).toBe('cancelled');
  });

  it('hides the button and copies the link when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(canShare()).toBe(false);
    expect(await shareLink(link)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(link.url);
  });
});

describe('lightTap', () => {
  it('does nothing on the website', () => {
    lightTap();
    expect(native.impact).not.toHaveBeenCalled();
  });

  it('gives a light tap in the installed app', () => {
    native.isNative = true;
    lightTap();
    expect(native.impact).toHaveBeenCalledWith({ style: 'LIGHT' });
  });

  it('never throws when the phone cannot vibrate', async () => {
    native.isNative = true;
    native.impact.mockRejectedValue(new Error('no motor'));
    expect(() => lightTap()).not.toThrow();
    await Promise.resolve();
  });
});
