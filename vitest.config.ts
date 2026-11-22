import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Bookmark logic is pure, but the translator needs a browser stand-in.
    setupFiles: ['./test/setup.ts'],
  },
});
