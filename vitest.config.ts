import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so tests don't start the Cloudflare/PWA plugins.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
