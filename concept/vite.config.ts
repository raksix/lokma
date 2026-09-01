import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    port: 3457,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3456',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3456',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3457,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
