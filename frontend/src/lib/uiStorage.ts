// SPDX-License-Identifier: AGPL-3.0-or-later

/** Copy a legacy UI preference once. Keep the original available for older clients. */
export function readMigratedStorage(key: string, legacy: string): string | null {
  try {
    const value = localStorage.getItem(key)
    if (value !== null) return value
    const previous = localStorage.getItem(legacy)
    if (previous !== null) {
      try {
        localStorage.setItem(key, previous)
      } catch {
        /* Read remains available when storage is full. */
      }
    }
    return previous
  } catch {
    return null
  }
}
