// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from 'react-i18next'
import { deResources } from './resources'
import type { Namespace } from './resources'

/**
 * A hand-rolled replacement for react-i18next's own generic `t()` typing.
 *
 * i18next/react-i18next's built-in TypeScript support (`CustomTypeOptions`,
 * `TFunction<Ns>`) derives the key union for `t()` from a chain of
 * conditional types (`ParseKeys` / `NsByTOptions` in
 * `i18next/typescript/t.d.ts`) that depends on inferring a generic `TOptions`
 * type parameter from the call's *options* argument. When `t('key')` is
 * called with no options object — our most common call shape — there is no
 * argument to infer that parameter from, and (at least as of i18next 26 /
 * react-i18next 17) the conditional types fall back to a distributive
 * evaluation that unions in every configured namespace's *prefixed* keys
 * (`"otherNs:key"`) instead of the current namespace's bare keys. In
 * practice this makes `t('someRealKey')` fail to typecheck while
 * `t('otherNamespace:unrelatedKey')` would "pass" — the opposite of what we
 * need. See the project i18n setup notes for a minimal repro.
 *
 * Rather than depend on that fragile machinery, `useT` derives the key union
 * directly and structurally from our own bundled (German) resource shape in
 * `./resources.ts` — the same file that is the single source of truth for
 * both the runtime bundle and typing. This is simpler, has no dependency on
 * i18next's internal generic inference, and still gives a real compile error
 * for a missing or misspelled key or a wrong namespace.
 */

type PluralSuffix = '_zero' | '_one' | '_two' | '_few' | '_many' | '_other'

/** `"key_one" | "key_other"` collapse to plain `"key"` (i18next's plural key convention). */
type StripPluralSuffix<Key extends string> = Key extends `${infer Base}${PluralSuffix}` ? Base : Key

/**
 * Flattens exactly one level of nested objects (e.g. `state.ts`'s `status.*`)
 * into dot-path keys — none of our namespaces nest deeper than that. This is
 * intentionally NOT a general recursive flatten: a self-referential type
 * alias evaluated inside a mapped type over ~500 combined keys across 13
 * namespaces reliably hits TypeScript's "Type instantiation is excessively
 * deep" limit, even when every concrete namespace shape is small and finite.
 * A fixed two-level version sidesteps that entirely.
 */
type FlattenKeys<T> = {
  [K in Extract<keyof T, string>]: T[K] extends string
    ? K
    : { [K2 in Extract<keyof T[K], string>]: `${K}.${K2}` }[Extract<keyof T[K], string>]
}[Extract<keyof T, string>]

// Precomputed once per concrete namespace (each `N` below is a literal, not
// an open generic) so `Keys<Ns>` below is a cheap indexed lookup rather than
// re-running `FlattenKeys` against a generic, unresolved `Ns`.
type NamespaceKeys = { [N in Namespace]: StripPluralSuffix<FlattenKeys<(typeof deResources)[N]>> }

export type Keys<Ns extends Namespace> = NamespaceKeys[Ns]

export interface TypedT<Ns extends Namespace> {
  (key: Keys<Ns>, options?: Record<string, unknown>): string
}

/**
 * Typed alternative to `useTranslation(ns)`. Behaves identically at runtime
 * (it just calls react-i18next's own hook, so language switching and
 * lazy-loaded namespaces work exactly the same) but exposes a `t` whose key
 * argument is checked against the real key set of `ns` — including
 * namespace-flattened nested keys and plural base keys — without the
 * upstream inference pitfall described above.
 */
export function useT<Ns extends Namespace>(ns: Ns): { t: TypedT<Ns> } {
  const { t } = useTranslation(ns)
  return { t: t as unknown as TypedT<Ns> }
}
