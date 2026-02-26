import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 60000,
    globalSetup: ['tests/e2e/globalSetup.ts'],
    globalTeardown: ['tests/e2e/globalTeardown.ts'],
  },
});
