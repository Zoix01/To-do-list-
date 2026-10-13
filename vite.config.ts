import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    // The PWA files belong to the browser build only, not to the Worker bundle.
    ...VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Planner',
        short_name: 'Planner',
        description: 'Personal task planner',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#1C1916',
        theme_color: '#1C1916',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        navigateFallback: '/index.html',
        // Season art is too big to precache; each image is kept once it has been seen.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/art/'),
            handler: 'CacheFirst',
            options: { cacheName: 'art', expiration: { maxEntries: 40 } },
          },
        ],
        // Server routes, not app pages: the API and the Claude connector's OAuth pages.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/mcp(\/|$)/,
          /^\/authorize(\?|$)/,
          /^\/token(\?|$)/,
          /^\/register(\?|$)/,
          /^\/\.well-known\//,
        ],
      },
    }).map((plugin) => ({
      ...plugin,
      applyToEnvironment: (environment: { name: string }) => environment.name === 'client',
    })),
  ],
});
