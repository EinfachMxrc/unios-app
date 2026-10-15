// SPDX-License-Identifier: AGPL-3.0-or-later

export function motionDuration(milliseconds: number): number {
  const appReduced = document.documentElement.dataset.reduceMotion === 'true'
  const osReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  return appReduced || osReduced ? 0 : milliseconds
}

export function waitForMotion(milliseconds: number): Promise<void> {
  const duration = motionDuration(milliseconds)
  return duration === 0 ? Promise.resolve() : new Promise((resolve) => window.setTimeout(resolve, duration))
}
