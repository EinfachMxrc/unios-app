// SPDX-License-Identifier: AGPL-3.0-or-later

import { ChevronLeft, ChevronRight, CornerDownLeft, FilePenLine, Moon, PanelsTopLeft, Search, Sun, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { MAX_READER_WIDTH, MIN_READER_WIDTH, readerPercentForWidth, readerWidthForPercent } from './readerGestures'
import { searchPosition } from './pdfSearch'
import type { useReaderSearch } from './useReaderSearch'

type ReaderSearch = ReturnType<typeof useReaderSearch>
/**
 * The zoom level as a field, like a native viewer: type a value and press
 * Enter; Escape or an invalid value keeps the current zoom.
 */
function ZoomField({ pageWidth, onZoomTo }: { pageWidth: number; onZoomTo: (width: number) => void }) {
  const { t } = useT('material')
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const width = draft === null ? null : readerWidthForPercent(draft)
    if (width !== null) onZoomTo(width)
    setDraft(null)
  }
  return (
    <span className="material-zoom-field">
      <input value={draft ?? String(readerPercentForWidth(pageWidth))} inputMode="numeric" aria-label={t('zoomLevelAria')}
        onFocus={(event) => { setDraft(event.target.value); event.target.select() }}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          else if (event.key === 'Escape') { event.stopPropagation(); setDraft(null); event.currentTarget.blur() }
        }} />
      <span aria-hidden="true">%</span>
    </span>
  )
}

/**
 * The reader bar, grouped like a native viewer: pages, zoom, notes, then the
 * search and the view menu on the right. Everything else lives behind "View".
 */
export function ReaderToolbar({
  page, pages, ready, goToPage, pageOverview, onToggleOverview, notesExpanded, onOpenNotes, search,
  pageWidth, fitWidth, onZoom, onZoomTo, onFitWidth, originalColors, onToggleColors,
}: {
  page: number
  pages: number
  ready: boolean
  goToPage: (page: number) => void
  pageOverview: boolean
  onToggleOverview: () => void
  notesExpanded: boolean
  onOpenNotes: () => void
  search: ReaderSearch
  pageWidth: number
  fitWidth: boolean
  onZoom: (direction: -1 | 1) => void
  onZoomTo: (width: number) => void
  onFitWidth: () => void
  originalColors: boolean
  onToggleColors: () => void
}) {
  const { t } = useT('material')
  const shortcut = t(/Mac|iPhone|iPad/i.test(navigator.platform) ? 'studyNotesKeysMac' : 'studyNotesKeysOther')
  return (
    <div className="material-controls">
      <div className="material-pager">
        <Button variant="ghost" size="sm" aria-label={t('pageOverview')} aria-expanded={pageOverview}
          disabled={!ready} onClick={onToggleOverview}>
          <PanelsTopLeft size={16} />
        </Button>
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)} aria-label={t('prevPageAria')}>
          <ChevronLeft size={17} />
        </Button>
        <details className="reader-page-jump" onToggle={(event) => {
          // The page number turns into a field in place, selected: click (or G), type, Enter.
          if (!event.currentTarget.open) return
          const field = event.currentTarget.querySelector('input')
          requestAnimationFrame(() => { field?.focus(); field?.select() })
        }}>
          <summary title={t('jumpShortcutHint')}><span>{t('pageOfTotal', { page, total: pages || '…' })}</span></summary>
          <form onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            // Escape leaves the field and returns to the page number, without closing dialogs behind it.
            event.stopPropagation()
            const details = event.currentTarget.closest('details')
            details?.removeAttribute('open')
            details?.querySelector('summary')?.focus()
          }} onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            event.currentTarget.closest('details')?.removeAttribute('open')
          }} onSubmit={event => {
            event.preventDefault()
            const next = Number(new FormData(event.currentTarget).get('page'))
            if (!Number.isSafeInteger(next) || next < 1 || next > pages) return
            // Close the field first: the bar is taller while it is open, and the jump
            // must measure against the bar the reader will actually see.
            event.currentTarget.closest('details')?.removeAttribute('open')
            requestAnimationFrame(() => goToPage(next))
          }}>
            <span aria-hidden="true">{t('pagePrefix')}</span>
            <input key={page} type="number" name="page" aria-label={t('jumpToPage')}
              min={1} max={pages || 1} defaultValue={page} required />
            <span aria-hidden="true">{t('pageSuffix', { total: pages || '…' })}</span>
            <Button type="submit" variant="ghost" size="sm" aria-label={t('jumpButton')} title={t('jumpButton')}>
              <CornerDownLeft size={14} aria-hidden="true" />
            </Button>
          </form>
        </details>
        <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => goToPage(page + 1)} aria-label={t('nextPageAria')}>
          <ChevronRight size={17} />
        </Button>
      </div>
      <span className="reader-toolbar-separator" aria-hidden="true" />
      <div className="material-zoom" role="group" aria-label={t('zoomGroupAria')}>
        <Button variant="ghost" size="sm" aria-label={t('zoomOutAria')} disabled={pageWidth <= MIN_READER_WIDTH} onClick={() => onZoom(-1)}>
          <ZoomOut size={16} />
        </Button>
        <ZoomField key={fitWidth ? 'fit' : 'manual'} pageWidth={pageWidth} onZoomTo={onZoomTo} />
        <Button variant="ghost" size="sm" aria-label={t('zoomInAria')} disabled={pageWidth >= MAX_READER_WIDTH} onClick={() => onZoom(1)}>
          <ZoomIn size={16} />
        </Button>
      </div>
      <span className="reader-toolbar-separator" aria-hidden="true" />
      <Button className="reader-notes-toggle" variant="ghost" size="sm"
        aria-label={t('studyNotesTab')} aria-keyshortcuts="Control+Shift+B Meta+Shift+B"
        title={t('studyNotesShortcut', { keys: shortcut })}
        aria-expanded={notesExpanded} onClick={onOpenNotes}>
        <FilePenLine size={16} aria-hidden="true" /><span>{t('studyNotesTab')}</span>
      </Button>
      <form className="material-search" onSubmit={(event) => void search.search(event)} role="search">
        <label className="sr-only" htmlFor="material-search-input">{t('searchInDocLabel')}</label>
        <div className="material-search-controls">
          <input id="material-search-input" type="search" value={search.input} maxLength={120}
            placeholder={t('searchPlaceholder')} onChange={(event) => search.setInput(event.target.value)}
            onKeyDown={(event) => {
              // After a search, Enter walks the hit pages (Shift+Enter backwards) instead of searching again.
              if (event.key !== 'Enter' || !search.results.length || search.input.trim() !== search.searchedTerm) return
              event.preventDefault()
              search.move(event.shiftKey ? -1 : 1)
            }} />
          {search.searchedTerm && search.results.length > 0 && <SearchCounter search={search} page={page} />}
          <Button type="submit" variant="ghost" size="sm" className="material-search-submit" aria-label={t('searchButton')}
            title={t('searchButton')} disabled={!ready || search.input.trim().length < 2}>
            <Search size={16} aria-hidden="true" />
          </Button>
          {search.searchedTerm && (
            <Button type="button" variant="ghost" size="sm" onClick={search.clear} aria-label={t('clearSearchAria')}>
              <X size={16} />
            </Button>
          )}
        </div>
      </form>
      <details className="material-view-options">
        <summary>{t('viewSummary')}</summary>
        <div>
          <Button variant="ghost" size="sm" aria-pressed={fitWidth} onClick={onFitWidth}>{t('fitToWidthButton')}</Button>
          <Button className="material-color-toggle" variant="ghost" size="sm" aria-pressed={originalColors} onClick={onToggleColors}>
            {originalColors ? <Moon size={16} /> : <Sun size={16} />}
            {originalColors ? t('darkPagesButton') : t('originalColorsButton')}
          </Button>
          <p className="reader-gesture-hint">{t('gestureHint')}</p>
        </div>
      </details>
    </div>
  )
}

/** "2 / 5" hit pages inside the field; the title spells out the pages and all hits. */
function SearchCounter({ search, page }: { search: ReaderSearch; page: number }) {
  const { t } = useT('material')
  const position = searchPosition(search.results, page)
  return (
    <span className="material-search-count" title={t('searchPositionTitle', { index: position.index ?? '–', pages: position.pages, hits: position.hits })}>
      {position.index ?? '–'}/{position.pages}
    </span>
  )
}

/** Live progress and outcome of the document search, announced politely. */
export function ReaderSearchFeedback({ search, total }: { search: ReaderSearch; total: number }) {
  const { t } = useT('material')
  return (
    <div className="material-search-feedback" role="status">
      {search.status === 'searching' && t('searchingProgress', { progress: search.progress, total })}
      {search.status === 'error' && t('searchFailed')}
      {search.status === 'done' && (search.results.length
        ? t('searchResultsSummary', {
          count: search.results.reduce((sum, result) => sum + result.count, 0),
          pages: search.results.length,
          term: search.searchedTerm,
        })
        : t('searchNoResults', { term: search.searchedTerm }))}
    </div>
  )
}

/** Previous/next hit, with the number of hits on the current page. */
export function ReaderSearchNavigation({ search, page }: { search: ReaderSearch; page: number }) {
  const { t } = useT('material')
  if (!search.results.length) return null
  return (
    <div className="material-search-navigation">
      <Button type="button" variant="outline" size="sm" onClick={() => search.move(-1)} aria-label={t('prevResultAria')}>
        <ChevronLeft size={16} />
      </Button>
      <span>{t('resultPageSummary', { page, count: search.results.find((result) => result.page === page)?.count ?? 0 })}</span>
      <Button type="button" variant="outline" size="sm" onClick={() => search.move(1)} aria-label={t('nextResultAria')}>
        <ChevronRight size={16} />
      </Button>
    </div>
  )
}
