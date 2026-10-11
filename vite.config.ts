import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'pipeline/**/*.test.ts'],
  },
})
