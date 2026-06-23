import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'assets'),
  base: '/build/',
  build: {
    outDir: resolve(__dirname, 'public/build'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'assets/ts/main.ts'),
      output: {
        entryFileNames: 'main.js',
        assetFileNames: 'main.[ext]',
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    host: true,
  },
});
