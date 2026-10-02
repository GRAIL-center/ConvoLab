import { describe, expect, it } from 'vitest';
import { dismissTour, isTourDismissed, TOUR_STORAGE_KEY } from './tourStorage';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('tourStorage', () => {
  it('starts undismissed', () => {
    expect(isTourDismissed(memoryStorage())).toBe(false);
  });

  it('records dismissal', () => {
    const storage = memoryStorage();
    dismissTour(storage);
    expect(storage.getItem(TOUR_STORAGE_KEY)).toBe('1');
    expect(isTourDismissed(storage)).toBe(true);
  });
});
