// SPDX-License-Identifier: AGPL-3.0-or-later

// Deliberately incomplete: only translates "greeting", never "farewell". A
// deep-partial locale — see `LocaleNamespaceResource` in `../../resources.ts`
// — is exactly this shape at the type level; this fixture proves it also
// works at runtime, i.e. that the `zz -> en -> de` fallback chain resolves
// "farewell" through English rather than crashing or showing an empty
// string.
export default {
  greeting: 'Zzzhello',
} as const
