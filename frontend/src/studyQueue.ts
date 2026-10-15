// SPDX-License-Identifier: AGPL-3.0-or-later

import { createStore, get, update } from 'idb-keyval'
import { createEmptyCard, fsrs, type CardInput, type Grade } from 'ts-fsrs'
import i18n from '@/i18n'
import { isHostOnline, markHostReachable } from '@/hostAvailability'
import { ApiError, request, verifiedMutationGeneration } from '@/api'
import { queryClient } from '@/offlineCache'
import { invalidateStudyReads } from '@/studyQueries'
import type { StudyCard } from '@/studyTypes'
import { randomId } from '@/lib/uuid'

export type PendingReview = {
  card_id: number
  rating: Grade
  review_id: string
  offline: true
  reviewed_at: string
  study_deck_id?: number
  upload_started?: boolean
  undo_requested?: boolean
}

export function validPendingReview(value: unknown): value is PendingReview | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<PendingReview>
  return (
    Number.isSafeInteger(item.card_id) &&
    Number(item.card_id) > 0 &&
    typeof item.review_id === 'string' &&
    item.review_id.length >= 8 &&
    typeof item.rating === 'number' &&
    item.rating >= 1 &&
    item.rating <= 4
  )
}

const storage = typeof indexedDB === 'undefined' ? null : createStore('marc-uni-os-study', 'review-queue')
const KEY = 'pending-v1'
let sequence: Promise<unknown> = Promise.resolve()
let flushing: Promise<number> | null = null

export class StudyUndoUnavailableError extends Error {}

function confirmedUndoUnavailable(status: number, code: unknown, detail: unknown, review: PendingReview): boolean {
  return (
    status === 409 &&
    code === 'UNDO_UNAVAILABLE' &&
    typeof detail === 'string' &&
    detail.startsWith(`UNDO_UNAVAILABLE:${review.review_id}: `)
  )
}

function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = sequence.then(work, work)
  sequence = next.catch(() => undefined)
  return next
}

async function pending(): Promise<PendingReview[]> {
  return storage ? storedReviews(await get<unknown>(KEY, storage)) : []
}

function storedReviews(value: unknown): PendingReview[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(i18n.t('common:offlineStorageUnavailable'))
  return value as PendingReview[]
}

export function pendingReviewCount(): Promise<number> {
  return serialized(async () => (await pending()).length)
}

/** Card IDs are global across parent/child scopes; old entries have no scope field. */
export function pendingReviewCardIds(): Promise<number[]> {
  return serialized(async () => [...new Set((await pending()).map((entry) => entry.card_id))])
}

export function queueReview(
  cardId: number,
  rating: Grade,
  state?: CardInput,
  studyDeckId?: number,
): Promise<{ pending: number; estimate: Date; review: PendingReview }> {
  return serialized(async () => {
    if (!storage) throw new Error(i18n.t('common:offlineStorageUnavailable'))
    if (studyDeckId !== undefined && (!Number.isSafeInteger(studyDeckId) || studyDeckId <= 0))
      throw new Error(i18n.t('study:scopeMismatch'))
    const now = new Date()
    const entry: PendingReview = {
      card_id: cardId,
      rating,
      review_id: randomId(),
      offline: true,
      reviewed_at: now.toISOString(),
      ...(studyDeckId !== undefined ? { study_deck_id: studyDeckId } : {}),
    }
    let count = 0
    // One readwrite transaction also protects ratings from other windows.
    // The callback is synchronous; HTTP remains outside the IDB transaction.
    await update<PendingReview[]>(
      KEY,
      (value) => {
        const items = storedReviews(value)
        count = items.length + 1
        return [...items, entry]
      },
      storage,
    )
    const estimate = fsrs().next(state ?? createEmptyCard(now), now, rating).card.due
    return { pending: count, estimate, review: entry }
  })
}

export function flushReviews(): Promise<number> {
  if (flushing) return flushing
  flushing = (async () => {
    if (!storage || !isHostOnline()) return pendingReviewCount()
    let acknowledged = false
    try {
      while (isHostOnline()) {
        // Claim before HTTP in one durable IDB transaction. Another window may
        // safely delete only a UUID that has never been claimed for upload.
        const item = await serialized(async () => {
          let claimed: PendingReview | undefined
          await update<PendingReview[]>(
            KEY,
            (value) => {
              const items = storedReviews(value)
              const first = items[0]
              if (!first) return items
              if (first.undo_requested) {
                claimed = first
                return items
              }
              claimed = { ...first, upload_started: true }
              return [claimed, ...items.slice(1)]
            },
            storage!,
          )
          return claimed
        })
        if (!item) break
        let response: Response
        let generation: number
        try {
          generation = await verifiedMutationGeneration()
        } catch {
          break
        }
        try {
          response = await fetch(item.undo_requested ? '/api/anki/study/reviews/undo' : '/api/anki/study/reviews', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-UniOS-Lease-Generation': String(generation) },
            body: JSON.stringify(
              item.undo_requested
                ? { review_id: item.review_id, card_id: item.card_id, rating: item.rating }
                : reviewPayload(item),
            ),
          })
          markHostReachable(true)
        } catch {
          markHostReachable(false)
          break
        }
        if (!response.ok) {
          const unresolved = await serialized(async () =>
            (await pending()).find((entry) => entry.review_id === item.review_id),
          )
          if (!unresolved) continue // This exact UUID was durably undone while HTTP was in flight.
          if (unresolved.undo_requested && !item.undo_requested) continue // Replay the durable undo intent next.
          let detail = `HTTP ${response.status}`
          let code: unknown
          try {
            const payload = (await response.json()) as { detail?: unknown; code?: unknown }
            if (typeof payload.detail === 'string') detail = payload.detail
            code = payload.code
          } catch {
            /* plain response */
          }
          if (item.undo_requested && confirmedUndoUnavailable(response.status, code, detail, item)) {
            await serialized(() =>
              update<PendingReview[]>(
                KEY,
                (value) => storedReviews(value).filter((entry) => entry.review_id !== item.review_id),
                storage!,
              ),
            )
            acknowledged = true
            throw new StudyUndoUnavailableError(i18n.t('reviewUndo:unavailable'))
          }
          throw new Error(`Bewertung bleibt gespeichert: ${detail}`)
        }
        if (item.undo_requested) {
          const result = (await response.json()) as { review_id?: string }
          if (result.review_id !== item.review_id) throw new Error(i18n.t('reviewUndo:identityMismatch'))
        }
        // Only acknowledge this UUID. New ratings can be appended while HTTP is pending.
        await serialized(() =>
          update<PendingReview[]>(
            KEY,
            (value) =>
              storedReviews(value).filter(
                (entry) =>
                  entry.review_id !== item.review_id || (!item.undo_requested && Boolean(entry.undo_requested)),
              ),
            storage!,
          ),
        )
        acknowledged = true
      }
      return pendingReviewCount()
    } finally {
      // Partial replay changes native counts and the mirrored learning progress.
      if (acknowledged) void invalidateStudyReads(queryClient, { progress: true })
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

function reviewPayload(item: PendingReview) {
  const { card_id, rating, review_id, offline, reviewed_at, study_deck_id } = item
  return { card_id, rating, review_id, offline, reviewed_at, ...(study_deck_id !== undefined ? { study_deck_id } : {}) }
}

/** A never-uploaded tail can be removed offline; attempted uploads need an
 * exact server cancellation/undo receipt before this device acknowledges undo. */
export function undoReview(review: PendingReview): Promise<{ pending: number; card: StudyCard | null }> {
  return serialized(async () => {
    if (!storage) throw new Error(i18n.t('common:offlineStorageUnavailable'))
    let localOnly = false
    let count = 0
    await update<PendingReview[]>(
      KEY,
      (value) => {
        const items = storedReviews(value)
        const index = items.findIndex((item) => item.review_id === review.review_id)
        if (index >= 0 && index !== items.length - 1) throw new Error(i18n.t('reviewUndo:newerReview'))
        if (index < 0) {
          if (items.length) throw new Error(i18n.t('reviewUndo:newerReview'))
          // The answer ACK already removed this UUID. Persist the undo intent
          // before HTTP so a failed ACK/reload can still replay the cancellation.
          return [{ ...review, upload_started: true, undo_requested: true }]
        }
        if (index >= 0 && !items[index].upload_started) {
          localOnly = true
          count = items.length - 1
          return items.filter((item) => item.review_id !== review.review_id)
        }
        return items.map((item) => (item.review_id === review.review_id ? { ...item, undo_requested: true } : item))
      },
      storage,
    )
    if (localOnly) return { pending: count, card: null }
    let result: { review_id: string; card: StudyCard | null }
    try {
      result = await request<{ review_id: string; card: StudyCard | null }>('/api/anki/study/reviews/undo', {
        method: 'POST',
        body: JSON.stringify({
          review_id: review.review_id,
          card_id: review.card_id,
          rating: review.rating,
        }),
      })
    } catch (cause) {
      if (cause instanceof ApiError && confirmedUndoUnavailable(cause.status, cause.code, cause.message, review)) {
        await update<PendingReview[]>(
          KEY,
          (value) => storedReviews(value).filter((item) => item.review_id !== review.review_id),
          storage,
        )
        void invalidateStudyReads(queryClient, { progress: true })
        throw new StudyUndoUnavailableError(i18n.t('reviewUndo:unavailable'))
      }
      throw cause
    }
    if (result.review_id !== review.review_id) throw new Error(i18n.t('reviewUndo:identityMismatch'))
    await update<PendingReview[]>(
      KEY,
      (value) => storedReviews(value).filter((item) => item.review_id !== review.review_id),
      storage,
    )
    void invalidateStudyReads(queryClient, { progress: true })
    return { pending: (await pending()).length, card: result.card }
  })
}
