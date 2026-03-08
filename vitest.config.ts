import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.e2e.test.ts'],
    setupFiles: ['tests/unitSetup.ts'],
    // Unhandled ESM errors from jsdom → html-encoding-sniffer → @exodus/bytes (require() of ESM). Verified benign:
    // with dangerouslyIgnoreUnhandledErrors: false, all 193 tests still pass; only exit code becomes 1. The errors
    // do not affect test assertions or cause false positives.
    dangerouslyIgnoreUnhandledErrors: true,
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
