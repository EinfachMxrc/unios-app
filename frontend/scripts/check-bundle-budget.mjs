// SPDX-License-Identifier: AGPL-3.0-or-later

import { readdir, readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { URL } from 'node:url'
import console from 'node:console'
import process from 'node:process'

const assets = new URL('../dist/assets/', import.meta.url)
const dist = new URL('../dist/', import.meta.url)
// Baseline plus deliberate headroom; editor/worker costs also affect cold PWA installs.
const limits = {
  index: 222 * 1024, // +2 KiB for the course desk (measured +1.1 KiB, CI compresses ~0.4 KiB larger than local)
  MaterialPage: 250 * 1024,
  NotesPage: 320 * 1024,
  'pdf.worker.min': 450 * 1024,
  'editor.api': 800 * 1024,
  tsMode: 360 * 1024,
  'ts.worker': 1700 * 1024,
  'editor.worker': 110 * 1024,
}
const files = await readdir(assets)
let failed = false
for (const [prefix, budget] of Object.entries(limits)) {
  const matches = files.filter(name => name.startsWith(prefix + '-') && /\.(?:js|mjs)$/.test(name))
  if (matches.length !== 1) throw new Error(`Expected one measured artifact for ${prefix}, found ${matches.length}`)
  const [file] = matches
  if (!file) throw new Error(`Missing measured artifact: ${prefix}`)
  const bytes = gzipSync(await readFile(new URL(file, assets))).length
  console.log(`${prefix}: ${bytes} gzip bytes; budget ${budget}`)
  if (bytes > budget) failed = true
}
// Read Workbox's generated manifest without executing the service worker.
const worker = await readFile(new URL('sw.js', dist), 'utf8')
const manifest = worker.match(/\.precacheAndRoute\(\[([\s\S]*?)\],/)?.[1]
if (!manifest) throw new Error('Missing generated Workbox precache manifest')
const urls = new Set([...manifest.matchAll(/\burl:("(?:[^"\\]|\\.)*")/g)]
  .map(match => JSON.parse(match[1])))
if (!urls.size) throw new Error('Empty generated precache manifest')
for (const file of files.filter(name => /\.(?:mjs|woff|woff2|ttf)$/.test(name))) {
  if (!urls.has(`assets/${file}`)) throw new Error(`Offline worker/font missing from precache: ${file}`)
}
let rawTotal = 0
let gzipTotal = 0
for (const url of urls) {
  const file = new URL(url, dist)
  if (!file.href.startsWith(dist.href) || file.search || file.hash) throw new Error(`Unexpected precache URL: ${url}`)
  const bytes = await readFile(file)
  rawTotal += bytes.length
  gzipTotal += gzipSync(bytes).length
}
const rawBudget = 18 * 1024 * 1024
const gzipBudget = 5 * 1024 * 1024
console.log(`PWA precache: ${urls.size} unique files; ${rawTotal} raw bytes / budget ${rawBudget}; ${gzipTotal} gzip bytes / budget ${gzipBudget}`)
if (rawTotal > rawBudget || gzipTotal > gzipBudget) failed = true
if (failed) process.exitCode = 1
