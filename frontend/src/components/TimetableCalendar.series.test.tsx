// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TimetableCalendar } from './TimetableCalendar'

const state = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue(true) }))
vi.mock('@/accessibility', () => ({ useAccessibility: () => ({ scale: 100 }) }))
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
  useCalendarMutation: () => ({ busy: false, save: state.save, clearFailure: vi.fn() }),
}))
vi.mock('@/hooks/useCalendarGesture', () => ({
  useCalendarGesture: () => ({ preview: null, tracking: false, begin: vi.fn(), consumeClick: () => false }),
}))
vi.mock('./State', () => ({ Empty: () => null, Loading: () => null }))

const event = {
  id: 7,
  title: 'Synthetic recurring lecture',
  revision: 'event-revision',
  starts_at: '2026-10-08T08:00:00Z',
  ends_at: '2026-10-08T09:00:00Z',
  series_revision: null,
}
const props = {
  day: '2026-10-08',
  today: '2026-10-08',
  now: new Date('2026-10-08T07:00:00Z'),
  loading: false,
  view: 'list' as const,
  onView: vi.fn(),
  onDay: vi.fn(),
  onToday: vi.fn(),
  canWrite: true,
  onChanged: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('adds refreshed series metadata to an open editor without losing typed changes', async () => {
  const { rerender } = render(<TimetableCalendar {...props} events={[event]} />)
  fireEvent.click(screen.getByTestId('timetable-event-7').querySelector('button')!)
  fireEvent.click(screen.getByRole('button', { name: 'calendarEdit' }))
  fireEvent.change(screen.getByLabelText(/calendarEventTitle/), { target: { value: 'My unsaved title' } })
  expect(screen.queryByLabelText('calendarEditScope')).toBeNull()
  const refreshed = { ...event, series_revision: 'fresh-series-revision', series_count: 4 }
  rerender(<TimetableCalendar {...props} events={[refreshed]} />)
  expect((screen.getByLabelText(/calendarEventTitle/) as HTMLInputElement).value).toBe('My unsaved title')
  fireEvent.change(screen.getByLabelText('calendarEditScope'), { target: { value: 'future' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'calendarSave' }))
  })
  expect(state.save).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'My unsaved title', scope: 'future' }),
    refreshed,
  )
})

it('keeps the original conflict guard when the refreshed event has a different revision', async () => {
  const { rerender } = render(<TimetableCalendar {...props} events={[event]} />)
  fireEvent.click(screen.getByTestId('timetable-event-7').querySelector('button')!)
  fireEvent.click(screen.getByRole('button', { name: 'calendarEdit' }))
  rerender(
    <TimetableCalendar
      {...props}
      events={[{ ...event, revision: 'newer-revision', series_revision: 'newer-series' }]}
    />,
  )
  expect(screen.queryByLabelText('calendarEditScope')).toBeNull()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'calendarSave' }))
  })
  expect(state.save).toHaveBeenCalledWith(expect.anything(), event)
})
