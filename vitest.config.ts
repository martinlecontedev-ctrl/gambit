import { defineConfig } from 'vitest/config';

// Domain logic is plain TS with no DOM dependency, so tests run in the default
// node environment without the app's Vite plugins (router/tailwind/static-copy).
// Keeping this config separate from vite.config.ts avoids loading those plugins
// — and their build-time side effects — on every test run.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
