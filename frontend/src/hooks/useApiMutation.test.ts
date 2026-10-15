// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { extractApiErrorMessage } from './useApiMutation'

describe('extractApiErrorMessage', () => {
  it('returns the message of an Error (as already extracted by request() from {"detail": ...})', () => {
    expect(extractApiErrorMessage(new Error('Kurs nicht gefunden'))).toBe('Kurs nicht gefunden')
  })

  it('passes through a plain string throwable', () => {
    expect(extractApiErrorMessage('Offline: Änderungen sind gesperrt')).toBe('Offline: Änderungen sind gesperrt')
  })

  it('falls back to a generic message for an Error without text', () => {
    expect(extractApiErrorMessage(new Error(''))).toBe('Unerwarteter Fehler')
  })

  it('falls back to a generic message for a non-Error, non-string throwable', () => {
    expect(extractApiErrorMessage({ code: 500 })).toBe('Unerwarteter Fehler')
    expect(extractApiErrorMessage(null)).toBe('Unerwarteter Fehler')
    expect(extractApiErrorMessage(undefined)).toBe('Unerwarteter Fehler')
  })
})
