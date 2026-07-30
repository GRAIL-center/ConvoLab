import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/data/atomic.test.ts', 'src/ws/conversation.atomic.test.ts'],
  },
});
