// SPDX-License-Identifier: AGPL-3.0-or-later

import './Mascot.css'

/** The sleeping owl's "z" is a drawing, not a word. */
const SNORE = 'z'

/** How Uli looks: awake by default, focused before reviews, sleepy at night, cheering when nothing is due. */
export type MascotMood = 'awake' | 'focus' | 'sleepy' | 'cheer'

/** Where the pupils look, in the drawing's units; zero is straight ahead. */
export interface MascotLook {
  x: number
  y: number
}

const STRAIGHT_AHEAD: MascotLook = { x: 0, y: 0 }

/** The mood that fits the moment: night wins, then due reviews, then a clear day. */
export function mascotMoodFor({
  hour,
  dueCards,
  openTasks,
}: {
  hour: number
  dueCards: number
  openTasks: number
}): MascotMood {
  if (hour >= 22 || hour < 5) return 'sleepy'
  if (dueCards > 0) return 'focus'
  if (openTasks === 0) return 'cheer'
  return 'awake'
}

function OpenEyes({ mood, look, wide }: { mood: MascotMood; look: MascotLook; wide: boolean }) {
  // Focus looks down at the page; awake looks at you. Wide-awake eyes grow a little.
  const pupilY = (mood === 'focus' && !wide ? 45 : 42) + look.y
  const eye = wide ? 12 : 11
  const pupil = wide ? 5.6 : 5
  return (
    <g className="mascot-eyes">
      <circle cx="34" cy="41" r={eye} fill="#fff" />
      <circle cx="62" cy="41" r={eye} fill="#fff" />
      <g className="mascot-pupils">
        <circle cx={35 + look.x} cy={pupilY} r={pupil} fill="var(--mascot-ink)" />
        <circle cx={61 + look.x} cy={pupilY} r={pupil} fill="var(--mascot-ink)" />
        <circle cx={36.6 + look.x} cy={pupilY - 1.8} r="1.6" fill="#fff" />
        <circle cx={62.6 + look.x} cy={pupilY - 1.8} r="1.6" fill="#fff" />
      </g>
    </g>
  )
}

function Eyes({ mood, look, wide }: { mood: MascotMood; look: MascotLook; wide: boolean }) {
  if (wide) return <OpenEyes mood={mood} look={look} wide />
  if (mood === 'sleepy') {
    return (
      <g className="mascot-closed" fill="none" stroke="var(--mascot-ink)" strokeWidth="3" strokeLinecap="round">
        <path d="M27 41q7 5 14 0" />
        <path d="M55 41q7 5 14 0" />
      </g>
    )
  }
  if (mood === 'cheer') {
    return (
      <g fill="none" stroke="var(--mascot-ink)" strokeWidth="3" strokeLinecap="round">
        <path d="M27 44q7-8 14 0" />
        <path d="M55 44q7-8 14 0" />
      </g>
    )
  }
  return <OpenEyes mood={mood} look={look} wide={false} />
}

interface MascotProps {
  mood?: MascotMood
  size?: number
  className?: string
  /** Where the pupils look; only open eyes follow it. */
  look?: MascotLook
  /** Eyes wide open, whatever the mood: Uli noticed you. */
  wide?: boolean
  /** The right wing waves hello. */
  waving?: boolean
}

/**
 * Uli, the UniOS owl. The drawing itself is decorative and hidden from screen
 * readers; `UliBuddy` wraps it in a button when Uli should react.
 */
export function Mascot({
  mood = 'awake',
  size = 72,
  className = '',
  look = STRAIGHT_AHEAD,
  wide = false,
  waving = false,
}: MascotProps) {
  const state = [wide && 'mascot-wide', waving && 'mascot-waving'].filter(Boolean).join(' ')
  return (
    <svg
      className={`mascot mascot-${mood} ${state} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="mascot-shadow" cx="48" cy="90" rx="24" ry="3.5" fill="var(--mascot-shadow)" />
      <g className="mascot-figure">
        <path
          className="mascot-wing mascot-wing-left"
          d="M19 52c-7 4-10 14-6 22 4-2 8-7 9-13Z"
          fill="var(--mascot-wing)"
        />
        <path
          className="mascot-wing mascot-wing-right"
          d="M77 52c7 4 10 14 6 22-4-2-8-7-9-13Z"
          fill="var(--mascot-wing)"
        />
        <path className="mascot-tuft" d="M22 26 L18 10 L34 20 Z" fill="var(--mascot-body)" />
        <path className="mascot-tuft" d="M74 26 L78 10 L62 20 Z" fill="var(--mascot-body)" />
        <path
          d="M48 14c19 0 31 13 31 33v14c0 16-14 27-31 27S17 77 17 61V47c0-20 12-33 31-33Z"
          fill="var(--mascot-body)"
        />
        <path d="M48 54c11 0 19 7 19 17 0 9-8 14-19 14s-19-5-19-14c0-10 8-17 19-17Z" fill="var(--mascot-belly)" />
        <path
          d="M41 70q3 2 7 0M49 76q3 2 7 0M41 80q3 2 6 0"
          fill="none"
          stroke="var(--mascot-body)"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity=".55"
        />
        <g className="mascot-face">
          <g className="mascot-brows" fill="none" stroke="var(--mascot-wing)" strokeWidth="3" strokeLinecap="round">
            <path d="M27 26q6-3 12 0" />
            <path d="M57 26q6-3 12 0" />
          </g>
          <Eyes mood={mood} look={look} wide={wide} />
          <path d="M44 50 L48 57 L52 50 Z" fill="var(--mascot-beak)" />
          {mood === 'focus' && (
            <g fill="none" stroke="var(--mascot-ink)" strokeWidth="2">
              <circle cx="34" cy="41" r="12.5" />
              <circle cx="62" cy="41" r="12.5" />
              <path d="M46.5 41h3" />
            </g>
          )}
          <g className="mascot-cheeks" fill="var(--mascot-beak)" opacity=".4">
            <ellipse cx="24" cy="51" rx="4" ry="2.5" />
            <ellipse cx="72" cy="51" rx="4" ry="2.5" />
          </g>
        </g>
        <g className="mascot-feet" fill="var(--mascot-beak)">
          <path d="M33 85q-6 5-2 5h10q3-1-1-5Z" />
          <path d="M56 85q-4 4-1 5h10q4 0-2-5Z" />
        </g>
        {mood === 'sleepy' && !wide && (
          <text x="74" y="22" fontSize="11" fontWeight="700" fill="var(--mascot-ink)" opacity=".6">
            {SNORE}
          </text>
        )}
      </g>
    </svg>
  )
}
