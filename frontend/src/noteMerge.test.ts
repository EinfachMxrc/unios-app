// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { mergeNoteText, mergeNoteTitle } from './noteMerge'

describe('note reconciliation', () => {
  it('combines independent edits after a device handoff', () => {
    const base = 'Rekursion\nBasisfall\nBeispiel'
    const local = 'Rekursion\nBasisfall beendet den Aufruf\nBeispiel'
    const remote = 'Rekursion funktioniert über Selbstaufrufe\nBasisfall\nBeispiel'
    expect(mergeNoteText(base, local, remote)).toEqual({
      clean: true,
      value: 'Rekursion funktioniert über Selbstaufrufe\nBasisfall beendet den Aufruf\nBeispiel',
    })
  })

  it('keeps overlapping edits for an explicit decision', () => {
    expect(mergeNoteText('Basisfall', 'Basisfall ist wichtig', 'Basisfall beendet Rekursion')).toEqual({ clean: false })
    expect(mergeNoteTitle('Rekursion', 'Selbstaufruf', 'Funktionen')).toEqual({ clean: false })
  })

  it('recognizes an already transferred draft', () => {
    expect(mergeNoteText('Alt', 'Neu', 'Neu')).toEqual({ clean: true, value: 'Neu' })
  })
})
