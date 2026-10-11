// Not part of the CI suite: needs the OmniRoute gateway. Run with `npm run test:ai`.
import { defineConfig, devices } from '@playwright/test'
import { CAMPUS_GPS } from './lib/viewports.ts'

const RUN = process.env.AI_E2E_RUN ?? 'adhoc'
const PORT = 4173

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  outputDir: `../../data/raw/ai-e2e/${RUN}/pw`,
  timeout: 12 * 60_000,
  workers: 1, // one Gemini caller at a time
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on',
    geolocation: { latitude: CAMPUS_GPS.latitude, longitude: CAMPUS_GPS.longitude, accuracy: CAMPUS_GPS.accuracy },
    permissions: ['geolocation'],
    timezoneId: 'Asia/Kuala_Lumpur',
    locale: 'en-MY',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 5 * 60_000,
  },
})
