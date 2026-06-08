import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pwaOptions from './vite-plugin-pwa.config'

export default defineConfig({
  plugins: [
    react(),
    VitePWA(pwaOptions),
  ],
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('node_modules/heic2any')) return 'vendor-heic2any'
          if (id.includes('node_modules/jszip')) return 'vendor-jszip'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react'
          }

          if (id.includes('node_modules/@tensorflow/tfjs-backend-webgl')) {
            return 'vendor-tf-webgl'
          }
          if (id.includes('node_modules/@tensorflow/tfjs-backend-cpu')) {
            return 'vendor-tf-cpu'
          }
          if (id.includes('node_modules/@tensorflow/tfjs-core')) return 'vendor-tf-core'
          if (id.includes('node_modules/@tensorflow/tfjs-layers')) return 'vendor-tf-layers'
          if (id.includes('node_modules/@tensorflow/tfjs-converter')) {
            return 'vendor-tf-converter'
          }
          if (id.includes('node_modules/@tensorflow/tfjs')) return 'vendor-tf'
        },
      },
    },
  },
})
