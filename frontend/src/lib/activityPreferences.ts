// SPDX-License-Identifier: AGPL-3.0-or-later
/** Explicit display choices only; cleared when the connected workspace changes. */
export const ACTIVITY_PREFERENCES_KEY = 'unios-activity-preferences-v1'
const keys = ['course_id', 'kind', 'from_date', 'to_date'] as const
const kinds = ['', 'content', 'new', 'updated', 'assignment', 'sync', 'mail']

export function activityPreferences(): URLSearchParams {
  try {
    const raw = localStorage.getItem(ACTIVITY_PREFERENCES_KEY)
    if (!raw || raw.length > 1000) return new URLSearchParams()
    const saved = new URLSearchParams(raw)
    const result = new URLSearchParams()
    for (const key of keys) {
      const value = saved.get(key)
      if (
        value &&
        (key === 'kind'
          ? kinds.includes(value)
          : key === 'course_id'
            ? /^[1-9]\d{0,9}$/.test(value)
            : /^\d{4}-\d{2}-\d{2}$/.test(value))
      )
        result.set(key, value)
    }
    return result
  } catch {
    return new URLSearchParams()
  }
}
export function rememberActivityPreferences(params: URLSearchParams) {
  const saved = new URLSearchParams()
  for (const key of keys) if (params.has(key)) saved.set(key, params.get(key) ?? '')
  try {
    localStorage.setItem(ACTIVITY_PREFERENCES_KEY, saved.toString())
  } catch {
    /* Storage may be unavailable. */
  }
}
