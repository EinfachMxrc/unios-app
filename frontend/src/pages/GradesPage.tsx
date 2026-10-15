// SPDX-License-Identifier: AGPL-3.0-or-later

import { useLayoutEffect, useRef, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/Shell'
import { EntityProperties } from '@/components/EntityProperties'
import { LinkedItems } from '@/components/LinkedItems'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { useApiMutation, extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import { useRevisionDraft, type RevisionSnapshot } from '@/hooks/useRevisionDraft'
import { queryClient } from '@/offlineCache'
import type { CoursesResponse } from '@/types'
import './GradesPage.css'
import { ProofImageButton } from './grades/ProofImageButton'

type Module = {
  id: number
  source: string
  title: string
  semester_id: number | null
  semester_name: string | null
  ects: string
  grade: string | null
  weight: string | null
  attempt: number | null
  status: 'open' | 'passed' | 'failed'
  revision: number
  archived_at: string | null
  updated_at: string
}
type Ects = { planned_ects: string; earned_ects: string; hypothetical_ects: string }
type Dashboard = {
  modules: Module[]
  semesters: (Ects & { semester_id: number | null; semester_name: string | null })[]
  overall: Ects
  average: string | null
  average_basis: 'no_grades' | 'ects' | 'entered_weight'
  weighting_complete: boolean
  scenario_average: string | null
  scenario_basis: 'no_grades' | 'ects' | 'entered_weight' | null
  scenario_weighting_complete: boolean | null
}
type PrimussStatus = {
  configured: boolean
  session_available: boolean
  missing_fields: string[]
  alias_map_available: boolean
  sync_available: boolean
  grades_sync_available: boolean
}
type GradeSyncReport = { created: number; updated: number; unchanged: number; skipped: number; warnings: string[] }
type SavedExam = {
  id: number
  title: string
  exam_at: string | null
  registration: string
  checked_at: string
  proof_id: string | null
}
type PrimussPreview = {
  exams: {
    title: string
    exam_at: string | null
    registration: 'registered' | 'unregistered' | 'unclear'
    registration_text: string | null
    registration_deadline: string | null
  }[]
  grades: { title: string; value: string | null; ects: string | null; status: string | null }[]
  warnings: string[]
  proof_id: string | null
  proof_at: string | null
  saved: boolean
}
type Form = {
  title: string
  semester_id: string
  ects: string
  grade: string
  weight: string
  attempt: string
  status: Module['status']
}
const emptyForm: Form = { title: '', semester_id: '', ects: '', grade: '', weight: '', attempt: '', status: 'open' }
function moduleForm(module: Module): Form {
  return {
    title: module.title,
    semester_id: String(module.semester_id ?? ''),
    ects: module.ects,
    grade: module.grade ?? '',
    weight: module.weight ?? '',
    attempt: String(module.attempt ?? ''),
    status: module.status,
  }
}

function statusLabels(t: TypedT<'grades'>): Record<Module['status'], string> {
  return { open: t('statusOpen'), passed: t('statusPassed'), failed: t('statusFailed') }
}

function registrationLabel(t: TypedT<'grades'>, registration: 'registered' | 'unregistered' | 'unclear' | string) {
  if (registration === 'registered') return t('registeredLabel')
  if (registration === 'unregistered') return t('unregisteredLabel')
  return t('unclearLabel')
}

function meanLabel(basis: Dashboard['average_basis'], t: TypedT<'grades'>) {
  if (basis === 'entered_weight') return t('meanEnteredWeight')
  if (basis === 'ects') return t('meanEctsWeighted')
  return t('meanNoGrades')
}

function ModuleForm({
  module,
  semesters,
  onDone,
}: {
  module?: Module
  semesters: CoursesResponse['semesters']
  onDone: () => void
}) {
  const { t } = useT('grades')
  const canWrite = useWritableHost()
  const [createdModule, setCreatedModule] = useState<Module | null>(null)
  const target = module ?? createdModule
  const draft = useRevisionDraft(module ? String(module.id) : 'new', {
    value: target ? moduleForm(target) : emptyForm,
    revision: target?.revision ?? 0,
  })
  const form = draft.value ?? emptyForm
  const save = useApiMutation<Module, RevisionSnapshot<Form>>(
    async (snapshot) => {
      const form = snapshot.value
      try {
        return await request<Module>(target ? `/api/grades/${target.id}` : '/api/grades', {
          method: target ? 'PUT' : 'POST',
          body: JSON.stringify({
            title: form.title.trim(),
            semester_id: form.semester_id ? Number(form.semester_id) : null,
            ects: form.ects,
            grade: form.status === 'open' || !form.grade ? null : form.grade,
            weight: form.weight || null,
            attempt: form.attempt ? Number(form.attempt) : null,
            status: form.status,
            ...(target ? { expected_revision: snapshot.revision } : {}),
          }),
        })
      } catch (cause) {
        draft.failed(snapshot)
        void queryClient.invalidateQueries({ queryKey: ['api', '/api/grades'] })
        void queryClient.invalidateQueries({ queryKey: ['api', '/api/grades?include_archived=true'] })
        throw cause
      }
    },
    {
      invalidate: ['/api/grades', '/api/grades?include_archived=true'],
      onSuccess: (updated, snapshot) => {
        if (!module) setCreatedModule(updated)
        if (draft.acknowledge(snapshot, { value: moduleForm(updated), revision: updated.revision })) onDone()
      },
    },
  )

  function change<K extends keyof Form>(key: K, value: Form[K]) {
    draft.change({ ...form, [key]: value, ...(key === 'status' && value === 'open' ? { grade: '' } : {}) })
  }

  return (
    <form
      className="grades-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canWrite || target?.archived_at) return
        const snapshot = draft.begin()
        if (snapshot) save.mutate(snapshot)
      }}
    >
      {save.error && <Failure message={save.error} />}
      {draft.changed && (
        <div>
          <p role="status">{t('draftChanged')}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={draft.pending}
            onClick={() => {
              draft.discard()
              save.reset()
            }}
          >
            {t('discardDraftReload')}
          </Button>
        </div>
      )}
      <label>
        {t('moduleNameLabel')}
        <input required maxLength={300} value={form.title} onChange={(event) => change('title', event.target.value)} />
      </label>
      <label>
        {t('semesterLabel')}
        <select value={form.semester_id} onChange={(event) => change('semester_id', event.target.value)}>
          <option value="">{t('noSemesterOption')}</option>
          {semesters.map((semester) => (
            <option key={semester.id} value={semester.id}>
              {semester.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('ectsLabel')}
        <input
          type="number"
          required
          min="0.01"
          max="120"
          step="0.01"
          value={form.ects}
          onChange={(event) => change('ects', event.target.value)}
        />
      </label>
      <label>
        {t('statusLabel')}
        <select value={form.status} onChange={(event) => change('status', event.target.value as Module['status'])}>
          <option value="open">{t('statusOpen')}</option>
          <option value="passed">{t('statusPassed')}</option>
          <option value="failed">{t('statusFailed')}</option>
        </select>
      </label>
      <label>
        {t('actualGradeLabel')}
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          disabled={form.status === 'open'}
          value={form.grade}
          onChange={(event) => change('grade', event.target.value)}
        />
      </label>
      <label>
        {t('attemptLabel')}
        <input
          type="number"
          min="1"
          max="20"
          step="1"
          value={form.attempt}
          onChange={(event) => change('attempt', event.target.value)}
        />
      </label>
      <label>
        {t('weightLabel')}
        <input
          type="number"
          min="0.01"
          max="1000"
          step="0.01"
          value={form.weight}
          onChange={(event) => change('weight', event.target.value)}
        />
      </label>
      <p className="muted-text">{t('weightHint')}</p>
      <div className="grades-actions">
        <Button type="submit" disabled={!canWrite || draft.pending || draft.changed || !!target?.archived_at}>
          {draft.pending ? t('savingButton') : t('saveModuleButton')}
        </Button>
        <Button type="button" variant="outline" disabled={draft.pending} onClick={onDone}>
          {t('cancelButton')}
        </Button>
      </div>
    </form>
  )
}

export function GradesPage() {
  const { t } = useT('grades')
  const labels = statusLabels(t)
  const [showArchived, setShowArchived] = useState(false)
  const path = `/api/grades${showArchived ? '?include_archived=true' : ''}`
  const { data, error, loading, reload } = useApi<Dashboard>(path)
  const { data: courses } = useApi<CoursesResponse>('/api/courses?all_semesters=true')
  const { data: primussStatus } = useApi<PrimussStatus>('/api/primuss/status')
  const { data: savedExams, reload: reloadExams } = useApi<SavedExam[]>('/api/primuss/exams')
  const canWrite = useWritableHost()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [editorGeneration, setEditorGeneration] = useState(0)
  const editorSession = useRef(0)
  function openEditor(id: number | 'new') {
    editorSession.current += 1
    setEditorGeneration(editorSession.current)
    setEditing(id)
  }
  const [working, setWorking] = useState<number | null>(null)
  const [actionError, setActionError] = useState('')
  const [hypothetical, setHypothetical] = useState<Record<number, string>>({})
  const [scenario, setScenario] = useState<{ data: Dashboard; signature: string; inputs: string } | null>(null)
  const [scenarioPending, setScenarioPending] = useState<string | null>(null)
  const scenarioRequest = useRef(0)
  const openModules = data?.modules.filter((module) => module.status === 'open' && !module.archived_at) ?? []
  const scenarioGrades = Object.fromEntries(
    Object.entries(hypothetical).filter(
      ([id, value]) => value !== '' && openModules.some((module) => String(module.id) === id),
    ),
  )
  const scenarioSignature = JSON.stringify({ grades: scenarioGrades, modules: data?.modules })
  const visibleScenario = scenario?.signature === scenarioSignature ? scenario : null
  useLayoutEffect(() => {
    scenarioRequest.current += 1
    setScenarioPending(null)
  }, [scenarioSignature])
  const [primussPreview, setPrimussPreview] = useState<PrimussPreview | null>(null)
  const [primussBusy, setPrimussBusy] = useState(false)
  const [primussError, setPrimussError] = useState('')
  const [gradeSyncBusy, setGradeSyncBusy] = useState(false)
  const [gradeSyncReport, setGradeSyncReport] = useState<GradeSyncReport | null>(null)

  function refresh(generation = editorGeneration) {
    if (generation === editorSession.current) {
      editorSession.current += 1
      setEditing(null)
    }
    scenarioRequest.current += 1
    setScenario(null)
    setScenarioPending(null)
    reload()
  }

  async function archiveOrRestore(module: Module) {
    setWorking(module.id)
    setActionError('')
    try {
      await request(`/api/grades/${module.id}/${module.archived_at ? 'restore' : 'archive'}`, {
        method: 'POST',
        body: JSON.stringify({ expected_revision: module.revision }),
      })
      refresh()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      setWorking(null)
    }
  }

  async function calculateScenario() {
    const requestId = ++scenarioRequest.current
    const signature = scenarioSignature
    const inputs = openModules
      .filter((module) => scenarioGrades[module.id] !== undefined)
      .map((module) => `${module.title}: ${scenarioGrades[module.id]}`)
      .join(' · ')
    setScenarioPending(signature)
    setActionError('')
    try {
      const result = await request<Dashboard>('/api/grades/scenario', {
        method: 'POST',
        body: JSON.stringify({ grades: scenarioGrades }),
      })
      if (requestId === scenarioRequest.current) setScenario({ data: result, signature, inputs })
    } catch (cause) {
      if (requestId === scenarioRequest.current) setActionError(extractApiErrorMessage(cause))
    } finally {
      if (requestId === scenarioRequest.current) setScenarioPending(null)
    }
  }

  async function previewPrimuss() {
    setPrimussBusy(true)
    setPrimussError('')
    setPrimussPreview(null)
    try {
      const result = await request<PrimussPreview>(
        primussStatus?.sync_available ? '/api/primuss/recheck' : '/api/primuss/preview',
        { method: 'POST' },
      )
      setPrimussPreview(result)
      if (result.saved) reloadExams()
    } catch (cause) {
      setPrimussError(extractApiErrorMessage(cause))
    } finally {
      setPrimussBusy(false)
    }
  }

  async function syncPrimussGrades() {
    setGradeSyncBusy(true)
    setPrimussError('')
    setGradeSyncReport(null)
    try {
      const result = await request<GradeSyncReport>('/api/primuss/grades/sync', { method: 'POST' })
      setGradeSyncReport(result)
      reload()
    } catch (cause) {
      setPrimussError(extractApiErrorMessage(cause))
    } finally {
      setGradeSyncBusy(false)
    }
  }

  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')}>
      <div className="grades-stack">
        <p className="muted-text">{t('manualDataHint')}</p>
        {error && <Failure message={error} />}
        {actionError && <Failure message={actionError} />}
        {loading && !data && <Loading />}
        {data && (
          <>
            <Panel title={t('progressPanelTitle')}>
              <div className="grades-summary">
                <div>
                  <span>{t('earnedEctsLabel')}</span>
                  <strong>
                    {data.overall.earned_ects} / {data.overall.planned_ects}
                  </strong>
                </div>
                <div>
                  <span>{t('averageGradeLabel')}</span>
                  <strong>{data.average ?? '–'}</strong>
                  <small>{meanLabel(data.average_basis, t)}</small>
                </div>
              </div>
              {data.semesters.map((semester) => (
                <p className="grades-semester" key={semester.semester_id ?? 'none'}>
                  <strong>{semester.semester_name ?? t('noSemesterName')}</strong>
                  <span>{t('semesterEctsLine', { earned: semester.earned_ects, planned: semester.planned_ects })}</span>
                </p>
              ))}
              {!data.weighting_complete && data.average && <p className="muted-text">{t('incompleteWeightingHint')}</p>}
            </Panel>
            {data.semesters.length > 0 && (
              <Panel title={t('matrixPanelTitle')}>
                <p className="muted-text">{t('matrixIntro')}</p>
                <div className="semester-matrix">
                  {data.semesters.map((semester) => (
                    <section key={semester.semester_id ?? 'none'}>
                      <h3>
                        {semester.semester_name ?? t('noSemesterName')}
                        <small>
                          {t('semesterEctsShort', { earned: semester.earned_ects, planned: semester.planned_ects })}
                        </small>
                      </h3>
                      {data.modules
                        .filter((module) => !module.archived_at && module.semester_id === semester.semester_id)
                        .sort((left, right) => Number(right.ects) - Number(left.ects))
                        .map((module) => (
                          <div key={module.id} className="semester-matrix-row">
                            <strong>{module.title}</strong>
                            <span>{t('moduleEctsLabel', { ects: module.ects })}</span>
                            <span>
                              {module.grade === null
                                ? labels[module.status]
                                : t('gradeValueLabel', { grade: module.grade })}
                            </span>
                          </div>
                        ))}
                    </section>
                  ))}
                </div>
              </Panel>
            )}
            <Panel title={t('modulesPanelTitle')}>
              <div className="grades-actions">
                <Button disabled={!canWrite} onClick={() => openEditor('new')}>
                  {t('addModuleButton')}
                </Button>
                <Button variant="outline" onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? t('hideArchivedButton') : t('showArchivedButton')}
                </Button>
              </div>
              {editing === 'new' && (
                <ModuleForm
                  key={`new-${editorGeneration}`}
                  semesters={courses?.semesters ?? []}
                  onDone={() => refresh(editorGeneration)}
                />
              )}
              {!data.modules.length && (
                <Empty icon={GraduationCap} title={t('emptyModulesTitle')} text={t('emptyModulesText')} />
              )}
              <div className="grades-list">
                {data.modules.map((module) => (
                  <div className="grades-module" key={module.id}>
                    <div>
                      <strong>{module.title}</strong>
                      <p>
                        {t('moduleSummaryLine', {
                          semester: module.semester_name ?? t('noSemesterName'),
                          ects: module.ects,
                          status: labels[module.status],
                          source: module.source === 'manual' ? t('moduleSourceManual') : t('moduleSourcePrimuss'),
                        })}
                      </p>
                      <p>
                        {module.grade !== null ? t('gradeValueLabel', { grade: module.grade }) : t('noGradeYet')}
                        {module.attempt ? t('attemptSuffix', { attempt: module.attempt }) : ''}
                        {module.archived_at ? t('archivedSuffix', { date: localDate(module.archived_at) }) : ''}
                      </p>
                    </div>
                    {module.source === 'manual' && (
                      <div className="grades-actions">
                        {!module.archived_at && (
                          <Button variant="outline" disabled={!canWrite} onClick={() => openEditor(module.id)}>
                            {t('editButton')}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          disabled={!canWrite || working === module.id}
                          onClick={() => void archiveOrRestore(module)}
                        >
                          {module.archived_at ? t('restoreButton') : t('archiveButton')}
                        </Button>
                      </div>
                    )}
                    {editing === module.id && (
                      <ModuleForm
                        key={`${module.id}-${editorGeneration}`}
                        module={module}
                        semesters={courses?.semesters ?? []}
                        onDone={() => refresh(editorGeneration)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={t('scenarioPanelTitle')}>
              <p className="muted-text">{t('scenarioIntro')}</p>
              {data.modules
                .filter((module) => module.status === 'open' && !module.archived_at)
                .map((module) => (
                  <label className="grades-scenario" key={module.id}>
                    <span>{module.title}</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder={t('hypotheticalGradePlaceholder')}
                      value={hypothetical[module.id] ?? ''}
                      onChange={(event) => {
                        setHypothetical((previous) => ({ ...previous, [module.id]: event.target.value }))
                      }}
                    />
                  </label>
                ))}
              <Button
                variant="outline"
                disabled={!openModules.length || scenarioPending === scenarioSignature}
                onClick={() => void calculateScenario()}
              >
                {scenarioPending === scenarioSignature ? t('calculatingScenarioButton') : t('calculateScenarioButton')}
              </Button>
              {scenario && !visibleScenario && <p role="status">{t('scenarioInputsChanged')}</p>}
              {visibleScenario?.data.scenario_average && (
                <div className="grades-result" role="status">
                  <strong>{t('hypotheticalAverageResult', { average: visibleScenario.data.scenario_average })}</strong>
                  <span>
                    {t('scenarioResultLine', {
                      basis: meanLabel(visibleScenario.data.scenario_basis ?? 'no_grades', t),
                      ects: visibleScenario.data.overall.hypothetical_ects,
                    })}
                  </span>
                  <small>{t('scenarioInputsLabel', { values: visibleScenario.inputs })}</small>
                </div>
              )}
            </Panel>
            <Panel title={t('primussPanelTitle')}>
              <p className="muted-text">{t('primussIntro')}</p>
              {!primussStatus?.configured && !primussStatus?.grades_sync_available && (
                <p>
                  {primussStatus?.alias_map_available === false
                    ? t('missingAliasMapText')
                    : t('unverifiedStructureText')}
                </p>
              )}
              {primussStatus?.configured && !primussStatus.session_available && <p>{t('needsLoginText')}</p>}
              <Button
                variant="outline"
                disabled={!canWrite || !primussStatus?.configured || !primussStatus.session_available || primussBusy}
                onClick={() => void previewPrimuss()}
              >
                {primussBusy
                  ? t('checkingPrimussButton')
                  : primussStatus?.sync_available
                    ? t('checkAndSaveButton')
                    : t('readPrimussButton')}
              </Button>
              <Button
                variant="outline"
                disabled={
                  !canWrite ||
                  !primussStatus?.grades_sync_available ||
                  !primussStatus.session_available ||
                  gradeSyncBusy
                }
                onClick={() => void syncPrimussGrades()}
              >
                {gradeSyncBusy ? t('syncingGradesButton') : t('syncGradesButton')}
              </Button>
              {primussError && <Failure message={primussError} />}
              {gradeSyncReport && (
                <div className="grades-preview" role="status">
                  <p>
                    {t('gradeSyncSummary', {
                      created: gradeSyncReport.created,
                      updated: gradeSyncReport.updated,
                      unchanged: gradeSyncReport.unchanged,
                      skipped: gradeSyncReport.skipped,
                    })}
                  </p>
                  {gradeSyncReport.warnings.map((warning, index) => (
                    <p className="muted-text" key={index}>
                      {warning}
                    </p>
                  ))}
                </div>
              )}
              {primussPreview && (
                <div className="grades-preview" role="status">
                  {primussPreview.saved && <p>{t('registrationsSavedText')}</p>}
                  {primussPreview.proof_id && primussPreview.proof_at && (
                    <p>
                      {t('proofLinePrefix', { date: localDate(primussPreview.proof_at) })}
                      <ProofImageButton
                        proofId={primussPreview.proof_id}
                        label={t('openImageLink')}
                        takenAt={localDate(primussPreview.proof_at)}
                      />
                    </p>
                  )}
                  <h3>{t('examsHeading')}</h3>
                  {!primussPreview.exams.length && <p>{t('noExamsDetected')}</p>}
                  {primussPreview.exams.map((exam, index) => (
                    <div className="grades-module" key={`${exam.title}-${index}`}>
                      <strong>{exam.title}</strong>
                      <p>
                        {t('registrationLine', { status: registrationLabel(t, exam.registration) })}
                        {exam.registration_text ? t('portalTextSuffix', { text: exam.registration_text }) : ''}
                      </p>
                      <p>
                        {t('examLine', {
                          date: exam.exam_at ? localDate(exam.exam_at) : t('unclearLabel'),
                          deadline: exam.registration_deadline
                            ? localDate(exam.registration_deadline)
                            : t('unclearLabel'),
                        })}
                      </p>
                    </div>
                  ))}
                  <h3>{t('gradesHeading')}</h3>
                  {!primussPreview.grades.length && <p>{t('noGradesDetected')}</p>}
                  {primussPreview.grades.map((grade, index) => (
                    <div className="grades-module" key={`${grade.title}-${index}`}>
                      <strong>{grade.title}</strong>
                      <p>
                        {t('portalValueLine', {
                          value: grade.value ?? t('unclearLabel'),
                          ects: grade.ects ?? t('unclearLabel'),
                          status: grade.status ?? t('unclearLabel'),
                        })}
                      </p>
                    </div>
                  ))}
                  {primussPreview.warnings.map((warning, index) => (
                    <p className="muted-text" key={index}>
                      {warning}
                    </p>
                  ))}
                </div>
              )}
              {savedExams && savedExams.length > 0 && (
                <div className="grades-preview">
                  <h3>{t('recentRegistrationsHeading')}</h3>
                  {savedExams.map((exam) => (
                    <div className="grades-module" key={exam.id}>
                      <strong>{exam.title}</strong>
                      <p>
                        {registrationLabel(t, exam.registration)}
                        {t('checkedSuffix', { date: localDate(exam.checked_at) })}
                        {exam.exam_at ? t('examSuffix', { date: localDate(exam.exam_at) }) : ''}
                      </p>
                      {exam.proof_id && (
                        <ProofImageButton
                          proofId={exam.proof_id}
                          label={t('openProofImageLink')}
                          takenAt={localDate(exam.checked_at)}
                        />
                      )}
                      <EntityProperties
                        title={t('examDetailsTitle')}
                        rows={[
                          { label: t('registrationRowLabel'), value: registrationLabel(t, exam.registration) },
                          {
                            label: t('examRowLabel'),
                            value: exam.exam_at ? localDate(exam.exam_at) : t('noExamDateText'),
                          },
                          { label: t('checkedRowLabel'), value: localDate(exam.checked_at) },
                          { label: t('proofRowLabel'), value: exam.proof_id ? t('proofSavedText') : t('noProofText') },
                        ]}
                        metadata={{ kind: 'exam', id: String(exam.id) }}
                        activity={{ kind: 'exam', id: String(exam.id) }}
                      />
                      <LinkedItems kind="exam" id={String(exam.id)} />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </Shell>
  )
}
