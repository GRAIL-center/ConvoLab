export const PROD_FIRESTORE_PROJECT_ID = 'convolab-490517';

export function assertSafeFirestoreTestTarget(
  env: Record<string, string | undefined> = process.env
): void {
  const projectId = env.FIRESTORE_PROJECT_ID;
  const emulatorHost = env.FIRESTORE_EMULATOR_HOST;

  if (projectId === PROD_FIRESTORE_PROJECT_ID && !emulatorHost) {
    throw new Error(
      'Refusing to run tests against production Firestore. Set FIRESTORE_EMULATOR_HOST.'
    );
  }
}
