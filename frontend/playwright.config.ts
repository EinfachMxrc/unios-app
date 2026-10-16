// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from '@playwright/test'
import path from 'node:path'

const uvicorn = `"${path.resolve(import.meta.dirname, '..', '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'uvicorn.exe' : 'uvicorn')}"`

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  // Keyboard-focus races show up now and then on shared CI runners; a retry is reported as "flaky", not hidden.
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: process.env.UNIOS_BROWSER_CHANNEL ?? 'chrome',
    timezoneId: 'Europe/Berlin',
    serviceWorkers: 'allow',
  },
  webServer: [
    {
      command: `${uvicorn} tests.fake_servers.phase1_app:app --host 127.0.0.1 --port 8173`,
      cwd: path.resolve(import.meta.dirname, '..'),
      env: { LIBREOFFICE_BIN: '/missing/soffice' },
      url: 'http://127.0.0.1:8173/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173/',
      env: { UNIOS_API_TARGET: 'http://127.0.0.1:8173' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `${uvicorn} tests.fake_servers.standby_app:app --host 127.0.0.1 --port 8174`,
      cwd: path.resolve(import.meta.dirname, '..'),
      url: 'http://127.0.0.1:8174/api/host',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174/',
      env: { UNIOS_API_TARGET: 'http://127.0.0.1:8174' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `${uvicorn} tests.fake_servers.production_app:app --host 127.0.0.1 --port 8175`,
      cwd: path.resolve(import.meta.dirname, '..'),
      url: 'http://127.0.0.1:8175/api/host',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `${uvicorn} tests.fake_servers.disabled_connector_app:app --host 127.0.0.1 --port 8176`,
      cwd: path.resolve(import.meta.dirname, '..'),
      url: 'http://127.0.0.1:8176/api/host',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `${uvicorn} tests.fake_servers.syncthing_api:app --host 127.0.0.1 --port 8177`,
      cwd: path.resolve(import.meta.dirname, '..'),
      url: 'http://127.0.0.1:8177/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `${uvicorn} tests.fake_servers.handoff_app:app --host 127.0.0.1 --port 8178`,
      cwd: path.resolve(import.meta.dirname, '..'),
      url: 'http://127.0.0.1:8178/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',
      url: 'http://127.0.0.1:4178/',
      env: { UNIOS_API_TARGET: 'http://127.0.0.1:8178' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
