// SPDX-License-Identifier: AGPL-3.0-or-later

import { useWorkspaceState } from '@/lib/workspaceState'
import { useMemo } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { matchesMensa } from '@/lib/mensa'
import { matchesRooms } from '@/lib/rooms'
import { useT } from '@/i18n/useT'
import {
  ArrowRight,
  FileText,
  Lightbulb,
  Link2,
  MessageSquareText,
  NotebookPen,
  Search as SearchIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { request, useApi } from '@/api'
import type { SearchResponse } from '@/types'
import { useHostOnline } from '@/hostAvailability'
import { searchOffline } from '@/offlineSearch'
import type { OfflineSearchIndex } from '@/offlineSearch'
import { Shell } from '@/components/Shell'
import { Loading, Failure, Empty, Panel, ListRows } from '@/components/State'
import { FormField } from '@/components/FormField'
import { SearchHighlight } from '@/components/SearchHighlight'
import { StudyPeekLink } from '@/components/StudyPeekLink'

export function SearchPage() {
  const { t } = useT('search')
  const { t: quality } = useT('quality')
  const { t: tMensa } = useT('mensa')
  const { t: tRooms } = useT('rooms')
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useWorkspaceState(`search:${params.toString()}:input`, params.get('q') ?? '')
  const q = params.get('q') ?? ''
  const courseId = params.get('course_id') ?? ''
  const semesterId = params.get('semester_id') ?? ''
  const kind = params.get('type') ?? ''
  const online = useHostOnline()
  const { data, error, loading, updatedAt } = useApi<SearchResponse>(`/api/search?${params.toString()}`)
  const offlineIndex = useQuery<OfflineSearchIndex, Error>({
    queryKey: ['api', '/api/search/offline-index'],
    queryFn: () => request<OfflineSearchIndex>('/api/search/offline-index'),
    enabled: online,
    networkMode: 'always',
    staleTime: 15 * 60 * 1000,
    meta: { offlineCache: true },
  })
  const offline = !online
  const offlineResult = useMemo(
    () => (offlineIndex.data ? searchOffline(offlineIndex.data, q, courseId, semesterId, kind) : null),
    [offlineIndex.data, q, courseId, semesterId, kind],
  )
  const documents = !kind || kind === 'document' ? (data?.results ?? []) : []
  const announcements = !kind || kind === 'announcement' ? (data?.announcement_results ?? []) : []
  const annotations = !kind || kind === 'annotation' ? (data?.annotation_results ?? []) : []
  const courseNotes = !kind || kind === 'course_note' ? (data?.course_note_results ?? []) : []
  const notes = !kind || kind === 'note' ? (data?.note_results ?? []) : []
  const jots = !kind || kind === 'jot' ? (data?.jot_results ?? []) : []
  const clips = !kind || kind === 'clip' ? (data?.clip_results ?? []) : []
  const resultCount =
    documents.length +
    announcements.length +
    annotations.length +
    courseNotes.length +
    notes.length +
    jots.length +
    clips.length
  const courseOptions =
    data?.courses ??
    Array.from(
      new Map(
        (offlineIndex.data?.items ?? [])
          .filter((item) => item.course_id !== null)
          .map((item) => [item.course_id, item.course_name]),
      ).entries(),
      ([id, name]) => ({ id, name }),
    )
  const semesterOptions =
    data?.semesters ??
    Array.from(
      new Map(
        (offlineIndex.data?.items ?? [])
          .filter((item) => item.semester_id !== null)
          .map((item) => [item.semester_id, item.semester_name]),
      ).entries(),
      ([id, name]) => ({ id, name }),
    )
  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    updateParam('q', query.trim())
  }
  return (
    <Shell title={t('title')} eyebrow={t('eyebrow')} cachedAt={offline ? offlineIndex.dataUpdatedAt : updatedAt}>
      <Panel title={t('panelTitle')}>
        <p className="muted-text">{t('operatorsHint')}</p>
        <form onSubmit={submit} className="search-form">
          <FormField label={t('queryLabel')}>
            {(control) => (
              <div className="search-input-wrap">
                <SearchIcon size={17} />
                <Input
                  {...control}
                  aria-label={t('queryLabel')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('queryPlaceholder')}
                  maxLength={400}
                />
              </div>
            )}
          </FormField>
          <FormField label={t('filterCourseLabel')}>
            {(control) => (
              <select
                {...control}
                className="native-select"
                aria-label={t('filterCourseLabel')}
                value={courseId}
                onChange={(event) => updateParam('course_id', event.target.value)}
              >
                <option value="">{t('allCourses')}</option>
                {courseOptions.map((item) => (
                  <option key={item.id} value={item.id ?? ''}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label={t('filterSemesterLabel')}>
            {(control) => (
              <select
                {...control}
                className="native-select"
                aria-label={t('filterSemesterLabel')}
                value={semesterId}
                onChange={(event) => updateParam('semester_id', event.target.value)}
              >
                <option value="">{t('allSemesters')}</option>
                {semesterOptions.map((item) => (
                  <option key={item.id} value={item.id ?? ''}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label={t('filterTypeLabel')}>
            {(control) => (
              <select
                {...control}
                className="native-select"
                aria-label={t('filterTypeLabel')}
                value={kind}
                onChange={(event) => updateParam('type', event.target.value)}
              >
                <option value="">{t('allTypes')}</option>
                <option value="document">{t('typeDocument')}</option>
                <option value="annotation">{t('typeAnnotation')}</option>
                <option value="announcement">{t('typeAnnouncement')}</option>
                <option value="course_note">{t('typeCourseNote')}</option>
                <option value="note">{t('typeNote')}</option>
                <option value="jot">{t('typeJot')}</option>
                <option value="clip">{t('typeClip')}</option>
              </select>
            )}
          </FormField>
          <Button type="submit">{t('submit')}</Button>
        </form>
        {online && (
          <p className="muted-text mt-3" role="status">
            {offlineIndex.data
              ? t('offlineSearchable')
              : offlineIndex.isFetching
                ? t('preparingOfflineSearch')
                : t('offlineSearchUnavailable')}
          </p>
        )}
      </Panel>
      {matchesMensa(q) && (
        <Panel title={tMensa('areas')}>
          <Link className="more-row" to="/mensa">
            {tMensa('title')} →
          </Link>
        </Panel>
      )}
      {matchesRooms(q) && (
        <Panel title={tMensa('areas')}>
          <Link className="more-row" to="/rooms">
            {tRooms('title')} →
          </Link>
        </Panel>
      )}
      {offline ? (
        !offlineIndex.data ? (
          <Empty icon={SearchIcon} title={t('offlineNotReadyTitle')} text={t('offlineNotReadyText')} />
        ) : !q ? (
          <Empty icon={SearchIcon} title={t('offlinePromptTitle')} text={t('offlinePromptText')} />
        ) : (
          <Panel title={t('offlineResultsTitle', { count: offlineResult?.total ?? 0 })}>
            {offlineResult?.hits.length ? (
              <>
                <ListRows>
                  {offlineResult.hits.map((item) => (
                    <div className="search-result" key={`${item.kind}-${item.id}`}>
                      <span className="file-symbol">
                        <SearchIcon size={19} />
                      </span>
                      <div>
                        {item.href.startsWith('https://') ? (
                          <a className="result-title" href={item.href} target="_blank" rel="noreferrer">
                            {item.title}
                          </a>
                        ) : (
                          <Link className="result-title" to={item.href}>
                            {item.title}
                          </Link>
                        )}
                        <p>
                          <SearchHighlight text={item.excerpt} query={q} />
                        </p>
                        <span className="row-subtitle">
                          {
                            (
                              {
                                document: t('kindDocument'),
                                annotation: t('kindAnnotation'),
                                announcement: t('kindAnnouncement'),
                                course_note: t('kindCourseNote'),
                                note: t('kindNote'),
                                jot: t('kindJot'),
                                clip: t('kindClip'),
                              } as Record<string, string>
                            )[item.kind]
                          }{' '}
                          · {item.course_name ?? t('withoutCourse')} · {item.semester_name ?? t('withoutSemester')}
                          {item.page_number ? ` · ${t('pageOnly', { page: item.page_number })}` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </ListRows>
                {offlineResult.total > 100 && <p className="muted-text mt-3">{t('offlineTruncated')}</p>}
              </>
            ) : (
              <Empty icon={SearchIcon} title={t('offlineNoResultsTitle')} text={t('offlineNoResultsText')} />
            )}
          </Panel>
        )
      ) : loading && !data ? (
        <Loading variant="rows" />
      ) : error ? (
        <Failure message={error} />
      ) : (
        data &&
        q &&
        (resultCount > 0 || (!matchesMensa(q) && !matchesRooms(q))) && (
          <Panel title={t('resultsTitle', { count: resultCount })}>
            {documents.length ? (
              <ListRows>
                {documents.map((item, index) => (
                  <div className="search-result" key={`${item.version_id}-${item.page_number}-${index}`}>
                    <span className="file-symbol">
                      <FileText size={19} />
                    </span>
                    <div>
                      <Link to={`/material/${item.version_id}?page=${item.page_number}`} className="result-title">
                        <SearchHighlight text={item.filename} query={q} />
                      </Link>
                      <p>
                        <SearchHighlight text={item.excerpt} query={q} />
                      </p>
                      <span className="row-subtitle">
                        {item.course_name} · {item.semester_name ?? t('withoutSemester')} ·{' '}
                        {t('versionLabel', { version: item.version })} · {t('pageLabel', { page: item.page_number })}
                      </span>
                      <details className="source-preview">
                        <summary>{quality('documentPreview')}</summary>
                        <p>
                          <SearchHighlight text={item.excerpt} query={q} />
                        </p>
                        <Link to={`/material/${item.version_id}?page=${item.page_number}`}>
                          {quality('openSource')}
                        </Link>
                      </details>
                      <a className="subtle-link" href={`/files/${item.version_id}/markdown`}>
                        {t('openMarkdown')} <ArrowRight size={13} />
                      </a>
                    </div>
                  </div>
                ))}
              </ListRows>
            ) : resultCount === 0 ? (
              <Empty
                icon={SearchIcon}
                title={t('noResultsTitle')}
                text={t('noResultsText')}
                action={
                  <Button variant="outline" onClick={() => setParams({ q })}>
                    {quality('clearFilters')}
                  </Button>
                }
              />
            ) : null}
            {annotations.length > 0 && (
              <div className="note-search-results">
                <h3>{t('annotationsHeading')}</h3>
                <ListRows>
                  {annotations.map((item) => (
                    <div className="search-result" key={item.id}>
                      <span className="file-symbol">
                        <NotebookPen size={19} />
                      </span>
                      <div>
                        <Link to={`/material/${item.version_id}#annotation-${item.id}`} className="result-title">
                          {item.resource_name}
                        </Link>
                        <p>
                          <SearchHighlight text={item.excerpt} query={q} />
                        </p>
                        <span className="row-subtitle">
                          {item.course_name} · {item.semester_name ?? t('withoutSemester')} ·{' '}
                          {t('pageOnly', { page: item.page_number })}
                        </span>
                      </div>
                    </div>
                  ))}
                </ListRows>
              </div>
            )}
            {announcements.length > 0 && (
              <div className="note-search-results">
                <h3>{t('announcementsHeading')}</h3>
                <ListRows>
                  {announcements.map((item) => (
                    <div className="search-result" key={item.id}>
                      <span className="file-symbol">
                        <MessageSquareText size={19} />
                      </span>
                      <div>
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer" className="result-title">
                            {item.title}
                          </a>
                        ) : (
                          <Link to={`/courses/${item.course_id}`} className="result-title">
                            {item.title}
                          </Link>
                        )}
                        <p>
                          <SearchHighlight text={item.excerpt} query={q} />
                        </p>
                        <span className="row-subtitle">
                          {item.course_name} · {item.semester_name ?? t('withoutSemester')} · {t('moodleForum')}
                        </span>
                      </div>
                    </div>
                  ))}
                </ListRows>
              </div>
            )}
            {courseNotes.length > 0 && (
              <div className="note-search-results">
                <h3>{t('courseNotesHeading')}</h3>
                <ListRows>
                  {courseNotes.map((item) => (
                    <div className="search-result" key={item.course_id}>
                      <span className="file-symbol">
                        <NotebookPen size={19} />
                      </span>
                      <div>
                        <Link to={`/courses/${item.course_id}`} className="result-title">
                          {item.course_name}
                        </Link>
                        <p>
                          <SearchHighlight text={item.excerpt} query={q} />
                        </p>
                        <span className="row-subtitle">{item.semester_name ?? t('withoutSemester')}</span>
                      </div>
                    </div>
                  ))}
                </ListRows>
              </div>
            )}
            {notes.length > 0 && (
              <div className="note-search-results">
                <h3>{t('notesHeading')}</h3>
                <ListRows>
                  {notes.map((item) => (
                    <div className="search-result" key={item.id}>
                      <span className="file-symbol">
                        <NotebookPen size={19} />
                      </span>
                      <div>
                        <StudyPeekLink id={item.id} className="result-title">
                          {item.title}
                        </StudyPeekLink>
                        <p>
                          <SearchHighlight text={item.excerpt} query={q} />
                        </p>
                        <span className="row-subtitle">
                          {item.course_name} · {item.semester_name ?? t('withoutSemester')} ·{' '}
                          {t('versionLabel', { version: item.revision })}
                        </span>
                      </div>
                    </div>
                  ))}
                </ListRows>
              </div>
            )}
            {jots.length > 0 && (
              <div className="note-search-results">
                <h3>{t('jotsHeading')}</h3>
                <ListRows>
                  {jots.map((item) => (
                    <div className="search-result" key={item.id}>
                      <span className="file-symbol">
                        <Lightbulb size={19} />
                      </span>
                      <div>
                        <Link to={`/jots#jot-${item.id}`} className="result-title">
                          {item.excerpt}
                        </Link>
                        <span className="row-subtitle">
                          {item.course_name ?? t('withoutCourse')} · {item.semester_name ?? t('withoutSemester')}
                        </span>
                      </div>
                    </div>
                  ))}
                </ListRows>
              </div>
            )}
            {clips.length > 0 && (
              <div className="note-search-results">
                <h3>{t('clipsHeading')}</h3>
                <ListRows>
                  {clips.map((item) => (
                    <div className="search-result" key={item.id}>
                      <span className="file-symbol">
                        <Link2 size={19} />
                      </span>
                      <div>
                        <Link to={`/inbox#clip-${item.id}`} className="result-title">
                          {item.title}
                        </Link>
                        <p>
                          <SearchHighlight text={item.excerpt} query={q} />
                        </p>
                        <span className="row-subtitle">
                          {item.course_name ?? t('withoutCourse')} · {item.semester_name ?? t('withoutSemester')}
                        </span>
                      </div>
                    </div>
                  ))}
                </ListRows>
              </div>
            )}
          </Panel>
        )
      )}
    </Shell>
  )
}
