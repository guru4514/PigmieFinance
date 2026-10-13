import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  // The staging launcher supplies all browser settings; do not load runtime .env files.
  envDir: process.env.APP_ENV === 'staging' ? false : undefined,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/app/, /^\/portal/, /^\/login$/, /^\/(setup|verify)-2fa$/],
        cleanupOutdatedCaches: true,
        importScripts: ['/push-worker.js'],
        // Business responses must never fall back to an account-independent URL cache.
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/'),
          handler: 'NetworkOnly',
          options: { fetchOptions: { cache: 'no-store' } },
        }],
      },
      manifest: {
        name: 'PigmieFinance',
        short_name: 'Pigmie',
        description: 'Micro-finance collection management',
        theme_color: '#6366f1',
        background_color: '#09090b',
        display: 'standalone',
        start_url: '/app/dashboard',
        scope: '/',
        icons: [
          { src: '/vite.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/vite.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
