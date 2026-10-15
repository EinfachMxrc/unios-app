// SPDX-License-Identifier: AGPL-3.0-or-later

// Files covered by the i18n guard (`i18next/no-literal-string`) in eslint.config.js.
// Kept separate so the guarded set can change without touching the ESLint config.
//
// Every UI surface has now been converted to `useT()`/`t()` (see the git log
// for the per-page rollout), so the guard applies to the whole frontend
// source tree. `i18nGuardIgnores` below carries the exceptions: tests,
// generated code, and anything with a justified `eslint-disable-next-line`
// at the call site (brand names, CLI command names, CSS class strings, …).
export const i18nGuardFiles = ['src/**/*.{ts,tsx}']

// Never guarded: tests and generated code.
export const i18nGuardIgnores = ['src/**/*.test.{ts,tsx}', 'src/generated/**', 'src/test/**']
