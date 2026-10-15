// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'

export type RevisionSource<T> = { value: T; revision: number }
export type RevisionSnapshot<T> = RevisionSource<T> & { key: string; generation: number }
type Entry<T> = { value: T; baseline: RevisionSource<T>; generation: number; pending: boolean }
export type RevisionDraftStore<T> = {
  entries: Record<string, Entry<T>>
  setEntries: Dispatch<SetStateAction<Record<string, Entry<T>>>>
  generations: RefObject<Record<string, number>>
}

/** An owner can retain keyed child drafts even while a loading state unmounts them. */
export function useRevisionDraftStore<T>(): RevisionDraftStore<T> {
  const [entries, setEntries] = useState<Record<string, Entry<T>>>({})
  const generations = useRef<Record<string, number>>({})
  return { entries, setEntries, generations }
}

const equal = <T,>(left: T, right: T) => JSON.stringify(left) === JSON.stringify(right)
const entryFor = <T,>(source: RevisionSource<T>, generation = 0): Entry<T> => ({
  value: source.value, baseline: source, generation, pending: false,
})

/** Keep in-memory drafts per object; refetches hydrate only a clean, idle draft. */
export function useRevisionDraft<T>(key: string, source?: RevisionSource<T>, store?: RevisionDraftStore<T>) {
  const localStore = useRevisionDraftStore<T>()
  const { entries, setEntries, generations } = store ?? localStore
  const entry = entries[key] ?? (source ? entryFor(source) : undefined)
  const dirty = !!entry && !equal(entry.value, entry.baseline.value)
  const changed = !!entry && !!source && source.revision > entry.baseline.revision

  useEffect(() => {
    if (!source) return
    setEntries(previous => {
      const current = previous[key]
      if (current && (current.pending || !equal(current.value, current.baseline.value)
        || source.revision < current.baseline.revision
        || (source.revision === current.baseline.revision && equal(source.value, current.baseline.value)))) return previous
      return { ...previous, [key]: entryFor(source, current?.generation ?? 0) }
    })
  }, [key, source, setEntries])

  function change(value: T) {
    if (!entry) return
    const generation = (generations.current[key] ?? entry.generation) + 1
    generations.current[key] = generation
    setEntries(previous => ({ ...previous, [key]: { ...(previous[key] ?? entry), value, generation } }))
  }

  function discard() {
    if (!source || entry?.pending) return
    const generation = (generations.current[key] ?? entry?.generation ?? 0) + 1
    generations.current[key] = generation
    setEntries(previous => ({ ...previous, [key]: entryFor(source, generation) }))
  }

  function begin(): RevisionSnapshot<T> | null {
    if (!entry || entry.pending || changed) return null
    const snapshot = { key, value: entry.value, revision: entry.baseline.revision, generation: entry.generation }
    setEntries(previous => ({ ...previous, [key]: { ...(previous[key] ?? entry), pending: true } }))
    return snapshot
  }

  function acknowledge(snapshot: RevisionSnapshot<T>, saved: RevisionSource<T>): boolean {
    const unchanged = (generations.current[snapshot.key] ?? snapshot.generation) === snapshot.generation
    setEntries(previous => {
      const current = previous[snapshot.key]
      if (!current || saved.revision < current.baseline.revision) return previous
      return { ...previous, [snapshot.key]: { ...current, baseline: saved,
        value: current.generation === snapshot.generation ? saved.value : current.value, pending: false } }
    })
    return snapshot.key === key && unchanged
  }

  function failed(snapshot: RevisionSnapshot<T>) {
    setEntries(previous => {
      const current = previous[snapshot.key]
      return current ? { ...previous, [snapshot.key]: { ...current, pending: false } } : previous
    })
  }

  return { value: entry?.value, revision: entry?.baseline.revision, dirty, changed,
    pending: entry?.pending ?? false, change, discard, begin, acknowledge, failed }
}
