// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/useT'
import { Mascot, type MascotLook, type MascotMood } from './Mascot'
import { mascotLine, pupilOffset, type MascotLine } from './mascotBehavior'
import './UliBuddy.css'

/** How long Uli keeps talking, and how long a wave or a spin lasts. */
const BUBBLE_MS = 6000
const WAVE_MS = 900
const SPIN_MS = 800
/** Four clicks this close together make Uli dizzy. */
const STREAK_GAP_MS = 600
const STREAK_FOR_SPIN = 4
/** The eyes sit at this height of the drawing. */
const EYE_LINE = 41 / 96

/** The pupils follow the pointer anywhere on the page, at most once per frame. */
function usePointerLook(target: React.RefObject<HTMLElement | null>): MascotLook {
  const [look, setLook] = useState<MascotLook>({ x: 0, y: 0 })
  useEffect(() => {
    let frame = 0
    const follow = (event: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const box = target.current?.getBoundingClientRect()
        if (!box?.width) return
        const center = { x: box.left + box.width / 2, y: box.top + box.height * EYE_LINE }
        const next = pupilOffset({ x: event.clientX, y: event.clientY }, center)
        // Far-away pointers all give the same full reach; skip renders that change nothing.
        setLook((previous) => (previous.x === next.x && previous.y === next.y ? previous : next))
      })
    }
    window.addEventListener('pointermove', follow, { passive: true })
    return () => {
      window.removeEventListener('pointermove', follow)
      cancelAnimationFrame(frame)
    }
  }, [target])
  return look
}

/** A timer that replaces itself and is cleared when the owl goes away. */
function useTimer() {
  const timers = useRef(new Map<string, number>())
  useEffect(() => {
    const running = timers.current
    return () => running.forEach((id) => window.clearTimeout(id))
  }, [])
  return (name: string, ms: number, run: () => void) => {
    window.clearTimeout(timers.current.get(name))
    timers.current.set(name, window.setTimeout(run, ms))
  }
}

interface UliBuddyProps {
  mood: MascotMood
  size?: number
  className?: string
}

/**
 * Uli you can play with: eyes follow the pointer, open wide on hover or
 * focus, and a click (or Enter) makes Uli wave and say something that fits
 * the moment, then a tip. Click fast enough and Uli gets dizzy.
 */
export function UliBuddy({ mood, size = 64, className = '' }: UliBuddyProps) {
  const { t } = useT('common')
  const button = useRef<HTMLButtonElement>(null)
  const look = usePointerLook(button)
  const later = useTimer()
  const clicks = useRef(0)
  const streak = useRef({ count: 0, at: 0 })
  const [noticed, setNoticed] = useState(false)
  const [line, setLine] = useState<MascotLine | null>(null)
  const [act, setAct] = useState<'wave' | 'spin' | 'peek' | 'bow' | 'celebrate' | null>(null)
  const [resting, setResting] = useState(false)

  useEffect(() => {
    let reset = 0
    let count = 0
    const visibility = () => {
      setResting(document.hidden)
      if (document.hidden) setAct(null)
    }
    document.addEventListener('visibilitychange', visibility)
    const timer = window.setInterval(() => {
      if (
        document.hidden ||
        noticed ||
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
        document.documentElement.dataset.reduceMotion === 'true'
      )
        return
      setAct((previous) => previous ?? (count++ % 2 ? 'bow' : 'peek'))
      window.clearTimeout(reset)
      reset = window.setTimeout(
        () => setAct((previous) => (previous === 'peek' || previous === 'bow' ? null : previous)),
        1500,
      )
    }, 18000)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(reset)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [noticed])

  const talk = () => {
    const now = Date.now()
    const count = now - streak.current.at < STREAK_GAP_MS ? streak.current.count + 1 : 1
    streak.current = { count: count >= STREAK_FOR_SPIN ? 0 : count, at: now }
    const spin = count >= STREAK_FOR_SPIN
    setAct(spin ? 'spin' : clicks.current % 3 === 1 ? 'bow' : clicks.current % 3 === 2 ? 'celebrate' : 'wave')
    later('act', spin ? SPIN_MS : WAVE_MS, () => setAct(null))
    setLine(mascotLine(mood, clicks.current))
    clicks.current += 1
    later('bubble', BUBBLE_MS, () => setLine(null))
  }

  return (
    <span
      className={`uli-buddy ${act === 'spin' ? 'is-dizzy' : ''} ${act ? `is-${act}` : ''} ${resting ? 'is-resting' : ''} ${className}`}
    >
      <button
        ref={button}
        type="button"
        className="uli-buddy-button"
        aria-label={t('mascot.label')}
        onPointerEnter={() => setNoticed(true)}
        onPointerLeave={() => setNoticed(false)}
        onFocus={() => setNoticed(true)}
        onBlur={() => setNoticed(false)}
        onClick={talk}
      >
        <Mascot mood={mood} size={size} look={look} wide={noticed || line !== null} waving={act === 'wave'} />
      </button>
      <span className={`uli-bubble ${line ? 'is-visible' : ''}`} role="status">
        {line ? t(`mascot.${line}`) : ''}
      </span>
    </span>
  )
}
