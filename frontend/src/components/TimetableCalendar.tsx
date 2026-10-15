// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { Dialog } from 'radix-ui'
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  X,
  Undo2,
  Loader2,
  Check,
  Minus,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { localDate } from '@/api'
import { useAccessibility } from '@/accessibility'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useT } from '@/i18n/useT'
import { campusClock, shiftMenuDay } from '@/lib/mensa'
import {
  calendarColour,
  calendarDisplayDays,
  calendarFitHourPx,
  calendarHours,
  calendarSegments,
  calendarWeekStart,
  type CalendarAppointment,
  type CalendarView,
} from '@/lib/calendarLayout'
import { useCalendarPreferences } from '@/lib/calendarPreferences'
import { calendarBlockLines } from '@/lib/calendarBlockLayout'
import { splitAppointmentTitle, timetableDate, timetableState } from '@/lib/timetable'
import { calendarShift, calendarSlot, type CalendarDraft } from '@/lib/calendarEditing'
import { useCalendarGesture } from '@/hooks/useCalendarGesture'
import { useCalendarMutation, type CalendarChange } from '@/hooks/useCalendarMutation'
import { CalendarEventForm } from './CalendarEventForm'
import { Button } from './ui/button'
import { Empty, Loading } from './State'
import './Calendar.css'

type Props = {
  day: string
  today: string
  now: Date
  events: CalendarAppointment[]
  loading: boolean
  view: CalendarView
  onView: (view: CalendarView) => void
  onDay: (day: string) => void
  onToday: () => void
  canWrite: boolean
  onChanged: (change: CalendarChange, id?: number) => void
}

export function TimetableCalendar({
  day,
  today,
  now,
  events,
  loading,
  view,
  onView,
  onDay,
  onToday,
  canWrite,
  onChanged,
}: Props) {
  const { t } = useT('deadlines')
  const { t: workspace } = useT('calendarWorkspace')
  const mobile = useMediaQuery('(max-width: 700px)')
  const { scale } = useAccessibility()
  const rootFont = getComputedStyle(document.documentElement).fontSize
  const textScale = rootFont.endsWith('px') ? Number.parseFloat(rootFont) / 16 : scale / 100
  const [selected, setSelected] = useState<CalendarAppointment | null>(null)
  const [editor, setEditor] = useState<{ event: CalendarAppointment | null; draft: CalendarDraft } | null>(null)
  const [gestureError, setGestureError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const { hourPx: manualHourPx, fit, setHourPx, setFit } = useCalendarPreferences()
  const mutation = useCalendarMutation(onChanged)
  const scroll = useRef<HTMLDivElement>(null)
  const [scrollArea, setScrollArea] = useState<HTMLDivElement | null>(null)
  const attachScroll = useCallback((node: HTMLDivElement | null) => {
    scroll.current = node
    setScrollArea(node)
  }, [])
  const body = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const picker = useRef<HTMLDivElement>(null)
  const focusDay = useRef(false)
  const [gridHeight, setGridHeight] = useState(500)
  const [visibleMinutes, setVisibleMinutes] = useState({ start: 480, end: 1080 })
  const [lockedGeometry, setLockedGeometry] = useState<{ height: number; hour: number } | null>(null)
  const start = calendarWeekStart(day)
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftMenuDay(start, index)), [start])
  const displayDays = useMemo(() => calendarDisplayDays(day, view), [view, day])
  const pickerDays = view === 'workweek' && !mobile ? displayDays : days
  const weekendCount = new Set(
    days.slice(5).flatMap((date) => calendarSegments(events, date).map((segment) => segment.event.id)),
  ).size
  const weekendSelected = view === 'workweek' && !displayDays.includes(day)
  const shown = mutation.pending
    ? events.map((event) => (event.id === mutation.pending!.id ? mutation.pending! : event))
    : events
  const layouts = displayDays.map((date) => ({ date, segments: calendarSegments(shown, date) }))
  const hours = calendarHours(layouts.flatMap((layout) => layout.segments))
  const earlier = layouts
    .flatMap((layout) => layout.segments)
    .filter((segment) => segment.start < visibleMinutes.start - 1)
  const later = layouts.flatMap((layout) => layout.segments).filter((segment) => segment.end > visibleMinutes.end + 1)
  const hourPx = lockedGeometry?.hour ?? (fit ? calendarFitHourPx(hours, gridHeight, expanded ? 32 : 44) : manualHourPx)
  const renderedHeight = lockedGeometry?.height ?? gridHeight
  const geometry = useRef({ height: renderedHeight, hour: hourPx })
  useLayoutEffect(() => {
    geometry.current = { height: renderedHeight, hour: hourPx }
  }, [renderedHeight, hourPx])
  const lockGeometry = useCallback((active: boolean) => setLockedGeometry(active ? geometry.current : null), [])
  const clock = campusClock(now, 'Europe/Berlin')
  const timeRows = Array.from({ length: 24 }, (_, index) => index)
  const dateLabel = (date: string, format: Intl.DateTimeFormatOptions) => localDate(`${date}T12:00:00Z`, format)
  const label =
    view === 'day'
      ? dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })
      : `${dateLabel(start, { day: 'numeric', month: 'long' })} – ${dateLabel(displayDays[displayDays.length - 1], { day: 'numeric', month: 'long', year: 'numeric' })}`
  const step = view === 'day' ? 1 : 7
  const editable = canWrite && !mutation.busy
  const resizeHours = useCallback(
    (requested: number, pointerY?: number) => {
      const area = scroll.current
      const next = Math.max(40, Math.min(112, requested))
      const anchor = area
        ? pointerY === undefined
          ? area.clientHeight / 2
          : pointerY - area.getBoundingClientRect().top
        : 0
      const nextScroll = area ? ((area.scrollTop + anchor - 10) / hourPx) * next + 10 - anchor : 0
      setHourPx(next)
      requestAnimationFrame(() => {
        if (area?.isConnected) area.scrollTop = nextScroll
      })
    },
    [hourPx, setHourPx],
  )
  function openCreate(draft?: CalendarDraft) {
    const slot = draft ?? calendarSlot(day, 9 * 60, 10 * 60)
    if (!slot || !editable) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : newButton.current
    setSelected(null)
    setEditor({ event: null, draft: slot })
    setGestureError('')
    mutation.clearFailure()
  }
  const gesture = useCalendarGesture({
    scroll,
    body,
    days: displayDays,
    hourPx,
    enabled: editable && !editor && !selected,
    onCreate: openCreate,
    onSave: (draft, event) => {
      setGestureError('')
      if ((event.series_count ?? 0) > 1) {
        setSelected(null)
        setEditor({ event, draft })
      } else void mutation.save(draft, event)
    },
    onInvalid: () => setGestureError(t('calendarInvalidTime')),
    onTrackingChange: lockGeometry,
  })
  useLayoutEffect(() => {
    const area = scroll.current
    if (!area || mobile || view === 'list') return
    const measure = () =>
      setGridHeight(
        Math.round(
          Math.max(expanded ? 180 : 460, Math.min(760, window.innerHeight - area.getBoundingClientRect().top - 56)),
        ),
      )
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (area.parentElement) observer?.observe(area.parentElement)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [mobile, view, loading, expanded, scrollArea])
  const previousLayout = useRef({
    key: '',
    area: null as HTMLDivElement | null,
    fit: false,
    hour: 0,
    height: 0,
    start: 0,
    end: 0,
  })
  useLayoutEffect(() => {
    const key = `${view === 'day' ? day : start}:${view}:${mobile}:${loading}:${expanded}`
    const previous = previousLayout.current
    if (
      scroll.current &&
      !lockedGeometry &&
      (previous.area !== scrollArea ||
        previous.key !== key ||
        (fit &&
          (!previous.fit ||
            previous.hour !== hourPx ||
            previous.height !== renderedHeight ||
            previous.start !== hours.start ||
            previous.end !== hours.end)))
    ) {
      scroll.current.scrollTop = (fit ? hours.start : 8) * hourPx
    }
    previousLayout.current = {
      key,
      area: scrollArea,
      fit: !!fit,
      hour: hourPx,
      height: renderedHeight,
      start: hours.start,
      end: hours.end,
    }
  }, [
    day,
    start,
    view,
    mobile,
    loading,
    expanded,
    scrollArea,
    fit,
    hourPx,
    renderedHeight,
    hours.start,
    hours.end,
    lockedGeometry,
  ])
  useLayoutEffect(() => {
    const area = scroll.current
    if (!area) return
    const update = () => {
      const next = {
        start: ((area.scrollTop - 10) / hourPx) * 60,
        end: ((area.scrollTop + area.clientHeight - 10) / hourPx) * 60,
      }
      setVisibleMinutes((previous) => (previous.start === next.start && previous.end === next.end ? previous : next))
    }
    update()
    area.addEventListener('scroll', update, { passive: true })
    return () => area.removeEventListener('scroll', update)
  }, [hourPx, renderedHeight, day, start, view, mobile, loading, expanded, scrollArea, fit, hours.start, hours.end])
  useEffect(() => {
    const area = scroll.current
    if (!area) return
    const zoom = (wheel: WheelEvent) => {
      if (!wheel.ctrlKey || mutation.busy || editor || selected || gesture.tracking) return
      wheel.preventDefault()
      resizeHours(hourPx * Math.exp(-wheel.deltaY * 0.005), wheel.clientY)
    }
    area.addEventListener('wheel', zoom, { passive: false })
    return () => area.removeEventListener('wheel', zoom)
  }, [
    hourPx,
    resizeHours,
    view,
    mobile,
    loading,
    expanded,
    scrollArea,
    mutation.busy,
    editor,
    selected,
    gesture.tracking,
  ])
  useEffect(() => {
    if (focusDay.current) {
      picker.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus()
      focusDay.current = false
    }
  }, [day])

  function appointment(event: CalendarAppointment, style?: CSSProperties, date?: string, resize = false) {
    const details = splitAppointmentTitle(event.title)
    const state = timetableState(event, now)
    const times = `${localDate(event.starts_at, { hour: '2-digit', minute: '2-digit' })}${event.ends_at ? ` – ${localDate(event.ends_at, { hour: '2-digit', minute: '2-digit' })}` : ''}`
    const height = style?.height === undefined ? undefined : Number.parseFloat(String(style.height))
    const lines = calendarBlockLines(height, textScale)
    const status = [state === 'current' ? t('timetableNow') : '', event.adjusted ? t('calendarAdjusted') : '']
      .filter(Boolean)
      .join(' · ')
    const accessibleTitle = [details.title, times, details.location, status].filter(Boolean).join(' · ')
    return (
      <article
        key={event.id}
        style={style}
        data-testid={`timetable-event-${event.id}`}
        data-lines={lines}
        data-compact={height !== undefined && height < 16 * textScale + 10 ? 'true' : undefined}
        aria-busy={mutation.busy && mutation.subject?.id === event.id}
        className={`calendar-appointment calendar-colour-${calendarColour(event.title)} is-${state}${date && event.revision && editable ? ' is-editable' : ''}${gesture.preview?.event?.id === event.id ? ' is-dragging' : ''}${mutation.busy && mutation.subject?.id === event.id ? ' is-saving' : ''}`}
      >
        <button
          type="button"
          data-calendar-trigger
          disabled={mutation.busy}
          aria-label={accessibleTitle}
          title={accessibleTitle}
          onPointerDown={(pointer) => {
            if (date && event.revision) gesture.begin(pointer, date, event)
          }}
          onClick={(click) => {
            if (gesture.consumeClick(event.id)) return
            opener.current = click.currentTarget
            setSelected(event)
            setEditor(null)
            mutation.clearFailure()
            setGestureError('')
          }}
          onKeyDown={(key) => {
            if (
              !editable ||
              !event.revision ||
              !key.altKey ||
              !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key.key)
            )
              return
            key.preventDefault()
            const draft = calendarShift(
              event,
              key.key === 'ArrowLeft' ? -1 : key.key === 'ArrowRight' ? 1 : 0,
              key.key === 'ArrowUp' ? -15 : key.key === 'ArrowDown' ? 15 : 0,
              key.shiftKey ? 'end' : 'move',
            )
            if (draft) {
              setGestureError('')
              saveFromKeyboard(draft, event, key.currentTarget)
            } else setGestureError(t('calendarInvalidTime'))
          }}
        >
          <strong>{details.title}</strong>
          {lines >= 2 && <time>{times}</time>}
          {lines >= 3 && details.location && (
            <span className="calendar-location">{details.location.split(',')[0].trim()}</span>
          )}
          {lines >= 4 && status && <span className="calendar-current">{status}</span>}
        </button>
        {date && resize && event.revision && editable && (
          <>
            {campusClock(timetableDate(event.starts_at), 'Europe/Berlin').day === date && (
              <button
                type="button"
                className="calendar-resize is-start"
                aria-label={t('calendarResizeStart', { title: details.title })}
                onPointerDown={(pointer) => gesture.begin(pointer, date, event, 'start')}
                onKeyDown={(key) => resizeKey(key, event, 'start')}
                onClick={(click) => {
                  if (!gesture.consumeClick(event.id)) {
                    opener.current = click.currentTarget
                    setSelected(null)
                    setEditor({ event, draft: event })
                  }
                }}
              />
            )}
            {(!event.ends_at ||
              campusClock(new Date(timetableDate(event.ends_at).getTime() - 1), 'Europe/Berlin').day === date) && (
              <button
                type="button"
                className="calendar-resize is-end"
                aria-label={t('calendarResizeEnd', { title: details.title })}
                onPointerDown={(pointer) => gesture.begin(pointer, date, event, 'end')}
                onKeyDown={(key) => resizeKey(key, event, 'end')}
                onClick={(click) => {
                  if (!gesture.consumeClick(event.id)) {
                    opener.current = click.currentTarget
                    setSelected(null)
                    setEditor({ event, draft: event })
                  }
                }}
              />
            )}
          </>
        )}
      </article>
    )
  }

  function resizeKey(key: KeyboardEvent<HTMLButtonElement>, event: CalendarAppointment, mode: 'start' | 'end') {
    if (!key.altKey || !editable || !['ArrowUp', 'ArrowDown'].includes(key.key)) return
    key.preventDefault()
    const draft = calendarShift(event, 0, key.key === 'ArrowUp' ? -15 : 15, mode)
    if (draft) {
      setGestureError('')
      saveFromKeyboard(draft, event, key.currentTarget)
    } else setGestureError(t('calendarInvalidTime'))
  }

  function saveFromKeyboard(draft: CalendarDraft, event: CalendarAppointment, source: HTMLButtonElement) {
    if ((event.series_count ?? 0) > 1) {
      opener.current = source
      setSelected(null)
      setEditor({ event, draft })
      return
    }
    const workspace = source.closest('.calendar-workspace')
    void mutation.save(draft, event).then(() =>
      requestAnimationFrame(() => {
        if (document.activeElement !== document.body && document.activeElement !== source) return
        const target =
          workspace?.querySelector<HTMLButtonElement>(
            `[data-testid="timetable-event-${event.id}"] [data-calendar-trigger]`,
          ) ??
          workspace?.querySelector<HTMLButtonElement>('.calendar-weekend-notice button') ??
          newButton.current
        target?.focus()
      }),
    )
  }

  function dayPicker() {
    return (
      <div
        className="calendar-day-picker"
        style={{ '--calendar-picker-days': pickerDays.length } as CSSProperties}
        ref={picker}
        role="group"
        aria-label={t('calendarSelectDay')}
      >
        {pickerDays.map((date) => (
          <button
            key={date}
            type="button"
            data-day={date}
            aria-pressed={date === day}
            aria-label={`${dateLabel(date, { weekday: 'short' })} ${Number(date.slice(-2))} · ${dateLabel(date, { dateStyle: 'full' })}`}
            aria-current={date === today ? 'date' : undefined}
            onClick={() => onDay(date)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const index = pickerDays.indexOf(date)
              const next =
                event.key === 'Home'
                  ? pickerDays[0]
                  : event.key === 'End'
                    ? pickerDays[pickerDays.length - 1]
                    : pickerDays[
                        Math.max(0, Math.min(pickerDays.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)))
                      ]
              focusDay.current = true
              onDay(next)
              event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus()
            }}
          >
            <span>{dateLabel(date, { weekday: 'short' })}</span> <b>{Number(date.slice(-2))}</b>
            <i className={calendarSegments(events, date).length ? 'has-events' : ''} aria-hidden="true" />
          </button>
        ))}
      </div>
    )
  }

  const calendar = (
    <div className="calendar-workspace" aria-busy={loading || mutation.busy}>
      <div className="calendar-toolbar">
        <div className="timetable-navigation">
          <div>
            <strong aria-live="polite">{label}</strong>
            <span>{t('calendarTimezone')}</span>
          </div>
          <button
            type="button"
            aria-label={view === 'day' ? t('previousDay') : t('previousWeek')}
            onClick={() => onDay(shiftMenuDay(day, -step))}
          >
            <ChevronLeft size={17} />
          </button>
          <button type="button" onClick={onToday}>
            {t('timetableToday')}
          </button>
          <button
            type="button"
            aria-label={view === 'day' ? t('nextDay') : t('nextWeek')}
            onClick={() => onDay(shiftMenuDay(day, step))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="calendar-view-switch" role="group" aria-label={t('calendarViewLabel')}>
          {(['day', 'workweek', 'week', 'list'] as const).map((key) => (
            <button type="button" key={key} aria-pressed={key === view} onClick={() => onView(key)}>
              {key === 'workweek'
                ? workspace('workweek')
                : t(key === 'day' ? 'calendarDay' : key === 'week' ? 'calendarWeek' : 'calendarList')}
            </button>
          ))}
        </div>
        {expanded ? (
          <Dialog.Close asChild>
            <Button size="sm" variant="outline" disabled={gesture.tracking}>
              <Minimize2 size={15} />
              {workspace('closeExpanded')}
            </Button>
          </Dialog.Close>
        ) : (
          <Dialog.Trigger asChild>
            <Button size="sm" variant="outline" disabled={gesture.tracking} aria-label={workspace('expandView')}>
              <Maximize2 size={15} />
              {workspace('expand')}
            </Button>
          </Dialog.Trigger>
        )}
        <Button ref={newButton} size="sm" variant="outline" disabled={!editable} onClick={() => openCreate()}>
          <Plus size={15} />
          {t('calendarNew')}
        </Button>
      </div>
      {view === 'workweek' && (weekendCount > 0 || (mobile && weekendSelected)) && (
        <div className="calendar-weekend-notice">
          <span>{weekendCount ? workspace('weekend', { count: weekendCount }) : workspace('weekendSelected')}</span>
          <button
            type="button"
            onClick={() => {
              if (mobile) {
                onDay(
                  weekendSelected
                    ? day
                    : (days.slice(5).find((date) => calendarSegments(events, date).length) ?? days[5]),
                )
                onView('day')
              } else onView('week')
            }}
          >
            {workspace('showWeekend')}
          </button>
        </div>
      )}
      <div className="calendar-interaction-hint">
        <span role="status">
          {mutation.busy && <Loader2 size={14} className="calendar-saving-icon" aria-hidden="true" />}
          {!mutation.busy && mutation.message && <Check size={14} aria-hidden="true" />}
          {mutation.busy
            ? mutation.subject
              ? workspace('savingEvent', { title: splitAppointmentTitle(mutation.subject.title).title })
              : t('calendarSaving')
            : mutation.message || (mobile || view === 'list' ? t('calendarTapHint') : workspace('interactionHint'))}
        </span>
        {mutation.undo && (
          <button type="button" disabled={!editable} onClick={() => void mutation.undoLast()}>
            <Undo2 size={14} />
            {t('calendarUndo')}
          </button>
        )}
        {!mobile && view !== 'list' && (
          <div className="calendar-zoom" role="group" aria-label={workspace('zoomLabel')}>
            <button
              type="button"
              className="calendar-fit"
              disabled={mutation.busy || gesture.tracking}
              aria-label={workspace('fitView')}
              aria-pressed={!!fit}
              onClick={() => {
                setFit(true)
                if (fit && scroll.current) scroll.current.scrollTop = hours.start * hourPx
              }}
            >
              {workspace('fit')}
            </button>
            <button
              type="button"
              disabled={hourPx <= 40 || mutation.busy || gesture.tracking}
              aria-label={workspace('zoomOut')}
              onClick={() => resizeHours(hourPx - 8)}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              disabled={mutation.busy || gesture.tracking}
              aria-label={workspace('zoomReset')}
              onClick={() => resizeHours(64)}
            >
              {Math.round((hourPx / 64) * 100)}%
            </button>
            <button
              type="button"
              disabled={hourPx >= 112 || mutation.busy || gesture.tracking}
              aria-label={workspace('zoomIn')}
              onClick={() => resizeHours(hourPx + 8)}
            >
              <Plus size={14} />
            </button>
          </div>
        )}
      </div>
      {(mutation.failure || gestureError) && (
        <div className="calendar-edit-error" role="alert">
          <span>
            {mutation.failure || gestureError}
            {mutation.conflict && <small>{workspace('retryConflictHint')}</small>}
          </span>
          {mutation.retryable && (
            <button type="button" disabled={!editable} onClick={() => void mutation.retryLast()}>
              {workspace('retry')}
            </button>
          )}
          <button
            type="button"
            disabled={mutation.busy}
            aria-label={workspace('dismissError')}
            onClick={() => {
              mutation.clearFailure()
              setGestureError('')
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {view !== 'list' && dayPicker()}
      {loading && !events.length ? (
        <Loading variant="rows" />
      ) : view === 'list' || mobile ? (
        <div className="calendar-agenda">
          {(view === 'list' ? days : [day]).map((date) => {
            const segments = calendarSegments(events, date)
            if (view === 'list' && !segments.length) return null
            return (
              <section key={date}>
                <h3>{dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                {segments.length ? (
                  segments.map((segment) => appointment(segment.event))
                ) : view !== 'list' ? (
                  <Empty title={t('noClassesToday')} text={t('calendarChooseDay')} />
                ) : null}
              </section>
            )
          })}
          {view === 'list' && !layouts.some((layout) => layout.segments.length) && (
            <Empty title={t('noClassesWeek')} text={t('timetableEmptyHint')} />
          )}
        </div>
      ) : (
        <div
          className={`calendar-time-scroll ${view === 'day' ? 'is-day' : ''}`}
          style={{ height: `${renderedHeight}px` }}
          ref={attachScroll}
          tabIndex={0}
          role="region"
          aria-label={t('calendarTimeGrid')}
        >
          <div className="calendar-time-head" style={{ '--calendar-days': displayDays.length } as CSSProperties}>
            <span />
            {displayDays.map((date) => (
              <span key={date} className={date === today ? 'is-today' : ''}>
                {dateLabel(date, { weekday: 'short' })} <b>{Number(date.slice(-2))}</b>
              </span>
            ))}
          </div>
          <div
            className="calendar-time-body"
            ref={body}
            style={
              {
                '--calendar-days': displayDays.length,
                '--calendar-hour': `${hourPx}px`,
                height: `${24 * hourPx}px`,
              } as CSSProperties
            }
          >
            <div className="calendar-time-axis" aria-hidden="true">
              {timeRows.map((hour) => (
                <span key={hour} style={{ top: `${hour * hourPx}px` }}>
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {layouts.map(({ date, segments }) => (
              <div
                key={date}
                data-calendar-day={date}
                className={`calendar-time-column ${date === today ? 'is-today' : ''}`}
                onPointerDown={(pointer) => {
                  if (pointer.target === pointer.currentTarget) gesture.begin(pointer, date)
                }}
              >
                {segments.map((segment) =>
                  appointment(
                    segment.event,
                    {
                      top: `${(segment.start / 60) * hourPx}px`,
                      height: `${((segment.end - segment.start) / 60) * hourPx}px`,
                      left: `calc(${(segment.column / segment.columns) * 100}% + 3px)`,
                      width: `calc(${100 / segment.columns}% - 6px)`,
                    },
                    date,
                    ((segment.end - segment.start) / 60) * hourPx >= 64,
                  ),
                )}
                {gesture.preview?.draft &&
                  calendarSegments([{ id: -1, ...gesture.preview.draft }], date).map((segment) => (
                    <div
                      key={date}
                      className="calendar-drag-preview"
                      aria-hidden="true"
                      style={{
                        top: `${(segment.start / 60) * hourPx}px`,
                        height: `${((segment.end - segment.start) / 60) * hourPx}px`,
                      }}
                    >
                      <strong>{gesture.preview?.draft?.title || t('calendarNew')}</strong>
                      <span>
                        {localDate(segment.event.starts_at, { hour: '2-digit', minute: '2-digit' })}
                        {segment.event.ends_at &&
                          ` – ${localDate(segment.event.ends_at, { hour: '2-digit', minute: '2-digit' })}`}
                      </span>
                    </div>
                  ))}
                {date === clock.day && (
                  <div
                    className="calendar-now-line"
                    aria-hidden="true"
                    style={{ top: `${(clock.minutes / 60) * hourPx}px` }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!mobile && view !== 'list' && (earlier.length > 0 || later.length > 0) && (
        <div className="calendar-scroll-notice">
          {earlier.length > 0 && (
            <button
              type="button"
              disabled={gesture.tracking}
              onClick={() => {
                if (scroll.current)
                  scroll.current.scrollTop = Math.max(
                    0,
                    (Math.min(...earlier.map((segment) => segment.start)) / 60) * hourPx,
                  )
              }}
            >
              {workspace('earlierAppointments', { count: new Set(earlier.map((segment) => segment.event.id)).size })}
            </button>
          )}
          {later.length > 0 && (
            <button
              type="button"
              disabled={gesture.tracking}
              onClick={() => {
                if (scroll.current)
                  scroll.current.scrollTop =
                    (Math.max(...later.map((segment) => segment.end)) / 60) * hourPx + 20 - scroll.current.clientHeight
              }}
            >
              {workspace('laterAppointments', { count: new Set(later.map((segment) => segment.event.id)).size })}
            </button>
          )}
        </div>
      )}
      <Dialog.Root
        open={!!selected || !!editor}
        onOpenChange={(open) => {
          if (!open && !mutation.busy) {
            setSelected(null)
            setEditor(null)
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="calendar-dialog-overlay" />
          <Dialog.Content
            className="calendar-event-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              ;(opener.current?.isConnected ? opener.current : newButton.current)?.focus()
            }}
          >
            <Dialog.Title>
              {editor
                ? t(editor.event ? 'calendarEdit' : 'calendarNew')
                : selected
                  ? splitAppointmentTitle(selected.title).title
                  : ''}
            </Dialog.Title>
            <Dialog.Description>
              {selected ? localDate(selected.starts_at, { dateStyle: 'full', timeStyle: 'short' }) : ''}
              {selected?.ends_at && ` – ${localDate(selected.ends_at, { dateStyle: 'medium', timeStyle: 'short' })}`}
              {editor && t('calendarTimezone')}
            </Dialog.Description>
            {editor ? (
              <CalendarEventForm
                key={`${editor.event?.id ?? 'new'}:${editor.draft.starts_at}`}
                event={editor.event}
                draft={editor.draft}
                busy={mutation.busy}
                onCancel={() => {
                  setEditor(null)
                  setSelected(editor.event)
                }}
                onSave={async (draft) => {
                  if (await mutation.save(draft, editor.event ?? undefined)) {
                    setEditor(null)
                    setSelected(null)
                  }
                }}
              />
            ) : (
              <>
                <p className="calendar-event-zone">{t('calendarTimezone')}</p>
                {selected && splitAppointmentTitle(selected.title).location && (
                  <p className="calendar-event-room">
                    <MapPin size={16} aria-hidden="true" />
                    {splitAppointmentTitle(selected.title).location}
                  </p>
                )}
                <p className="calendar-event-origin">
                  {t(selected?.personal ? 'calendarPersonal' : 'calendarImported')}
                </p>
                {selected?.revision && <p className="calendar-duration-hint">{workspace('durationHint')}</p>}
                {selected?.adjusted && (
                  <p className="calendar-original-time">
                    {t('calendarOriginalTime', {
                      date: localDate(selected.original_starts_at!, { dateStyle: 'medium', timeStyle: 'short' }),
                    })}
                  </p>
                )}
                {selected?.series_adjusted && <p className="calendar-event-origin">{t('calendarSeriesApplied')}</p>}
                {selected?.revision && (
                  <div className="calendar-edit-actions">
                    <Button
                      disabled={!editable}
                      onClick={() => {
                        setEditor({ event: selected, draft: selected })
                        setSelected(null)
                      }}
                    >
                      {t('calendarEdit')}
                    </Button>
                    {selected.personal && (
                      <Button
                        variant="ghost"
                        disabled={!editable}
                        onClick={async () => {
                          if (await mutation.remove(selected)) setSelected(null)
                        }}
                      >
                        {t('calendarDelete')}
                      </Button>
                    )}
                    {selected.adjusted && !selected.series_adjusted && (
                      <Button
                        variant="ghost"
                        disabled={!editable}
                        onClick={async () => {
                          if (await mutation.reset(selected)) setSelected(null)
                        }}
                      >
                        {t('calendarReset')}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
            {mutation.failure && (
              <p className="calendar-edit-error" role="alert">
                {mutation.failure}
              </p>
            )}
            <Dialog.Close disabled={mutation.busy} className="calendar-dialog-close" aria-label={t('calendarClose')}>
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
  return (
    <Dialog.Root open={expanded} onOpenChange={setExpanded}>
      {!expanded && calendar}
      {/* Unmount before returning inline, so the closing portal cannot duplicate trigger refs. */}
      {expanded && (
        <Dialog.Portal>
          <Dialog.Overlay className="calendar-dialog-overlay calendar-expanded-overlay" />
          <Dialog.Content
            className="calendar-expanded"
            onEscapeKeyDown={(event) => {
              if (gesture.tracking) event.preventDefault()
            }}
          >
            <Dialog.Title className="sr-only">{t('timetableTitle')}</Dialog.Title>
            <Dialog.Description className="sr-only">{workspace('expandedHint')}</Dialog.Description>
            {calendar}
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  )
}
