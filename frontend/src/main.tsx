// SPDX-License-Identifier: AGPL-3.0-or-later

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { i18nReady } from './i18n'
import { preloadRoute } from './lib/routeLoading'

// Fetch the page for the opened address while the app still checks its mode
// and restores the cache. Otherwise the page is only requested after those
// checks, and its loading frame (with its own sidebar) is replaced while the
// user may already be using it. A failed load retries when React renders it.
void preloadRoute(window.location.pathname)?.catch(() => undefined)

// Wait for i18next before the first render so a returning user whose stored
// preference is English never sees a flash of German fallback text (German
// itself renders instantly since its resources are bundled synchronously).
void i18nReady.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
