// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  checkForRoom,
  matchesRooms,
  offerFresh,
  parseRoomOffer,
  rememberRoomCheck,
  roomChecks,
  validSelection,
} from './rooms'
import type { BookingSelection, RoomConfig } from './rooms'
const fillScript = readFileSync(resolve('../desktop/src-tauri/src/room_form.js'), 'utf8')
const snapshotScript = readFileSync(resolve('../desktop/src-tauri/src/room_snapshot.js'), 'utf8')
const availabilityScript = readFileSync(resolve('../desktop/src-tauri/src/room_availability.js'), 'utf8')

const selection: BookingSelection = { day: '2026-10-05', persons: 2, startTime: '09:00', duration: 90, room: '' }
const config: RoomConfig = {
  url: 'https://myapps.hs-coburg.de/raumbuchung',
  rooms: ['4-031'],
  start_times: ['09:00'],
  durations: [30, 90],
}
const snapshot = {
  heading: 'Raumbuchung am 05.10. 09:00 für 1:30 h',
  message: 'Der Raum 4-031 steht zur Verfügung.',
  canBook: true,
}

describe('room offers', () => {
  it('recognizes only the exact offered slot and never marks it reserved', () => {
    expect(parseRoomOffer(snapshot, selection, config, 100)?.room).toBe('4-031')
    expect(parseRoomOffer(snapshot, selection, config, 100)).not.toHaveProperty('reserved')
    expect(parseRoomOffer(snapshot, { ...selection, day: '2026-10-06' }, config)).toBeNull()
    expect(parseRoomOffer(snapshot, { ...selection, duration: 30 }, config)).toBeNull()
    expect(parseRoomOffer(snapshot, { ...selection, room: '4-030' }, config)).toBeNull()
  })
  it('does not treat missing offers, arbitrary text, hidden actions or unknown rooms as free', () => {
    for (const change of [
      { canBook: false },
      { heading: 'Buchung erfolgreich' },
      { message: 'Kein Raum verfügbar' },
      { message: 'Der Raum 4-030 steht zur Verfügung.' },
    ]) {
      expect(parseRoomOffer({ ...snapshot, ...change }, selection, config)).toBeNull()
    }
  })
  it('recognizes the provider’s half-hour heading without broadening the interval', () => {
    const halfHour = { ...snapshot, heading: 'Raumbuchung am 05.10. 09:00 für 30 min' }
    expect(parseRoomOffer(halfHour, { ...selection, duration: 30 }, config)?.room).toBe('4-031')
    expect(parseRoomOffer(halfHour, selection, config)).toBeNull()
  })
  it('expires observations after two minutes and rejects invalid selections', () => {
    const offer = parseRoomOffer(snapshot, selection, config, 100)!
    expect(offerFresh(offer, 119_999)).toBe(true)
    expect(offerFresh(offer, 120_100)).toBe(false)
    expect(offerFresh(offer, 99)).toBe(false)
    expect(validSelection({ ...selection, day: '2026-02-30' }, config)).toBe(false)
    expect(validSelection({ ...selection, persons: 1.5 }, config)).toBe(false)
  })
  it('can be discovered through German and English room searches', () => {
    expect(matchesRooms('Raumbuchung')).toBe(true)
    expect(matchesRooms('rooms')).toBe(true)
    expect(matchesRooms('Raum reservieren')).toBe(true)
    expect(matchesRooms('Programmieren')).toBe(false)
  })
  it('keeps occupancy observations scoped to the exact interval, date, capacity and room', () => {
    const check = {
      room: '4-031',
      selection,
      checkedAt: 100,
      status: 'conflict' as const,
      source: 'user-confirmed' as const,
    }
    expect(checkForRoom([check], '4-031', selection)).toBe(check)
    for (const change of [{ startTime: '09:30' }, { duration: 30 }, { persons: 3 }, { day: '2027-10-05' }]) {
      expect(checkForRoom([check], '4-031', { ...selection, ...change })).toBeUndefined()
    }
    expect(checkForRoom([check], '5-U11a', selection)).toBeUndefined()
    expect(offerFresh(check, 120_100)).toBe(false)
  })
  it('replaces prior checks for a slot, retains other slots and bounds session history', () => {
    const check = {
      room: '4-031',
      selection,
      checkedAt: 100,
      status: 'conflict' as const,
      source: 'user-confirmed' as const,
    }
    rememberRoomCheck(check)
    const replacement = { ...check, checkedAt: 101, status: 'available' as const, source: 'portal-offer' as const }
    expect(rememberRoomCheck(replacement)).toEqual([replacement])
    rememberRoomCheck({ ...check, selection: { ...selection, startTime: '09:30' } })
    expect(roomChecks()).toHaveLength(2)
    for (let index = 0; index < 105; index++)
      rememberRoomCheck({ ...check, selection: { ...selection, persons: index + 10 } })
    const copy = roomChecks()
    expect(copy).toHaveLength(100)
    copy.pop()
    expect(roomChecks()).toHaveLength(100)
  })
})

function fictionalOffer(room = '4-031', epoch = Date.parse('2026-10-05T07:00:00Z') / 1000) {
  return `<h2>Raumbuchung am 05.10. 09:00 für 1:30 h</h2><p>Der Raum ${room} steht zur Verfügung.</p>
    <a href="/raumbuchung/buchen/${room}/?from=${epoch}&duration=5400">Raum verbindlich buchen</a>
    <input type="hidden" name="_token" value="fictional-secret"><script>window.bookingScriptExecuted = true</script>`
}

function availabilityContext(html: string, input = selection) {
  const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(async (url: string) => {
    const response = new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } })
    Object.defineProperty(response, 'url', { value: url })
    return response
  })
  const state: Record<string, unknown> = {}
  const location = { origin: 'https://myapps.hs-coburg.de', pathname: '/raumbuchung' }
  const page = new DOMParser().parseFromString('<h1>Raumbuchung</h1>', 'text/html')
  const script = new Function('document', 'location', 'window', 'fetch', 'DOMParser', `return (${availabilityScript})`)(
    page,
    location,
    state,
    fetch,
    DOMParser,
  )
  const call = (mode = 'start') => JSON.parse(script(input, 1, mode))
  const result = async () => {
    await vi.waitFor(() => expect(call('poll').status).not.toBe('pending'))
    const value = call('poll')
    call('stop')
    return value
  }
  return { fetch, state, location, page, call, result }
}

describe('HAR-verified availability GET with fictional responses', () => {
  it('queries the exact single-room interval once, verifies the offered timestamp, and never calls the booking URL', async () => {
    const context = availabilityContext(fictionalOffer(), { ...selection, room: '4-031' })
    expect(context.call()).toEqual({ status: 'pending' })
    expect(await context.result()).toEqual({ status: 'offered', snapshot })
    expect(context.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = context.fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).pathname).toBe('/raumbuchung/raum-buchen/4-031/verfuegbarkeit')
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
      capacity: '2',
      date: selection.day,
      time: '32400',
      duration: '5400',
    })
    expect(options).toMatchObject({ method: 'GET', credentials: 'same-origin', redirect: 'error', cache: 'no-store' })
    expect(context.state).not.toHaveProperty('bookingScriptExecuted')
    expect(context.state).not.toHaveProperty('__uniosRoomAvailability')
  })
  it('supports the verified category path but only returns its offered room', async () => {
    const context = availabilityContext(fictionalOffer())
    context.call()
    expect(await context.result()).toEqual({ status: 'offered', snapshot })
    expect(new URL(context.fetch.mock.calls[0][0]).pathname).toBe('/raumbuchung/kategorie-buchen/8/verfuegbarkeit')
  })
  it('distinguishes the fourteen-day restriction from occupancy and returns no raw page data', async () => {
    const context = availabilityContext(
      '<div class="modal">Räume dürfen maximal 14 Tage im voraus gebucht werden</div><input value="fictional-secret">',
    )
    context.call()
    expect(await context.result()).toEqual({ status: 'advance-limit' })
  })
  it('keeps unmatched rooms, years, times, ambiguous offers, unknown rejection text and oversized responses unknown or failed', async () => {
    const examples = [
      fictionalOffer('4-032'),
      fictionalOffer('4-031', Date.parse('2027-10-05T07:00:00Z') / 1000),
      fictionalOffer('4-031', Date.parse('2026-10-05T07:30:00Z') / 1000),
      fictionalOffer('4-031', Date.parse('2026-10-05T07:00:01Z') / 1000),
      fictionalOffer() + '<p>Der Raum 4-031 steht zur Verfügung.</p>',
      fictionalOffer().replace('/raumbuchung/buchen/4-031/', 'https://evil.test/raumbuchung/buchen/4-031/'),
      '<div class="modal">Keine passenden Räume gefunden</div>',
      'x'.repeat(262145),
    ]
    for (const html of examples) {
      const context = availabilityContext(html, { ...selection, room: '4-031' })
      context.call()
      expect(['unknown', 'failed']).toContain((await context.result()).status)
      expect(context.fetch).toHaveBeenCalledTimes(1)
    }
  })
  it('does not fetch from sign-in pages, invalid selections or unknown rooms', () => {
    for (const change of [
      { room: '../buchen' },
      { day: '2026-02-30' },
      { persons: 0 },
      { duration: 1 },
      { startTime: '07:30' },
    ]) {
      const context = availabilityContext('', { ...selection, ...change })
      expect(context.call()).toEqual({ status: 'failed' })
      expect(context.fetch).not.toHaveBeenCalled()
    }
    const context = availabilityContext('')
    context.location.origin = 'https://login.microsoftonline.com'
    expect(context.call()).toEqual({ status: 'login-required' })
    expect(context.fetch).not.toHaveBeenCalled()
  })
  it('handles sign-in HTML and network errors without treating them as occupied', async () => {
    const login = availabilityContext('<input type="password">')
    login.call()
    expect(await login.result()).toEqual({ status: 'login-required' })
    const failed = availabilityContext('')
    failed.fetch.mockRejectedValueOnce(new Error('fictional network error'))
    failed.call()
    expect(await failed.result()).toEqual({ status: 'failed' })
  })
  it('rejects redirects, unauthorized replies and non-HTML content without another request', async () => {
    for (const responseCase of [
      { status: 200, url: 'https://login.microsoftonline.com/', type: 'text/html', expected: 'failed' },
      { status: 302, type: 'text/html', expected: 'failed' },
      { status: 401, type: 'text/html', expected: 'login-required' },
      { status: 200, type: 'application/json', expected: 'failed' },
    ]) {
      const context = availabilityContext(fictionalOffer())
      context.fetch.mockImplementationOnce(async (url: string) => {
        const response = new Response(fictionalOffer(), {
          status: responseCase.status,
          headers: { 'Content-Type': responseCase.type },
        })
        Object.defineProperty(response, 'url', { value: responseCase.url || url })
        return response
      })
      context.call()
      expect(await context.result()).toEqual({ status: responseCase.expected })
      expect(context.fetch).toHaveBeenCalledTimes(1)
    }
  })
  it('abort stops the active GET and clears the polling slot', async () => {
    const context = availabilityContext('')
    context.fetch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          const options = context.fetch.mock.calls[0][1] as RequestInit
          options.signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
        }),
    )
    context.call()
    expect(context.call('poll')).toEqual({ status: 'pending' })
    expect(context.call('stop')).toEqual({ status: 'stopped' })
    expect(context.state).not.toHaveProperty('__uniosRoomAvailability')
    await Promise.resolve()
    expect(context.fetch).toHaveBeenCalledTimes(1)
  })
})

function pageContext(html: string, text = '') {
  document.body.innerHTML = html
  Object.defineProperty(document.body, 'innerText', { value: text, configurable: true })
  for (const button of document.querySelectorAll('button'))
    Object.defineProperty(button, 'innerText', { value: button.textContent, configurable: true })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 10, height: 10 } as DOMRect)
  const location = { origin: 'https://myapps.hs-coburg.de', pathname: '/raumbuchung' }
  return { document, location }
}

describe('native fixed scripts against fictional form markup', () => {
  it('fills label-associated fields without events, clicks or submission', () => {
    const context = pageContext(
      '<form><label>Datum<input type="date"></label><label>Personenanzahl<input type="number"></label><label>Uhrzeit<select><option value="x">09:00</option></select></label><label>Dauer<select><option value="y">1:30 h</option></select></label><button>weiter</button></form>',
    )
    const event = vi.fn()
    for (const name of ['input', 'change', 'submit', 'click']) document.addEventListener(name, event)
    const fill = new Function('document', 'location', `return (${fillScript})`)(context.document, context.location)
    expect(JSON.parse(fill(selection)).filled).toEqual(['day', 'persons', 'startTime', 'duration'])
    expect(document.querySelector('input')?.value).toBe('2026-10-05')
    expect(event).not.toHaveBeenCalled()
    for (const name of ['input', 'change', 'submit', 'click']) document.removeEventListener(name, event)
    vi.restoreAllMocks()
  })
  it('skips ambiguous/unlabelled fields and sign-in pages', () => {
    const context = pageContext(
      '<label>Personenanzahl<input></label><label>Personenanzahl<input></label><input name="date"><input type="hidden" value="private">',
    )
    const fill = new Function('document', 'location', `return (${fillScript})`)(context.document, context.location)
    expect(JSON.parse(fill(selection)).filled).toEqual([])
    context.location.origin = 'https://login.microsoftonline.com'
    expect(JSON.parse(fill(selection)).filled).toEqual([])
    vi.restoreAllMocks()
  })
  it('captures only visible offer text and action presence, excluding cookies, URLs and hidden fields', () => {
    const context = pageContext(
      '<button>Raum verbindlich buchen</button><input type="hidden" value="secret">',
      `${snapshot.heading}\n${snapshot.message}`,
    )
    const read = () =>
      JSON.parse(new Function('document', 'location', `return (${snapshotScript})`)(context.document, context.location))
    expect(read()).toEqual(snapshot)
    document.body.innerHTML = '<input type="password">'
    expect(read()).toEqual({ heading: '', message: '', canBook: false })
    vi.restoreAllMocks()
  })
})
