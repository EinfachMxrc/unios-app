// SPDX-License-Identifier: AGPL-3.0-or-later

// Verifies every discovered UI language other than German (the source
// language) against German's key set, and reports the same kind of issues
// `keyParity.test.ts` checks for German/English specifically, generalized to
// any number of languages. See docs/TRANSLATING.md for what each check
// means and the severity rules.
//
// Must be invoked as `node --experimental-strip-types scripts/i18n-check.mjs`
// (see the `i18n:check` npm script) — it imports the project's `.ts` source
// files directly (their logic is shared with the app and with Vitest; see
// each imported module's own header comment), and plain Node cannot parse
// TypeScript syntax without that flag.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import console from 'node:console'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptDir, '..')
const i18nDir = path.join(frontendDir, 'src', 'i18n')
const localesDir = path.join(i18nDir, 'locales')

function importI18nModule(relativePath) {
  return import(pathToFileURL(path.join(i18nDir, relativePath)).href)
}

const { validateLocaleMeta, intlLocaleFor } = await importI18nModule('localeMetaShape.ts')
const { checkNamespace, mergeReports, untranslatedBaselineLocale } = await importI18nModule('checkTranslations.ts')

function localeFolders() {
  return readdirSync(localesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function namespacesIn(folder) {
  // locale.json (metadata, not a namespace) is excluded simply by the
  // extension filter — see localeMetaShape.ts's header comment for why
  // metadata is JSON rather than `.ts`.
  return readdirSync(path.join(localesDir, folder))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => name.replace(/\.ts$/, ''))
    .sort()
}

async function loadResource(folder, namespace) {
  const module = await importI18nModule(`locales/${folder}/${namespace}.ts`)
  return module.default
}

function loadMeta(folder) {
  const raw = readFileSync(path.join(localesDir, folder, 'locale.json'), 'utf8')
  return validateLocaleMeta(folder, JSON.parse(raw))
}

async function checkLocale(folder, germanNamespaces) {
  const errors = []
  const warnings = []

  let meta
  try {
    meta = loadMeta(folder)
  } catch (error) {
    errors.push(`[${folder}] invalid locale.json — ${error.message}`)
    return { errors, warnings }
  }

  const extraNamespaces = namespacesIn(folder).filter((namespace) => !germanNamespaces.includes(namespace))
  for (const namespace of extraNamespaces) {
    errors.push(`[${folder}] namespace "${namespace}" has no German counterpart (typo, or stale file?)`)
  }

  const isStrict = folder === 'en'
  const baselineLocale = untranslatedBaselineLocale(folder)
  const intlLocale = intlLocaleFor(meta)

  const reports = []
  for (const namespace of germanNamespaces) {
    const german = await loadResource('de', namespace)
    const untranslatedBaseline = await loadResource(baselineLocale, namespace)
    const targetPath = path.join(localesDir, folder, `${namespace}.ts`)
    const target = existsSync(targetPath) ? await loadResource(folder, namespace) : {}
    reports.push(
      checkNamespace({ namespace, locale: folder, intlLocale, german, untranslatedBaseline, target, isStrict }),
    )
  }

  const merged = mergeReports(reports)
  for (const issue of merged.errors) errors.push(`[${folder}/${issue.namespace}] ${issue.message}`)
  for (const issue of merged.warnings) warnings.push(`[${folder}/${issue.namespace}] ${issue.message}`)
  return { errors, warnings }
}

async function main() {
  const requestedLocale = process.argv[2]
  const folders = localeFolders()
  if (!folders.includes('de')) {
    console.error('i18n:check: no "de" locale found under src/i18n/locales — German is required as the source language.')
    process.exitCode = 1
    return
  }
  const germanNamespaces = namespacesIn('de')

  let targets = folders.filter((folder) => folder !== 'de')
  if (requestedLocale) {
    if (requestedLocale === 'de') {
      console.log('i18n:check: German is the source language — nothing to check it against.')
      return
    }
    if (!folders.includes(requestedLocale)) {
      console.error(`i18n:check: unknown locale "${requestedLocale}". Discovered locales: ${folders.join(', ')}`)
      process.exitCode = 1
      return
    }
    targets = [requestedLocale]
  }

  const allErrors = []
  const allWarnings = []
  for (const folder of targets) {
    const { errors, warnings } = await checkLocale(folder, germanNamespaces)
    allErrors.push(...errors)
    allWarnings.push(...warnings)
  }

  console.log(`i18n:check — ${targets.length} language(s) checked against German (${germanNamespaces.length} namespaces): ${targets.join(', ')}`)

  if (allWarnings.length) {
    console.log(`\nWarnings (${allWarnings.length}) — missing translations, non-blocking:`)
    for (const warning of allWarnings) console.log(`  - ${warning}`)
  }

  if (allErrors.length) {
    console.error(`\nErrors (${allErrors.length}):`)
    for (const error of allErrors) console.error(`  - ${error}`)
    process.exitCode = 1
  } else {
    console.log('\nNo errors.')
  }
}

await main()
