// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { rememberWorkspace, useWorkspaceState, workspaceGeneration, workspaceValue } from '@/lib/workspaceState'
import { CollectionPreview } from './collections/CollectionPreview'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Columns3, LayoutGrid, List, Plus, Table2 } from 'lucide-react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { useApi, request } from '@/api'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/Shell'
import { Failure, Loading } from '@/components/State'
import { useWritableHost } from '@/hooks/host'
import { useBusyAction } from '@/hooks/useBusyAction'
import type { CoursesResponse } from '@/types'
import { CollectionResults, fieldLabels } from './collections/CollectionResults'
import {
  emptyConfig,
  kindLabels,
  presetsFor,
  previewPath,
  type Collection,
  type Config,
  type GroupBy,
  type Item,
  type Kind,
  type Result,
  type Sort,
  type View,
  type VisibleField,
} from './collections/collectionModel'
import { OrConditions } from './collections/OrConditions'
import './CollectionsPage.css'

function viewOptions(t: TypedT<'collections'>): Array<{ id: View; label: string; icon: typeof List }> {
  return [
    { id: 'list', label: t('viewList'), icon: List },
    { id: 'table', label: t('viewTable'), icon: Table2 },
    { id: 'cards', label: t('viewCards'), icon: LayoutGrid },
    { id: 'board', label: t('viewBoard'), icon: Columns3 },
    { id: 'calendar', label: t('viewCalendar'), icon: CalendarDays },
  ]
}

type CollectionEditor = {
  selected: Collection | null
  initialized: boolean
  name: string
  config: Config
  appliedConfig: Config
  filtersOpen: boolean
}
function makeEditor(
  config = emptyConfig,
  name = '',
  selected: Collection | null = null,
  filtersOpen = false,
): CollectionEditor {
  return { selected, initialized: true, name, config, appliedConfig: config, filtersOpen }
}
function editorKey(params: URLSearchParams) {
  return `collection-editor:${params.has('id') ? `saved:${Number(params.get('id'))}` : `new:${Number(params.get('course_id')) || 'all'}:${params.get('preset') === 'questions' ? 'questions' : 'blank'}`}`
}

export function CollectionsPage() {
  const { t } = useT('collections')
  const [params, setParams] = useSearchParams()
  const scope = editorKey(params)
  const activeScope = useRef(scope)
  activeScope.current = scope
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [preview, setPreview] = useState<Item | null>(null)
  const labels = kindLabels(t)
  const views = viewOptions(t)
  const presets = presetsFor(t)
  const canWrite = useWritableHost()
  const { data: saved, reload: reloadSaved } = useApi<Collection[]>('/api/collections')
  const { data: courses } = useApi<CoursesResponse>('/api/courses?all_semesters=true')
  const [editor, setEditor] = useWorkspaceState<CollectionEditor>(
    scope,
    { ...makeEditor(), initialized: false },
    { persist: false },
  )
  const { selected, initialized, name, config, appliedConfig, filtersOpen } = editor
  const setName = (value: string) => setEditor((current) => ({ ...current, name: value }))
  const setConfig = (value: Config) => setEditor((current) => ({ ...current, config: value }))
  const setAppliedConfig = (value: Config) => setEditor((current) => ({ ...current, appliedConfig: value }))
  const setFiltersOpen = (value: boolean) => setEditor((current) => ({ ...current, filtersOpen: value }))
  const activePath = previewPath(appliedConfig)
  const { data: result, error, loading, updatedAt } = useApi<Result>(activePath, { enabled: initialized })
  const { busy, error: actionError, setError: setActionError, run } = useBusyAction()
  const [message, setMessage] = useState('')
  useEffect(() => {
    setPreview(null)
  }, [scope])
  useEffect(() => {
    if (initialized) {
      if (selected && params.get('id') !== String(selected.id)) {
        const next = new URLSearchParams({ id: String(selected.id) })
        rememberWorkspace(editorKey(next), editor, false)
        setParams(next, { replace: true })
      }
      return
    }
    if (!saved) return
    const linked = saved.find((item) => item.id === Number(params.get('id')))
    if (linked) setEditor(makeEditor(linked.config, linked.name, linked))
    else if (params.has('id')) {
      setEditor(makeEditor())
      setMessage(t('viewUnavailable'))
    } else if (Number(params.get('course_id')) > 0)
      setEditor(makeEditor({ ...emptyConfig, course_id: Number(params.get('course_id')) }, '', null, true))
    else if (params.get('preset') === 'questions') {
      const preset = presets.find((item) => item.config.kind === 'questions')!
      setEditor(makeEditor(preset.config, preset.name))
    } else if (saved.length) {
      const first = saved[0]
      const next = new URLSearchParams({ id: String(first.id) })
      rememberWorkspace(editorKey(next), makeEditor(first.config, first.name, first), false)
      setParams(next, { replace: true })
    } else setEditor(makeEditor())
  }, [saved, initialized, params, presets, t, selected, editor, setEditor, setParams])

  function choose(item: Collection) {
    const next = new URLSearchParams({ id: String(item.id) })
    rememberWorkspace(editorKey(next), makeEditor(item.config, item.name, item), false)
    setParams(next, { replace: true })
    setActionError('')
    setMessage('')
  }
  function startNew(preset?: (typeof presets)[number]) {
    const courseId = (selected?.config.course_id ?? Number(params.get('course_id'))) || null
    const nextParams = new URLSearchParams(courseId ? { course_id: String(courseId) } : {})
    const next = { ...(preset?.config ?? emptyConfig), course_id: courseId }
    rememberWorkspace(editorKey(nextParams), makeEditor(next, preset?.name ?? '', null, !preset), false)
    setParams(nextParams, { replace: true })
    setActionError('')
    setMessage('')
  }
  function changeKind(kind: Kind) {
    const next: Config = {
      ...config,
      kind,
      view: config.view === 'calendar' && kind === 'topics' ? 'list' : config.view,
      days: kind === 'topics' ? null : config.days,
      max_percent: kind === 'topics' ? 70 : null,
      own_group_only: false,
      sort: kind === 'topics' ? 'progress' : 'date',
      time_filter: 'all',
      unread_only: false,
      has_questions: false,
      submission_filter: 'all',
    }
    setConfig(next)
  }
  async function save() {
    if (!name.trim()) return
    const generation = workspaceGeneration()
    const startedUrl = window.location.pathname + window.location.search
    setMessage('')
    await run(async () => {
      const path = selected ? `/api/collections/${selected.id}` : '/api/collections'
      const item = await request<Collection>(path, {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: name.trim(),
          config,
          ...(selected ? { expected_revision: selected.revision } : {}),
        }),
      })
      if (generation !== workspaceGeneration()) return
      const next = new URLSearchParams({ id: String(item.id) })
      const latest = workspaceValue(scope, editor, { persist: false })
      const acknowledged = {
        ...latest,
        selected: item,
        initialized: true,
        name: latest.name === name ? item.name : latest.name,
        config: latest.config === config ? item.config : latest.config,
        appliedConfig: latest.appliedConfig === appliedConfig ? item.config : latest.appliedConfig,
      }
      rememberWorkspace(scope, acknowledged, false)
      rememberWorkspace(editorKey(next), acknowledged, false)
      if (
        mounted.current &&
        activeScope.current === scope &&
        window.location.pathname + window.location.search === startedUrl
      ) {
        setParams(next, { replace: true })
        setMessage(t('viewSavedMessage'))
      }
      reloadSaved()
    })
  }
  async function archive() {
    if (!selected) return
    const generation = workspaceGeneration()
    const startedUrl = window.location.pathname + window.location.search
    await run(async () => {
      await request(`/api/collections/${selected.id}/archive`, { method: 'POST' })
      if (generation !== workspaceGeneration()) return
      rememberWorkspace(scope, makeEditor(), false)
      if (
        mounted.current &&
        activeScope.current === scope &&
        window.location.pathname + window.location.search === startedUrl
      ) {
        const next = new URLSearchParams()
        rememberWorkspace(editorKey(next), makeEditor(), false)
        setParams(next, { replace: true })
      }
      if (
        mounted.current &&
        activeScope.current === scope &&
        window.location.pathname + window.location.search === startedUrl
      )
        setMessage(t('viewArchivedMessage'))
      reloadSaved()
    })
  }

  return (
    <Shell
      title={name.trim() || t('pageTitle')}
      breadcrumbs={name.trim() ? [{ label: t('pageTitle'), to: '/collections' }, { label: name }] : undefined}
      cachedAt={updatedAt}
      description={t('introText')}
    >
      <div className="collections-layout">
        <aside className="collections-sidebar">
          <div className="collections-sidebar-heading">
            <strong>{t('myViewsTitle')}</strong>
            <button type="button" aria-label={t('newCollectionAria')} onClick={() => startNew()}>
              <Plus size={16} />
            </button>
          </div>
          {saved?.map((item) => (
            <button
              type="button"
              key={item.id}
              className={selected?.id === item.id ? 'active' : ''}
              onClick={() => choose(item)}
            >
              <span>{item.name}</span>
              <small>{labels[item.config.kind]}</small>
            </button>
          ))}
          {!saved?.length && <p>{t('noViewsSavedText')}</p>}
          <div className="collections-presets">
            <strong>{t('quickStartTitle')}</strong>
            {presets.map((preset) => (
              <button type="button" key={preset.name} onClick={() => startNew(preset)}>
                {preset.name}
              </button>
            ))}
          </div>
        </aside>
        <div className="collections-main" data-workspace-pending={!initialized ? 'true' : undefined}>
          <details
            className="collections-settings"
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          >
            <summary>
              {t('adjustFiltersSummary')} <span>{labels[config.kind]}</span>
            </summary>
            <section className="collections-builder">
              <div className="collections-builder-top">
                <label>
                  {t('viewNameLabel')}
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={120}
                    placeholder={t('viewNamePlaceholder')}
                  />
                </label>
                <div>
                  <Button disabled={!canWrite || busy || !name.trim()} onClick={() => void save()}>
                    {selected ? t('saveChangesButton') : t('saveViewButton')}
                  </Button>
                  {selected && (
                    <Button variant="ghost" disabled={!canWrite || busy} onClick={() => void archive()}>
                      {t('archiveButton')}
                    </Button>
                  )}
                </div>
              </div>
              <div className="collections-fields">
                <label>
                  {t('contentLabel')}
                  <select
                    className="native-select"
                    value={config.kind}
                    onChange={(event) => changeKind(event.target.value as Kind)}
                  >
                    {Object.entries(labels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('courseLabel')}
                  <select
                    className="native-select"
                    value={config.course_id ?? ''}
                    onChange={(event) =>
                      setConfig({ ...config, course_id: event.target.value ? Number(event.target.value) : null })
                    }
                  >
                    <option value="">{t('allCoursesOption')}</option>
                    {courses?.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>
                </label>
                {config.kind === 'topics' ? (
                  <label>
                    {t('maxMeasurementLabel')}
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={config.max_percent ?? ''}
                      onChange={(event) =>
                        setConfig({ ...config, max_percent: event.target.value ? Number(event.target.value) : null })
                      }
                      placeholder="70"
                    />
                    %
                  </label>
                ) : (
                  <label>
                    {config.kind === 'deadlines' ? t('dueInDaysLabel') : t('fromLastDaysLabel')}
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={config.days ?? ''}
                      onChange={(event) =>
                        setConfig({ ...config, days: event.target.value ? Number(event.target.value) : null })
                      }
                      placeholder={t('allPlaceholder')}
                    />
                  </label>
                )}
                <label>
                  {t('groupByLabel')}
                  <select
                    className="native-select"
                    value={config.group_by}
                    onChange={(event) => setConfig({ ...config, group_by: event.target.value as GroupBy })}
                  >
                    <option value="status">{t('groupByStatus')}</option>
                    <option value="course">{t('courseLabel')}</option>
                    <option value="kind">{t('groupByKind')}</option>
                    <option value="source">{t('groupBySource')}</option>
                  </select>
                </label>
                <label>
                  {t('sortLabel')}
                  <select
                    className="native-select"
                    value={config.sort}
                    onChange={(event) => setConfig({ ...config, sort: event.target.value as Sort })}
                  >
                    <option value="date">{t('sortDate')}</option>
                    <option value="title">{t('sortTitle')}</option>
                    {config.kind === 'topics' && <option value="progress">{t('sortProgress')}</option>}
                  </select>
                </label>
                <label>
                  {t('sortDirection')}
                  <select
                    aria-label={t('sortDirection')}
                    className="native-select"
                    value={config.sort_direction}
                    onChange={(event) =>
                      setConfig({ ...config, sort_direction: event.target.value as Config['sort_direction'] })
                    }
                  >
                    <option value="auto">{t('sortAuto')}</option>
                    <option value="asc">{t('sortAsc')}</option>
                    <option value="desc">{t('sortDesc')}</option>
                  </select>
                </label>
                {(config.kind === 'deadlines' || config.kind === 'all') && (
                  <>
                    <label>
                      {t('timeFilter')}
                      <select
                        className="native-select"
                        value={config.time_filter}
                        onChange={(event) =>
                          setConfig({ ...config, time_filter: event.target.value as Config['time_filter'] })
                        }
                      >
                        <option value="all">{t('allOption')}</option>
                        <option value="upcoming">{t('upcoming')}</option>
                        <option value="overdue">{t('presetOverdue')}</option>
                      </select>
                    </label>
                    <label>
                      {t('submissionFilter')}
                      <select
                        className="native-select"
                        value={config.submission_filter}
                        onChange={(event) =>
                          setConfig({ ...config, submission_filter: event.target.value as Config['submission_filter'] })
                        }
                      >
                        <option value="all">{t('allOption')}</option>
                        <option value="unsubmitted">{t('presetUnsubmitted')}</option>
                      </select>
                      <small>{t('submissionHint')}</small>
                    </label>
                  </>
                )}
              </div>
              {(config.kind === 'materials' || config.kind === 'all') && (
                <div className="collections-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={config.unread_only}
                      onChange={(event) => setConfig({ ...config, unread_only: event.target.checked })}
                    />{' '}
                    {t('presetUnread')}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={config.has_questions}
                      onChange={(event) => setConfig({ ...config, has_questions: event.target.checked })}
                    />{' '}
                    {t('presetMaterialQuestions')}
                  </label>
                </div>
              )}
              <fieldset className="collections-toggles">
                <legend>{t('visibleFields')}</legend>
                {Object.entries(fieldLabels(t)).map(([field, label]) => (
                  <label key={field}>
                    <input
                      type="checkbox"
                      checked={config.visible_fields.includes(field as VisibleField)}
                      disabled={field === 'title'}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          visible_fields: event.target.checked
                            ? [...config.visible_fields, field as VisibleField]
                            : config.visible_fields.filter((value) => value !== field),
                        })
                      }
                    />{' '}
                    {label}
                  </label>
                ))}
              </fieldset>
              <div className="collections-toggles">
                {config.kind === 'materials' && (
                  <label>
                    <input
                      type="checkbox"
                      checked={config.own_group_only}
                      onChange={(event) => setConfig({ ...config, own_group_only: event.target.checked })}
                    />{' '}
                    {t('ownGroupOnlyLabel')}
                  </label>
                )}
                {config.kind === 'topics' && (
                  <label>
                    <input
                      type="checkbox"
                      checked={config.include_unmeasured}
                      onChange={(event) => setConfig({ ...config, include_unmeasured: event.target.checked })}
                    />{' '}
                    {t('includeUnmeasuredLabel')}
                  </label>
                )}
              </div>
              <details className="collections-metadata-filters">
                <summary>{t('tagsPropertiesFilterSummary')}</summary>
                <div>
                  <label>
                    {t('tagLabel')}
                    <input
                      value={config.tag ?? ''}
                      placeholder={t('tagPlaceholder')}
                      onChange={(event) => setConfig({ ...config, tag: event.target.value || null })}
                    />
                  </label>
                  <label>
                    {t('priorityLabel')}
                    <select
                      className="native-select"
                      value={config.priority ?? ''}
                      onChange={(event) =>
                        setConfig({ ...config, priority: (event.target.value as Config['priority']) || null })
                      }
                    >
                      <option value="">{t('allOption')}</option>
                      <option value="low">{t('priorityLow')}</option>
                      <option value="medium">{t('priorityMedium')}</option>
                      <option value="high">{t('priorityHigh')}</option>
                    </select>
                  </label>
                  <label>
                    {t('examRelevantLabel')}
                    <select
                      className="native-select"
                      value={config.exam_relevant === null ? '' : String(config.exam_relevant)}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          exam_relevant: event.target.value === '' ? null : event.target.value === 'true',
                        })
                      }
                    >
                      <option value="">{t('allOption')}</option>
                      <option value="true">{t('yesOption')}</option>
                      <option value="false">{t('noOption')}</option>
                    </select>
                  </label>
                  <label>
                    {t('difficultyLabel')}
                    <select
                      className="native-select"
                      value={config.difficulty ?? ''}
                      onChange={(event) =>
                        setConfig({ ...config, difficulty: (event.target.value as Config['difficulty']) || null })
                      }
                    >
                      <option value="">{t('allOption')}</option>
                      <option value="easy">{t('difficultyEasy')}</option>
                      <option value="medium">{t('difficultyMedium')}</option>
                      <option value="hard">{t('difficultyHard')}</option>
                    </select>
                  </label>
                  <label>
                    {t('statusLabel')}
                    <select
                      className="native-select"
                      value={config.workflow_status ?? ''}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          workflow_status: (event.target.value as Config['workflow_status']) || null,
                        })
                      }
                    >
                      <option value="">{t('allOption')}</option>
                      <option value="open">{t('statusOpen')}</option>
                      <option value="working">{t('statusWorking')}</option>
                      <option value="done">{t('statusDone')}</option>
                    </select>
                  </label>
                </div>
              </details>
              <OrConditions
                groups={config.any_groups}
                labels={labels}
                courses={courses?.courses}
                onChange={(any_groups) => setConfig({ ...config, any_groups })}
              />
              <div className="collections-view-bar">
                <div role="group" aria-label={t('viewGroupAria')}>
                  {views.map(({ id, label, icon: Icon }) => (
                    <button
                      type="button"
                      key={id}
                      className={config.view === id ? 'active' : ''}
                      disabled={config.kind === 'topics' && id === 'calendar'}
                      onClick={() => setConfig({ ...config, view: id })}
                    >
                      <Icon size={15} /> {label}
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => setAppliedConfig(config)}>
                  {t('showResultsButton')}
                </Button>
              </div>
              {actionError && (
                <p role="alert" className="text-destructive">
                  {actionError}
                </p>
              )}
              {message && (
                <p role="status" className="collections-message">
                  {message}
                </p>
              )}
            </section>
          </details>
          <section className="collections-results">
            <div className="collections-result-heading">
              <h3>{t('resultsTitle')}</h3>
              <span>
                {result
                  ? `${t('resultsCount', { count: result.total })}${result.total > 200 ? t('firstVisibleSuffix') : ''}`
                  : ''}
              </span>
            </div>
            {saved && !saved.length && !selected && !name && !filtersOpen && (
              <div className="collection-start">
                <strong>{t('startWithTemplateTitle')}</strong>
                <p>{t('startWithTemplateText')}</p>
                <Button size="sm" variant="outline" onClick={() => startNew(presets[0])}>
                  {t('viewExamPrepButton')}
                </Button>
              </div>
            )}
            {previewPath(config) !== activePath && <p className="collection-pending">{t('filtersChangedNotice')}</p>}
            {loading && !result ? (
              <Loading />
            ) : error ? (
              <Failure message={error} />
            ) : (
              result &&
              (filtersOpen || saved?.length || selected || name) && (
                <CollectionResults
                  onPreview={setPreview}
                  result={result}
                  view={appliedConfig.view}
                  groupBy={appliedConfig.group_by}
                  fields={appliedConfig.visible_fields}
                />
              )
            )}
          </section>
        </div>
      </div>
      {preview && (
        <CollectionPreview key={`${preview.kind}:${preview.id}`} item={preview} onClose={() => setPreview(null)} />
      )}
    </Shell>
  )
}
