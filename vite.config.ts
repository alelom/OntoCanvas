import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/e2e/**/*.e2e.test.ts'],
    globals: true,
    // Default to node; e2e tests that need DOM use @vitest-environment jsdom in the file
    environment: 'node',
    testTimeout: 10000,
  },
});
