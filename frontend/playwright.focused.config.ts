// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from '@playwright/test'
import full from './playwright.config'

// Only the primary fake app and its frontend preview are needed for ordinary UI flows.
export default defineConfig({
  ...full,
  webServer: Array.isArray(full.webServer) ? full.webServer.slice(0, 2) : full.webServer,
})
