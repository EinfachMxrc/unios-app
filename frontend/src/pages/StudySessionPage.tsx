// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, Undo2 } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { type Grade } from 'ts-fsrs'
import { useT } from '@/i18n/useT'
import { localDate, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Failure, Loading } from '@/components/State'
import { useHostOnline } from '@/hostAvailability'
import { sanitizeCardHtml } from '@/lib/sanitizeCardHtml'
import { waitForMotion } from '@/lib/motion'
import {
  flushReviews,
  pendingReviewCardIds,
  pendingReviewCount,
  queueReview,
  StudyUndoUnavailableError,
  undoReview,
  validPendingReview,
  type PendingReview,
} from '@/studyQueue'
import { useRuntimeVerified } from '@/lib/runtimeAccess'
import { useWorkspaceState } from '@/lib/workspaceState'
import { queryClient } from '@/offlineCache'
import { fetchFreshStudyDue } from '@/studyQueries'
import { ownCardSourceUrl, ownCardSourceTitle, isNoteCardSource } from '@/noteCardTypes'
import { LearningFocusBar, useLearningFocus } from '@/components/LearningFocusBar'
import { focusPath, focusQuery } from '@/lib/learningFocus'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { HostContext } from '@/hooks/host'
import {
  freezeStudySession,
  matchesStudyScope,
  studyCardInput,
  studyCountTotal,
  studyDuePath,
  validStudySession,
  type StudyDueResponse,
  type StudySessionSnapshot,
} from '@/studyTypes'
import './StudyPage.css'

const emptyIds: number[] = []

export function StudySessionPage() {
  const { t } = useT('study')
  const { t: learning } = useT('learning')
  const { t: undoText } = useT('reviewUndo')
  const { t: noteText } = useT('noteCards')
  const focus = useLearningFocus()
  const host = useContext(HostContext)
  const readOnly = host !== null && host.mode !== 'host'
  const ratingLabels = [t('ratingAgain'), t('ratingHard'), t('ratingGood'), t('ratingEasy')] as const
  const { deck = '' } = useParams()
  const focusAllowsDeck =
    !focus.requested || Boolean(focus.reference && focus.data?.card_scope.decks.some((item) => item.name === deck))
  const location = useLocation()
  const ratingLock = useRef(false)
  const mounted = useRef(true)
  const currentDeck = useRef(deck)
  useLayoutEffect(() => {
    currentDeck.current = deck
  }, [deck])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const {
    data: status,
    error: statusError,
    loading: statusLoading,
    reload: reloadStatus,
  } = useApi<{ mode: string }>('/api/anki/study/status')
  const duePath = studyDuePath(deck)
  const {
    data: due,
    error: dueError,
    loading: dueLoading,
  } = useApi<StudyDueResponse>(duePath, { enabled: status?.mode === 'integrated' && focusAllowsDeck })
  const online = useHostOnline()
  const runtimeVerified = useRuntimeVerified()
  const [session, setSession] = useWorkspaceState<StudySessionSnapshot | null>(`study:${deck}:session`, null, {
    persist: false,
    valid: validStudySession,
  })
  const [answeredIds, setAnsweredIds] = useWorkspaceState(`study:${deck}:answered`, emptyIds, { persist: false })
  const [shown, setShown] = useWorkspaceState(`study:${deck}:shown`, false, { persist: false })
  const [lastReview, setLastReview] = useWorkspaceState<PendingReview | null>(`study:${deck}:last-review`, null, {
    persist: false,
    valid: validPendingReview,
  })
  const [undoMessage, setUndoMessage] = useState('')
  const [switching, setSwitching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [initializationError, setInitializationError] = useState<{ deck: string; message: string } | null>(null)
  const [initializationAttempt, setInitializationAttempt] = useState(0)
  const cachedDue = online ? null : due

  // Freeze only after durable pending reviews are known. A cached online queue can
  // still contain cards whose server acknowledgement arrived before this reload.
  useEffect(() => {
    if (status?.mode !== 'integrated' || !focusAllowsDeck || session?.deck === deck) return
    let active = true
    const initialize = async () => {
      try {
        if (online && runtimeVerified) {
          try {
            await flushReviews()
          } catch {
            if (active) setErrorMessage(t('reviewsPendingUpload'))
          }
        }
        // An obsolete effect must not cancel a newer initializer's fetch after replay.
        if (!active) return
        const fresh = online ? await fetchFreshStudyDue(queryClient, deck, () => active) : cachedDue
        if (!fresh) return
        const snapshot = freezeStudySession(deck, fresh)
        if (!snapshot) throw new Error(t('scopeMismatch'))
        const [pendingIds, pendingTotal] = await Promise.all([pendingReviewCardIds(), pendingReviewCount()])
        if (!active) return
        const pendingSet = new Set(pendingIds)
        setAnsweredIds(snapshot.cards.filter((card) => pendingSet.has(card.id)).map((card) => card.id))
        setPending(pendingTotal)
        setShown(false)
        setSession(snapshot)
        setInitializationError(null)
      } catch (cause) {
        if (active) setInitializationError({ deck, message: extractApiErrorMessage(cause) })
      }
    }
    void initialize()
    return () => {
      active = false
    }
  }, [
    deck,
    duePath,
    cachedDue,
    online,
    runtimeVerified,
    status?.mode,
    focusAllowsDeck,
    session?.deck,
    initializationAttempt,
    setSession,
    setAnsweredIds,
    setShown,
    t,
  ])

  useEffect(() => {
    if (session?.deck !== deck) return
    let active = true
    const sync = async () => {
      const count = await pendingReviewCount()
      if (active) setPending(count)
      if (online && runtimeVerified) {
        try {
          const remaining = await flushReviews()
          if (active) setPending(remaining)
        } catch {
          if (active) setErrorMessage(t('reviewsPendingUpload'))
        }
      }
    }
    void sync()
    return () => {
      active = false
    }
  }, [deck, session?.deck, online, runtimeVerified, t])

  const cards = session?.deck === deck ? session.cards : []
  const current = cards.find((card) => !answeredIds.includes(card.id))
  const completed = cards.length - cards.filter((card) => !answeredIds.includes(card.id)).length

  const rate = useCallback(
    async (rating: Grade) => {
      if (!current || ratingLock.current || !focusAllowsDeck || readOnly) return
      ratingLock.current = true
      setBusy(true)
      setErrorMessage('')
      try {
        const result = await queueReview(current.id, rating, studyCardInput(current.fsrs), session?.scope?.deck_id)
        setLastReview(result.review ?? null)
        setUndoMessage('')
        setPending(result.pending)
        setSwitching(true)
        await waitForMotion(120)
        setAnsweredIds((ids) => [...ids, current.id])
        setShown(false)
        setSwitching(false)
        if (online && runtimeVerified) {
          try {
            void flushReviews()
              .then((remaining) => {
                if (mounted.current) setPending(remaining)
              })
              .catch(() => {
                if (mounted.current) setErrorMessage(t('reviewSavedRetryLater'))
              })
          } catch {
            setErrorMessage(t('reviewSavedRetryLater'))
          }
        }
      } catch {
        setSwitching(false)
        setErrorMessage(t('ratingSaveFailed'))
      } finally {
        ratingLock.current = false
        if (mounted.current) setBusy(false)
      }
    },
    [
      current,
      session?.scope?.deck_id,
      online,
      runtimeVerified,
      focusAllowsDeck,
      readOnly,
      t,
      setAnsweredIds,
      setShown,
      setLastReview,
    ],
  )

  const undoLast = useCallback(async () => {
    if (!lastReview || ratingLock.current || !focusAllowsDeck || readOnly) return
    ratingLock.current = true
    setBusy(true)
    setErrorMessage('')
    const selected = lastReview
    const selectedDeck = deck
    try {
      const result = await undoReview(selected)
      if (!mounted.current || currentDeck.current !== selectedDeck) return
      setPending(result.pending)
      if (result.card)
        setSession((snapshot) =>
          snapshot?.deck === selectedDeck
            ? { ...snapshot, cards: snapshot.cards.map((card) => (card.id === selected.card_id ? result.card! : card)) }
            : snapshot,
        )
      setAnsweredIds((ids) => ids.filter((id) => id !== selected.card_id))
      setShown(true)
      setLastReview(null)
      setUndoMessage(undoText('undone'))
    } catch (cause) {
      if (mounted.current && currentDeck.current === selectedDeck) {
        try {
          setPending(await pendingReviewCount())
        } catch {
          /* Preserve the original failure if local storage is unavailable. */
        }
        if (cause instanceof StudyUndoUnavailableError) setLastReview(null)
        setErrorMessage(undoText('failed', { reason: extractApiErrorMessage(cause) }))
      }
    } finally {
      ratingLock.current = false
      if (mounted.current) setBusy(false)
    }
  }, [deck, lastReview, focusAllowsDeck, readOnly, setAnsweredIds, setLastReview, setSession, setShown, undoText])

  async function restartSession() {
    if (ratingLock.current || !online || !focusAllowsDeck) return
    ratingLock.current = true
    setBusy(true)
    setErrorMessage('')
    const isCurrent = () => mounted.current && currentDeck.current === deck
    try {
      // A fresh server queue is only meaningful once this device's reviews were acknowledged.
      const queued = await pendingReviewCount()
      if (!isCurrent()) return
      const remaining = queued && runtimeVerified ? await flushReviews() : queued
      if (!isCurrent()) return
      setPending(remaining)
      if (remaining > 0) {
        setErrorMessage(t('restartNeedsUpload'))
        return
      }
      const fresh = await fetchFreshStudyDue(queryClient, deck, isCurrent)
      if (!fresh) return
      const snapshot = freezeStudySession(deck, fresh)
      if (!snapshot) throw new Error(t('scopeMismatch'))
      const [pendingIds, pendingTotal] = await Promise.all([pendingReviewCardIds(), pendingReviewCount()])
      if (!isCurrent()) return
      const pendingSet = new Set(pendingIds)
      setSession(snapshot)
      setAnsweredIds(snapshot.cards.filter((card) => pendingSet.has(card.id)).map((card) => card.id))
      setPending(pendingTotal)
      setShown(false)
      setLastReview(null)
      setUndoMessage('')
    } catch {
      if (isCurrent()) setErrorMessage(t('restartFailed'))
    } finally {
      ratingLock.current = false
      if (mounted.current) setBusy(false)
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || busy) return
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
      if (event.key.toLowerCase() === 'z' && lastReview) {
        event.preventDefault()
        void undoLast()
        return
      }
      if (!current) return
      if (
        !shown &&
        (event.code === 'Space' || event.key === 'Enter') &&
        !target.closest('a, button, summary, [role="button"]')
      ) {
        event.preventDefault()
        setShown(true)
      } else if (shown && /^[1-4]$/.test(event.key)) {
        event.preventDefault()
        void rate(Number(event.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, current, rate, shown, setShown, lastReview, undoLast])

  const activeSession = session?.deck === deck ? session : null
  const offlineMissing = !online && status?.mode === 'integrated' && !activeSession && !due
  const initialError = !activeSession && initializationError?.deck === deck ? initializationError.message : null
  const focusPending = focus.requested && focus.reference && !focus.data && !focus.error
  const focusError =
    focus.requested && (!focus.reference || focus.error)
      ? learning('focusContextUnavailable')
      : focus.data && !focusAllowsDeck
        ? learning('focusScopeMismatch')
        : null
  const loading =
    Boolean(focusPending) ||
    (statusLoading && !status) ||
    (!focusError &&
      focusAllowsDeck &&
      !offlineMissing &&
      !initialError &&
      status?.mode === 'integrated' &&
      !activeSession &&
      (online || dueLoading || (due && matchesStudyScope(deck, due))))
  const error =
    focusError ||
    statusError ||
    initialError ||
    (!activeSession && !offlineMissing ? dueError : null) ||
    (!activeSession && due && !matchesStudyScope(deck, due) ? t('scopeMismatch') : null)
  const planned = activeSession ? studyCountTotal(activeSession.counts) : 0
  const sourceHref =
    current?.source &&
    (!isNoteCardSource(current.source) && focus.reference && focus.data?.course_id === current.source.course_id
      ? focusPath(focus.reference, { mode: 'source', version: current.source.version_id, page: current.source.page })
      : ownCardSourceUrl(current.source))
  const decksHref = `/study${focus.reference ? `?${focusQuery(focus.reference)}` : ''}`

  return (
    <main className="study-session" data-workspace-key={location.key}>
      <div className="study-session-shell">
        <header className="study-session-header">
          <Link className="study-session-back" to={decksHref}>
            <ArrowLeft size={18} aria-hidden="true" /> {t('allDecksLink')}
          </Link>
          <span className="study-session-brand">{t('sessionBrand')}</span>
        </header>
        <LearningFocusBar focus={focus} />
        {loading ? (
          <Loading />
        ) : error ? (
          <Failure
            message={error}
            retry={() => {
              setInitializationError(null)
              setInitializationAttempt((attempt) => attempt + 1)
              reloadStatus()
              if (focus.requested) focus.reload()
            }}
          />
        ) : offlineMissing ? (
          <div className="study-session-done">
            <h1>{t('offlineDeckMissingTitle')}</h1>
            <p className="muted-text">{t('offlineDeckMissingText')}</p>
            <Button asChild>
              <Link to="/system">{t('openConnection')}</Link>
            </Button>
          </div>
        ) : status?.mode !== 'integrated' ? (
          <div className="study-session-done">
            <h1>{t('integratedNotEnabledTitle')}</h1>
            <Button asChild>
              <Link to="/study">{t('openFlashcardsLink')}</Link>
            </Button>
          </div>
        ) : (
          <div className="study-session-main">
            {readOnly && <p role="status" className="muted-text">{t('standbySessionReadOnly')}</p>}
            <div className="study-session-heading">
              <p className="study-session-eyebrow">{t('sessionEyebrow')}</p>
              <h1>{deck.replace(/^Uni::/, '').replaceAll('::', ' › ')}</h1>
              <p className="muted-text" aria-live="polite">
                {cards.length
                  ? t('sessionProgressText', { completed, total: cards.length, count: cards.length })
                  : planned > 0
                    ? t('noCardsAvailableText')
                    : t('noCardsDueText')}
              </p>
              {activeSession && (
                <>
                  <p className="muted-text">{t('countsSummary', activeSession.counts)}</p>
                  <details className="muted-text">
                    <summary>{t('sessionSnapshotText', { date: localDate(activeSession.generated_at) })}</summary>
                    <p>{t('sessionScopeText')}</p>
                  </details>
                </>
              )}
              {cards.length > 0 && (
                <progress
                  className="study-session-progress"
                  value={completed}
                  max={cards.length}
                  aria-label={t('progressAria')}
                />
              )}
            </div>
            {lastReview && (
              <Button
                variant="ghost"
                disabled={busy || readOnly}
                onClick={() => void undoLast()}
                aria-label={undoText('undo')}
                title={undoText('undoHint')}
              >
                <Undo2 size={16} aria-hidden="true" /> {undoText('undo')} <kbd>Z</kbd>
              </Button>
            )}
            {current ? (
              <div key={current.id} className={`study-card-flow study-session-flow ${switching ? 'is-leaving' : ''}`}>
                <article className="study-session-card" aria-label={t('flashcardAria')}>
                  <div className={shown ? 'study-session-answer' : undefined}>
                    <div className="study-session-card-label">{t(shown ? 'answerLabel' : 'questionLabel')}</div>
                    <div
                      className="study-session-card-content"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeCardHtml(shown ? current.back_html : current.front_html),
                      }}
                    />
                  </div>
                  {current.source && sourceHref && (
                    <Link className="study-session-source" to={sourceHref}>
                      {t('manual.openSource')} · {ownCardSourceTitle(current.source)} ·{' '}
                      {isNoteCardSource(current.source)
                        ? noteText('sourcePosition', { revision: current.source.revision })
                        : t('manual.sourcePosition', { version: current.source.version, page: current.source.page })}
                    </Link>
                  )}
                </article>
                {shown ? (
                  <div className="study-session-actions" aria-label={t('rateAnswerAria')}>
                    {ratingLabels.map((label, index) => (
                      <Button
                        key={label}
                        variant={index === 2 ? 'default' : 'outline'}
                        disabled={busy || readOnly}
                        onClick={() => void rate((index + 1) as Grade)}
                      >
                        <kbd>{index + 1}</kbd> · {label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Button className="study-session-reveal" onClick={() => setShown(true)}>
                    {t('showAnswer')} <span className="study-session-shortcut">{t('spacebarHint')}</span>
                  </Button>
                )}
              </div>
            ) : (
              <div className="study-session-done study-card-flow">
                <h2>
                  {cards.length
                    ? t('sessionDoneTitle')
                    : planned > 0
                      ? t('noCardsAvailableText')
                      : t('deckNothingDueTitle')}
                </h2>
                <p className="muted-text">
                  {!cards.length && planned > 0
                    ? t('learningCardsWaitingText')
                    : activeSession?.has_more
                      ? t('moreCardsAvailableText')
                      : t('nextReviewsScheduled')}
                </p>
                <Button disabled={busy || !online || pending > 0} onClick={() => void restartSession()}>
                  {t('startAnotherSession')}
                </Button>
                {pending > 0 && <p className="muted-text">{t('restartNeedsUpload')}</p>}
                <Button asChild>
                  <Link to={decksHref}>{t('backToDecksButton')}</Link>
                </Button>
              </div>
            )}
            {errorMessage && (
              <p className="study-session-note" role="alert">
                {errorMessage}
              </p>
            )}
            {undoMessage && (
              <p className="study-session-note" role="status">
                {undoMessage}
              </p>
            )}
            {!online && <p className="study-session-note">{t('offlineNotice')}</p>}
            {pending > 0 && <p className="study-session-note">{t('pendingReviewsUpload', { count: pending })}</p>}
          </div>
        )}
      </div>
    </main>
  )
}
