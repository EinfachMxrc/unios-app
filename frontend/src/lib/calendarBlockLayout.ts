// SPDX-License-Identifier: AGPL-3.0-or-later

/** Visible metadata follows the rendered time geometry, including the user's text scale. */
export function calendarBlockLines(height: number | undefined, textScale = 1): number {
  if (height === undefined) return 4
  const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 1
  const line = 16 * scale
  const padding = height >= line + 10 ? 8 : 0
  return Math.max(1, Math.min(4, Math.floor((height - padding - 2 + 2) / (line + 2))))
}
