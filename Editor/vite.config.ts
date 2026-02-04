import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
