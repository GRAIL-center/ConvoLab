// Narrow config for running only *.safe.test.ts files during focused debugging.
//
// The default API Vitest config now also uses in-memory fake Firestore via
// src/__tests__/setup.ts. This file remains useful when you want to run only
// the explicitly safe subset without loading the broader API setup.
//
// Run with: npx vitest run --config vitest.safe.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Same minimal guard-only setup as vitest.atomic.config.ts: safe tests
    // manage their own FakeFirestore and never call createPrismaClient()
    // directly, so the full setup.ts (which does) doesn't fit here either.
    setupFiles: ['./src/__tests__/atomicGuardSetup.ts'],
    include: ['src/**/*.safe.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
