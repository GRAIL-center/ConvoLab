import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],

    // IMPORTANT: only run your tests
    include: ["src/**/*.test.ts"],

    // prevent dependency/test pollution (THIS fixes Fastify noise)
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
    ],

    // optional but helpful stability improvement
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});