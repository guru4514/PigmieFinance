import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/app/, /^\/portal/],
        runtimeCaching: [
          // Cache API responses for due-today (critical for agents)
          {
            urlPattern: /\/api\/v1\/collections\/due-today/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'due-today-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 3600 },
              networkTimeoutSeconds: 5,
            },
          },
          // Cache customer list
          {
            urlPattern: /\/api\/v1\/customers/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'customers-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
              networkTimeoutSeconds: 5,
            },
          },
          // Cache loans list
          {
            urlPattern: /\/api\/v1\/loans/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'loans-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
              networkTimeoutSeconds: 5,
            },
          },
          // Cache dashboard summary
          {
            urlPattern: /\/api\/v1\/reports\/summary/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'dashboard-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 1800 },
              networkTimeoutSeconds: 5,
            },
          },
          // Cache static assets (fonts, images)
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|woff2?)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 * 30 },
            },
          },
        ],
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
      '@': path.resolve(__dirname, './src'),
    },
  },
});
