import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vitest/config'

const DATA_DIR = 'public/data'

/** Every file in public/data, as `{ 'graph.bin': 'data/graph.<hash>.bin' }`. */
function hashedData(): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const e of readdirSync(join(DATA_DIR, dir), { withFileTypes: true })) {
      const rel = join(dir, e.name)
      if (e.isDirectory()) walk(rel)
      else {
        const hash = createHash('sha256').update(readFileSync(join(DATA_DIR, rel))).digest('hex').slice(0, 10)
        out[rel] = rel.replace(/(\.[^./]+)$/, `.${hash}$1`)
      }
    }
  }
  walk('')
  return out
}

/** Emit public/data/* under content-hashed names and drop the unhashed copies. The app reads names through `dataUrl()`. */
function dataAssets(files: Record<string, string>): Plugin {
  return {
    name: 'utm-hashed-data',
    generateBundle() {
      for (const [name, hashed] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: `data/${hashed}`, source: readFileSync(join(DATA_DIR, name)) })
      }
    },
    closeBundle: {
      order: 'pre',
      handler() {
        for (const name of Object.keys(files)) rmSync(join('dist/data', name), { force: true })
      },
    },
  }
}

export default defineConfig(({ command }) => {
  const files = command === 'build' ? hashedData() : {}
  return {
    plugins: [
      react(),
      dataAssets(files),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          name: 'UTM Move',
          short_name: 'UTM Move',
          description: 'Walking and campus bus directions for UTM, offline.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#7a1f33',
          background_color: '#ffffff',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,json,bin,pmtiles,pbf,woff2,webmanifest}'],
          globIgnores: Object.keys(files).map((n) => `data/${n}`),
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        },
      }),
    ],
    define: { __DATA_FILES__: JSON.stringify(files) },
    worker: { format: 'es' },
    test: {
      include: ['src/**/*.test.{ts,tsx}', 'pipeline/**/*.test.ts', 'tests/*.test.ts', 'tests/ai-e2e/**/*.test.ts'],
    },
  }
})
