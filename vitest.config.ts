import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.e2e.test.ts'],
    setupFiles: ['tests/unitSetup.ts'],
    globalSetup: ['tests/unitGlobalSetup.ts'],
    // Uncapped, the default is cores - 1 (13 here). Measured on this suite: wall time is the same with 8 (about 47 s),
    // but the work the workers do at once drops by about 40% (cumulative import 171 s against 284 s), and a SPARQL hook
    // that loads the query engine stopped timing out at 10 s under the load (1 of 2 full runs failed uncapped, 0 of 2
    // capped). The E2E config caps for the same reason (#93).
    maxWorkers: Math.max(1, Math.min(8, availableParallelism() - 1)),
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
        '**/unitGlobalSetup.ts',
      ],
    },
  },
});
