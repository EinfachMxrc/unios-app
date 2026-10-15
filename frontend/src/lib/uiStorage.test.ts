// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readMigratedStorage } from './uiStorage'
describe('UI preference migration', () => {
  beforeEach(() => {
    const values = new Map<string,string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key,value) })
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
  it('copies legacy values once and preserves newer choices', () => {
    localStorage.setItem('marc-theme', 'dark')
    expect(readMigratedStorage('unios-theme', 'marc-theme')).toBe('dark')
    localStorage.setItem('unios-theme', 'light')
    localStorage.setItem('marc-theme', 'system')
    expect(readMigratedStorage('unios-theme', 'marc-theme')).toBe('light')
    expect(localStorage.getItem('marc-theme')).toBe('system')
  })
  it('keeps a readable legacy preference even when durable migration cannot write', () => {
    localStorage.setItem('marc-sidebar-width', '320')
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
    expect(readMigratedStorage('unios-sidebar-width', 'marc-sidebar-width')).toBe('320')
  })
})
