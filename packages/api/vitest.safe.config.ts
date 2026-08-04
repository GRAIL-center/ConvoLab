// A separate, deliberately minimal vitest config for the new tests added
// alongside the Firestore shim fixes (see docs/plans/15-firestore-shim-gaps.md).
//
// The project's default vitest.config.ts wires every test file to
// src/__tests__/setup.ts, which connects to whatever Firestore project
// FIRESTORE_PROJECT_ID in .env points at and wipes every collection in
// `beforeEach`. This config intentionally has NO setupFiles and only picks
// up *.safe.test.ts files, so these tests never touch real infrastructure —
// they run entirely against the in-memory fake Firestore from
// packages/database/src/__tests__/fakeFirestore.ts.
//
// Run with: npx vitest run --config vitest.safe.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.safe.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
