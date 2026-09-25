// The pre-analysis plan (Section 3.1) registers the pilot as a laptop/desktop
// study: the coach sits in a rail beside the conversation, which the layout
// only does from Tailwind's `lg` breakpoint upward. 1024 is that breakpoint, so
// the entry gate and the `lg:` classes on the conversation page are the same
// number by construction. Change it here and the pilot no longer matches what
// was registered.
export const STUDY_MIN_VIEWPORT_WIDTH = 1024;

// Width only, deliberately: user agent and touch capability answer a different
// question (what kind of device is this) than the one the plan asks (is the
// registered layout available). A laptop with a touchscreen passes; a desktop
// browser window dragged narrow does not, and widening it is a fix the
// participant can make on the spot.
export function isStudyViewportTooNarrow(): boolean {
  return window.innerWidth < STUDY_MIN_VIEWPORT_WIDTH;
}

export const STUDY_NARROW_VIEWPORT_TITLE = 'Please use a laptop or desktop computer';

export const STUDY_NARROW_VIEWPORT_BODY = `This study's conversation needs a screen at least ${STUDY_MIN_VIEWPORT_WIDTH} pixels wide. Open this link on a laptop or desktop computer, or make this browser window wider, and the page will continue automatically.`;
