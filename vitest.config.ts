import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['assets/ts/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'assets/ts'),
    },
  },
});
