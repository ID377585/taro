import type { VitePWAOptions } from 'vite-plugin-pwa'

const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  includeAssets: [
    'vite.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'cards/*.{svg,jpg,jpeg,png}',
  ],
  manifest: {
    id: '/',
    name: 'Leituras de Tarot',
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
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
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
    suppressWarnings: true,
  },
}

export default pwaOptions
