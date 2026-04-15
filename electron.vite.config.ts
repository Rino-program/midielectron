import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      outDir: resolve('dist-electron/main'),
    },
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    build: {
      outDir: resolve('dist-electron/preload'),
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    build: {
      outDir: resolve('dist-electron/renderer'),
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer'),
      },
    },
  },
});
