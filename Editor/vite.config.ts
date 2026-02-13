import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/e2e/**/*.e2e.test.ts'],
    globals: true,
    // Use node environment for unit tests, browser for E2E tests
    environment: (name) => {
      if (name.includes('e2e')) {
        return 'jsdom'; // Use jsdom for E2E tests (Playwright will handle actual browser)
      }
      return 'node';
    },
  },
});
