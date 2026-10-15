// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Pure helpers shared between `keyParity.test.ts` (German ⇄ English, run by
 * Vitest) and `frontend/scripts/i18n-check.mjs` (any locale ⇄ German/English,
 * run by plain Node via `--experimental-strip-types`). Kept dependency-free
 * so both runtimes can import this file directly.
 */

/** i18next plural key suffixes (CLDR categories). */
export const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

/**
 * `"key_one" | "key_other"` collapse to plain `"key"` (i18next's plural key
 * convention). A namespace is free to give one language a plain `key` and
 * another `key_one`/`key_other` — i18next falls back to the plain key when a
 * language has no suffixed variant for the active count, so this is a
 * normal, working shape difference rather than a missing translation (see
 * `de/courses.ts`'s `count` vs `en/courses.ts`'s `count_one`/`count_other`
 * for a documented example). Comparing "base" keys (suffix stripped) instead
 * of raw keys treats that shape difference as equivalent rather than a
 * mismatch.
 */
export function baseKey(key: string): string {
  return key.replace(PLURAL_SUFFIX, '')
}

/** Recursively flattens a (possibly nested) resource object into dot-path -> string-value pairs. */
export function flattenResource(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      Object.assign(out, flattenResource(entry as Record<string, unknown>, path))
    } else {
      out[path] = String(entry)
    }
  }
  return out
}

/**
 * Words that are legitimately identical across languages in UniOS's UI copy:
 * brand/product names, loanwords and anglicisms already used as-is in German
 * (a real pattern in German tech products — "Version", "Feedback", "Token"
 * and similar are simply not translated), and other cross-language cognates.
 * Matched case-insensitively against individual words, not whole strings, so
 * one entry covers every template that happens to use it (e.g. `Version
 * {{version}}` or `{{count}} ECTS`). Keep this specific — it exists to allow
 * real exceptions, not to hide untranslated copy.
 */
export const COGNATE_WORDS = new Set(
  [
    'UniOS',
    'PDF',
    'PDFs',
    'ECTS',
    'ZIP',
    'JSON',
    'GitHub',
    'Moodle',
    'PRIMUSS',
    'Syncthing',
    'Tailscale',
    'AnkiConnect',
    'Anki',
    'API',
    'ID',
    'URL',
    'MCP',
    'KB',
    'MB',
    'SHA',
    'CSV',
    'OK',
    'System',
    'Status',
    'Version',
    'Details',
    'Material',
    'Text',
    'Website',
    'Board',
    'Tag',
    'Name',
    'Pause',
    'Backup',
    'Token',
    'News',
    'Links',
    'Commits',
    'Issues',
    'Pull',
    'Requests',
    'Branches',
    'To-do',
    'To-dos',
    'mycampus',
    'code',
    'codeblock',
    'Code',
    'marcunios',
    'Forum',
    'Generation',
    'Semester',
    'Audio',
    'Java',
    'Python',
    'JavaScript',
    'ms',
    'Integral',
    // Mathematical names and network nouns have the same spelling in de/en.
    'Norm',
    'Modulo',
    'Median',
    'Minimum',
    'Maximum',
    'Client',
    'Router',
    'Server',
    'Feedback',
    'Capabilities',
    'Domains',
    'Secrets',
    'https',
    'Smart',
    'Capture',
    'Vegan',
    'Desktop',
    // Two-letter weekday abbreviations that coincide because the German and
    // English day names happen to share the same first two letters (Montag/
    // Monday, Freitag/Friday, Samstag/Saturday) — see de/en `deadlines.ts`'s
    // `weekdayMon`/`weekdayFri`/`weekdaySat` (the other five days differ:
    // Di/Tu, Mi/We, Do/Th, So/Su).
    'Mo',
    'Fr',
    'Sa',
  ].map((word) => word.toLocaleLowerCase('en-US')),
)

/**
 * True when a value cannot possibly reveal a forgotten translation: every
 * "word" in it (once interpolation placeholders are stripped) is either a
 * single character (keyboard-shortcut letters, list markers), punctuation,
 * digits, or a known cognate/loanword — never running prose that could have
 * been left untranslated by copy-paste.
 */
export function isTranslationInsensitive(value: string): boolean {
  const withoutPlaceholders = value.replace(/\{\{[^}]+\}\}/g, ' ')
  const rawWords = withoutPlaceholders.match(/\p{L}[\p{L}'-]*/gu) ?? []
  const words = rawWords.map((word) => word.replace(/[-']+$/, ''))
  return words.every((word) => word.length === 1 || COGNATE_WORDS.has(word.toLocaleLowerCase('en-US')))
}
