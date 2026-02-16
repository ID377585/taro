import type { VitePWAOptions } from 'vite-plugin-pwa'

const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  includeAssets: ['vite.svg', 'cards/*.jpg'],
  manifest: {
    id: '/',
    name: 'Tarô Teleprompter',
    short_name: 'Tarô',
    description: 'Leitura de tarô com reconhecimento de cartas por câmera',
    start_url: '/',
    display: 'standalone',
    scope: '/',
    background_color: '#1a1a1a',
    theme_color: '#1a1a1a',
    lang: 'pt-BR',
    icons: [
      {
        src: '/vite.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: '/vite.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  },
  workbox: {
    navigateFallback: '/index.html',
    globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,json,webmanifest}'],
    runtimeCaching: [
      {
        urlPattern: ({ request, url }) =>
          request.destination === 'image' && url.pathname.startsWith('/cards/'),
        handler: 'CacheFirst',
        options: {
          cacheName: 'card-images',
          expiration: {
            maxEntries: 300,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
        },
      },
      {
        urlPattern: ({ url }) =>
          url.pathname.startsWith('/data/') || url.pathname.startsWith('/model/'),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'tarot-data',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
        },
      },
    ],
  },
  devOptions: {
    enabled: true,
  },
}

export default pwaOptions
