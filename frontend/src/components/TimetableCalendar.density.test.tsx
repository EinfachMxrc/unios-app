// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimetableCalendar } from './TimetableCalendar'

const state = vi.hoisted(() => ({ scale: 100 }))
vi.mock('@/accessibility', () => ({ useAccessibility: () => ({ scale: state.scale }) }))
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/api', () => ({
  localDate: (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('de-DE', { ...options, timeZone: 'Europe/Berlin' }).format(new Date(value)),
}))
vi.mock('@/lib/calendarPreferences', () => ({
  useCalendarPreferences: () => ({ hourPx: 64, fit: false, setHourPx: vi.fn(), setFit: vi.fn() }),
}))
vi.mock('@/hooks/useCalendarMutation', () => ({
  useCalendarMutation: () => ({ busy: false, save: vi.fn(), clearFailure: vi.fn() }),
}))
vi.mock('@/hooks/useCalendarGesture', () => ({
  useCalendarGesture: () => ({ preview: null, tracking: false, begin: vi.fn(), consumeClick: () => false }),
}))
vi.mock('./CalendarEventForm', () => ({ CalendarEventForm: () => null }))
vi.mock('./State', () => ({ Empty: () => null, Loading: () => null }))

const makeEvent = (id: number, ends: string) => ({
  id,
  title: `Fixture lecture ${id} · R42, Fictional campus`,
  starts_at: '2026-10-08T08:00:00Z',
  ends_at: ends,
  revision: 'revision-1',
})
const props = {
  day: '2026-10-08',
  today: '2026-10-08',
  now: new Date('2026-10-08T07:00:00Z'),
  loading: false,
  onView: vi.fn(),
  onDay: vi.fn(),
  onToday: vi.fn(),
  canWrite: true,
  onChanged: vi.fn(),
}

afterEach(() => {
  cleanup()
  state.scale = 100
  document.documentElement.style.removeProperty('font-size')
})

describe('readable calendar blocks', () => {
  it('retains the complete accessible name and detail path when a short block shows only its title', () => {
    render(<TimetableCalendar {...props} view="day" events={[makeEvent(1, '2026-10-08T08:15:00Z')]} />)
    const block = screen.getByTestId('timetable-event-1')
    expect(block.dataset.lines).toBe('1')
    expect(block.querySelector('time')).toBeNull()
    expect(block.querySelector('.calendar-location')).toBeNull()
    expect(block.querySelector('.calendar-resize')).toBeNull()
    const trigger = screen.getByRole('button', { name: 'Fixture lecture 1 · 10:00 – 10:15 · R42, Fictional campus' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog').textContent).toContain('R42, Fictional campus')
  })
  it('keeps metadata and both resize alternatives in a tall block, adapting to enlarged text', () => {
    const event = makeEvent(2, '2026-10-08T09:00:00Z')
    const { rerender } = render(<TimetableCalendar {...props} view="day" events={[event]} />)
    const block = screen.getByTestId('timetable-event-2')
    expect(block.dataset.lines).toBe('3')
    expect(block.querySelector('.calendar-location')?.textContent).toBe('R42')
    expect(block.querySelectorAll('.calendar-resize')).toHaveLength(2)
    state.scale = 150
    document.documentElement.style.fontSize = '24px'
    rerender(<TimetableCalendar {...props} view="day" events={[event]} />)
    expect(block.dataset.lines).toBe('2')
    expect(block.querySelector('.calendar-location')).toBeNull()
    expect(block.style.height).toBe('64px')
  })
  it('shows complete metadata in the unconstrained agenda', () => {
    render(<TimetableCalendar {...props} view="list" events={[makeEvent(1, '2026-10-08T08:15:00Z')]} />)
    const block = screen.getByTestId('timetable-event-1')
    expect(block.querySelector('time')?.textContent).toBe('10:00 – 10:15')
    expect(block.querySelector('.calendar-location')?.textContent).toBe('R42')
  })
})
