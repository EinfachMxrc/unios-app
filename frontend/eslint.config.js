// SPDX-License-Identifier: AGPL-3.0-or-later

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import i18next from 'eslint-plugin-i18next'
import { i18nGuardFiles, i18nGuardIgnores } from './i18n-guard-files.js'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // i18n guard: flags hard-coded JSX text/attributes. The covered files are
    // listed in i18n-guard-files.js so converted surfaces can be added there.
    files: i18nGuardFiles,
    ignores: i18nGuardIgnores,
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          words: {
            // Punctuation/spacing used as pure layout glue between already
            // translated fragments (" · ", " – ", "←", "→", "✓", …) rather
            // than user-facing copy. Real words are never made only of these
            // characters, so this can't hide an untranslated string.
            exclude: [/^[0-9!-/:-@[-`{-~]+$/, /^[A-Z_-]+$/, /^[ ·–—•✓←→×+/]*$/],
          },
        },
      ],
    },
  },
)
