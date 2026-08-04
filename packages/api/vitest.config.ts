import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@workspace/database': new URL('../database/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 10000,
    // Run tests sequentially since they share a database
    fileParallelism: false,
    // Only test source files, not compiled dist/
    include: ['src/**/*.test.ts'],
  },
});
