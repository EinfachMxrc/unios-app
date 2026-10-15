// SPDX-License-Identifier: AGPL-3.0-or-later

// Scaffolds a new UI language: `src/i18n/locales/<code>/locale.json` plus
// one namespace file per existing English namespace, copied verbatim as a
// starting point for translation. See docs/TRANSLATING.md for the full
// contributor workflow.
//
// Usage:
//   npm run i18n:new -- <code> --name "<native name>" [--english-name "<English name>"] [--rtl]
// Example:
//   npm run i18n:new -- fr --name "Français" --english-name "French"
//
// Must be invoked as `node --experimental-strip-types scripts/i18n-new.mjs`
// (see the `i18n:new` npm script) — it imports `localeMetaShape.ts` directly
// to reuse the same BCP-47 validation the running app relies on.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import console from 'node:console'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptDir, '..')
const i18nDir = path.join(frontendDir, 'src', 'i18n')
const localesDir = path.join(i18nDir, 'locales')

const { isValidBcp47 } = await import(pathToFileURL(path.join(i18nDir, 'localeMetaShape.ts')).href)

function usage() {
  console.log('Usage: npm run i18n:new -- <code> --name "<native name>" [--english-name "<English name>"] [--rtl]')
  console.log('Example: npm run i18n:new -- fr --name "Français" --english-name "French"')
}

function parseArgs(argv) {
  const [code, ...rest] = argv
  const options = { code, nativeName: null, englishName: null, rtl: false }
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index]
    if (arg === '--name') options.nativeName = rest[++index]
    else if (arg === '--english-name') options.englishName = rest[++index]
    else if (arg === '--rtl') options.rtl = true
    else {
      console.error(`i18n:new: unknown argument "${arg}"`)
      process.exitCode = 1
      return null
    }
  }
  return options
}

function namespacesIn(folder) {
  // locale.json (metadata) is excluded simply by the extension filter.
  return readdirSync(path.join(localesDir, folder))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => name.replace(/\.ts$/, ''))
    .sort()
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return
  if (!options.code || !options.nativeName) {
    usage()
    process.exitCode = 1
    return
  }
  if (!isValidBcp47(options.code)) {
    console.error(`i18n:new: "${options.code}" is not a valid BCP-47 language tag, e.g. "fr" or "pt-BR".`)
    process.exitCode = 1
    return
  }

  const targetDir = path.join(localesDir, options.code)
  if (existsSync(targetDir)) {
    console.error(`i18n:new: src/i18n/locales/${options.code}/ already exists — refusing to overwrite it.`)
    process.exitCode = 1
    return
  }

  const englishName = options.englishName ?? options.nativeName
  const dir = options.rtl ? 'rtl' : 'ltr'

  mkdirSync(targetDir, { recursive: true })

  const metaContent = `${JSON.stringify({ code: options.code, nativeName: options.nativeName, englishName, dir }, null, 2)}\n`
  writeFileSync(path.join(targetDir, 'locale.json'), metaContent, 'utf8')

  const namespaces = namespacesIn('en')
  const scaffoldNotice =
    `// Copied from English by \`npm run i18n:new\` as a starting point.\n` +
    `// Translate every value below, then run \`npm run i18n:check -- ${options.code}\`.\n` +
    `export default {`

  for (const namespace of namespaces) {
    const englishSource = readFileSync(path.join(localesDir, 'en', `${namespace}.ts`), 'utf8')
    const scaffolded = englishSource.replace('export default {', scaffoldNotice)
    writeFileSync(path.join(targetDir, `${namespace}.ts`), scaffolded, 'utf8')
  }

  console.log(`Created src/i18n/locales/${options.code}/ with ${namespaces.length} namespace file(s), copied from English.`)
  console.log('')
  console.log('Next steps:')
  console.log(`  1. Translate every value in src/i18n/locales/${options.code}/*.ts.`)
  console.log(`  2. npm run i18n:check -- ${options.code}`)
  console.log(`  3. npm run dev, then pick "${options.nativeName}" in Settings to try it out.`)
}

await main()
