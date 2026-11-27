/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend lives in src-www/ and is built into www/, which the ioBroker
// web adapter serves at /vis-3d/.
export default defineConfig({
  root: 'src-www',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../www',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    root: '.',
    include: ['src-www/src/**/*.test.ts'],
  },
});
