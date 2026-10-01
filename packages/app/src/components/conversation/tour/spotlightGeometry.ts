export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const PAD = 8;
const VIEWPORT_INSET = 8;

export function paddedHole(
  rect: Rect,
  viewport: { width: number; height: number },
  pad = PAD
): Rect {
  const left = Math.max(VIEWPORT_INSET, rect.left - pad);
  const top = Math.max(VIEWPORT_INSET, rect.top - pad);
  const right = Math.min(viewport.width - VIEWPORT_INSET, rect.left + rect.width + pad);
  const bottom = Math.min(viewport.height - VIEWPORT_INSET, rect.top + rect.height + pad);
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function isMeasurable(rect: Rect): boolean {
  return rect.width > 24 && rect.height > 24;
}

export function placeTooltip(
  hole: Rect,
  tooltip: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 12,
  margin = 16
): { left: number; top: number } {
  const fits = (left: number, top: number) =>
    left >= margin &&
    top >= margin &&
    left + tooltip.width <= viewport.width - margin &&
    top + tooltip.height <= viewport.height - margin;

  const overlapsHole = (left: number, top: number) => {
    const right = left + tooltip.width;
    const bottom = top + tooltip.height;
    return !(
      right < hole.left ||
      left > hole.left + hole.width ||
      bottom < hole.top ||
      top > hole.top + hole.height
    );
  };

  const candidates: Array<{ left: number; top: number }> = [
    {
      left: hole.left + hole.width / 2 - tooltip.width / 2,
      top: hole.top + hole.height + gap,
    },
    {
      left: hole.left + hole.width / 2 - tooltip.width / 2,
      top: hole.top - tooltip.height - gap,
    },
    {
      left: hole.left + hole.width + gap,
      top: hole.top + hole.height / 2 - tooltip.height / 2,
    },
    {
      left: hole.left - tooltip.width - gap,
      top: hole.top + hole.height / 2 - tooltip.height / 2,
    },
  ];

  for (const candidate of candidates) {
    const left = clamp(candidate.left, margin, viewport.width - tooltip.width - margin);
    const top = clamp(candidate.top, margin, viewport.height - tooltip.height - margin);
    if (fits(left, top) && !overlapsHole(left, top)) {
      return { left, top };
    }
  }

  return {
    left: clamp(
      hole.left + hole.width / 2 - tooltip.width / 2,
      margin,
      viewport.width - tooltip.width - margin
    ),
    top: clamp(
      hole.top + hole.height - tooltip.height - 24,
      margin,
      viewport.height - tooltip.height - margin
    ),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
