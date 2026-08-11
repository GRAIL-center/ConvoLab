import { describe, expect, it } from 'vitest';
import {
  assertSafeFirestoreTestTarget,
  PROD_FIRESTORE_PROJECT_ID,
} from './firestoreProductionGuard.js';

describe('assertSafeFirestoreTestTarget', () => {
  it.each([
    undefined,
    '',
  ])('refuses the production project with emulator host %s', (emulatorHost) => {
    expect(() =>
      assertSafeFirestoreTestTarget({
        FIRESTORE_PROJECT_ID: PROD_FIRESTORE_PROJECT_ID,
        FIRESTORE_EMULATOR_HOST: emulatorHost,
      })
    ).toThrow('Refusing to run tests against production Firestore. Set FIRESTORE_EMULATOR_HOST.');
  });

  it('allows the production project when an emulator host is configured', () => {
    expect(() =>
      assertSafeFirestoreTestTarget({
        FIRESTORE_PROJECT_ID: PROD_FIRESTORE_PROJECT_ID,
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      })
    ).not.toThrow();
  });

  it('allows a non-production project without an emulator host', () => {
    expect(() =>
      assertSafeFirestoreTestTarget({
        FIRESTORE_PROJECT_ID: 'convolab-test',
        FIRESTORE_EMULATOR_HOST: undefined,
      })
    ).not.toThrow();
  });

  it('preserves existing behavior when the project ID is missing', () => {
    expect(() =>
      assertSafeFirestoreTestTarget({
        FIRESTORE_PROJECT_ID: undefined,
        FIRESTORE_EMULATOR_HOST: undefined,
      })
    ).not.toThrow();
  });
});
