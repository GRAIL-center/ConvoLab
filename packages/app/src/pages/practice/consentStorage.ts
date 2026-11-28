/**
 * First-use screen (#246): what someone agrees to before their first
 * conversation, and where that answer is remembered.
 *
 * The answer is kept on this device. Bump CONSENT_VERSION whenever the wording
 * below changes, so everyone sees the new wording once.
 */
export const CONSENT_VERSION = '2026-11-23';
export const CONSENT_STORAGE_KEY = 'convolab.firstUseConsent';

/** Placeholder until the policy is published (#245). */
export const PRIVACY_POLICY_URL = 'https://convolab.us/privacy';

export const consentCopy = {
  title: 'Before you start',
  aiParagraph:
    "ConvoLab lets you practice a difficult conversation. Your conversation partner and your coach are both AI, not people. Their replies are written by AI models from Anthropic (Claude) and Google (Gemini). AI can get things wrong, and the coach's tips are for practice, not professional advice.",
  topicsParagraph:
    'Conversations can touch on sensitive political or personal topics and may feel uncomfortable. You can stop at any time.',
  storageParagraph:
    "We store your conversations so the app can work, show your progress, and help us improve the partner and the coach. Anthropic and Google don't use them to train their AI. If you use ConvoLab as a guest, we don't know who you are. You can delete your conversations at any time from the account menu.",
  sharingParagraph:
    "Please don't share details that could identify you or anyone else, such as full names, addresses or health information.",
  privacyLink: 'Read our privacy policy',
  ageLabel: 'I am 18 or older.',
  continueLabel: 'Continue',
  underageLabel: "I'm under 18",
  underageMessage: 'Sorry, ConvoLab is for adults 18 and over.',
  underageBack: 'Back to the home page',
} as const;

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function hasAcceptedConsent(storage: ReadableStorage | undefined = defaultStorage()) {
  if (!storage) return false;
  try {
    const raw = storage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as { version?: unknown };
    return saved.version === CONSENT_VERSION;
  } catch {
    return false;
  }
}

/** Returns false when the answer could not be saved (private mode, storage full). */
export function recordConsent(
  storage: WritableStorage | undefined = defaultStorage(),
  now: Date = new Date()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_VERSION, acceptedAt: now.toISOString(), adult: true })
    );
    return true;
  } catch {
    return false;
  }
}
