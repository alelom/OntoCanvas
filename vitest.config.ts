import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

/**
 * The tests that build the real SPARQL engine. Building it takes seconds of CPU, and with the other test files
 * running beside it that grew past the 10 s hook limit now and then (#175), so they run first, as a group of their
 * own, with the machine to themselves. A new test that builds the real engine (it calls runQuery without stubbing
 * the engine) goes in this list.
 */
const ENGINE_TESTS = ['tests/unit/sparqlRunQuery.test.ts', 'tests/unit/sparqlExamples.test.ts'];

export default defineConfig({
  test: {
    setupFiles: ['tests/unitSetup.ts'],
    globalSetup: ['tests/unitGlobalSetup.ts'],
    // Uncapped, the default is cores - 1 (13 here). Measured on this suite: wall time is the same with 8 (about 47 s),
    // but the work the workers do at once drops by about 40% (cumulative import 171 s against 284 s). The E2E config
    // caps for the same reason (#93).
    maxWorkers: Math.max(1, Math.min(8, availableParallelism() - 1)),
    // Unhandled ESM errors from jsdom → html-encoding-sniffer → @exodus/bytes (require() of ESM). Verified benign:
    // with dangerouslyIgnoreUnhandledErrors: false, all 193 tests still pass; only exit code becomes 1. The errors
    // do not affect test assertions or cause false positives.
    dangerouslyIgnoreUnhandledErrors: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'engine',
          include: ENGINE_TESTS,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/*.e2e.test.ts', ...ENGINE_TESTS],
          sequence: { groupOrder: 1 },
        },
      },
    ],
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
