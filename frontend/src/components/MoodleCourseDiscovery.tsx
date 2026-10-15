// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { Search } from 'lucide-react'
import { notifySyncCompleted, request } from '@/api'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

type Hit = { id: number; name: string; description: string; category: string; enrolled: boolean; url: string }
type Results = { available: boolean; courses: Hit[]; total: number; page: number; search_url: string }
type Options = {
  available: boolean
  methods: Array<{ id: number; name: string; available: boolean; key_required: boolean }>
  url: string
}

export function MoodleCourseDiscovery() {
  const { t } = useT('courses')
  const canWrite = useWritableHost()
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const [selected, setSelected] = useState<Hit | null>(null)
  const [options, setOptions] = useState<Options | null>(null)
  const [method, setMethod] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const suggestedKey = selected?.description.match(
    /(?:Einschreib(?:ungs?|e)?schlüssel|Einschreibekey)\s*[:=]\s*[„"']?([^\s„“"'<>]{2,100})/i,
  )?.[1]
  async function search(page = 0) {
    setBusy(true)
    setError('')
    setMessage('')
    setSelected(null)
    setKey('')
    setOptions(null)
    const text = page === 0 ? query.trim() : searched
    try {
      setResults(await request<Results>(`/api/moodle/courses/search?q=${encodeURIComponent(text)}&page=${page}`))
      setSearched(text)
    } catch (cause) {
      setError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  async function choose(course: Hit) {
    setSelected(course)
    setKey('')
    setOptions(null)
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const response = await request<Options>(`/api/moodle/courses/${course.id}/enrolment`)
      setOptions(response)
      setMethod(String(response.methods.find((item) => item.available)?.id ?? ''))
    } catch (cause) {
      setError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  async function enrol() {
    if (!selected) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await request<{ enrolled: boolean; sync_status: string }>(
        `/api/moodle/courses/${selected.id}/enrolment`,
        {
          method: 'POST',
          body: JSON.stringify({ instance_id: Number(method), key, confirmed: true }),
        },
      )
      if (!response.enrolled) throw new Error(t('enrolNotConfirmed'))
      setResults(
        (current) =>
          current && {
            ...current,
            courses: current.courses.map((item) => (item.id === selected.id ? { ...item, enrolled: true } : item)),
          },
      )
      setKey('')
      setSelected(null)
      setOptions(null)
      setMessage(response.sync_status === 'success' ? t('enrolSuccess') : t('enrolRefreshNeeded'))
      notifySyncCompleted()
    } catch (cause) {
      setError(extractApiErrorMessage(cause))
      setKey('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mt-6 border-t border-border pt-5" aria-label={t('findMoodleCourses')}>
      <h2>{t('findMoodleCourses')}</h2>
      <p className="muted-text mb-3">{t('discoveryIntro')}</p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <Input
          className="min-w-0 flex-1"
          aria-label={t('searchMoodleLabel')}
          placeholder={t('searchMoodlePlaceholder')}
          value={query}
          maxLength={120}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button variant="outline" disabled={busy || query.trim().length < 2} type="submit">
          <Search size={15} />
          {t('searchMoodle')}
        </Button>
      </form>
      {busy && (
        <p role="status" className="muted-text mt-3">
          {t('discoveryBusy')}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3">
          {message}
        </p>
      )}
      {results && (
        <div className="mt-4">
          {!results.available ? (
            <p>
              {t('searchUnavailable')}{' '}
              <a className="subtle-link" href={results.search_url} target="_blank" rel="noopener noreferrer">
                {t('searchOnMoodle')}
              </a>
            </p>
          ) : !results.courses.length ? (
            <p className="muted-text">{t('noMoodleMatches')}</p>
          ) : (
            results.courses.map((course) => (
              <article key={course.id} className="border-b border-border py-4">
                <h3>{course.name}</h3>
                <p className="muted-text">{course.category}</p>
                <p className="whitespace-pre-wrap mt-2">{course.description || t('noCourseDescription')}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {course.enrolled ? (
                    <span>{t('alreadyEnrolled')}</span>
                  ) : (
                    <Button variant="outline" disabled={busy} onClick={() => void choose(course)}>
                      {t('viewEnrolment')}
                    </Button>
                  )}
                  <a className="subtle-link" href={course.url} target="_blank" rel="noopener noreferrer">
                    {t('openOnMoodle')}
                  </a>
                </div>
                {selected?.id === course.id && options && (
                  <div className="mt-4 rounded-lg border border-border p-4">
                    {!options.available || !options.methods.some((item) => item.available) ? (
                      <p>
                        {t('enrolOnMoodleHint')}{' '}
                        <a className="subtle-link" href={options.url} target="_blank" rel="noopener noreferrer">
                          {t('openOnMoodle')}
                        </a>
                      </p>
                    ) : (
                      <>
                        <h4>{t('enrolConfirmTitle', { name: course.name })}</h4>
                        <label className="block mt-3">
                          {t('enrolMethod')}
                          <select
                            className="native-select mt-1 w-full"
                            value={method}
                            onChange={(event) => {
                              setMethod(event.target.value)
                              setKey('')
                            }}
                            disabled={busy}
                          >
                            {options.methods
                              .filter((item) => item.available)
                              .map((item) => (
                                <option value={item.id} key={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        {options.methods.find((item) => String(item.id) === method)?.key_required && (
                          <div className="mt-3">
                            <label className="block">
                              {t('enrolKey')}
                              <Input
                                className="mt-1"
                                type="password"
                                autoComplete="off"
                                value={key}
                                maxLength={256}
                                disabled={busy}
                                onChange={(event) => setKey(event.target.value)}
                              />
                            </label>
                            {suggestedKey && (
                              <Button variant="ghost" disabled={busy} onClick={() => setKey(suggestedKey)}>
                                {t('useDescriptionKey')}
                              </Button>
                            )}
                          </div>
                        )}
                        <p className="muted-text mt-3">{t('enrolConfirmHint')}</p>
                        <div className="mt-3 flex gap-2">
                          <Button
                            disabled={
                              busy ||
                              !canWrite ||
                              !method ||
                              (options.methods.find((item) => String(item.id) === method)?.key_required && !key)
                            }
                            onClick={() => void enrol()}
                          >
                            {t('enrolNow')}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setSelected(null)
                              setOptions(null)
                              setKey('')
                            }}
                          >
                            {t('cancelEnrol')}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </article>
            ))
          )}
          {results.available && results.total > 20 && (
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                disabled={busy || results.page === 0}
                onClick={() => void search(results.page - 1)}
              >
                {t('previousSearchPage')}
              </Button>
              <Button
                variant="outline"
                disabled={busy || (results.page + 1) * 20 >= results.total}
                onClick={() => void search(results.page + 1)}
              >
                {t('nextSearchPage')}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
