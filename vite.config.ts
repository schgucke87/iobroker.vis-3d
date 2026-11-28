/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

const { version } = pkg;

// The frontend lives in src-www/ and is built into www/, which the ioBroker
// web adapter serves at /vis-3d/.
export default defineConfig({
  root: 'src-www',
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: '../www',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    // keep the injected version available in tests too

    root: '.',
    include: ['src-www/src/**/*.test.ts'],
  },
});
