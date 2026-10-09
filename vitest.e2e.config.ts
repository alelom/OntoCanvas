import { availableParallelism } from 'node:os';
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
    // Each test file drives its own browser against the one dev server. Uncapped, a 14-core machine ran ~13
    // at once and page loads timed out. Up to 8 runs clean and fastest (measured: 8 → 47-49 s, 6 → 50 s,
    // 4 → 71-85 s); never more than cores - 1, so small CI runners aren't oversubscribed (#93).
    maxWorkers: Math.max(1, Math.min(8, availableParallelism() - 1)),
    globalSetup: ['tests/e2e/globalSetup.ts'],
  },
});
