// SPDX-License-Identifier: AGPL-3.0-or-later

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { Agent } from 'node:http'
import { readFileSync, readdirSync } from 'node:fs'
import { isIP } from 'node:net'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { modernMathFontCss } from './tooling/mathFonts.ts'

// https://vite.dev/config/
const apiTarget = process.env.UNIOS_API_TARGET ?? 'http://127.0.0.1:8000'
const targetUrl = new URL(apiTarget)
const localHttp =
  targetUrl.protocol === 'http:' &&
  (targetUrl.hostname === 'localhost' ||
    targetUrl.hostname === '[::1]' ||
    (isIP(targetUrl.hostname) === 4 && targetUrl.hostname.split('.')[0] === '127'))
// The proxy otherwise forces agent:false/Connection:close for every request.
const apiAgent = localHttp
  ? new Agent({
      keepAlive: true,
      maxSockets: 32,
      maxTotalSockets: 32,
      maxFreeSockets: 8,
      scheduling: 'lifo',
    })
  : undefined
const proxyTarget = apiAgent ? { target: apiTarget, changeOrigin: true, agent: apiAgent } : apiTarget
const apiProxy = {
  '/api': proxyTarget,
  '/files': proxyTarget,
  '/calendar.ics': proxyTarget,
}
const proxyLifecycle: Plugin = {
  name: 'unios-loopback-proxy-lifecycle',
  configureServer(server) {
    server.httpServer?.once('close', () => apiAgent?.destroy())
  },
  configurePreviewServer(server) {
    server.httpServer.once('close', () => apiAgent?.destroy())
  },
}

// MathLive otherwise discovers fonts on a CDN. Ship and precache every font
// locally; the same path works in development and in the native client.
const localMathFonts: Plugin = {
  name: 'unios-local-math-fonts',
  generateBundle() {
    const directory = path.resolve(import.meta.dirname, 'node_modules/mathlive/fonts')
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.woff2')))
      this.emitFile({
        type: 'asset',
        fileName: `mathlive/fonts/${file}`,
        source: readFileSync(path.join(directory, file)),
      })
  },
  configureServer(server) {
    server.middlewares.use('/mathlive/fonts', (req, res, next) => {
      const name = req.url?.slice(1)
      if (!name || !/^[A-Za-z0-9_-]+\.woff2$/.test(name)) return next()
      const file = path.resolve(import.meta.dirname, 'node_modules/mathlive/fonts', name)
      try {
        res.setHeader('Content-Type', 'font/woff2')
        res.end(readFileSync(file))
      } catch {
        next()
      }
    })
  },
}
const modernMathFonts: Plugin = {
  name: 'unios-woff2-math-fonts',
  enforce: 'pre',
  configResolved(config) {
    mathFontsBase = `${config.base}mathlive/fonts/`
  },
  transform(source, id) {
    if (!/\/node_modules\/katex\/dist\/katex(?:\.min)?\.css$/.test(id.replaceAll('\\', '/'))) return
    const directory = path.resolve(import.meta.dirname, 'node_modules/mathlive/fonts')
    const katexFonts = path.resolve(import.meta.dirname, 'node_modules/katex/dist/fonts')
    const shared = new Set(
      readdirSync(directory).filter((name) => {
        if (!name.endsWith('.woff2')) return false
        try {
          return readFileSync(path.join(directory, name)).equals(readFileSync(path.join(katexFonts, name)))
        } catch {
          return false
        }
      }),
    )
    return { code: modernMathFontCss(source, shared, mathFontsBase), map: null }
  },
}
let mathFontsBase = '/mathlive/fonts/'

export default defineConfig({
  plugins: [
    ...(apiAgent ? [proxyLifecycle] : []),
    react(),
    localMathFonts,
    modernMathFonts,
    tailwindcss(),
    VitePWA({
      disable: process.env.VITE_UNIOS_DESKTOP === 'true',
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        name: 'UniOS',
        short_name: 'UniOS',
        // The manifest is static and can't follow the in-app language switch
        // (unlike the rest of the UI, which is fully translated via i18next —
        // see src/i18n/). English reads naturally to the widest audience for
        // an install prompt / app-switcher label, so it's used here instead
        // of duplicating a bilingual string; "UniOS" stays the neutral brand
        // name in both languages.
        description: 'Private study space for courses, materials and deadlines',
        lang: 'de',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        share_target: {
          action: '/inbox',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        theme_color: '#0b111c',
        background_color: '#0b111c',
        icons: [
          { src: '/brand/v2/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/brand/v2/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/brand/v2/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Monaco is lazy loaded; cache its local workers for offline draft editing.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{html,js,mjs,css,svg,png,ico,woff,woff2,ttf}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/files\//, /^\/calendar\.ics$/],
        runtimeCaching: [
          {
            // This route can only read explicit, binding-scoped preparation.
            // Ordinary file visits never populate a persistent download cache.
            urlPattern: ({ url, request, sameOrigin }) =>
              request.method === 'GET' &&
              sameOrigin &&
              /^\/files\/[1-9]\d*(?:\/inline)?$/.test(url.pathname) &&
              /^[0-9a-f-]{36}$/i.test(url.searchParams.get('unios-offline-scope') ?? ''),
            handler: 'CacheFirst',
            options: { cacheName: 'unios-course-files-v1', plugins: [{ cacheWillUpdate: async () => null }] },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    host: '127.0.0.1',
    proxy: apiProxy,
  },
  preview: { proxy: apiProxy },
})
