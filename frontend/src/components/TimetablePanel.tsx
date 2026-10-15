// SPDX-License-Identifier: AGPL-3.0-or-later
import { useWorkspaceState } from '@/lib/workspaceState'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, MapPin, RefreshCw } from 'lucide-react'
import { activeIntlLocale, localDate, notifySyncCompleted, request, useApi } from '@/api'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import { campusClock } from '@/lib/mensa'
import { splitAppointmentTitle, timetableState, timetableDate } from '@/lib/timetable'
import { calendarWeekStart, type CalendarAppointment as Appointment } from '@/lib/calendarLayout'
import { useCalendarPreferences } from '@/lib/calendarPreferences'
import { queryClient } from '@/offlineCache'
import type { CalendarChange } from '@/hooks/useCalendarMutation'
import { TimetableCalendar } from './TimetableCalendar'
import { FormField } from './FormField'
import { Button } from './ui/button'
import { Empty, Failure, Panel } from './State'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import './TimetablePanel.css'

type Status = {
  subscribed: boolean
  name: string
  keyring_available: boolean
  last_success_at: string | null
  last_error: string
  event_count: number
  session_link: boolean
  through: string | null
}
type Slot = { id: string; title: string; weekday: number; start_time: string; visible: boolean }
export function TimetablePanel({ compact = false }: { compact?: boolean }) {
  const { t } = useT('deadlines')
  const { t: quality } = useT('quality')
  const [urlError, setUrlError] = useState('')
  const {
    data: status,
    error: statusError,
    reload: reloadStatus,
  } = useApi<Status>('/api/timetable/status', { refetchInterval: 60_000 })
  const canWrite = useWritableHost()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const today = campusClock(now, 'Europe/Berlin').day
  const [selectedDay, setDay] = useWorkspaceState(compact ? 'today:calendar-day' : 'calendar:day', '')
  const day = selectedDay || today
  const { view: calendarView, setView: setCalendarView } = useCalendarPreferences()
  const queryDay = compact ? day : calendarWeekStart(day)
  const {
    data: events,
    error: eventsError,
    loading: eventsLoading,
    reload: reloadEvents,
  } = useApi<Appointment[]>(`/api/timetable/events?day=${queryDay}`, {
    refetchInterval: 60_000,
  })
  const [url, setUrl] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [confirmStop, setConfirmStop] = useState(false)
  const [showPast, setShowPast] = useWorkspaceState(compact ? 'today:past' : 'calendar:past', false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [slotChoices, setSlotChoices] = useState<Record<string, boolean>>({})
  const { data: slots, error: slotsError, reload: reloadSlots } = useApi<Slot[]>('/api/timetable/selection', {
    enabled: !compact && settingsOpen && !!status?.subscribed,
  })
  useEffect(() => {
    setSlotChoices(previous => {
      const pending = Object.entries(previous).filter(([id, visible]) =>
        !slots?.some(slot => slot.id === id && slot.visible === visible))
      return pending.length === Object.keys(previous).length ? previous : Object.fromEntries(pending)
    })
  }, [slots])
  async function selectSlot(slot: Slot, visible: boolean) {
    setSlotChoices(previous => ({ ...previous, [slot.id]: visible }))
    setBusy(true)
    setFailure('')
    try {
      await request('/api/timetable/selection', {
        method: 'PUT', body: JSON.stringify({ slot_id: slot.id, visible }),
      })
      reloadSlots()
      reloadEvents()
      notifySyncCompleted()
    } catch (cause) {
      setSlotChoices(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== slot.id)))
      setFailure(extractApiErrorMessage(cause))
    }
    finally { setBusy(false) }
  }
  async function change(action: 'subscribe' | 'sync' | 'stop') {
    if (action === 'subscribe') {
      try { const link = new URL(url.trim()); if (link.protocol !== 'https:' || !link.hostname) throw new Error('INVALID_URL') }
      catch { setUrlError(quality('invalidCalendar')); return }
    }
    setUrlError('')
    setBusy(true)
    setFailure('')
    try {
      await request(action === 'stop' ? '/api/timetable/subscription' : `/api/timetable/${action}`, {
        method: action === 'stop' ? 'DELETE' : 'POST',
        ...(action === 'subscribe' ? { body: JSON.stringify({ url: url.trim(), name: t('timetableTitle') }) } : {}),
      })
      setUrl('')
      setEditing(false)
      setConfirmStop(false)
      reloadStatus()
      reloadEvents()
      notifySyncCompleted()
    } catch (cause) {
      setFailure(extractApiErrorMessage(cause))
      reloadStatus()
    } finally {
      setBusy(false)
    }
  }
  function calendarChanged(change: CalendarChange, id?: number) {
    queryClient.setQueryData<Appointment[]>(['api', `/api/timetable/events?day=${queryDay}`], previous => {
      const rows = (previous ?? []).filter(event => event.id !== (change.event?.id ?? id))
      return change.event ? [...rows, change.event] : rows
    })
    reloadEvents()
    notifySyncCompleted()
  }
  if (compact && !status?.subscribed && !events?.length) return null
  const belongs = (event: Appointment) =>
    !compact || campusClock(timetableDate(event.starts_at), 'Europe/Berlin').day === today
  const hidden = (events ?? []).filter((event) => belongs(event) && campusClock(timetableDate(event.starts_at), 'Europe/Berlin').day === today && timetableState(event, now) === 'past').length
  const visible = (events ?? []).filter(
    (event) => belongs(event) && (campusClock(timetableDate(event.starts_at), 'Europe/Berlin').day !== today || (!compact && showPast) || timetableState(event, now) !== 'past'),
  )
  const groups = new Map<string, Appointment[]>()
  for (const event of visible) {
    const key = campusClock(timetableDate(event.starts_at), 'Europe/Berlin').day
    groups.set(key, [...(groups.get(key) ?? []), event])
  }
  if (compact && !visible.length && !eventsLoading && !eventsError && !statusError && !status?.last_error) {
    return <section id="timetable" className="timetable-summary-empty" aria-label={t('timetableTitle')}>
      <CalendarDays size={19} aria-hidden="true" />
      <div><h2>{t('timetableTitle')}</h2><p>{t('noRemainingClasses')}</p></div>
      <Link to="/deadlines#timetable">{t('timetableOpen')}</Link>
    </section>
  }
  const connectionForm = (
    <form
      className="timetable-subscription"
      onSubmit={(event) => {
        event.preventDefault()
        void change('subscribe')
      }}
    >
      <FormField label={t('timetableUrl')} hint={t('timetablePrivate')} error={urlError} required>
        {control => <input {...control} className="native-input" type="password" autoComplete="off" value={url}
          onChange={event => { setUrl(event.target.value); setUrlError('') }} maxLength={8000} placeholder="https://…" />}
      </FormField>
      <div className="timetable-actions">
        <Button type="submit" disabled={!canWrite || !status?.keyring_available || !url.trim() || busy}>
          {busy ? t('timetableLoading') : t('timetableSubscribe')}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEditing(false)
              setUrl('')
            }}
          >
            {t('timetableCancel')}
          </Button>
        )}
      </div>
    </form>
  )
  return (
    <section id="timetable" className={compact ? 'timetable-panel is-compact' : 'timetable-panel'}>
      <Panel
        title={t('timetableTitle')}
        action={
          !compact && status?.subscribed ? (
            <Button size="sm" variant="ghost" disabled={!canWrite || busy} onClick={() => void change('sync')}>
              <RefreshCw size={15} />
              {busy ? t('timetableLoading') : t('timetableRefresh')}
            </Button>
          ) : undefined
        }
      >
        {!compact && <TimetableCalendar day={day} today={today} now={now}
          events={visible} loading={eventsLoading} view={calendarView} onView={setCalendarView} onDay={setDay}
          onToday={() => { setDay(''); setShowPast(false) }} canWrite={canWrite} onChanged={calendarChanged} />}
        {!compact && status && !status.subscribed && (
          <>
            <details className="timetable-settings"><summary>{t('calendarAddSubscription')}</summary>
              <p className="muted-text">{t('timetableIntro')}</p>{connectionForm}</details>
          </>
        )}
        {compact && (status?.subscribed || !!visible.length) && (
          <div className="timetable-days">
            {groups.size ? (
              [...groups].map(([key, appointments]) => (
                <section className="timetable-day" key={key}>
                  {appointments.map((event) => {
                    const state = timetableState(event, now)
                    const details = splitAppointmentTitle(event.title)
                    return (
                      <article
                        className={`timetable-appointment is-${state}`}
                        key={event.id}
                        data-testid={`timetable-event-${event.id}`}
                      >
                        <time>
                          <span>{localDate(event.starts_at, { hour: '2-digit', minute: '2-digit' })}</span>
                          {event.ends_at && (
                            <span>{localDate(event.ends_at, { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </time>
                        <div className="timetable-event-content">
                          <strong title={event.title}>{details.title}</strong>
                          {details.location && (
                            <p>
                              <MapPin size={13} />
                              <span title={details.location}>{details.location.split(',')[0].trim()}</span>
                            </p>
                          )}
                          {state === 'current' && <span className="timetable-current">{t('timetableNow')}</span>}
                        </div>
                      </article>
                    )
                  })}
                </section>
              ))
            ) : !eventsLoading && !eventsError && !status?.last_error ? (
              <Empty
                icon={CalendarDays}
                title={compact ? t('noRemainingClasses') : t('noClassesWeek')}
                text={compact ? t('timetableDoneHint') : t('timetableEmptyHint')}
              />
            ) : null}
          </div>
        )}
        {(failure || status?.last_error || statusError || eventsError) && (
          <Failure message={failure || status?.last_error || statusError || eventsError || ''} />
        )}
        {compact ? (
          <Link className="timetable-open" to="/deadlines#timetable">
            {t('timetableOpen')}
          </Link>
        ) : (
          <>
            {!!hidden && calendarWeekStart(day) === calendarWeekStart(today) && (
              <label className="timetable-show-past">
                <input type="checkbox" checked={showPast} onChange={(event) => setShowPast(event.target.checked)} />
                {t('timetableShowPast', { count: hidden })}
              </label>
            )}
            {status?.subscribed && (
              <details className="timetable-settings" onToggle={event => {
                if (event.target === event.currentTarget) setSettingsOpen(event.currentTarget.open)
              }}>
                <summary>{t('timetableSettings')}</summary>
                {status.last_success_at && <p className="row-subtitle">{quality('lastChecked', { date: localDate(status.last_success_at) })}</p>}
                {!!slots?.length && <div className="timetable-selection">
                  <h3>{t('timetableSelection')}</h3>
                  <p className="row-subtitle">{t('timetableSelectionHint')}</p>
                  {[...new Set(slots.map(slot => slot.title))].map(title => (
                    <details key={title}>
                      <summary>{title}</summary>
                      {slots.filter(slot => slot.title === title).map(slot => (
                        <label key={slot.id}>
                          <input type="checkbox" checked={slotChoices[slot.id] ?? slot.visible} disabled={!canWrite || busy}
                            onChange={event => void selectSlot(slot, event.target.checked)} />
                          {new Intl.DateTimeFormat(activeIntlLocale(), { weekday: 'long', timeZone: 'UTC' })
                            .format(new Date(Date.UTC(2024, 0, 1 + slot.weekday)))} · {slot.start_time}
                        </label>
                      ))}
                    </details>
                  ))}
                </div>}
                {slotsError && <Failure message={slotsError} />}
                {status.session_link && <p className="row-subtitle">{t('timetableSessionNotice')}</p>}
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(!editing)
                    setFailure('')
                  }}
                >
                  {t('timetableChange')}
                </Button>
                {editing && connectionForm}
                <div className="timetable-stop">
                  {confirmStop ? (
                    <div className="timetable-actions">
                      <p>{t('timetableStopHint')}</p>
                      <Button variant="outline" disabled={!canWrite || busy} onClick={() => void change('stop')}>
                        {t('timetableStopConfirm')}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmStop(false)}>
                        {t('timetableCancel')}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" disabled={!canWrite || busy} onClick={() => setConfirmStop(true)}>
                      {t('timetableStop')}
                    </Button>
                  )}
                </div>
              </details>
            )}
            {status && !status.keyring_available && <p>{t('timetableKeyring')}</p>}
          </>
        )}
      </Panel>
    </section>
  )
}
