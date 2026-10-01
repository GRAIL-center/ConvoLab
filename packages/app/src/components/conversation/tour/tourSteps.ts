export type TourStepId = 'partner' | 'composer' | 'coach' | 'lapp';

export interface TourStep {
  id: TourStepId;
  title: string;
  body: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'partner',
    title: 'The conversation',
    body: 'This is the conversation. You are talking with the simulated partner — they only see this thread.',
  },
  {
    id: 'composer',
    title: 'Your reply',
    body: 'Type here and press Enter to reply. Opening suggestions are optional.',
  },
  {
    id: 'coach',
    title: 'Private coach',
    body: 'Private coach. The partner never sees this. Ask for a better next line anytime.',
  },
  {
    id: 'lapp',
    title: 'How you are doing',
    body: 'After each of your turns, Listen / Acknowledge / Pivot / Perspective scores land here.',
  },
];

export const LG_MIN_WIDTH = 1024;
export const XL_MIN_WIDTH = 1280;
export const RAILS_EXPAND_MS = 520;
