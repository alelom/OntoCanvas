import { defineConfig } from 'vite';
import packageJson from './package.json';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
  },
  server: {
    fs: { allow: ['..'] },
    cors: true, // Enable CORS for local development
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/e2e/**/*.e2e.test.ts'],
    globals: true,
    // Default to node; e2e tests that need DOM use @vitest-environment jsdom in the file
    environment: 'node',
    testTimeout: 5000,
  },
});
