// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FolderKanban, Plus, Loader2, Undo2 } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { ApiError, localDate, request, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import { LinkedItems } from '@/components/LinkedItems'
import { EntityProperties } from '@/components/EntityProperties'
import { SubmissionCheck } from '@/components/SubmissionCheck'
import { queryClient } from '@/offlineCache'
import './ProjectsPage.css'
import { ProjectEditor } from './projects/ProjectEditor'
import { GitHubPanel, MirrorPanel } from './projects/ProjectRepoPanels'
import type { MirrorSnapshot, Project, ProjectSummary, Todo } from './projects/projectTypes'

export function ProjectsPage() {
  const { t } = useT('projects')
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [archived, setArchived] = useState(false)
  const { data, error, loading, updatedAt } = useApi<ProjectSummary[]>(`/api/projects?include_archived=${archived}`)
  return <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')} cachedAt={updatedAt}>
    <div className="page-actions">
      <Button onClick={() => setCreating(!creating)}><Plus size={16} /> {creating ? t('closeButton') : t('newProjectButton')}</Button>
      <Button variant="outline" onClick={() => setArchived(!archived)}>{archived ? t('showActiveButton') : t('showArchivedButton')}</Button>
    </div>
    {creating && <Panel title={t('createPanelTitle')}><ProjectEditor onSaved={(project) => navigate(`/projects/${project.id}`)} /></Panel>}
    {loading && !data ? <Loading /> : error ? <Failure message={error} /> : data?.length ? (
      <div className="course-grid">{data.map((item) => <Link to={`/projects/${item.id}`} className="course-tile" key={item.id}>
        <span className="course-icon"><FolderKanban size={21} /></span>
        <strong>{item.name}</strong>
        <span>{item.course_name}{item.archived_at ? t('archivedSuffix') : ''}</span>
        <span>{item.deadline_at ? t('deadlinePrefix', { date: localDate(item.deadline_at) }) : t('noDeadline')} · {t('openTodosCount', { count: item.open_todo_count })}</span>
      </Link>)}</div>
    ) : <Panel title={t('yourProjectsPanelTitle')}><Empty icon={FolderKanban} title={t('emptyTitle')} text={t('emptyText')} /></Panel>}
  </Shell>
}

function ProjectDetail({ project }: { project: Project }) {
  const { t } = useT('projects')
  const { t: task } = useT('ownTaskSupport')
  const canWrite = useWritableHost()
  const [current, setCurrent] = useState(project)
  const { data: mirrorSnapshot } = useApi<MirrorSnapshot | null>(`/api/projects/${project.id}/mirror`, { enabled: Boolean(current.github_repo) })
  const [editing, setEditing] = useState(false)
  const [activeSubmissionId, setActiveSubmissionId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const actionLock = useRef(false)
  const [todoPending, setTodoPending] = useState<{ id: string; title: string; done: boolean } | null>(null)
  const [todoError, setTodoError] = useState('')
  const [todoMessage, setTodoMessage] = useState('')
  const [todoUndo, setTodoUndo] = useState<{ id: string; done: boolean; revision: number } | null>(null)
  useEffect(() => {
    if (!busy && !editing && project.revision > current.revision) { setCurrent(project); setTodoUndo(null) }
  }, [project, current.revision, busy, editing])
  useEffect(() => {
    if (!todoMessage) return
    const timer = window.setTimeout(() => setTodoMessage(''), 2000)
    return () => window.clearTimeout(timer)
  }, [todoMessage])

  async function refreshConflict(cause: unknown) {
    if (!(cause instanceof ApiError) || cause.status !== 409) return
    setTodoUndo(null)
    try {
      const latest = await request<Project>(`/api/projects/${current.id}`)
      setCurrent(latest)
      queryClient.setQueryData(['api', `/api/projects/${current.id}`], latest)
    } catch { /* Retain the original conflict message if refreshing also fails. */ }
  }

  async function mutate(path: string, payload: object) {
    if (actionLock.current) return
    actionLock.current = true; setTodoUndo(null); setTodoMessage('')
    setBusy(true)
    setError('')
    try {
      const updated = await request<Project>(path, { method: 'POST', body: JSON.stringify(payload) })
      setCurrent(updated)
      await queryClient.invalidateQueries({ queryKey: ['api', '/api/projects'] })
    } catch (cause) { setError(extractApiErrorMessage(cause)); await refreshConflict(cause) }
    finally { setBusy(false); actionLock.current = false }
  }

  async function setTodo(todo: Todo, done: boolean, reversing = false) {
    if (!canWrite || actionLock.current) return
    if (reversing && (!todoUndo || todoUndo.revision !== current.revision)) { setTodoUndo(null); setTodoError(task('undoExpired')); return }
    actionLock.current = true
    setBusy(true)
    setTodoError(''); setTodoMessage(''); setTodoUndo(null); setTodoPending({ id: todo.id, title: todo.title, done })
    try {
      const updated = await request<Project>(`/api/projects/${current.id}`, {
        method: 'PUT', body: JSON.stringify({ ...current, todos: current.todos.map((item) => item.id === todo.id ? { ...item, done } : item), expected_revision: current.revision }),
      })
      setCurrent(updated)
      queryClient.setQueryData(['api', `/api/projects/${current.id}`], updated)
      if (!reversing) setTodoUndo({ id: todo.id, done: todo.done, revision: updated.revision })
      setTodoMessage(reversing ? task('todoUndone') : task('todoSaved', { title: todo.title, state: task(done ? 'done' : 'open') }))
      await queryClient.invalidateQueries({ queryKey: ['api', '/api/projects'] })
      void queryClient.invalidateQueries({ queryKey: ['api', '/api/overview'] })
    } catch (cause) { setTodoError(extractApiErrorMessage(cause)); await refreshConflict(cause) }
    finally { setBusy(false); setTodoPending(null); actionLock.current = false }
  }

  return <Shell title={current.name} eyebrow={current.course_name}>
    <div className="page-actions">
      <Link to="/projects">{t('allProjectsLink')}</Link>
      <div className="project-actions">
        <Button variant="outline" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? t('viewButton') : t('editButton')}</Button>
        <Button variant="outline" disabled={!canWrite || busy} onClick={() => void mutate(`/api/projects/${current.id}/${current.archived_at ? 'restore' : 'archive'}`, { expected_revision: current.revision })}>
          {current.archived_at ? t('restoreButton') : t('archiveButton')}
        </Button>
      </div>
    </div>
    {error && <Failure message={error} />}
    {editing ? <Panel title={t('editPanelTitle')}><ProjectEditor key={current.revision} initial={current} onSaved={(updated) => { setCurrent(updated); setEditing(false); setTodoUndo(null) }} /></Panel> : <>
      <div className="two-column">
        <EntityProperties title={t('detailsTitle')} initiallyOpen rows={[
          { label: t('deadlineRowLabel'), value: current.deadline_at ? localDate(current.deadline_at) : t('noDeadlineRow') },
          { label: t('courseRowLabel'), value: <Link to={`/courses/${current.course_id}`}>{current.course_name}</Link> },
          { label: t('githubRowLabel'), value: current.github_repo ? <a href={`https://github.com/${current.github_repo}`}
            target="_blank" rel="noreferrer">{current.github_repo}</a> : t('notLinked') },
          { label: t('statusRowLabel'), value: current.archived_at ? t('archivedOn', { date: localDate(current.archived_at) }) : t('activeStatus') },
        ]} metadata={{ kind: 'project', id: String(current.id) }}
          activity={{ kind: 'project', id: String(current.id) }} />
        <Panel title={t('assignmentsLegend')}>
          {current.assignments.length ? current.assignments.map((item) => <div className="data-row" key={item.id}>
            <div>
              <strong>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</strong>
              {item.due_at && <span className="row-subtitle"> · {localDate(item.due_at)}</span>}
              <p><Link to={`/courses/${current.course_id}#assignment-${item.id}`}>{t('checkSubmissionLink')}</Link></p>
              <Button variant="outline" disabled={!canWrite} onClick={() => setActiveSubmissionId(activeSubmissionId === item.id ? null : item.id)}>
                {activeSubmissionId === item.id ? t('closeSubmissionButton') : t('prepareSubmissionButton')}
              </Button>
              {activeSubmissionId === item.id && <div className="mt-2">
                {mirrorSnapshot?.head && <p>
                  <a href={`/api/projects/${current.id}/mirror/archive`}>{t('downloadZipLink')}</a>
                  <span className="row-subtitle">{t('mirrorStampSuffix', { head: mirrorSnapshot.head.slice(0, 12) })}</span>
                </p>}
                <p className="muted-text">{t('submissionHint')}</p>
                <SubmissionCheck assignmentId={item.id}
                  projectArchive={mirrorSnapshot?.head ? { projectId: current.id, head: mirrorSnapshot.head } : undefined} />
              </div>}
            </div>
          </div>) : <p className="muted-text">{t('noAssignmentText')}</p>}
        </Panel>
      </div>
      <div className="two-column">
        <Panel title={t('todosTitle')}>
          {current.todos.length ? current.todos.map((todo) => <label className="project-check project-todo" aria-busy={todoPending?.id === todo.id} key={todo.id}>
            <input type="checkbox" checked={todoPending?.id === todo.id ? todoPending.done : todo.done} disabled={!canWrite || busy} onChange={() => void setTodo(todo, !todo.done)} />
            <span className={todo.done ? 'project-done' : ''}>{todo.title}</span>
            {todoPending?.id === todo.id && <Loader2 size={15} className="project-todo-pending" aria-hidden="true" />}
          </label>) : <p className="muted-text">{t('noTodosText')}</p>}
          <div className="project-todo-feedback"><span role="status">{todoPending ? task('todoSaving', { title: todoPending.title }) : todoMessage}</span>
            {todoUndo && <Button size="sm" variant="ghost" disabled={!canWrite || busy} onClick={() => {
              const todo = current.todos.find(item => item.id === todoUndo.id)
              if (todo) void setTodo(todo, todoUndo.done, true)
            }}><Undo2 size={14} aria-hidden="true" />{task('undo')}</Button>}
          </div>
          {todoError && <p className="project-todo-error" role="alert">{todoError}</p>}
        </Panel>
        <Panel title={t('membersLinksTitle')}>
          {current.members.map((item, index) => <p key={index}>{item.name}{item.github_username && <span className="row-subtitle">{t('githubHandleSuffix', { handle: item.github_username })}</span>}</p>)}
          {current.links.map((item, index) => <p key={index}><a href={item.url} target="_blank" rel="noreferrer">{item.label}</a></p>)}
          {!current.members.length && !current.links.length && <p className="muted-text">{t('noEntriesYet')}</p>}
        </Panel>
      </div>
      {current.notes && <Panel title={t('notesTitle')}><p className="project-notes">{current.notes}</p></Panel>}
      <Panel title={t('relationsTitle')}><LinkedItems kind="project" id={String(current.id)} /></Panel>
      {current.github_repo && <GitHubPanel projectId={current.id} />}
      {current.github_repo && <MirrorPanel projectId={current.id} />}
    </>}
  </Shell>
}

export function ProjectPage() {
  const { t } = useT('projects')
  const { id } = useParams()
  const { data, error, loading } = useApi<Project>(`/api/projects/${id}`)
  if (loading && !data) return <Shell title={t('loadingTitle')}><Loading /></Shell>
  if (error || !data) return <Shell title={t('loadingTitle')}><Failure message={error ?? t('notFoundText')} /></Shell>
  return <ProjectDetail key={data.id} project={data} />
}
