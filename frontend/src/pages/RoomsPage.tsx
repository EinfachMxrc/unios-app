// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, DoorOpen, ExternalLink, MapPin } from 'lucide-react'
import { localDate, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/button'
import { Empty, Failure, Loading } from '@/components/State'
import { useT } from '@/i18n/useT'
import { checkRoomAvailability, fillRoomBooking, isDesktopApp, openRoomBooking, readRoomBooking } from '@/lib/desktop'
import { campusClock, shiftMenuDay } from '@/lib/mensa'
import { checkForRoom, offerFresh, parseRoomOffer, rememberRoomCheck, roomChecks, roomDay, roomEnd, validSelection } from '@/lib/rooms'
import type { BookingSelection, RoomCheck, RoomConfig, RoomOffer } from '@/lib/rooms'
import './RoomsPage.css'

export function RoomsPage() {
  const { t } = useT('rooms')
  const { data: config, error, loading } = useApi<RoomConfig>('/api/rooms/config')
  const today = campusClock(new Date(), 'Europe/Berlin').day
  const [selection, setSelection] = useState<BookingSelection>({ day: today, persons: 1, startTime: '09:00', duration: 90, room: '' })
  const current = useRef(selection)
  const [offer, setOffer] = useState<RoomOffer | null>(null)
  const [checks, setChecks] = useState<RoomCheck[]>(roomChecks)
  const [conflictConfirmed, setConflictConfirmed] = useState(false)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const cancel = useRef(false)
  const [now, setNow] = useState(Date.now)
  const desktop = isDesktopApp()
  useEffect(() => () => { cancel.current = true }, [])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    const resume = () => setNow(Date.now())
    window.addEventListener('focus', resume)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', resume) }
  }, [])
  function update(value: Partial<BookingSelection>) {
    current.current = { ...current.current, ...value }
    setSelection(current.current)
    setOffer(null)
    setConflictConfirmed(false)
    setMessage('')
  }
  async function open() {
    setBusy(true)
    setMessage('')
    try { await openRoomBooking(); setOpened(true) } catch { setMessage(t('openFailed')) }
    finally { setBusy(false) }
  }
  async function inspect(action: 'fill' | 'read') {
    if (!config) return
    setBusy(true)
    setOffer(null)
    setConflictConfirmed(false)
    setMessage('')
    const requested = { ...current.current }
    try {
      if (action === 'fill') {
        const result = await fillRoomBooking(requested)
        if (JSON.stringify(requested) !== JSON.stringify(current.current)) return
        const labels: Record<string, string> = { day: t('day'), persons: t('persons'), startTime: t('time'), duration: t('duration'), room: t('room') }
        const fields = result.filled.map(key => labels[key]).filter(Boolean)
        setMessage(fields.length ? t('filled', { fields: fields.join(', ') }) : t('noFields'))
      } else {
        const snapshot = await readRoomBooking()
        if (JSON.stringify(requested) !== JSON.stringify(current.current)) return
        const parsed = parseRoomOffer(snapshot, requested, config)
        setOffer(parsed)
        if (parsed) setChecks(rememberRoomCheck({ ...parsed, status: 'available', source: 'portal-offer' }))
        setNow(Date.now())
        if (!parsed) setMessage(t('unknown'))
      }
    } catch { setMessage(t('failed')) }
    finally { setBusy(false) }
  }
  async function query(allRooms: boolean) {
    if (!config || busy) return
    const requested = { ...current.current }
    const targets = allRooms ? config.rooms : [requested.room]
    cancel.current = false
    setBusy(true)
    setOffer(null)
    setMessage('')
    setProgress({ done: 0, total: targets.length })
    let done = 0
    try {
      for (const room of targets) {
        if (cancel.current) break
        const input = { ...requested, room }
        // A failed recheck invalidates an earlier free/conflict observation for this slot.
        if (room) setChecks(rememberRoomCheck({ room, selection: input, checkedAt: Date.now(), status: 'unknown', source: 'portal-query' }))
        const result = await checkRoomAvailability(input)
        if (cancel.current || JSON.stringify(current.current) !== JSON.stringify(requested)) break
        done++
        setProgress({ done, total: targets.length })
        setNow(Date.now())
        if (result.status === 'offered') {
          const parsed = parseRoomOffer(result.snapshot, input, config)
          if (parsed) {
            setChecks(rememberRoomCheck({ ...parsed, status: 'available', source: 'portal-query' }))
            if (!allRooms || !requested.room || requested.room === parsed.room) setOffer(previous => previous || parsed)
          } else if (!allRooms) setMessage(t('unknown'))
        } else if (result.status === 'advance-limit' || result.status === 'login-required' || result.status === 'failed') {
          setMessage(t(result.status === 'advance-limit' ? 'advanceLimit' : result.status === 'login-required' ? 'queryLogin' : 'queryFailed'))
          return
        } else if (!allRooms) setMessage(t('unknown'))
      }
      if (allRooms) setMessage(t(cancel.current ? 'scanStopped' : 'scanFinished', { count: done, total: targets.length }))
    } catch { setMessage(t('queryFailed')) }
    finally { setProgress(null); setBusy(false) }
  }
  const valid = !!config && validSelection(selection, config) && selection.day >= today
  const fresh = offer && offerFresh(offer, now)
  const directOffer = offer && checkForRoom(checks, offer.room, offer.selection)?.source === 'portal-query'
  function recordConflict() {
    if (!config || !valid || !selection.room || !conflictConfirmed) return
    setChecks(rememberRoomCheck({ room: selection.room, selection: { ...selection }, checkedAt: Date.now(), status: 'conflict', source: 'user-confirmed' }))
    setOffer(null)
    setConflictConfirmed(false)
    setNow(Date.now())
    setConflictOpen(false)
    setMessage(t('conflictSaved'))
  }
  const dayChecks = checks.filter(check => check.selection.day === selection.day && config?.rooms.includes(check.room))
    .sort((a, b) => a.selection.startTime.localeCompare(b.selection.startTime) || a.room.localeCompare(b.room))
  function status(check: RoomCheck | undefined): string {
    if (!check) return t('unchecked')
    const label = check.status === 'conflict' ? t('conflict') : check.status === 'unknown' ? t('unclear') : t('available')
    return offerFresh(check, now) ? label : t('olderCheck', { status: label })
  }
  return <Shell title={t('title')}>
    <div className="rooms-page">
      <p className="rooms-intro">{t('intro')}</p>
      {error && <Failure message={error} />}
      {loading && <Loading />}
      {config && !config.url && <Empty icon={DoorOpen} title={t('title')} text={t('unconfigured')} />}
      {config?.url && <>
        <div className="rooms-layout">
          <section className="room-selection" aria-labelledby="room-selection-title">
            <h2 id="room-selection-title">{t('selection')}</h2>
            <div className="room-day-nav">
              <Button variant="outline" size="icon" aria-label={t('previous')} disabled={selection.day <= today || busy} onClick={() => update({ day: shiftMenuDay(selection.day, -1) })}><ArrowLeft size={17} /></Button>
              <strong>{roomDay(selection.day)}</strong>
              <Button variant="outline" size="icon" aria-label={t('next')} disabled={busy} onClick={() => update({ day: shiftMenuDay(selection.day, 1) })}><ArrowRight size={17} /></Button>
            </div>
            <div className="room-fields">
              <label>{t('day')}<input type="date" min={today} value={selection.day} disabled={busy} onChange={event => { if (event.target.value) update({ day: event.target.value }) }} /></label>
              <label>{t('persons')}<input type="number" min={1} max={1000} step={1} value={selection.persons || ''} disabled={busy} onChange={event => update({ persons: Number(event.target.value) })} /></label>
              <label>{t('time')}<select className="native-select" value={selection.startTime} disabled={busy} onChange={event => update({ startTime: event.target.value })}>{config.start_times.map(time => <option key={time}>{time}</option>)}</select></label>
              <label>{t('duration')}<select className="native-select" value={selection.duration} disabled={busy} onChange={event => update({ duration: Number(event.target.value) })}>{config.durations.map(duration => <option key={duration} value={duration}>{t('minutes', { count: duration })}</option>)}</select></label>
              <label className="room-choice">{t('room')}<select className="native-select" value={selection.room} disabled={busy} onChange={event => update({ room: event.target.value })}><option value="">{t('anyRoom')}</option>{config.rooms.map(room => <option key={room} value={room}>{room === '5-U11a' ? t('quietRoom') : room}</option>)}</select></label>
            </div>
            <p className="room-hint">{desktop ? t('queryHint') : t('selectedRoomHint')}</p>
            {desktop && <div className="room-actions">
              <Button variant="outline" disabled={busy || !valid} onClick={() => void open()}><ExternalLink size={16} />{opened ? t('return') : t('open')}</Button>
              <Button disabled={busy || !opened || !valid} onClick={() => void query(false)}>{t('checkAvailability')}</Button>
            </div>}
          </section>
          <section className="room-result" aria-labelledby="room-result-title">
            <h2 id="room-result-title">{t('availability')}</h2>
            {offer ? <article className={`room-offer ${fresh ? 'is-fresh' : 'is-stale'}`}>
              <span className="room-offer-status"><span />{fresh ? t('available') : t('expired')}</span>
              <h3><MapPin size={23} />{offer.room}</h3>
              <p>{roomDay(offer.selection.day)}</p>
              <strong>{offer.selection.startTime}–{roomEnd(offer.selection)}</strong>
              <small>{t(directOffer ? 'queriedAt' : 'checked', { time: localDate(new Date(offer.checkedAt).toISOString(), { hour: '2-digit', minute: '2-digit' }) })}</small>
              <p className="room-hint">{fresh ? t('notReserved') : t('expiredHint')}</p>
              {!directOffer && <p className="room-hint">{t('yearHint')}</p>}
              <Button variant="outline" disabled={busy} onClick={() => void open()}>{t('return')}<ExternalLink size={15} /></Button>
            </article> : <Empty icon={DoorOpen} title={t('emptyTitle')} text={t('emptyText')} />}
            <details className="room-conflict-entry" open={conflictOpen} onToggle={event => setConflictOpen(event.currentTarget.open)}>
              <summary>{t('recordConflict')}</summary>
              <p className="room-hint">{t('conflictExplanation')}</p>
              <label><input type="checkbox" checked={conflictConfirmed} disabled={busy || !valid || !selection.room} onChange={event => setConflictConfirmed(event.target.checked)} />{t('conflictConfirmation')}</label>
              {!selection.room && <p className="room-hint">{t('chooseSpecificRoom')}</p>}
              <Button variant="outline" disabled={busy || !valid || !selection.room || !conflictConfirmed} onClick={recordConflict}>{t('saveConflict')}</Button>
            </details>
          </section>
        </div>
        <section className="room-workflow">
          {desktop ? <details className="room-manual-workflow">
            <summary>{t('manualCheck')}</summary>
            <p className="room-hint">{t('instruction')}</p>
            <div className="room-actions">
              <Button variant="outline" disabled={busy || !opened || !valid} onClick={() => void inspect('fill')}>{t('fill')}</Button>
              <Button variant="outline" disabled={busy || !opened || !valid} onClick={() => void inspect('read')}>{busy ? t('busy') : t('read')}</Button>
            </div>
            <p className="room-hint">{t('nativeHint')}</p>
          </details> : <>
            <div className="room-actions"><Button asChild><a href={config.url} target="_blank" rel="noreferrer">{t('browserOpen')}<ExternalLink size={16} /></a></Button></div>
            <p className="room-hint">{t('browserHint')}</p>
          </>}
          {message && <p role="status" className="room-message">{message}</p>}
        </section>
        <section className="room-occupancy" aria-labelledby="room-occupancy-title">
          <div className="room-occupancy-heading"><h2 id="room-occupancy-title">{t('occupancyTitle')}</h2><span>{selection.startTime}–{roomEnd(selection)} · {t('people', { count: selection.persons })}</span></div>
          <p className="room-hint">{t('occupancyHint')}</p>
          {desktop && <div className="room-actions">
            <Button variant="outline" disabled={busy || !opened || !valid} onClick={() => void query(true)}>{t('checkAll')}</Button>
            {progress && <>
              <span role="status" className="room-scan-progress">{t('scanProgress', { count: progress.done, total: progress.total })}</span>
              <Button variant="ghost" onClick={() => { cancel.current = true }}>{t('stopScan')}</Button>
            </>}
          </div>}
          <div className="room-comparison">
            {config.rooms.map(room => {
              const check = checkForRoom(checks, room, selection)
              const state = !check ? 'unknown' : !offerFresh(check, now) ? 'stale' : check.status
              return <button key={room} type="button" className={`room-comparison-item is-${state}`} aria-pressed={selection.room === room} disabled={busy} onClick={() => update({ room })}>
                <strong>{room === '5-U11a' ? t('quietRoom') : room}</strong><span>{status(check)}</span>
                {check && <small>{check.source === 'user-confirmed' ? t('confirmedByYou') : check.source === 'portal-query' ? t('queriedFromPortal') : t('readFromPortal')} · {localDate(new Date(check.checkedAt).toISOString(), { hour: '2-digit', minute: '2-digit' })}</small>}
              </button>
            })}
          </div>
          {dayChecks.length > 0 && <details className="room-check-history" open>
            <summary>{t('checkedTimes', { day: roomDay(selection.day) })}</summary>
            <ul>{dayChecks.map(check => <li key={`${check.room}-${check.selection.startTime}-${check.selection.duration}-${check.selection.persons}`}>
              <button type="button" disabled={busy} onClick={() => update({ ...check.selection, room: check.room })}>
                <span className="room-check-time">{check.selection.startTime}–{roomEnd(check.selection)}</span>
                <strong>{check.room}</strong><span>{status(check)}</span>
                <small>{t('people', { count: check.selection.persons })} · {check.source === 'user-confirmed' ? t('confirmedByYou') : check.source === 'portal-query' ? t('queriedFromPortal') : t('readFromPortal')} · {localDate(new Date(check.checkedAt).toISOString(), { hour: '2-digit', minute: '2-digit' })}</small>
              </button>
            </li>)}</ul>
          </details>}
          <p className="room-hint">{t('sessionHint')}</p>
        </section>
        <footer className="room-footer"><p>{t('scope')}</p><a href={config.url} target="_blank" rel="noreferrer">{t('source')}<ExternalLink size={14} /></a></footer>
      </>}
    </div>
  </Shell>
}
