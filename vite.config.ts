import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    sentryVitePlugin({
      org: 'kaan-barmore-genc',
      project: 'frame-shift-video-server',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      external: [
        // Externalize server-only Sentry package to prevent bundling in client
        '@sentry/bun',
      ],
    },

    sourcemap: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
