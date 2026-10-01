import { describe, expect, it } from 'vitest';
import { isMeasurable, paddedHole, placeTooltip } from './spotlightGeometry';

describe('paddedHole', () => {
  it('pads the target and clamps to the viewport', () => {
    expect(
      paddedHole({ left: 40, top: 40, width: 100, height: 50 }, { width: 800, height: 600 })
    ).toEqual({ left: 32, top: 32, width: 116, height: 66 });
  });

  it('does not extend past the viewport edge', () => {
    const hole = paddedHole(
      { left: 780, top: 10, width: 30, height: 20 },
      { width: 800, height: 600 }
    );
    expect(hole.left + hole.width).toBeLessThanOrEqual(792);
    expect(hole.top).toBeGreaterThanOrEqual(8);
  });
});

describe('isMeasurable', () => {
  it('rejects collapsed rails', () => {
    expect(isMeasurable({ left: 0, top: 0, width: 0, height: 400 })).toBe(false);
  });

  it('accepts a visible panel', () => {
    expect(isMeasurable({ left: 0, top: 80, width: 360, height: 640 })).toBe(true);
  });
});

describe('placeTooltip', () => {
  const tooltip = { width: 320, height: 160 };
  const viewport = { width: 1440, height: 900 };

  it('prefers sitting below a compact hole', () => {
    const pos = placeTooltip({ left: 500, top: 80, width: 200, height: 80 }, tooltip, viewport);
    expect(pos.top).toBeGreaterThan(80 + 80);
    expect(pos.left).toBeGreaterThanOrEqual(16);
  });

  it('stays inside the viewport for a full-height column', () => {
    const pos = placeTooltip({ left: 335, top: 72, width: 700, height: 800 }, tooltip, viewport);
    expect(pos.left).toBeGreaterThanOrEqual(16);
    expect(pos.top).toBeGreaterThanOrEqual(16);
    expect(pos.left + tooltip.width).toBeLessThanOrEqual(viewport.width - 16);
    expect(pos.top + tooltip.height).toBeLessThanOrEqual(viewport.height - 16);
  });
});
