import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/atomicGuardSetup.ts'],
    include: [
      'src/__tests__/firestoreProductionGuard.test.ts',
      'src/data/atomic.test.ts',
      'src/ws/conversation.atomic.test.ts',
      'src/data/voiceExchanges.atomic.test.ts',
      'src/ws/conversation.voice.atomic.test.ts',
    ],
  },
});
