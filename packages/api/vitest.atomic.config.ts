import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/__tests__/firestoreProductionGuard.test.ts',
      'src/data/atomic.test.ts',
      'src/ws/conversation.atomic.test.ts',
    ],
  },
});
