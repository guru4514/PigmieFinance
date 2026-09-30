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
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/collections\/due-today/,
            handler: 'NetworkFirst',
            options: { cacheName: 'due-today-cache', expiration: { maxAgeSeconds: 3600 } },
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
        icons: [
          { src: '/vite.svg', sizes: '192x192', type: 'image/svg+xml' },
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
