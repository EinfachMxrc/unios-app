// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'
import { request } from '@/api'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { useCampusImport } from '@/hooks/useCampusImport'

type Program = { name: string; url: string; faculty: string; degree: string }
/** Choose the study programme and read everything myCampus offers for it. */
export function CampusImportPanel({ disabled, onProgramChosen }: { disabled: boolean; onProgramChosen?: () => void }) {
  const { t } = useT('campus')
  const [programs, setPrograms] = useState<Program[] | null>(null)
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<Program | null>(null)
  const { status, starting, start } = useCampusImport()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  // The first-run setup is shown before the router exists; a router link would crash there.
  const inRouter = useInRouterContext()

  useEffect(() => {
    void request<{ name: string; url: string } | null>('/api/mycampus/program')
      .then((saved) => saved && setChosen({ ...saved, faculty: '', degree: '' }))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (disabled || programs) return
    void request<Program[]>('/api/mycampus/programs')
      .then(setPrograms)
      .catch(() => setError(t('programsFailed')))
  }, [disabled, programs, t])

  async function loadPrograms() {
    setError('')
    try {
      setPrograms(await request<Program[]>('/api/mycampus/programs'))
    } catch {
      setError(t('programsFailed'))
    }
  }

  async function choose(url: string) {
    const program = programs?.find((item) => item.url === url)
    if (!program) return
    setError('')
    try {
      await request('/api/mycampus/program', {
        method: 'POST',
        body: JSON.stringify({ name: program.name, url: program.url }),
      })
      setChosen(program)
      setMessage(t('programSaved', { name: program.name }))
      onProgramChosen?.()
    } catch {
      setError(t('programSaveFailed'))
      return
    }
    await startImport()
  }

  async function startImport() {
    setError('')
    setMessage('')
    try {
      await start()
    } catch {
      setError(t('importFailed'))
    }
  }

  const matching = (programs ?? []).filter((item) =>
    `${item.name} ${item.faculty} ${item.degree}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  const report = status?.report
  return (
    <details className="setup-fields" open={!disabled || (status && status.state !== 'idle') || chosen !== null}>
      <summary>{t('importTitle')}</summary>
      <p className="muted-text">{t('importIntro')}</p>
      <div className="setup-actions">
        <Button variant="outline" disabled={disabled} onClick={() => void loadPrograms()}>
          {t('loadPrograms')}
        </Button>
      </div>
      {programs && (
        <>
          <p className="muted-text">{t('programCount', { count: programs.length })}</p>
          <label htmlFor="campus-program-search">{t('programLabel')}</label>
          <input
            id="campus-program-search"
            type="search"
            value={query}
            placeholder={t('programPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="campus-program-list" role="listbox" aria-label={t('programLabel')}>
            {matching.slice(0, 40).map((item) => (
              <button
                key={item.url}
                type="button"
                role="option"
                aria-selected={item.url === chosen?.url}
                className="campus-program-option"
                disabled={disabled || starting || status?.state === 'running'}
                onClick={() => void choose(item.url)}
              >
                <strong>{item.name}</strong>
                <span>{[item.faculty, item.degree].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
          {matching.length > 40 && <p className="muted-text">{t('programNarrowSearch')}</p>}
        </>
      )}
      {!programs && chosen && <p role="status">{t('programSaved', { name: chosen.name })}</p>}
      {message && <p role="status">{message}</p>}
      <div className="setup-actions">
        <Button
          disabled={disabled || !chosen || starting || status?.state === 'running'}
          onClick={() => void startImport()}
        >
          {t('importStart')}
        </Button>
      </div>
      {status?.state === 'done' && report && (
        <>
          <p role="status">
            {t('importDone', {
              events: report.events,
              news: report.news,
              documents: report.documents,
              files: report.files_stored,
              fresh: report.new_items,
            })}
          </p>
          {report.warnings.length > 0 && (
            <p className="muted-text">{t('importWarnings', { warnings: report.warnings.length })}</p>
          )}
          {inRouter ? (
            <Link className="subtle-link" to="/campus">
              {t('importOpenResults')}
            </Link>
          ) : (
            <a className="subtle-link" href="/campus">
              {t('importOpenResults')}
            </a>
          )}
        </>
      )}
      {(status?.state === 'error' || error) && (
        <p role="alert" className="setup-error">
          {error || status?.message || t('importFailed')}
        </p>
      )}
    </details>
  )
}
