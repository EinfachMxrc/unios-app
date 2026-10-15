// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { useT } from '@/i18n/useT'
import type { Keys, TypedT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { EntityProperties } from '@/components/EntityProperties'
import { LinkedItems } from '@/components/LinkedItems'
import { useApiMutation, extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import type { TopicStatus } from '@/types'

type StudyModule = {
  id: number
  course_id: number
  course_name: string
  name: string
  revision: number
  topic_ids: number[]
  topic_count: number
  measured_topics: number
  anki_retention: number | null
  exercise_accuracy: number | null
}

const confidenceKey: Record<TopicStatus['confidence'], Keys<'learning'>> = {
  low: 'confidenceLow',
  medium: 'confidenceMedium',
  high: 'confidenceHigh',
}

function percent(value: number | null, t: TypedT<'learning'>) {
  return value === null ? t('percentInsufficientData') : `${Math.round(value * 100)} %`
}

function TopicLinks({ id }: { id: number }) {
  const { t } = useT('learning')
  const [open, setOpen] = useState(false)
  return (
    <details className="mt-2" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm">{t('topicLinksSummary')}</summary>
      {open && <LinkedItems kind="topic" id={String(id)} />}
    </details>
  )
}

/** "Zusammenführen…": fold a duplicate topic into another one from the same course. */
function MergeTopicControl({
  item,
  candidates,
  onMerged,
}: {
  item: TopicStatus
  candidates: TopicStatus[]
  onMerged: () => void
}) {
  const { t } = useT('learning')
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState('')
  const merge = useApiMutation(
    (intoTopicId: number) =>
      request(`/api/learning/topics/${item.topic_id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ into_topic_id: intoTopicId }),
      }),
    {
      onSuccess: () => {
        setOpen(false)
        setTargetId('')
        onMerged()
      },
    },
  )
  if (!candidates.length) return null
  if (!open) {
    return (
      <button type="button" className="mt-2 text-xs text-muted-foreground" onClick={() => setOpen(true)}>
        {t('topicMergeButton')}
      </button>
    )
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="text-sm">
        {t('topicMergeIntoLabel')}
        <select
          className="native-select ml-2"
          aria-label={t('topicMergeTargetAria', { topic: item.topic })}
          value={targetId}
          disabled={merge.pending}
          onChange={(event) => setTargetId(event.target.value)}
        >
          <option value="">{t('topicMergeSelectPlaceholder')}</option>
          {candidates.map((candidate) => (
            <option key={candidate.topic_id} value={candidate.topic_id}>
              {candidate.topic}
            </option>
          ))}
        </select>
      </label>
      <Button size="sm" disabled={!targetId || merge.pending} onClick={() => merge.mutate(Number(targetId))}>
        {t('topicMergeConfirm')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={merge.pending}
        onClick={() => {
          setOpen(false)
          setTargetId('')
        }}
      >
        {t('topicMergeCancel')}
      </Button>
      {merge.error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {merge.error}
        </p>
      )}
    </div>
  )
}

export function LearningStatusPanel() {
  const { t } = useT('learning')
  const { data, error, loading, reload } = useApi<TopicStatus[]>('/api/learning/topics')
  const { data: modules, reload: reloadModules } = useApi<StudyModule[]>('/api/learning/modules')
  const canWrite = useWritableHost()
  const [newName, setNewName] = useState('')
  const [newCourse, setNewCourse] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const courses = Array.from(new Map((data ?? []).map((item) => [item.course_id, item.course_name])).entries())

  async function createModule() {
    if (!newName.trim() || !newCourse) return
    setBusy(true)
    setActionError('')
    try {
      await request('/api/learning/modules', {
        method: 'POST',
        body: JSON.stringify({
          course_id: Number(newCourse),
          name: newName.trim(),
        }),
      })
      setNewName('')
      reloadModules()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function renameModule(module: StudyModule) {
    setBusy(true)
    setActionError('')
    try {
      await request(`/api/learning/modules/${module.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expected_revision: module.revision,
          name: editName.trim(),
        }),
      })
      setEditing(null)
      reloadModules()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function assignTopic(item: TopicStatus, moduleId: string) {
    setBusy(true)
    setActionError('')
    try {
      await request(`/api/learning/modules/topics/${item.topic_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expected_module_id: item.module_id,
          module_id: moduleId ? Number(moduleId) : null,
        }),
      })
      reload()
      reloadModules()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function topicRow(item: TopicStatus) {
    return (
      <div className="data-row" key={item.topic_id}>
        <div className="min-w-0 flex-1">
          <strong>{item.topic}</strong>
          <span className="row-subtitle">{t(confidenceKey[item.confidence])}</span>
          <p className="mt-1 text-sm">
            {t('topicAnkiRetention', { percent: percent(item.anki_retention, t), count: item.anki_review_count })}
          </p>
          <p className="text-sm">
            {t('topicExerciseAccuracy', {
              percent: percent(item.exercise_accuracy, t),
              count: item.exercise_attempt_count,
            })}
          </p>
          {item.last_review && (
            <p className="muted-text mt-1 text-sm">{t('topicLastReview', { date: localDate(item.last_review) })}</p>
          )}
          {canWrite && (
            <label className="mt-2 block text-sm">
              {t('topicModuleLabel')}
              <select
                className="native-select ml-2"
                value={item.module_id ?? ''}
                disabled={busy}
                onChange={(event) => void assignTopic(item, event.target.value)}
              >
                <option value="">{t('topicModuleNone')}</option>
                {modules
                  ?.filter((module) => module.course_id === item.course_id)
                  .map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {canWrite && (
            <MergeTopicControl
              item={item}
              candidates={(data ?? []).filter(
                (other) => other.course_id === item.course_id && other.topic_id !== item.topic_id,
              )}
              onMerged={reload}
            />
          )}
          <EntityProperties
            title={t('entityDetailsTitle')}
            rows={[
              { label: t('entityCourseLabel'), value: item.course_name },
              { label: t('entityDataLabel'), value: t(confidenceKey[item.confidence]) },
              {
                label: t('entityAnkiLabel'),
                value: t('entityAnkiValue', {
                  percent: percent(item.anki_retention, t),
                  count: item.anki_review_count,
                }),
              },
              {
                label: t('entityExercisesLabel'),
                value: t('entityExercisesValue', {
                  percent: percent(item.exercise_accuracy, t),
                  count: item.exercise_attempt_count,
                }),
              },
            ]}
            metadata={{ kind: 'topic', id: String(item.topic_id) }}
            activity={{ kind: 'topic', id: String(item.topic_id) }}
          />
          <TopicLinks id={item.topic_id} />
        </div>
      </div>
    )
  }

  return (
    <Panel title={t('statusTitle')} action={<Gauge size={20} />}>
      <p className="muted-text mb-4">{t('statusIntro')}</p>
      {canWrite && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            {t('entityCourseLabel')}
            <select
              className="native-select block"
              aria-label={t('courseSelectAria')}
              value={newCourse}
              onChange={(event) => setNewCourse(event.target.value)}
            >
              <option value="">{t('courseOptionPlaceholder')}</option>
              {courses.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {t('newModuleLabel')}
            <input
              className="block rounded border border-border bg-background px-2 py-1"
              value={newName}
              maxLength={120}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t('newModulePlaceholder')}
            />
          </label>
          <button
            type="button"
            className="rounded border border-border px-3 py-1 text-sm"
            disabled={busy || !newName.trim() || !newCourse}
            onClick={() => void createModule()}
          >
            {t('createModuleButton')}
          </button>
        </div>
      )}
      {actionError && (
        <p role="alert" className="text-destructive">
          {actionError}
        </p>
      )}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : data?.length ? (
        <div>
          {courses.map(([courseId, courseName]) => {
            const courseModules = (modules ?? []).filter((module) => module.course_id === courseId)
            const courseTopics = data.filter((item) => item.course_id === courseId)
            const unassigned = courseTopics.filter(
              (item) => !item.module_id || !courseModules.some((module) => module.id === item.module_id),
            )
            return (
              <section key={courseId} className="mb-6">
                <h3 className="mb-2 border-b border-border pb-1 text-sm font-semibold">{courseName}</h3>
                {courseModules.map((module) => (
                  <section key={module.id} className="mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {editing === module.id ? (
                        <>
                          <input
                            className="rounded border border-border bg-background px-2 py-1 text-sm"
                            value={editName}
                            maxLength={120}
                            onChange={(event) => setEditName(event.target.value)}
                            aria-label={t('moduleNameLabel')}
                          />
                          <button
                            type="button"
                            disabled={busy || !editName.trim()}
                            onClick={() => void renameModule(module)}
                          >
                            {t('moduleSave')}
                          </button>
                          <button type="button" onClick={() => setEditing(null)}>
                            {t('moduleCancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <h4 className="text-sm font-semibold">{module.name}</h4>
                          {canWrite && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground"
                              onClick={() => {
                                setEditing(module.id)
                                setEditName(module.name)
                              }}
                            >
                              {t('moduleRename')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <p className="row-subtitle">
                      {t('moduleTopicCount', {
                        topicCount: module.topic_count,
                        measured: module.measured_topics,
                        anki: percent(module.anki_retention, t),
                        exercises: percent(module.exercise_accuracy, t),
                      })}
                    </p>
                    <div className="row-list">
                      {courseTopics.filter((item) => item.module_id === module.id).map(topicRow)}
                    </div>
                  </section>
                ))}
                {unassigned.length > 0 && (
                  <section>
                    <h4 className="text-sm font-semibold">{t('moduleUnassigned')}</h4>
                    <div className="row-list">{unassigned.map(topicRow)}</div>
                  </section>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <Empty icon={Gauge} title={t('statusEmptyTitle')} text={t('statusEmptyText')} />
      )}
    </Panel>
  )
}
