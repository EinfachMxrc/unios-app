// SPDX-License-Identifier: AGPL-3.0-or-later

import { localDate, request, requestResponse, useApi } from '@/api'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { AgentSetupWizard } from '@/components/AgentSetupWizard'
import { AiAdapterStatusPanel } from '@/components/AiAdapterStatusPanel'
import { CostCalculatorPanel } from '@/components/CostCalculatorPanel'
import { Shell } from '@/components/Shell'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import { queryClient } from '@/offlineCache'
import { usePreferences } from '@/preferences'
import { Clipboard, Download, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ResourceChooser } from './ai/ResourceChooser'
type Access = {
  categories: Record<string, boolean>
  courses: { id: number; name: string; allowed: boolean }[]
}
type PackageMode = 'cards' | 'questions' | 'exercises'
export function AiPage() {
  const { t } = useT('ai')
  const { data, loading, error } = useApi<Access>('/api/ai/access')
  const { data: corpus } = useApi<{ pending: number; failed: number; documents: number; chunks: number }>(
    '/api/corpus/status',
    { refetchInterval: 10000 },
  )
  const { data: mcpState, reload: reloadMcpState } = useApi<{ configured: boolean; enabled: boolean }>(
    '/api/ai/mcp/state',
  )
  const { data: connection } = useApi<{
    keyring_available: boolean
    client_config: {
      command: string
      args: string[]
      env: Record<string, string>
    }
  }>('/api/ai/connection')
  const { data: audit } =
    useApi<{ at: string; tool: string; resource_id: number | null; permitted: boolean; actor: string }[]>(
      '/api/ai/mcp/audit',
    )
  const preferences = usePreferences()
  const canWrite = useWritableHost()
  const [periodScope, setPeriodScope] = useState(false)
  const [courseId, setCourseId] = useState<number | null>(null)
  const [includeQuestions, setIncludeQuestions] = useState(true)
  const [pickResources, setPickResources] = useState(false)
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([])
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [copyMode, setCopyMode] = useState<PackageMode>('cards')
  const [copyText, setCopyText] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  useEffect(
    () => setCopyText(''),
    [periodScope, courseId, includeQuestions, pickResources, selectedResourceIds, copyMode, fromDate, toDate],
  )
  // Through the shared client: lease header, offline write lock and stale-host recovery apply here too.
  function requestPackage(mode: PackageMode, output: 'zip' | 'text') {
    return requestResponse('/api/ai/package', {
      method: 'POST',
      body: JSON.stringify({
        ...(periodScope ? {} : { course_id: courseId }),
        mode,
        output,
        include_questions: includeQuestions,
        ...(fromDate ? { from_date: fromDate } : {}),
        ...(toDate ? { to_date: toDate } : {}),
        ...(pickResources ? { resource_ids: selectedResourceIds } : {}),
      }),
    })
  }
  /** One action at a time; its error replaces the feedback line. */
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setFeedback('')
    try {
      await action()
    } catch (cause) {
      setFeedback(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  async function setAccess(scope: 'course' | 'category', key: string, allowed: boolean) {
    setBusy(true)
    setFeedback('')
    const queryKey = ['api', '/api/ai/access']
    const previous = queryClient.getQueryData<Access>(queryKey)
    queryClient.setQueryData<Access>(
      queryKey,
      (current) =>
        current && {
          categories: scope === 'category' ? { ...current.categories, [key]: allowed } : current.categories,
          courses:
            scope === 'course'
              ? current.courses.map((course) => (course.id === Number(key) ? { ...course, allowed } : course))
              : current.courses,
        },
    )
    try {
      const updated = await request<Access>(`/api/ai/access/${scope}/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ allowed }),
      })
      queryClient.setQueryData(queryKey, updated)
    } catch (cause) {
      queryClient.setQueryData(queryKey, previous)
      setFeedback(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  async function downloadPackage(mode: PackageMode) {
    if (!scopeReady) return
    await run(async () => {
      const response = await requestPackage(mode, 'zip')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `ki-${mode}-${periodScope ? 'zeitraum' : `kurs-${courseId}`}.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setFeedback(t('packageDownloadedMessage'))
    })
  }
  async function showTextPackage() {
    if (!scopeReady) return
    setCopyText('')
    await run(async () => {
      const response = await requestPackage(copyMode, 'text')
      setCopyText(await response.text())
      setFeedback(t('textPackageReadyMessage'))
    })
  }
  async function copyPackageText() {
    try {
      await navigator.clipboard.writeText(copyText)
      setFeedback(t('textCopiedMessage'))
    } catch {
      setFeedback(t('clipboardUnavailableMessage'))
    }
  }
  async function toggleLocalConnection() {
    if (!mcpState) return
    await run(async () => {
      await request('/api/ai/mcp/state', { method: 'PUT', body: JSON.stringify({ enabled: !mcpState.enabled }) })
      reloadMcpState()
    })
  }
  function setupLocalConnection() {
    return run(async () => {
      await request('/api/ai/connection', { method: 'POST' })
      reloadMcpState()
      setFeedback(t('connectionReadyMessage'))
    })
  }
  async function copyConnectionConfiguration() {
    if (!connection) return
    try {
      await navigator.clipboard.writeText(JSON.stringify({ mcpServers: { unios: connection.client_config } }, null, 2))
      setFeedback(t('connectionCopiedMessage'))
    } catch {
      setFeedback(t('clipboardUnavailableMessage'))
    }
  }
  const selected = data?.courses.find((course) => course.id === courseId)
  const invalidPeriod = Boolean(fromDate && toDate && fromDate > toDate)
  const scopeReady = periodScope
    ? Boolean((fromDate || toDate) && data?.courses.some((course) => course.allowed))
    : Boolean(selected?.allowed)
  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')}>
      <AgentSetupWizard />
      <p className="muted-text mb-5">{t('pageIntro')}</p>
      {feedback && (
        <p role="status" className="mb-4">
          {feedback}
        </p>
      )}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : data ? (
        <div className="grid gap-5">
          {corpus && (
            <details className="rounded-xl border border-border p-4">
              <summary>{t('agentIndex')}</summary>
              <p className="muted-text mt-3">{t('agentIndexCounts', corpus)}</p>
              <p className="mt-2" role="status">
                {t(
                  corpus.failed ? 'agentIndexFailed' : corpus.pending ? 'agentIndexPending' : 'agentIndexReady',
                  corpus,
                )}
              </p>
              <a className="text-link mt-3 inline-block" href="/jobs">
                {t('agentIndexJobs')}
              </a>
            </details>
          )}
          <Panel title={t('accessPanelTitle')} action={<ShieldCheck size={20} />}>
            <label className="data-row flex items-center gap-3">
              <input
                type="checkbox"
                checked={data.categories.course_material ?? true}
                onChange={(event) => void setAccess('category', 'course_material', event.target.checked)}
                disabled={!canWrite || busy}
              />{' '}
              {t('shareCourseMaterialLabel')}
            </label>
            <label className="data-row flex items-center gap-3">
              <input
                type="checkbox"
                checked={data.categories.learning_questions ?? true}
                onChange={(event) => void setAccess('category', 'learning_questions', event.target.checked)}
                disabled={!canWrite || busy}
              />{' '}
              {t('shareLearningQuestionsLabel')}
            </label>
            <label className="data-row flex items-center gap-3">
              <input
                type="checkbox"
                checked={data.categories.deadlines ?? false}
                onChange={(event) => void setAccess('category', 'deadlines', event.target.checked)}
                disabled={!canWrite || busy}
              />{' '}
              {t('shareDeadlinesLabel')}
            </label>
            <label className="data-row flex items-center gap-3">
              <input
                type="checkbox"
                checked={data.categories.projects ?? false}
                onChange={(event) => void setAccess('category', 'projects', event.target.checked)}
                disabled={!canWrite || busy}
              />{' '}
              {t('shareProjectsLabel')}
            </label>
            <label className="data-row flex items-center gap-3">
              <input
                type="checkbox"
                checked={data.categories.exam_status ?? false}
                onChange={(event) => void setAccess('category', 'exam_status', event.target.checked)}
                disabled={!canWrite || busy}
              />{' '}
              {t('shareExamStatusLabel')}
            </label>
            <label className="data-row flex items-center gap-3">
              <input
                type="checkbox"
                checked={data.categories.submission_status ?? false}
                onChange={(event) => void setAccess('category', 'submission_status', event.target.checked)}
                disabled={!canWrite || busy}
              />{' '}
              {t('shareSubmissionStatusLabel')}
            </label>
            <label className="flex items-center gap-3 mt-3">
              <input
                type="checkbox"
                checked={Boolean(data.categories.timetable)}
                disabled={!canWrite || busy}
                onChange={(event) => void setAccess('category', 'timetable', event.target.checked)}
              />
              {t('shareTimetableLabel')}
            </label>
            <label className="flex items-center gap-3 mt-3">
              <input
                type="checkbox"
                checked={Boolean(data.categories.mail)}
                disabled={!canWrite || busy}
                onChange={(event) => void setAccess('category', 'mail', event.target.checked)}
              />
              {t('shareMailLabel')}
            </label>
            <p className="row-subtitle mt-3">{t('mailReleaseHint')}</p>
            <details className="mt-4">
              <summary>{t('agentCategories')}</summary>
              {(['notes', 'exercises', 'project_code', 'learning_state', 'coding_tutor'] as const).map((category) => (
                <label className="data-row flex items-center gap-3" key={category}>
                  <input
                    type="checkbox"
                    checked={Boolean(data.categories[category])}
                    disabled={!canWrite || busy}
                    onChange={(event) => void setAccess('category', category, event.target.checked)}
                  />
                  {t(`agentCategory.${category}`)}
                </label>
              ))}
            </details>
            <p className="row-subtitle mt-3">{t('accessHint')}</p>
            {data.courses.length ? (
              data.courses.map((course) => (
                <label className="data-row flex items-center gap-3" key={course.id}>
                  <input
                    type="checkbox"
                    checked={course.allowed}
                    onChange={(event) => void setAccess('course', String(course.id), event.target.checked)}
                    disabled={!canWrite || busy}
                  />{' '}
                  {course.name}
                </label>
              ))
            ) : (
              <Empty title={t('noCoursesTitle')} text={t('noCoursesText')} />
            )}
          </Panel>
          <Panel title={t('createPackagePanelTitle')} action={<Download size={20} />}>
            <label className="grid gap-2 text-sm">
              {t('scopeLabel')}
              <select
                className="native-select"
                value={periodScope ? 'period' : 'course'}
                onChange={(event) => {
                  setPeriodScope(event.target.value === 'period')
                  setCourseId(null)
                  setPickResources(false)
                  setSelectedResourceIds([])
                }}
              >
                <option value="course">{t('scopeCourseOption')}</option>
                <option value="period">{t('scopePeriodOption')}</option>
              </select>
            </label>
            {!periodScope ? (
              <label className="mt-3 grid gap-2 text-sm">
                {t('courseLabel')}
                <select
                  className="native-select"
                  value={courseId ?? ''}
                  onChange={(event) => {
                    setCourseId(event.target.value ? Number(event.target.value) : null)
                    setPickResources(false)
                    setSelectedResourceIds([])
                  }}
                >
                  <option value="">{t('chooseCourseOption')}</option>
                  {data.courses.map((course) => (
                    <option value={course.id} key={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="row-subtitle mt-3">{t('periodScopeHint')}</p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                {t('fromDateLabel')}
                <input
                  type="date"
                  className="native-select"
                  disabled={busy}
                  value={fromDate}
                  onChange={(event) => {
                    setFromDate(event.target.value)
                    setSelectedResourceIds([])
                  }}
                />
              </label>
              <label className="grid gap-2 text-sm">
                {t('toDateLabel')}
                <input
                  type="date"
                  className="native-select"
                  disabled={busy}
                  value={toDate}
                  onChange={(event) => {
                    setToDate(event.target.value)
                    setSelectedResourceIds([])
                  }}
                />
              </label>
            </div>
            {invalidPeriod && (
              <p className="row-subtitle mt-2" role="alert">
                {t('invalidPeriodText')}
              </p>
            )}
            <label className="mt-3 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={pickResources}
                onChange={(event) => {
                  setPickResources(event.target.checked)
                  setSelectedResourceIds([])
                }}
                disabled={busy || !scopeReady || !data.categories.course_material}
              />{' '}
              {t('pickResourcesLabel')}
            </label>
            {pickResources && scopeReady && data.categories.course_material && !invalidPeriod && (
              <ResourceChooser
                courseId={periodScope ? null : courseId}
                fromDate={fromDate}
                toDate={toDate}
                selectedIds={selectedResourceIds}
                onChange={setSelectedResourceIds}
              />
            )}
            <label className="mt-3 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={includeQuestions}
                onChange={(event) => setIncludeQuestions(event.target.checked)}
              />{' '}
              {t('includeQuestionsLabel')}
            </label>
            <Button
              className="mt-4"
              onClick={() => void downloadPackage('cards')}
              disabled={
                !canWrite ||
                busy ||
                !scopeReady ||
                !data.categories.course_material ||
                invalidPeriod ||
                (pickResources && !selectedResourceIds.length)
              }
            >
              {t('downloadCardsButton')}
            </Button>
            <Button
              className="mt-4 ml-2"
              variant="outline"
              onClick={() => void downloadPackage('questions')}
              disabled={
                !canWrite ||
                busy ||
                !scopeReady ||
                !data.categories.course_material ||
                invalidPeriod ||
                !data.categories.learning_questions ||
                (pickResources && !selectedResourceIds.length)
              }
            >
              {t('explainQuestionsButton')}
            </Button>
            <Button
              className="mt-4 ml-2"
              variant="outline"
              onClick={() => void downloadPackage('exercises')}
              disabled={
                !canWrite ||
                busy ||
                !scopeReady ||
                !data.categories.course_material ||
                invalidPeriod ||
                (pickResources && !selectedResourceIds.length)
              }
            >
              {t('proposeExercisesButton')}
            </Button>
            <div className="mt-5 grid gap-3 border-t pt-4">
              <label className="grid gap-2 text-sm">
                {t('textPackageLabel')}
                <select
                  className="native-select"
                  value={copyMode}
                  onChange={(event) => setCopyMode(event.target.value as PackageMode)}
                >
                  <option value="cards">{t('textModeCards')}</option>
                  <option value="questions">{t('textModeQuestions')}</option>
                  <option value="exercises">{t('textModeExercises')}</option>
                </select>
              </label>
              <Button
                variant="outline"
                onClick={() => void showTextPackage()}
                disabled={
                  !canWrite ||
                  busy ||
                  !scopeReady ||
                  !data.categories.course_material ||
                  invalidPeriod ||
                  (copyMode === 'questions' && !data.categories.learning_questions) ||
                  (pickResources && !selectedResourceIds.length)
                }
              >
                {t('showTextPackageButton')}
              </Button>
              {copyText && (
                <div className="grid gap-2">
                  <label htmlFor="ai-package-text" className="text-sm">
                    {t('packageTextLabel')}
                  </label>
                  <textarea
                    id="ai-package-text"
                    readOnly
                    value={copyText}
                    rows={10}
                    className="w-full rounded-lg border bg-background p-3 text-sm"
                  />
                  <Button variant="outline" onClick={() => void copyPackageText()}>
                    <Clipboard size={16} /> {t('copyTextButton')}
                  </Button>
                </div>
              )}
              <p className="row-subtitle">{t('largePackageHint')}</p>
            </div>
          </Panel>
          <Panel title={t('localConnectionPanelTitle')}>
            <p className="muted-text">
              {mcpState?.enabled
                ? t('localConnectionEnabledText')
                : mcpState?.configured
                  ? t('localConnectionConfiguredText')
                  : t('localConnectionUnconfiguredText')}
            </p>
            <p className="row-subtitle mt-3">{t('connectionDescription')}</p>
            {!mcpState?.configured && (
              <Button
                className="mt-3"
                disabled={!canWrite || busy || !connection?.keyring_available}
                onClick={() => void setupLocalConnection()}
              >
                {t('setupConnectionButton')}
              </Button>
            )}
            {connection && !connection.keyring_available && (
              <p className="row-subtitle mt-3">{t('connectionVaultUnavailable')}</p>
            )}
            {mcpState?.configured && (
              <Button
                className="mt-3"
                variant="outline"
                disabled={!canWrite || busy}
                onClick={() => void toggleLocalConnection()}
              >
                {mcpState.enabled ? t('disableConnectionButton') : t('enableConnectionButton')}
              </Button>
            )}
            {mcpState?.configured && (
              <>
                <p className="row-subtitle mt-3">{t('connectionExample')}</p>
                <details className="mt-3">
                  <summary>{t('connectionOtherPrograms')}</summary>
                  <p className="row-subtitle mt-3">{t('connectionConfigHint')}</p>
                  <Button className="mt-3" variant="outline" onClick={() => void copyConnectionConfiguration()}>
                    <Clipboard size={16} /> {t('copyConnectionButton')}
                  </Button>
                </details>
              </>
            )}
          </Panel>
          <CostCalculatorPanel />
          <AiAdapterStatusPanel />
          {preferences.advanced && (
            <Panel title={t('auditPanelTitle')}>
              {audit?.length ? (
                <div className="row-list">
                  {audit.slice(0, 20).map((entry, index) => (
                    <div className="data-row" key={`${entry.at}-${index}`}>
                      <strong>{entry.permitted ? t('accessGrantedLabel') : t('accessDeniedLabel')}</strong>
                      <p className="row-subtitle">
                        {entry.tool} · {localDate(entry.at)}
                        {entry.resource_id ? t('auditMaterialSuffix', { id: entry.resource_id }) : ''}
                        {entry.actor?.startsWith('oauth:')
                          ? t('auditRemoteSuffix', { token: entry.actor.slice(6, 18) })
                          : t('auditLocalSuffix')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title={t('noAuditEntriesTitle')} text={t('noAuditEntriesText')} />
              )}
            </Panel>
          )}
        </div>
      ) : null}
    </Shell>
  )
}
