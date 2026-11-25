// SPDX-License-Identifier: AGPL-3.0-or-later

/** ISO 8601 week number of a `YYYY-MM-DD` day: the week belongs to the year of its Thursday. */
export function isoWeek(day: string): number {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4, 12))
  return (
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    )
  )
}
