// SPDX-License-Identifier: AGPL-3.0-or-later

import './CommandPalette.css'

import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { ArrowRight, Clock3, FilePlus2, ListPlus, RefreshCw, Search as SearchIcon, type LucideIcon } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { activeIntlLocale, request, useApi } from '@/api'
import type { CoursesResponse, SystemResponse } from '@/types'
import { areaForPath, sidebarCatalog } from '@/components/sidebarCatalog'
import { clearRecentObjects, useRecentObjects } from '@/lib/recentObjects'
import { useWorkspaceState } from '@/lib/workspaceState'
import { beginNewFreeNote } from '@/lib/sourceNoteSave'
import { HostContext } from '@/hooks/host'
import { JotCapture } from '@/components/JotCapture'
import { useMoodleRefresh } from '@/hooks/useMoodleRefresh'
import { useHostOnline } from '@/hostAvailability'
import { matchesMensa } from '@/lib/mensa'
import { matchesRooms } from '@/lib/rooms'
import { usePreferences } from '@/preferences'
import { RegistryActions } from '@/components/RegistryActions'
import { selectCommandPaletteHits } from './commandPaletteHits'
import { useCommandPaletteSearch } from './useCommandPaletteSearch'
import {
  EnterHint,
  HIT_FILTERS,
  HIT_ICONS,
  HitFilters,
  Highlighted,
  KEYS,
  PaletteFooter,
  type HitFilter,
} from './CommandPaletteParts'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
const NEW_TASK = '/deadlines?new=task#tasks'

/**
 * Cmd/Ctrl+K: one field to open any page, find a PDF passage or note, run an
 * action, or capture a thought without leaving the current page.
 */
export function CommandPalette() {
  const navigate = useNavigate()
  const host = useContext(HostContext)
  const online = useHostOnline()
  const preferences = usePreferences()
  const recent = useRecentObjects().filter((item) => {
    const area = areaForPath(item.to.split('?')[0])
    return area && (!area.module || preferences.modules[area.module])
  })
  const { t } = useT('commandPalette')
  const { t: tShell } = useT('shell')
  const { t: tMore } = useT('more')
  const { t: tNav } = useT('nav')
  const triggerText = t(preferences.modules.search ? 'triggerText' : 'navigationText')
  const shortcutHint = t(/Mac|iPhone|iPad/i.test(navigator.platform) ? 'shortcutHintMac' : 'shortcutHintOther')
  const captureShortcut = t(/Mac|iPhone|iPad/i.test(navigator.platform) ? 'captureShortcutMac' : 'captureShortcutOther')
  const [open, setOpen] = useWorkspaceState('palette:open', false, { persist: false })
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [backupConfirm, setBackupConfirm] = useState(false)
  const { data: courses } = useApi<CoursesResponse>('/api/courses')
  const [query, setQuery] = useState('')
  const [system, setSystem] = useState<SystemResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [kindFilter, setKindFilter] = useState<HitFilter | null>(null)
  const [courseFilter, setCourseFilter] = useState('')
  const search = useCommandPaletteSearch(query, preferences.modules.search && open && online)
  const hits = search?.results
    ? selectCommandPaletteHits(search.results, {
        kinds: kindFilter ? HIT_FILTERS[kindFilter] : undefined,
        course: courseFilter || null,
      })
    : []
  // Ctrl/Cmd+Alt+N opens the palette straight in the capture field and leaves the current page as it is.
  const [captureFirst, setCaptureFirst] = useState(false)
  useEffect(() => {
    // Also covers closing through the shortcut or a command, which bypasses onOpenChange.
    if (!open) setCaptureFirst(false)
  }, [open])
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
      // event.code, because Option+N on a Mac types a dead key instead of "n".
      // Windows reports AltGr as Ctrl+Alt; a layout that types another character there keeps it.
      const typesN = event.metaKey || event.key.toLowerCase() === 'n'
      if ((event.metaKey || event.ctrlKey) && event.altKey && !event.shiftKey && event.code === 'KeyN' && typesN) {
        event.preventDefault()
        setCaptureFirst(true)
        setOpen(true)
      }
    }
    const actions = () => {
      setOpen(true)
      setActionsOpen(true)
    }
    const openSearch = () => setOpen(true)
    window.addEventListener('unios:open-search', openSearch)
    window.addEventListener('unios:actions', actions)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('unios:open-search', openSearch)
      window.removeEventListener('unios:actions', actions)
    }
  }, [setOpen])
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setQuery('')
    setKindFilter(null)
    setCourseFilter('')
    setMessage('')
    setSyncRequested(false)
    setSystem(null)
    setLoading(true)
    request<SystemResponse>('/api/system', { signal: controller.signal })
      .then(setSystem)
      .catch((cause) => {
        if (!controller.signal.aborted) setMessage(extractApiErrorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [open])
  const commands: { label: string; to: string; icon?: LucideIcon }[] = [
    ...sidebarCatalog(preferences, tNav, tShell, tMore).map((item) => ({
      label: item.label,
      to: item.to,
      icon: item.icon,
    })),
    ...(preferences.modules.courses ? [{ label: t('dueCards'), to: '/study' }] : []),
    { label: t('openQuestions'), to: '/collections?preset=questions' },
    { label: t('entityActions'), to: 'actions' },
    { label: t('backup'), to: 'backup' },
    ...(preferences.modules.courses ? (courses?.courses ?? []) : []).map((item) => ({
      label: item.name,
      to: `/courses/${item.id}`,
    })),
    { label: t('syncData'), to: 'sync' },
  ]
  const create: typeof commands = [
    { label: t('newNote'), to: '/notes?new=1', icon: FilePlus2 },
    ...(preferences.modules.deadlines ? [{ label: t('newTask'), to: NEW_TASK, icon: ListPlus }] : []),
  ]
  const matching = (label: string) =>
    label.toLocaleLowerCase(activeIntlLocale()).includes(query.toLocaleLowerCase(activeIntlLocale()))
  const creating = create.filter((item) => matching(item.label))
  const destinations = commands.filter(
    (item) =>
      (item.to === '/mensa' && matchesMensa(query)) ||
      (item.to === '/rooms' && matchesRooms(query)) ||
      matching(item.label),
  )
  // Keyboard order and Enter follow what is on screen: creating comes first.
  const visible = [...creating, ...destinations]
  const sync = useMoodleRefresh()
  const [syncRequested, setSyncRequested] = useState(false)
  useEffect(() => {
    if (syncRequested && sync.result)
      setMessage(sync.result === 'success' ? t('syncSuccess') : t('syncFinishedCheckStatus'))
  }, [syncRequested, sync.result, t])
  const canSync = online && host?.mode === 'host' && system?.moodle_configured && !sync.busy
  function runCommand(to: string) {
    if (to === 'actions') {
      setActionsOpen(true)
      return
    }
    if (to === 'backup') {
      setBackupConfirm(true)
      return
    }
    if (to !== 'sync') {
      setOpen(false)
      if (/^https:\/\//.test(to)) {
        window.open(to, '_blank', 'noopener,noreferrer')
        return
      }
      if (to === '/notes?new=1') beginNewFreeNote()
      navigate(to)
      return
    }
    if (!canSync) return
    setMessage('')
    setSyncRequested(true)
    sync.refresh()
  }
  function runSearch() {
    const value = query.trim()
    if (!value || !preferences.modules.search) return
    setOpen(false)
    navigate(`/search?q=${encodeURIComponent(value)}`)
  }
  const typed = query.trim()
  const exactCommand = visible.find(
    (item) => item.label.toLocaleLowerCase(activeIntlLocale()) === typed.toLocaleLowerCase(activeIntlLocale()),
  )
  // Same order as the Enter handler: an exact command, else a full search, else the first command.
  const enterTarget = exactCommand?.to ?? (typed && preferences.modules.search ? 'search' : visible[0]?.to)
  const status = message || (loading ? t('checkingConnection') : !system ? t('connectionUnknown') : '')
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="outline" className="top-search-trigger" title={t('openButtonTitle')}>
          <SearchIcon size={17} aria-hidden="true" /> <span>{triggerText}</span> <kbd>{shortcutHint}</kbd>{' '}
          <span className="sr-only">{t('openButtonLabel')}</span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="command-overlay" />
        <Dialog.Content
          className="command-dialog"
          aria-describedby="command-description"
          onOpenAutoFocus={(event) => {
            returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
            event.preventDefault()
            // The capture field takes over once it is ready; on a read-only device it
            // never is, so the search field holds the focus until then.
            inputRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected && returnFocus.current.getClientRects().length > 0) {
              event.preventDefault()
              returnFocus.current.focus({ preventScroll: true })
            }
          }}
          onKeyDown={(event) => {
            if (
              !['ArrowDown', 'ArrowUp'].includes(event.key) ||
              (event.target instanceof Element && event.target.closest('select,textarea'))
            )
              return
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>('.command-list .command-item:not(:disabled)'),
            ]
            if (!buttons.length) return
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
            const next =
              index < 0 ? 0 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            event.preventDefault()
            buttons[next].focus()
          }}
        >
          <Dialog.Title className="sr-only">{t('title')}</Dialog.Title>
          <Dialog.Description id="command-description" className="sr-only">
            {t('description')}
          </Dialog.Description>
          <div className="command-search">
            <SearchIcon size={20} aria-hidden="true" />
            <input
              ref={inputRef}
              className="command-input"
              aria-label={t('inputLabel')}
              placeholder={t('inputPlaceholder')}
              maxLength={400}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  if (exactCommand) runCommand(exactCommand.to)
                  else if (typed) runSearch()
                  else if (visible[0]) runCommand(visible[0].to)
                }
              }}
            />
            <Dialog.Close asChild>
              <button type="button" className="command-close" aria-label={t('closeLabel')}>
                {KEYS.escape}
              </button>
            </Dialog.Close>
          </div>
          <div className="command-list" aria-label={t('commandsLabel')}>
            {!typed && recent.length > 0 && (
              <section aria-label={t('recentObjects')}>
                <div className="command-recent-heading">
                  <p className="command-section-label">{t('recentObjects')}</p>
                  <button type="button" className="command-clear" onClick={clearRecentObjects}>
                    {t('clearRecent')}
                  </button>
                </div>
                {recent.slice(0, 5).map((item) => (
                  <button type="button" key={item.to} className="command-item" onClick={() => runCommand(item.to)}>
                    <Clock3 size={16} aria-hidden="true" />
                    <span className="command-label">{item.title}</span>
                  </button>
                ))}
              </section>
            )}
            {preferences.modules.search && typed.length >= 2 && (
              <div className="command-results" aria-label={t('resultsLabel')}>
                <p className="command-section-label">
                  {t('contentLabel')} {search?.searching ? t('searching') : ''}
                </p>
                <HitFilters
                  kind={kindFilter}
                  onKind={setKindFilter}
                  course={courseFilter}
                  onCourse={setCourseFilter}
                  courses={preferences.modules.courses ? (courses?.courses ?? []).map((item) => item.name) : []}
                />
                {search?.error && (
                  <p role="alert" className="command-empty">
                    {t('searchFailed', { error: search.error })}
                  </p>
                )}
                {hits.map((item) => {
                  const Icon = HIT_ICONS[item.kind]
                  return (
                    <button
                      type="button"
                      key={item.key}
                      className="command-item command-hit"
                      onClick={() => void runCommand(item.to)}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span className="command-label">
                        <strong>
                          <Highlighted text={item.label} query={typed} />
                        </strong>
                        <small>
                          <Highlighted
                            query={typed}
                            text={t(item.detailKey, {
                              course: item.course ?? t('withoutCourse'),
                              page: item.page,
                              excerpt: item.excerpt,
                            })}
                          />
                        </small>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {preferences.modules.search && typed && (
              <button type="button" className="command-item" onClick={runSearch}>
                <SearchIcon size={16} aria-hidden="true" />
                <span className="command-label">{t('searchAllFor', { query: typed })}</span>
                {enterTarget === 'search' && <EnterHint />}
              </button>
            )}
            {(
              [
                [t('createLabel'), creating],
                [t('commandsLabel'), destinations],
              ] as const
            ).map(([heading, items]) =>
              items.length ? (
                <section key={heading} aria-label={heading}>
                  <p className="command-section-label">{heading}</p>
                  {items.map((item) => {
                    const Icon = item.to === 'sync' ? RefreshCw : (item.icon ?? ArrowRight)
                    return (
                      <button
                        type="button"
                        key={item.to}
                        className="command-item"
                        disabled={item.to === 'sync' && !canSync}
                        onClick={() => void runCommand(item.to)}
                      >
                        <Icon
                          size={16}
                          aria-hidden="true"
                          className={item.to === 'sync' && sync.busy ? 'animate-spin' : ''}
                        />
                        <span className="command-label">
                          <Highlighted text={item.label} query={typed} />
                        </span>
                        {enterTarget === item.to && <EnterHint />}
                      </button>
                    )
                  })}
                </section>
              ) : null,
            )}
            {!visible.length && !hits.length && <p className="command-empty">{t('noMatchingCommand')}</p>}
          </div>
          {actionsOpen && (
            <div className="command-panel">
              <RegistryActions />
            </div>
          )}
          {backupConfirm && (
            <section className="command-panel">
              <p>{t('backupConfirm')}</p>
              <Button
                disabled={!online || host?.mode !== 'host'}
                onClick={() => {
                  void request('/api/jobs', {
                    method: 'POST',
                    body: JSON.stringify({ kind: 'backup', confirmed: true }),
                  })
                    .then(() => {
                      setOpen(false)
                      setBackupConfirm(false)
                      navigate('/jobs')
                    })
                    .catch((error) => setMessage(extractApiErrorMessage(error)))
                }}
              >
                {t('runAction')}
              </Button>
              <Button variant="ghost" onClick={() => setBackupConfirm(false)}>
                {t('closeLabel')}
              </Button>
            </section>
          )}
          <div className="command-capture">
            <p className="command-section-label">
              {t('quickCapture')} <kbd>{captureShortcut}</kbd>
            </p>
            <JotCapture compact autoFocus={captureFirst} />
          </div>
          <PaletteFooter status={status} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
