// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mathTemplates } from './mathTemplates'
import { matchesMathTemplate, readStudyQuickAccess, STUDY_QUICK_ACCESS_KEY, updateStudyQuickAccess, useStudyQuickAccess } from './studyQuickAccess'
import { quickStudyCommand } from './studyCommands'
import { insertStudyText, studyTextSelection } from './studyTextInsertion'

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('study quick access without private content', () => {
  it('rejects corrupt and foreign IDs, deduplicates and bounds recent shelves', () => {
    localStorage.setItem(STUDY_QUICK_ACCESS_KEY, JSON.stringify({
      templates: { favorites: ['fraction', 'fraction', '<script>', 'private formula'], recent: Object.keys(mathTemplates) },
      tools: { favorites: ['number', 'private answer', 9], recent: ['recall', 'recall', 'number'] },
      body: 'synthetic text must not enter preferences',
    }))
    const result = readStudyQuickAccess()
    expect(result.templates.favorites).toEqual(['fraction'])
    expect(result.templates.recent).toHaveLength(6)
    expect(result.tools.favorites).toEqual(['number'])
    expect(result.tools.recent).toEqual(['recall', 'number'])
    expect(JSON.stringify(result)).not.toContain('synthetic text')
    localStorage.setItem(STUDY_QUICK_ACCESS_KEY, '{')
    expect(readStudyQuickAccess().templates.favorites).toEqual([])
  })

  it('keeps the most recent accepted templates once and toggles favorites independently', () => {
    let preferences = readStudyQuickAccess()
    for (const key of Object.keys(mathTemplates).slice(0, 8)) preferences = updateStudyQuickAccess(preferences, 'templates', key, 'use')
    preferences = updateStudyQuickAccess(preferences, 'templates', 'fraction', 'use')
    expect(preferences.templates.recent).toEqual(['fraction', 'limit', 'matrix', 'integral', 'sum', 'index'])
    preferences = updateStudyQuickAccess(preferences, 'templates', 'fraction', 'favorite')
    expect(preferences.templates.favorites).toEqual(['fraction'])
    expect(updateStudyQuickAccess(preferences, 'templates', 'fraction', 'favorite').templates.favorites).toEqual([])
    expect(updateStudyQuickAccess(preferences, 'tools', 'fraction', 'favorite')).toBe(preferences)
  })

  it('merges changes from two dialogs and responds only to relevant cross-tab storage events', () => {
    const first = renderHook(useStudyQuickAccess), second = renderHook(useStudyQuickAccess)
    act(() => first.result.current.toggleTemplate('matrix'))
    act(() => second.result.current.toggleTool('recall'))
    expect(first.result.current.preferences.tools.favorites).toEqual(['recall'])
    expect(second.result.current.preferences.templates.favorites).toEqual(['matrix'])
    const next = readStudyQuickAccess()
    next.templates.favorites = ['integral']
    localStorage.setItem(STUDY_QUICK_ACCESS_KEY, JSON.stringify(next))
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'another-preference' })))
    expect(first.result.current.preferences.templates.favorites).toEqual(['matrix'])
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: STUDY_QUICK_ACCESS_KEY })))
    expect(first.result.current.preferences.templates.favorites).toEqual(['integral'])
  })

  it('keeps choices in memory when storage fails and persists them when it recovers', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const hook = renderHook(useStudyQuickAccess)
    act(() => hook.result.current.toggleTemplate('fraction'))
    act(() => hook.result.current.toggleTool('number'))
    expect(hook.result.current.sessionOnly).toBe(true)
    expect(hook.result.current.preferences.templates.favorites).toEqual(['fraction'])
    expect(hook.result.current.preferences.tools.favorites).toEqual(['number'])
    storage.mockRestore()
    act(() => hook.result.current.useTemplate('integral'))
    expect(hook.result.current.sessionOnly).toBe(false)
    expect(readStudyQuickAccess().templates.favorites).toEqual(['fraction'])
    expect(readStudyQuickAccess().tools.favorites).toEqual(['number'])
  })
})

describe('fast keyboard entry', () => {
  it('finds native names, slash aliases and accented terms without requiring LaTeX spelling', () => {
    expect(matchesMathTemplate('fraction', 'Fraction', '/bruch')).toBe(true)
    expect(matchesMathTemplate('derivative', 'Derivative', 'ableitung')).toBe(true)
    expect(matchesMathTemplate('cases', 'Cases', 'fälle')).toBe(true)
    expect(matchesMathTemplate('norm', 'Norm', 'laenge')).toBe(true)
    expect(matchesMathTemplate('integral', 'Integral', 'matrix')).toBe(false)
    expect(quickStudyCommand('/bruch')).toEqual({ kind: 'math', template: 'fraction' })
    expect(quickStudyCommand('potenz')).toEqual({ kind: 'math', template: 'power' })
    expect(quickStudyCommand('wahrheitstabelle')).toEqual({ kind: 'truth' })
  })

  it('replaces only the remembered UTF-16 range and continues typing immediately after the insertion', () => {
    const source = '📚 F = /bruch weiter'
    const selection = studyTextSelection(source, 7, 13)
    expect(insertStudyText(source, selection, '$\\frac12$', 100)).toEqual({ body: '📚 F = $\\frac12$ weiter', caret: 16 })
    expect(insertStudyText('newer note', selection, 'x', 100)).toBe('changed')
    expect(insertStudyText(source, selection, 'x'.repeat(100), 30)).toBe('long')
    expect(studyTextSelection(source, -10, 1000)).toEqual({ source, from: 0, to: source.length })
  })
})
