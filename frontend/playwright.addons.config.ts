// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from '@playwright/test'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const uvicorn = `"${path.join(
  root,
  '.venv',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'uvicorn.exe' : 'uvicorn',
)}"`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'addons.spec.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4178', channel: 'chrome' },
  webServer: [
    {
      command: `${uvicorn} tests.fake_servers.phase1_app:app --host 127.0.0.1 --port 8183`,
      cwd: root,
      url: 'http://127.0.0.1:8183/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',
      url: 'http://127.0.0.1:4178/',
      env: { UNIOS_API_TARGET: 'http://127.0.0.1:8183' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
