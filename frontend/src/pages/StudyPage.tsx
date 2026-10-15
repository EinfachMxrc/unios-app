// SPDX-License-Identifier: AGPL-3.0-or-later

import { useWorkspaceState } from '@/lib/workspaceState'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpenCheck, Download, RotateCcw } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { LearningTabs } from '@/components/LearningTabs'
import { LearningFocusBar, useLearningFocus } from '@/components/LearningFocusBar'
import { focusQuery } from '@/lib/learningFocus'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useHostOnline } from '@/hostAvailability'
import { useWritableHost } from '@/hooks/host'
import { flushReviews, pendingReviewCount } from '@/studyQueue'
import { useRuntimeVerified } from '@/lib/runtimeAccess'
import { queryClient } from '@/offlineCache'
import { invalidateStudyReads } from '@/studyQueries'
import { studyCountTotal, type StudyCard, type StudyStats, type StudyStatus } from '@/studyTypes'
import { useStudyCollection } from './study/useStudyCollection'
import './StudyPage.css'

const BASE = '/api/anki/study'

type CardEditor = { id: number; generation: number; front: string; back: string }

function refreshCardBrowsers() {
  // URL-scoped libraries have independent cache keys; refreshing only the
  // search captured before a pending edit would leave another scope stale.
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const [domain, path] = query.queryKey
      return domain === 'api' && typeof path === 'string' && /^\/api\/anki\/study\/cards(?:\?|$)/.test(path)
    },
  })
}

export function StudyPage() {
  const { t } = useT('study')
  const { t: learning } = useT('learning')
  const focus = useLearningFocus()
  const { data: status, loading, error } = useApi<StudyStatus>(`${BASE}/status`)
  const [rememberedTab, setRememberedTab] = useWorkspaceState<'learn' | 'browse'>('cards:tab', 'learn')
  const [params, setParams] = useSearchParams()
  const requestedView = params.get('view')
  const tab =
    requestedView === 'learn' || requestedView === 'browse'
      ? requestedView
      : params.has('q') || params.has('deck')
        ? 'browse'
        : rememberedTab
  const browserQuery = params.get('q') ?? ''
  const browserDeck = params.get('deck') ?? ''
  // Anki's native search includes subdecks. Escape literal deck-name wildcards
  // and group the user expression so OR cannot bypass the selected deck.
  // https://docs.ankiweb.net/manual/searching
  const deckQuery = browserDeck ? `deck:"${browserDeck.replace(/[\\"*_]/g, '\\$&')}"` : ''
  const query =
    deckQuery && browserQuery.trim() ? `${deckQuery} (${browserQuery.trim()})` : deckQuery || browserQuery.trim()
  const browserPath = `${BASE}/cards${query ? `?q=${encodeURIComponent(query)}` : ''}`
  const {
    data: browser,
    reload: reloadBrowser,
    loading: browserLoading,
    error: browserError,
  } = useApi<{ cards: StudyCard[] }>(browserPath, {
    enabled: !focus.requested && tab === 'browse' && status?.mode === 'integrated',
  })
  const {
    data: stats,
    reload: reloadStats,
    loading: statsLoading,
    error: statsError,
    updatedAt: statsUpdatedAt,
  } = useApi<StudyStats>(`${BASE}/stats`, { enabled: status?.mode === 'integrated' })
  const online = useHostOnline()
  const runtimeVerified = useRuntimeVerified()
  const canWrite = useWritableHost()
  const {
    busy,
    message,
    errorMessage,
    setErrorMessage,
    file,
    setFile,
    preview,
    setPreview,
    lastPackage,
    track,
    previewFile,
    activate,
    switchToExternal,
    startEmpty,
    exportCards,
    transferApproved,
  } = useStudyCollection({ onCardsChanged: reloadBrowser })
  const [pending, setPending] = useState(0)
  const [editing, setEditing] = useState<number | null>(null)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const editorRef = useRef<CardEditor | null>(null)
  const cardSavePending = useRef(false)
  const decks =
    stats?.decks.filter(
      (deck) =>
        deck.cards > 0 &&
        (!focus.requested || focus.data?.card_scope.decks.some((item) => item.deck_id === deck.deck_id)),
    ) ?? []
  const browserDecks = [...new Set(stats?.decks.filter((deck) => deck.cards > 0).map((deck) => deck.name) ?? [])]

  function toggleCardBrowser() {
    const next = tab === 'browse' ? 'learn' : 'browse'
    setRememberedTab(next)
    setParams((current) => {
      const nextParams = new URLSearchParams(current)
      nextParams.set('view', next)
      return nextParams
    })
  }

  function searchCards(form: HTMLFormElement) {
    const fields = new FormData(form)
    const nextQuery = String(fields.get('q') ?? '').trim()
    const nextDeck = String(fields.get('deck') ?? '')
    setRememberedTab('browse')
    setParams((current) => {
      const nextParams = new URLSearchParams(current)
      nextParams.set('view', 'browse')
      if (nextQuery) nextParams.set('q', nextQuery)
      else nextParams.delete('q')
      if (nextDeck) nextParams.set('deck', nextDeck)
      else nextParams.delete('deck')
      return nextParams
    })
  }

  function resetCardSearch(form: HTMLFormElement | null) {
    form?.reset()
    setParams((current) => {
      const nextParams = new URLSearchParams(current)
      nextParams.set('view', 'browse')
      nextParams.delete('q')
      nextParams.delete('deck')
      return nextParams
    })
  }

  const syncPending = useCallback(async () => {
    const queued = await pendingReviewCount()
    setPending(queued)
    if (queued > 0 && online && runtimeVerified) {
      try {
        const remaining = await flushReviews()
        setPending(remaining)
      } catch {
        setErrorMessage(t('reviewsSyncFailed'))
      }
    }
  }, [online, runtimeVerified, t, setErrorMessage])

  useEffect(() => {
    void syncPending()
  }, [syncPending])

  function openCardEditor(card: StudyCard) {
    // A fresh object identifies this editor even when the same card is reopened.
    editorRef.current = { id: card.id, generation: 0, front: card.front, back: card.back }
    setEditing(card.id)
    setFront(card.front)
    setBack(card.back)
  }

  function updateCardField(field: 'front' | 'back', value: string) {
    const editor = editorRef.current
    if (!editor) return
    editor[field] = value
    editor.generation += 1
    if (field === 'front') setFront(value)
    else setBack(value)
  }

  async function saveCard() {
    const editor = editorRef.current
    if (!editor || cardSavePending.current || busy || !canWrite) return
    const ticket = { editor, generation: editor.generation, front: editor.front, back: editor.back }
    cardSavePending.current = true
    try {
      await track(async () => {
        await request(`${BASE}/cards/${editor.id}`, {
          method: 'PUT',
          body: JSON.stringify({ front: ticket.front, back: ticket.back }),
        })
        // This endpoint has no server revision contract. Only the unchanged local
        // editor that sent this snapshot may close; later typing remains unsaved.
        if (editorRef.current === ticket.editor && ticket.editor.generation === ticket.generation) {
          editorRef.current = null
          setEditing(null)
        }
        refreshCardBrowsers()
        void invalidateStudyReads(queryClient)
      }, 'saveCardFailed')
    } finally {
      cardSavePending.current = false
    }
  }

  return (
    <Shell title={focus.requested ? learning('focusCardsTitle') : t('pageTitle')} eyebrow={t('pageEyebrow')}>
      {focus.requested ? (
        <LearningFocusBar focus={focus} />
      ) : (
        <>
          <LearningTabs />
          <div className="page-actions">
            <Link className="subtle-link" to="/study/cards">
              {t('manual.manageCards')}
            </Link>
          </div>
        </>
      )}
      {loading && !status ? (
        <Loading />
      ) : error && !status ? (
        <Failure message={error} />
      ) : (
        status && (
          <div className="flex flex-col gap-5">
            {status.mode === 'integrated' && (
              <div>
                <Panel
                  title={t('deckListTitle')}
                  action={
                    focus.requested ? undefined : (
                      <span className="text-sm">{t('deckListDueCount', { count: status.due })}</span>
                    )
                  }
                >
                  <p className="muted-text mb-4">
                    {focus.requested ? learning('focusDeckScopeHint') : t('deckListIntro')}
                  </p>
                  {stats && statsUpdatedAt > 0 && (
                    <p className="muted-text mb-4">
                      {t('deckSnapshotText', { date: localDate(new Date(statsUpdatedAt).toISOString()) })}
                    </p>
                  )}
                  {!online && <p className="muted-text mb-4">{t('deckOverviewOfflineText')}</p>}
                  {focus.requested && (!focus.reference || focus.error) ? (
                    <Failure message={learning('focusContextUnavailable')} />
                  ) : (focus.requested && !focus.data) || (statsLoading && !stats) ? (
                    <Loading variant="rows" />
                  ) : statsError && !stats ? (
                    <Failure message={statsError} retry={reloadStats} />
                  ) : decks.length ? (
                    <div className="row-list">
                      {decks.map((deck) => {
                        const dueCount = studyCountTotal(deck.counts)
                        return (
                          <Link
                            className="data-row study-deck-link"
                            key={deck.deck_id}
                            to={`/study/session/${encodeURIComponent(deck.name)}${focus.reference ? `?${focusQuery(focus.reference)}` : ''}`}
                          >
                            <span className="flex-1">
                              <strong>{deck.name.replace(/^Uni::/, '').replaceAll('::', ' › ')}</strong>
                              <span className="row-subtitle">
                                {t('deckDueSummary', {
                                  due: dueCount,
                                  total: deck.scope_cards,
                                  count: deck.scope_cards,
                                })}
                              </span>
                              <span className="row-subtitle">{t('countsSummary', deck.counts)}</span>
                            </span>
                            <span>{dueCount ? t('deckActionLearn') : t('deckActionView')}</span>
                            <ArrowRight size={17} aria-hidden="true" />
                          </Link>
                        )
                      })}
                    </div>
                  ) : (
                    <Empty
                      title={focus.requested ? learning('focusCardsEmpty') : t('noDecksTitle')}
                      text={focus.requested ? learning('focusDeckScopeHint') : t('noCardsText')}
                    />
                  )}
                  {!focus.requested && (
                    <Button size="sm" variant="ghost" className="mt-4" onClick={toggleCardBrowser}>
                      {tab === 'browse' ? t('closeCardBrowser') : t('openCardBrowser')}
                    </Button>
                  )}
                  {!focus.requested && tab === 'browse' && (
                    <div className="grid gap-3">
                      <h3 className="text-sm font-semibold">{t('cardBrowserTitle')}</h3>
                      <form
                        className="grid gap-3"
                        onSubmit={(event) => {
                          event.preventDefault()
                          searchCards(event.currentTarget)
                        }}
                      >
                        <label className="grid gap-1 text-sm">
                          {t('cardSearchLabel')}
                          <Input
                            key={JSON.stringify([browserQuery, browserDeck])}
                            type="search"
                            name="q"
                            defaultValue={browserQuery}
                            placeholder={t('cardSearchPlaceholder')}
                            aria-describedby="card-browser-search-hint"
                          />
                        </label>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="grid min-w-0 flex-1 gap-1 text-sm">
                            {t('cardDeckFilterLabel')}
                            <select
                              className="native-select w-full"
                              name="deck"
                              value={browserDeck}
                              onChange={(event) => {
                                if (event.currentTarget.form) searchCards(event.currentTarget.form)
                              }}
                            >
                              <option value="">{t('cardDeckFilterAll')}</option>
                              {browserDeck && !browserDecks.includes(browserDeck) && (
                                <option value={browserDeck}>{browserDeck}</option>
                              )}
                              {browserDecks.map((deck) => (
                                <option value={deck} key={deck}>
                                  {deck.replace(/^Uni::/, '').replaceAll('::', ' › ')}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Button type="submit" variant="outline">
                            {t('cardSearchButton')}
                          </Button>
                          {(browserQuery || browserDeck) && (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={(event) => resetCardSearch(event.currentTarget.form)}
                            >
                              {t('cardSearchReset')}
                            </Button>
                          )}
                        </div>
                        <p id="card-browser-search-hint" className="muted-text text-sm">
                          {t('cardSearchHint')}
                        </p>
                      </form>
                      {browserLoading && !browser ? (
                        <Loading variant="rows" />
                      ) : browserError && !browser ? (
                        <Failure message={browserError} retry={reloadBrowser} />
                      ) : (
                        browser && (
                          <>
                            <p className="muted-text text-sm" role="status">
                              {t('cardSearchResultCount', { count: browser.cards.length })}
                            </p>
                            {browser.cards.length >= 200 && (
                              <p className="muted-text text-sm">{t('cardSearchLimitHint')}</p>
                            )}
                            {browser.cards.map((card) => (
                              <div className="data-row" key={card.id}>
                                <div className="flex-1">
                                  <strong>{card.front}</strong>
                                  <p className="row-subtitle">
                                    {t('cardMeta', { deck: card.deck, tags: card.tags.join(', ') })}
                                  </p>
                                  {editing === card.id && (
                                    <div className="mt-3 grid gap-2">
                                      <textarea
                                        className="native-select min-h-20 w-full"
                                        value={front}
                                        onChange={(event) => updateCardField('front', event.target.value)}
                                        aria-label={t('frontLabel')}
                                      />
                                      <textarea
                                        className="native-select min-h-20 w-full"
                                        value={back}
                                        onChange={(event) => updateCardField('back', event.target.value)}
                                        aria-label={t('backLabel')}
                                      />
                                      <Button disabled={!canWrite || busy} onClick={() => void saveCard()}>
                                        {t('saveCard')}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => openCardEditor(card)}>
                                  {t('editCard')}
                                </Button>
                              </div>
                            ))}
                            {!browser.cards.length && (
                              <Empty
                                title={t(browserQuery || browserDeck ? 'cardSearchEmptyTitle' : 'noCardsTitle')}
                                text={t(browserQuery || browserDeck ? 'cardSearchEmptyText' : 'noCardsText')}
                              />
                            )}
                          </>
                        )
                      )}
                    </div>
                  )}
                </Panel>
              </div>
            )}
            {(!focus.requested || status.mode === 'external') && (
              <div>
                <Panel
                  title={status.mode === 'integrated' ? t('manageCardsTitle') : t('setupCardsTitle')}
                  action={<BookOpenCheck size={20} />}
                >
                  <p className="muted-text mb-3">
                    {t('cardsSummary', { cards: status.cards, reviews: status.reviews, due: status.due })}
                  </p>
                  {status.mode === 'external' ? (
                    <div className="grid gap-3">
                      <p>{t('externalIntro')}</p>
                      <Button
                        className="study-start-button"
                        disabled={!canWrite || busy}
                        onClick={() => void startEmpty()}
                      >
                        {t('startWithoutExisting')}
                      </Button>
                      {!canWrite && <p className="muted-text text-sm">{t('setupUnavailable')}</p>}
                      <details className="study-import">
                        <summary>{t('importExistingSummary')}</summary>
                        <div className="grid gap-3 pt-3">
                          <p className="muted-text">{t('importExistingIntro')}</p>
                          <Input
                            aria-label={t('choosePackageAria')}
                            type="file"
                            accept=".apkg"
                            onChange={(event) => {
                              setFile(event.target.files?.[0] ?? null)
                              setPreview(null)
                            }}
                          />
                          {file && (
                            <p className="muted-text">
                              {t('selectedFile', { name: file.name, size: Math.ceil(file.size / 1024) })}
                            </p>
                          )}
                          <Button
                            variant="outline"
                            disabled={!canWrite || !file || busy}
                            onClick={() => void previewFile()}
                          >
                            {t('checkPackage')}
                          </Button>
                          {preview && (
                            <p role="status">
                              {t('previewSummary', {
                                notes: preview.notes,
                                cards: preview.cards,
                                reviews: preview.reviews,
                              })}
                            </p>
                          )}
                          <Button disabled={!canWrite || !preview || busy} onClick={() => void activate()}>
                            {t('adoptCards')}
                          </Button>
                        </div>
                      </details>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" disabled={!canWrite || busy} onClick={() => void transferApproved()}>
                        {t('transferApproved')}
                      </Button>
                      <details className="study-import">
                        <summary>{t('ankiDesktopSummary')}</summary>
                        <div className="flex flex-wrap gap-2 pt-3">
                          <Button variant="outline" disabled={!canWrite || busy} onClick={() => void exportCards()}>
                            {t('exportPackage')}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={!canWrite || busy || pending > 0}
                            onClick={() => void switchToExternal()}
                          >
                            {t('switchToExternal')}
                          </Button>
                        </div>
                      </details>
                    </div>
                  )}
                  {lastPackage && (
                    <p className="mt-3">
                      <a href={`${BASE}/packages/${lastPackage}`} className="underline" download>
                        <Download size={16} className="inline" /> {t('downloadPackage', { name: lastPackage })}
                      </a>
                    </p>
                  )}
                  {message && (
                    <p role="status" className="mt-3 text-sm">
                      {message}
                    </p>
                  )}
                  {errorMessage && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                      {errorMessage}
                    </p>
                  )}
                </Panel>
              </div>
            )}
            {!focus.requested && status.mode === 'integrated' && (
              <div>
                <Panel title={t('statsTitle')}>
                  <p className="muted-text mb-3">
                    {stats?.retention === null || stats?.retention === undefined
                      ? t('retentionInsufficient')
                      : t('retentionSummary', { percent: Math.round(stats.retention * 100) })}
                  </p>
                  <div className="mb-4 grid grid-cols-7 gap-2" role="group" aria-label={t('dailyReviewsAria')}>
                    {(stats?.daily_reviews ?? []).map((day) => (
                      <div className="grid gap-1 text-center text-xs" key={day.day}>
                        <div className="flex h-16 items-end justify-center rounded-lg bg-muted/50">
                          <div
                            className="w-4 rounded-t bg-primary"
                            style={{ height: `${Math.max(4, Math.min(100, day.count * 18))}%` }}
                          />
                        </div>
                        <span>{day.day.slice(5)}</span>
                        <strong>{day.count}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="row-list">
                    {(stats?.decks ?? []).map((deck) => (
                      <div className="data-row" key={deck.name}>
                        <span>{deck.name.replace(/^Uni::/, '').replaceAll('::', ' › ')}</span>
                        <strong>{t('deckCardCount', { count: deck.cards })}</strong>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            )}
            <p className="text-sm muted-text">
              <RotateCcw size={14} className="inline" /> {t('footerNote')}{' '}
              <Link to="/learning" className="study-footer-link">
                {t('footerLink')}
              </Link>
            </p>
          </div>
        )
      )}
    </Shell>
  )
}
