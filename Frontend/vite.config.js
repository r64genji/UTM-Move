import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg', 'data/*.json', 'data/*.jpg'],
      manifest: {
        name: 'UTM Shuttle Tracker',
        short_name: 'UTM Move',
        start_url: '.',
        display: 'standalone',
        background_color: '#101922',
        theme_color: '#101922',
        description: 'Real-time tracking for UTM shuttle buses.',
        icons: [
          {
            src: '/vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,jpg}'],
        maximumFileSizeToCacheInBytes: 5000000 // Allow up to 5MB for campus_locations.json and such
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://abeserver.ddns.net:3000',
        changeOrigin: true,
      }
    }
  }
})
