// SPDX-License-Identifier: AGPL-3.0-or-later
import { courseName } from '@/lib/courseNames'

import { useWorkspaceState } from '@/lib/workspaceState'
import { beginNewFreeNote } from '@/lib/sourceNoteSave'
import { focusPath } from '@/lib/learningFocus'
import { ListPagination } from '@/components/ListPagination'
import { ScrollTabs } from '@/components/ScrollTabs'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { ArrowRight, Bell, CheckCircle2, Clock3, FileText, Plus, Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { localDate, useApi } from '@/api'
import type { CourseDetail, NotesResponse } from '@/types'
import { Shell } from '@/components/Shell'
import { Empty, Failure, ListRows, Loading, Panel } from '@/components/State'
import { useWritableHost } from '@/hooks/host'
import { useAnchorScroll } from '@/hooks/useAnchorScroll'
import { CourseMaterialPanel } from '@/components/CourseMaterialPanel'
import { CourseOfflinePanel } from '@/components/CourseOfflinePanel'
import { SubmissionCheck } from '@/components/SubmissionCheck'
import { AssignmentDeadline } from '@/components/AssignmentDeadline'
import { AssessmentQuestion } from '@/components/AssessmentQuestion'
import { TaskPeekDrawer } from '@/components/TaskPeekDrawer'
import { PersonalTaskStatus } from '@/components/PersonalTaskStatus'
import { LinkedItems } from '@/components/LinkedItems'
import { EntityProperties } from '@/components/EntityProperties'
import { EntityActivity } from '@/components/EntityActivity'
import { AddonWidgetSlot } from '@/addons/AddonWidgetSlot'
import { CourseAssignmentCard, CourseResourceList } from './course/CourseResourceList'
import { useCourseActions } from './course/useCourseActions'
import { CourseDisplayName } from '@/components/CourseDisplayName'
import './CoursePage.css'
import './course/ResourceArrival.css'
export function CoursePage() {
  const canWrite = useWritableHost()
  const { t } = useT('courses')
  const { t: workspace } = useT('studyWorkspace')
  const { t: nav } = useT('nav')
  const { id } = useParams()
  const location = useLocation()
  const { hash } = location
  const navigate = useNavigate()
  const [view, setView] = useWorkspaceState(`course:${id}:view`, 'overview')
  const selectedView = hash.startsWith('#resource-') ? 'materials' : hash.startsWith('#assignment-') ? 'tasks' : view
  const [materialOffset, setMaterialOffset] = useWorkspaceState(`course:${id}:material-offset`, 0)
  const [noteOffset, setNoteOffset] = useWorkspaceState(`course:${id}:note-offset`, 0)
  const [search, setSearch] = useWorkspaceState(`course:${id}:search`, '')
  const settledSearch = useDebouncedValue(search)
  const materialParams = new URLSearchParams()
  if (selectedView === 'materials' && materialOffset) materialParams.set('offset', String(materialOffset))
  if (selectedView === 'materials' && settledSearch) materialParams.set('q', settledSearch)
  const targetResource = /^#resource-(\d+)$/.exec(hash)?.[1]
  if (targetResource) {
    materialParams.set('resource_id', targetResource)
    materialParams.delete('offset')
    materialParams.delete('q')
  }
  const { data, error, loading, updatedAt, reload } = useApi<CourseDetail>(
    `/api/courses/${id}${materialParams.size ? `?${materialParams}` : ''}`,
    { retainScope: `course:${id}` },
  )
  const {
    data: courseNotes,
    error: notesError,
    loading: notesLoading,
  } = useApi<NotesResponse>(`/api/notes?course_id=${id}${noteOffset ? `&offset=${noteOffset}` : ''}`)
  useAnchorScroll(data?.course.id === Number(id), updatedAt)
  const { busy, actionError, downloadOther, changeActivity, changeSemester, changeGroup, changeGroupDownload } =
    useCourseActions(id, data, reload)
  const [historyOpen, setHistoryOpen] = useWorkspaceState(`course:${id}:history`, false)
  const [activeAssignmentId, setActiveAssignmentId] = useState<number | null>(null)
  const activeAssignment = data?.assignments.find((item) => item.id === activeAssignmentId)
  useEffect(() => {
    const assignmentId = /^#assignment-(\d+)$/.exec(hash)?.[1]
    setActiveAssignmentId(assignmentId ? Number(assignmentId) : null)
  }, [hash, data?.course.id])
  const materials = data?.resources.filter((item) => item.group_category !== 'other_group') ?? []
  if (data && ['mycampus', 'primuss_portal'].includes(data.course.source)) {
    return <Navigate to={`/university-documents?collection=${data.course.id}`} replace />
  }
  return (
    <Shell
      title={data ? courseName(data.course) : t('singular')}
      eyebrow={t('eyebrowDetail')}
      cachedAt={updatedAt}
      breadcrumbs={[
        { label: nav('courses'), to: '/courses' },
        { label: data ? courseName(data.course) : t('singular') },
      ]}
    >
      <div className="page-actions">
        <Link className="subtle-link" to="/courses">
          {t('allCourses')}
        </Link>
        {data && (
          <div className="course-header-actions">
            <Button asChild>
              <Link to={focusPath({ kind: 'course', id: data.course.id })}>
                {workspace('open')} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </Button>
            {canWrite && (
              <Link
                className="course-new-note"
                to={`/notes?new=1&course_id=${id}`}
                onClick={() => beginNewFreeNote(Number(id))}
              >
                <Plus size={16} />
                {t('newNote')}
              </Link>
            )}
            <details className="course-settings">
              <summary>
                <Settings2 size={16} />
                {t('courseSettings')}
              </summary>
              <div className="course-settings-popover">
                <CourseDisplayName key={data.course.id} course={data.course} disabled={!canWrite} reload={reload} />
                <div className="course-status-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || !canWrite}
                    onClick={() => void changeActivity()}
                  >
                    {data.course.is_active ? t('makeInactive') : t('makeActive')}
                  </Button>
                  <select
                    aria-label={t('assignSemester')}
                    className="native-select"
                    value={data.course.semester_id ?? ''}
                    disabled={busy || !canWrite}
                    onChange={(event) => changeSemester(event.target.value)}
                  >
                    <option value="" disabled>
                      {t('chooseSemester')}
                    </option>
                    {data.semesters.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
      {activeAssignment && data && (
        <TaskPeekDrawer
          key={activeAssignment.id}
          target={{ kind: 'assignment', id: activeAssignment.id }}
          onClose={() => {
            setActiveAssignmentId(null)
            if (window.location.hash.startsWith('#assignment-')) {
              setView('tasks')
              navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true })
            }
          }}
          detail={
            <div className="course-assignment-detail">
              <h2>{activeAssignment.title}</h2>
              <PersonalTaskStatus
                kind="assignment"
                id={activeAssignment.id}
                courseId={data.course.id}
                removed={activeAssignment.removed_upstream}
              />
              <p className="course-assignment-course">{courseName(data.course)}</p>
              <div className="course-assignment-date">
                <Clock3 size={18} />
                <strong>{activeAssignment.due_at ? localDate(activeAssignment.due_at) : t('noDeadline')}</strong>
              </div>
              <div className="course-deadline-tools">
                <AssignmentDeadline
                  key={`${activeAssignment.id}-${activeAssignment.due_at}`}
                  item={activeAssignment}
                  onSaved={reload}
                  showDescription={false}
                />
              </div>
              {activeAssignment.description && (
                <section className="course-assignment-body">
                  <h3>{t('assignmentText')}</h3>
                  <AssessmentQuestion text={activeAssignment.description} />
                </section>
              )}
              {canWrite && !activeAssignment.removed_upstream && (
                <Link
                  className="subtle-link"
                  to={`/notes?new=1&course_id=${data.course.id}&assignment_id=${activeAssignment.id}`}
                  onClick={() => beginNewFreeNote(data.course.id)}
                >
                  {t('workInApp')}
                </Link>
              )}
              {activeAssignment.url && (
                <a className="course-source-link" href={activeAssignment.url} target="_blank" rel="noreferrer">
                  {t('openOnMoodle')} <ArrowRight size={14} />
                </a>
              )}
              {!activeAssignment.removed_upstream && activeAssignment.delivery !== 'in_person' && (
                <SubmissionCheck assignmentId={activeAssignment.id} />
              )}
              <EntityProperties
                title={t('assignmentDetailsTitle')}
                rows={[
                  { label: t('courseLabel'), value: data.course.name },
                  {
                    label: t('dueLabel'),
                    value: activeAssignment.due_at ? localDate(activeAssignment.due_at) : t('noDeadline'),
                  },
                  {
                    label: t('moodleLabel'),
                    value: activeAssignment.removed_upstream ? t('moodleRemoved') : t('moodlePresent'),
                  },
                ]}
                metadata={{ kind: 'assignment', id: String(activeAssignment.id) }}
                activity={{ kind: 'assignment', id: String(activeAssignment.id) }}
              />
            </div>
          }
        />
      )}
      {actionError && <Failure message={actionError} />}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : (
        data && (
          <div className={`course-sections course-workspace view-${selectedView}`}>
            {!data.course.is_active && (
              <p className="course-inactive-note">
                <Badge>{t('inactive')}</Badge> {t('inactiveHint')}
              </p>
            )}
            <ScrollTabs className="course-tabs" label={t('courseViews')}>
              {(['overview', 'materials', 'tasks', 'notes'] as const).map((tab) => (
                <Link
                  key={tab}
                  to={`/courses/${id}`}
                  aria-current={selectedView === tab ? 'page' : undefined}
                  onClick={() => setView(tab)}
                >
                  {t(`tab_${tab}`)}
                  <span>
                    {tab === 'materials'
                      ? (data.page?.total ?? materials.length)
                      : tab === 'tasks'
                        ? data.assignments.length
                        : tab === 'notes'
                          ? (courseNotes?.page?.total ?? courseNotes?.notes.length ?? 0)
                          : ''}
                  </span>
                </Link>
              ))}
            </ScrollTabs>
            <CourseOfflinePanel detail={data} notes={courseNotes} />
            {data.group_assignments.length > 0 && (
              <div className="course-group-settings">
                <Panel title={t('groupAssignmentTitle')}>
                  <p className="muted-text mb-4">{t('groupAssignmentDescription')}</p>
                  {data.group_assignments.map((item) => (
                    <div className="group-assignment" key={item.section_id}>
                      <div>
                        <strong>{data.sections.find((section) => section.id === item.section_id)?.name}</strong>
                        {item.needs_confirmation && (
                          <Badge className="ml-2 status-badge warn">{t('needsConfirmation')}</Badge>
                        )}
                        {item.suggested_status && item.needs_confirmation && (
                          <span className="row-subtitle">
                            {t('suggestionLabel')}{' '}
                            {item.suggested_status === 'own_group'
                              ? t('ownGroup')
                              : item.suggested_status === 'other_group'
                                ? t('otherGroup')
                                : t('unclear')}
                          </span>
                        )}
                      </div>
                      <select
                        className="native-select"
                        aria-label={t('groupForLabel', {
                          section: data.sections.find((section) => section.id === item.section_id)?.name,
                        })}
                        value={item.status}
                        onChange={(event) => changeGroup(item.section_id, event.target.value)}
                        disabled={busy || !canWrite}
                      >
                        <option value="unassigned" disabled>
                          {t('assignGroup')}
                        </option>
                        <option value="own_group">{t('ownGroup')}</option>
                        <option value="other_group">{t('otherGroup')}</option>
                        <option value="general">{t('general')}</option>
                      </select>
                      {item.needs_confirmation && item.status !== 'unassigned' && (
                        <Button
                          variant="outline"
                          disabled={busy || !canWrite}
                          onClick={() => changeGroup(item.section_id, item.status)}
                        >
                          {t('confirmSuggestion')}
                        </Button>
                      )}
                    </div>
                  ))}
                  <label className="group-download">
                    <input
                      type="checkbox"
                      checked={downloadOther ?? data.course.download_other_groups}
                      disabled={busy || !canWrite}
                      onChange={(event) => changeGroupDownload(event.target.checked)}
                    />{' '}
                    {t('downloadOtherGroups')}
                  </label>
                </Panel>
              </div>
            )}
            <div className="course-content">
              <div id="course-materials" className="course-materials">
                <Panel
                  title={selectedView === 'overview' ? t('recentMaterials') : t('materialsTitle')}
                  action={
                    selectedView === 'overview' ? (
                      <Link className="subtle-link" to={`/courses/${id}`} onClick={() => setView('materials')}>
                        {t('allMaterials')} <ArrowRight size={14} />
                      </Link>
                    ) : null
                  }
                >
                  {selectedView === 'materials' && (
                    <input
                      className="course-material-search"
                      type="search"
                      aria-label={t('searchMaterials')}
                      placeholder={t('searchMaterials')}
                      value={targetResource ? '' : search}
                      maxLength={200}
                      onChange={(event) => {
                        setMaterialOffset(0)
                        setSearch(event.target.value)
                        if (targetResource) {
                          setView('materials')
                          navigate(
                            { pathname: location.pathname, search: location.search, hash: '' },
                            { replace: true },
                          )
                        }
                      }}
                    />
                  )}
                  {data.resources.some((resource) => resource.group_category !== 'other_group') ? (
                    selectedView === 'overview' ? (
                      <CourseResourceList
                        recent
                        detail={data}
                        hash={hash}
                        canWrite={canWrite}
                        courseId={id}
                        resources={[...materials]
                          .sort((a, b) => (data.versions[b.id]?.[0]?.id ?? 0) - (data.versions[a.id]?.[0]?.id ?? 0))
                          .slice(0, 6)}
                      />
                    ) : (
                      <>
                        {[...new Set(materials.map((item) => item.section_id))]
                          .sort(
                            (a, b) =>
                              (data.sections.find((item) => item.id === a)?.position ?? 0) -
                              (data.sections.find((item) => item.id === b)?.position ?? 0),
                          )
                          .map((sectionId) => (
                            <section className="course-material-group" key={sectionId ?? 'other'}>
                              <h3>
                                {data.sections.find((section) => section.id === sectionId)?.name ?? t('otherSection')}
                              </h3>
                              <CourseResourceList
                                detail={data}
                                hash={hash}
                                canWrite={canWrite}
                                courseId={id}
                                resources={materials.filter((item) => item.section_id === sectionId)}
                              />
                            </section>
                          ))}
                        {materials.length === 0 && <p className="muted-text">{t('noMatchingMaterials')}</p>}
                      </>
                    )
                  ) : selectedView === 'materials' && search.trim() && !targetResource ? (
                    <p className="muted-text">{t('noMatchingMaterials')}</p>
                  ) : (
                    <Empty icon={FileText} title={t('noMaterialsTitle')} text={t('noMaterialsText')} />
                  )}
                </Panel>
                {selectedView === 'materials' && (
                  <ListPagination
                    page={data.page}
                    onPage={(offset) => {
                      setMaterialOffset(offset)
                      if (targetResource) {
                        setView('materials')
                        setSearch('')
                        navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true })
                      }
                    }}
                  />
                )}
              </div>
              <aside className="course-side">
                <div id="course-tasks" className="course-task-section">
                  <Panel title={t('tasksTitle')}>
                    {data.assignments.length ? (
                      <div className="course-task-list">
                        {[...data.assignments]
                          .sort(
                            (a, b) =>
                              Number(a.removed_upstream) - Number(b.removed_upstream) ||
                              (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'),
                          )
                          .map((item) => (
                            <CourseAssignmentCard key={item.id} item={item} onOpen={setActiveAssignmentId} />
                          ))}
                      </div>
                    ) : (
                      <div className="course-quiet-empty">
                        <CheckCircle2 size={18} />
                        <span>{t('noTasksTitle')}</span>
                      </div>
                    )}
                  </Panel>
                </div>
                <div className="course-notes" id="course-notes">
                  <Panel
                    title={t('notesTitle')}
                    action={
                      canWrite ? (
                        <Link
                          className="subtle-link"
                          to={`/notes?new=1&course_id=${id}`}
                          onClick={() => beginNewFreeNote(Number(id))}
                        >
                          {t('newNote')}
                        </Link>
                      ) : null
                    }
                  >
                    {notesLoading && !courseNotes ? (
                      <Loading />
                    ) : notesError ? (
                      <Failure message={notesError} />
                    ) : courseNotes?.notes.length ? (
                      <>
                        <ListRows>
                          {courseNotes.notes.map((note) => (
                            <div className="data-row" key={note.id}>
                              <FileText size={17} className="row-icon" />
                              <div>
                                <Link to={`/notes?id=${note.id}&course_id=${id}`}>{note.title}</Link>
                                <span className="row-subtitle">
                                  {t('versionLabel', { version: note.current_revision })} · {localDate(note.updated_at)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </ListRows>
                        <ListPagination page={courseNotes.page} onPage={setNoteOffset} />
                      </>
                    ) : (
                      <Empty icon={FileText} title={t('noNotesTitle')} text={t('noNotesText')} />
                    )}
                  </Panel>
                </div>
                {selectedView === 'overview' && data.announcements.length > 0 && (
                  <div className="course-announcements">
                    <Panel title={t('announcementsTitle')}>
                      <ListRows>
                        {data.announcements.map((item) => (
                          <div className="data-row" key={item.id}>
                            <Bell size={17} className="row-icon" />
                            <div>
                              {item.url ? (
                                <a href={item.url} target="_blank" rel="noreferrer">
                                  {item.title}
                                </a>
                              ) : (
                                <strong>{item.title}</strong>
                              )}
                              <span className="row-subtitle">{localDate(item.created_at)}</span>
                            </div>
                          </div>
                        ))}
                      </ListRows>
                    </Panel>
                  </div>
                )}
              </aside>
            </div>
            {data.resources.some((resource) => resource.group_category === 'other_group') && (
              <div className="course-materials-extra">
                <Panel title={t('otherGroupsMaterialTitle')}>
                  <CourseResourceList
                    detail={data}
                    hash={hash}
                    canWrite={canWrite}
                    courseId={id}
                    resources={data.resources.filter((resource) => resource.group_category === 'other_group')}
                  />
                </Panel>
              </div>
            )}
            <details className="course-tools">
              <summary>
                {t('moreTools')} <span>{t('moreToolsHint')}</span>
              </summary>
              <div className="course-tools-content">
                <CourseMaterialPanel key={id} courseId={Number(id)} />
                <Panel title={t('relations')}>
                  <LinkedItems kind="course" id={String(data.course.id)} />
                </Panel>
              </div>
            </details>
            <details
              className="course-history"
              open={historyOpen}
              onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
            >
              <summary>{t('courseHistory')}</summary>
              {historyOpen && <EntityActivity kind="course" id={String(data.course.id)} />}
            </details>
            <AddonWidgetSlot slot="course.tools" courseId={data.course.id} />
            <AddonWidgetSlot slot="course.sidebar" courseId={data.course.id} />
          </div>
        )
      )}
    </Shell>
  )
}
