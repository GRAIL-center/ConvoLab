import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 10000,
    // Run tests sequentially since they share a database
    fileParallelism: false,
    // Only test source files, not compiled dist/
    include: ['src/**/*.test.ts'],
    // Set DATABASE_URL to satisfy the database package singleton
    // Tests use TEST_DATABASE_URL via testPrisma client in setup.ts
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/conversation_coach_test',
    },
  },
});
