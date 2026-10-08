import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 10000, // Max 10s per project rule - tests use loadTtlDirectly for faster loading
    dangerouslyIgnoreUnhandledErrors: true,
    hookTimeout: 10000, // dev server startup; max 10s per project rule
    // Each test file drives its own browser against the one dev server. Uncapped, a many-core machine ran
    // ~13 at once and page loads timed out under the load; 4 is close to CI's runners, so local runs match
    // CI (#93).
    maxWorkers: 4,
    globalSetup: ['tests/e2e/globalSetup.ts'],
    globalTeardown: ['tests/e2e/globalTeardown.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.e2e.test.ts',
        '**/*.config.ts',
        '**/fixtures/**',
        '**/globalSetup.ts',
        '**/globalTeardown.ts',
      ],
    },
  },
});
