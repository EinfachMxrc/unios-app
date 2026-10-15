// SPDX-License-Identifier: AGPL-3.0-or-later

import type { MascotMood } from './Mascot'

export type MascotLine =
  | 'sleepy1' | 'sleepy2' | 'focus1' | 'focus2' | 'cheer1' | 'cheer2'
  | 'tip1' | 'tip2' | 'tip3' | 'tip4' | 'tip5' | 'tip6'

const TIPS: MascotLine[] = ['tip1', 'tip2', 'tip3', 'tip4', 'tip5', 'tip6']
const MOOD_LINES: Record<MascotMood, MascotLine[]> = {
  sleepy: ['sleepy1', 'sleepy2'],
  focus: ['focus1', 'focus2'],
  cheer: ['cheer1', 'cheer2'],
  awake: [],
}

/** What Uli says on the n-th click: first what fits the moment, then the tips in turn. */
export function mascotLine(mood: MascotMood, click: number): MascotLine {
  const lines = [...MOOD_LINES[mood], ...TIPS]
  return lines[((click % lines.length) + lines.length) % lines.length]
}

/** The furthest a pupil moves inside its eye, in the drawing's units. */
export const PUPIL_REACH = 3

/**
 * Where the pupils look: towards the pointer, but never out of the eye.
 * Far pointers give the full reach; one right at the owl barely moves them.
 */
export function pupilOffset(pointer: { x: number; y: number }, center: { x: number; y: number }) {
  const dx = pointer.x - center.x
  const dy = pointer.y - center.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1) return { x: 0, y: 0 }
  const reach = PUPIL_REACH * Math.min(1, distance / 120)
  return { x: Math.round((dx / distance) * reach * 10) / 10, y: Math.round((dy / distance) * reach * 10) / 10 }
}
