import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.e2e.test.ts'],
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
