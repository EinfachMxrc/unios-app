// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from '@playwright/test'
import full from './playwright.config'
import path from 'node:path'

// The release builder emits a desktop-specific UI. Keep the browser matrix on
// one immutable PWA build, including FastAPI's production-serving fixture.
const dist = path.resolve(import.meta.dirname, '..', '.tmp', 'workspace-022-pwa')
export default defineConfig({
  ...full,
  testDir: path.resolve(import.meta.dirname, 'e2e'),
  webServer: Array.isArray(full.webServer)
    ? full.webServer.map((server) => ({
        ...server,
        command: server.command.startsWith('npm run preview') ? `${server.command} --outDir "${dist}"` : server.command,
        env: { ...server.env, UNIOS_TEST_REACT_DIST: dist },
      }))
    : full.webServer,
})
