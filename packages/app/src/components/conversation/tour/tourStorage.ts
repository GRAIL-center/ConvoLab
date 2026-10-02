export const TOUR_STORAGE_KEY = 'convolab.conversationTour.v1';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

function canUseStorage(storage: ReadableStorage | WritableStorage | undefined): boolean {
  return typeof storage !== 'undefined' && storage !== null;
}

export function isTourDismissed(storage?: ReadableStorage): boolean {
  const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!canUseStorage(store)) return false;
  try {
    return store?.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissTour(storage?: WritableStorage): void {
  const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!canUseStorage(store)) return;
  try {
    store?.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    // Private mode / quota — treat as dismissed in-session only.
  }
}
