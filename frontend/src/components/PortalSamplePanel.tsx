// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { request } from '@/api'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { desktopCrawlBridge, portalCaptureCapabilities, snapshotPortalPage, type PortalName } from '@/lib/desktop'
import { chunkPages, crawlPortal } from '@/lib/portalCrawl'

const MAX_SAMPLE_PAGES = 30

type SamplePage = { kind: string; html: string }
type SampleResult = { file: string; folder: string; pages: number }

const PAGE_KINDS: Record<Exclude<PortalName, 'mail'>, string[]> = {
  mycampus: ['start', 'blog', 'news', 'timetable', 'events', 'other'],
  primuss: ['start', 'exams', 'grades', 'enrollment', 'study_program', 'other'],
}

/** Collects the pages the user opened in the portal window and stores them anonymised. */
export function PortalSamplePanel({ portal, disabled }: { portal: Exclude<PortalName, 'mail'>; disabled: boolean }) {
  const { t } = useT('setup')
  const [kind, setKind] = useState(PAGE_KINDS[portal][0])
  const [pages, setPages] = useState<SamplePage[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [crawling, setCrawling] = useState(false)
  const [progress, setProgress] = useState('')
  const cancelled = useRef(false)
  const [traversal, setTraversal] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    void portalCaptureCapabilities()
      .then((result) => {
        if (active) setTraversal(result.traversal)
      })
      .catch(() => {
        if (active) setTraversal(false)
      })
    return () => {
      active = false
    }
  }, [])

  const kindLabels: Record<string, string> = {
    start: t('sampleKindStart'),
    blog: t('sampleKindBlog'),
    news: t('sampleKindNews'),
    timetable: t('sampleKindTimetable'),
    events: t('sampleKindEvents'),
    exams: t('sampleKindExams'),
    grades: t('sampleKindGrades'),
    enrollment: t('sampleKindEnrollment'),
    study_program: t('sampleKindStudy'),
    other: t('sampleKindOther'),
  }

  async function addCurrentPage() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const snapshot = await snapshotPortalPage(portal)
      setPages((current) => [...current, { kind, html: snapshot.html }])
    } catch {
      setError(t('sampleCaptureFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function saveAll(collected: SamplePage[]): Promise<SampleResult[]> {
    const results: SampleResult[] = []
    for (const chunk of chunkPages(collected)) {
      results.push(
        await request<SampleResult>(`/api/setup/portals/${portal}/samples`, {
          method: 'POST',
          body: JSON.stringify({ pages: chunk }),
        }),
      )
    }
    return results
  }

  async function crawl() {
    setBusy(true)
    setCrawling(true)
    cancelled.current = false
    setError('')
    setMessage('')
    try {
      const result = await crawlPortal(desktopCrawlBridge(portal), {
        currentKind: kind,
        isCancelled: () => cancelled.current,
        onProgress: (item) =>
          setProgress(t('crawlProgress', { captured: item.captured, visited: item.visited, label: item.label })),
      })
      if (!result.pages.length) {
        setError(t('crawlNothing'))
        return
      }
      const saved = await saveAll(result.pages.map(({ kind, html }) => ({ kind, html })))
      const first = saved[0]
      setMessage(t('crawlSaved', { pages: result.pages.length, folder: first.folder, files: saved.length }))
    } catch {
      setError(t(traversal ? 'crawlFailed' : 'sampleCaptureFailed'))
    } finally {
      setProgress('')
      setCrawling(false)
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const result = await request<SampleResult>(`/api/setup/portals/${portal}/samples`, {
        method: 'POST',
        body: JSON.stringify({ pages }),
      })
      setPages([])
      setMessage(t('sampleSaved', { file: result.file, folder: result.folder, pages: result.pages }))
    } catch {
      setError(t('sampleSaveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="setup-fields">
      <summary>{t('sampleSummary')}</summary>
      <p className="muted-text">{t(traversal ? 'crawlIntro' : 'captureCurrentIntro')}</p>
      <div className="setup-actions">
        <Button disabled={disabled || busy || traversal === null} onClick={() => void crawl()}>
          {t(traversal ? 'crawlStart' : 'captureCurrentStart')}
        </Button>
        {crawling && (
          <Button
            variant="outline"
            onClick={() => {
              cancelled.current = true
            }}
          >
            {t('crawlCancel')}
          </Button>
        )}
      </div>
      {progress && <p role="status">{progress}</p>}
      <p className="muted-text">{t('sampleIntro')}</p>
      <div className="setup-actions">
        <select
          className="native-select"
          aria-label={t('sampleKindLabel')}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          {PAGE_KINDS[portal].map((item) => (
            <option key={item} value={item}>
              {kindLabels[item]}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={disabled || busy || pages.length >= MAX_SAMPLE_PAGES}
          onClick={() => void addCurrentPage()}
        >
          {t('sampleAddPage')}
        </Button>
        <Button disabled={disabled || busy || pages.length === 0} onClick={() => void save()}>
          {t('sampleSave')}
        </Button>
      </div>
      <p role="status">{t('sampleCount', { done: pages.length, max: MAX_SAMPLE_PAGES })}</p>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="setup-error">
          {error}
        </p>
      )}
    </details>
  )
}
