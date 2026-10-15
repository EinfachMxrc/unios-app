// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from '@playwright/test'
import full from './playwright.config'

// A handoff needs only the fake Syncthing API, handoff host and its preview.
export default defineConfig({
  ...full,
  webServer: Array.isArray(full.webServer) ? full.webServer.slice(6, 9) : full.webServer,
})
