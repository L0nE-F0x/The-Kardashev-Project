import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // the bots, the sea router and the scene tests take ~6 s each when every core is busy: give them room
    testTimeout: 60_000,
  },
});
