import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
    // Served behind nginx as lokma.fermag.com.tr — Vite blocks unknown Host headers.
    allowedHosts: ['lokma.fermag.com.tr', '127.0.0.1', 'localhost'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Phase 3 perf wave 2b: keep React in one shared chunk so the 22 lazy
    // Inspector panes (see `components/panes/lazy-panes.tsx`) share it
    // instead of each duplicating the runtime.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
