// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, FileText, MessageCircleQuestion, NotebookPen } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { activeIntlLocale, localDate, request, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/Shell'
import { Failure, Loading } from '@/components/State'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import { useRevisionDraft, useRevisionDraftStore, type RevisionDraftStore, type RevisionSnapshot } from '@/hooks/useRevisionDraft'
import './JournalPage.css'
import type { CoursesResponse } from '@/types'

type JournalItem = { id: string; title: string; course_id: number | null; course_name: string | null; url: string | null }
type JournalCourse = { course_id: number; course_name: string; covered: string; revision: number }
type JournalView = {
  day: string; reflection: string; revision: number
  sessions: Array<{ id: number; title: string; course_id: number | null; course_name: string | null; starts_at: string; ends_at: string | null }>
  materials: JournalItem[]; notes: JournalItem[]; questions: JournalItem[]; jots: JournalItem[]
  reviews: number; attempts: number; incorrect_attempts: number; courses: JournalCourse[]
}

function todayInBerlin() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function ItemList({ items, empty }: { items: JournalItem[]; empty: string }) {
  return items.length ? <div className="journal-items">{items.map((item) => (
    <div className="journal-item" key={item.id}>
      {item.url ? <Link to={item.url}>{item.title}</Link> : <span>{item.title}</span>}
      {item.course_name && <small>{item.course_name}</small>}
    </div>
  ))}</div> : <p className="journal-empty">{empty}</p>
}

function CourseCoverage({ course, day, onSaved, reload, store }: { course: JournalCourse; day: string; onSaved: () => void;
  reload: () => void; store: RevisionDraftStore<string> }) {
  const { t } = useT('journal')
  const canWrite = useWritableHost()
  const draft = useRevisionDraft(`${day}:${course.course_id}`, { value: course.covered, revision: course.revision }, store)
  const covered = draft.value ?? ''

  const save = useApiMutation<JournalView, RevisionSnapshot<string>>(
    async snapshot => {
      const [savedDay, courseId] = snapshot.key.split(':')
      try { return await request<JournalView>(`/api/journal/${savedDay}/courses/${courseId}`, {
        method: 'PUT', body: JSON.stringify({ expected_revision: snapshot.revision, covered: snapshot.value }),
      }) } catch (cause) { draft.failed(snapshot); reload(); throw cause }
    },
    { invalidate: snapshot => [`/api/journal/${snapshot.key.split(':')[0]}`], onSuccess: (updated, snapshot) => {
      const stored = updated.courses.find(item => String(item.course_id) === snapshot.key.split(':')[1])
      if (stored && draft.acknowledge(snapshot, { value: stored.covered, revision: stored.revision })) onSaved()
    } },
  )

  return <div className="journal-course">
    <div className="journal-course-heading"><BookOpen size={16} /><strong>{course.course_name}</strong>
      <Link to={`/courses/${course.course_id}`}>{t('openCourseLink')} <ArrowRight size={13} /></Link></div>
    <details><summary>{course.covered ? t('readEntry') : t('addEntry')}</summary>
    {draft.changed && <div><p role="status">{t('draftChanged')}</p><Button size="sm" variant="outline"
      disabled={draft.pending} onClick={() => { draft.discard(); save.reset() }}>{t('discardDraftReload')}</Button></div>}
    <label className="sr-only" htmlFor={`covered-${course.course_id}`}>{t('coveredTodayLabel', { course: course.course_name })}</label>
    <textarea id={`covered-${course.course_id}`} value={covered} maxLength={5_000}
      disabled={!canWrite} onChange={(event) => draft.change(event.target.value)}
      placeholder={t('coveredPlaceholder')} rows={2} />
    <div className="journal-editor-footer"><span>{course.covered ? t('coverageHintFilled') : t('coverageHintEmpty')}</span>
      <Button size="sm" variant="outline" disabled={!canWrite || draft.pending || draft.changed || !draft.dirty}
        onClick={() => { const snapshot = draft.begin(); if (snapshot) save.mutate(snapshot) }}>{draft.pending ? t('savingLabel') : t('saveButton')}</Button></div>
    {save.error && <p role="alert" className="text-destructive">{save.error}</p>}
    </details>
  </div>
}

export function JournalPage() {
  const { t } = useT('journal')
  const params = useParams()
  const day = params.day ?? todayInBerlin()
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(`${day}T12:00:00Z`).getTime())
  const { data: response, error, loading, updatedAt, reload } = useApi<JournalView>(`/api/journal/${day}`, { enabled: validDay })
  const data = response?.day === day ? response : null
  const canWrite = useWritableHost()
  const coverageDrafts = useRevisionDraftStore<string>()
  const draft = useRevisionDraft(day, data ? { value: data.reflection, revision: data.revision } : undefined)
  const reflection = draft.value ?? ''
  const [addedCourses, setAddedCourses] = useState<Record<string, string>>({})
  const addedCourse = addedCourses[day] ?? ''
  function setAddedCourse(value: string) { setAddedCourses(previous => ({ ...previous, [day]: value })) }
  const { data: courseChoices } = useApi<CoursesResponse>('/api/courses')
  const chosenCourse = courseChoices?.courses.find(course => String(course.id) === addedCourse)
  const visibleCourses = data ? chosenCourse && !data.courses.some(course => course.course_id === chosenCourse.id)
    ? [...data.courses, { course_id: chosenCourse.id, course_name: chosenCourse.name, covered: '', revision: 0 }]
    : data.courses : []

  const saveReflection = useApiMutation<JournalView, RevisionSnapshot<string>>(
    async snapshot => {
      try { return await request<JournalView>(`/api/journal/${snapshot.key}/reflection`, {
        method: 'PUT', body: JSON.stringify({ expected_revision: snapshot.revision, reflection: snapshot.value }),
      }) } catch (cause) { draft.failed(snapshot); reload(); throw cause }
    },
    { invalidate: snapshot => [`/api/journal/${snapshot.key}`], onSuccess: (updated, snapshot) => {
      draft.acknowledge(snapshot, { value: updated.reflection, revision: updated.revision })
      if (snapshot.key === day) reload()
    } },
  )

  const readableDay = validDay ? new Intl.DateTimeFormat(activeIntlLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day}T12:00:00Z`)) : day
  return <Shell title={t('pageTitle')} cachedAt={updatedAt}>
    <div className="journal-navigation"><Link to={`/journal/${shiftDay(validDay ? day : todayInBerlin(), -1)}`} aria-label={t('prevDayAria')}><ArrowLeft size={17} /></Link>
      <strong>{readableDay}</strong><Link to={`/journal/${shiftDay(validDay ? day : todayInBerlin(), 1)}`} aria-label={t('nextDayAria')}><ArrowRight size={17} /></Link>
      {day !== todayInBerlin() && <Link className="journal-today-link" to="/journal">{t('todayLink')}</Link>}</div>
    {error && data && <Failure message={error} />}
    {!validDay ? <Failure message={t('invalidDateMessage')} /> : loading && !data ? <Loading /> : error && !data ? <Failure message={error} /> : data && <div className="journal-layout">
      <div className="journal-main">
        <section className="journal-section"><h2><CalendarDays size={18} /> {t('uniSectionTitle')}</h2>
          {data.sessions.length ? <div className="journal-items">{data.sessions.map((item) => <div className="journal-session" key={item.id}>
            <time>{localDate(item.starts_at, { hour: '2-digit', minute: '2-digit' })}{item.ends_at ? `–${localDate(item.ends_at, { hour: '2-digit', minute: '2-digit' })}` : ''}</time>
            <span>{item.course_id ? <Link to={`/courses/${item.course_id}`}>{item.course_name ?? item.title}</Link> : item.title}</span>
          </div>)}</div> : <p className="journal-empty">{t('noSessionsText')}</p>}
        </section>
        <section className="journal-section"><h2><NotebookPen size={18} /> {t('coveredTodayTitle')}</h2>
          <p className="journal-empty">{t('coveragePurpose')}</p>
          {visibleCourses.length ? visibleCourses.map((course) => <CourseCoverage key={course.course_id} course={course} day={day}
            store={coverageDrafts} reload={reload} onSaved={() => { setAddedCourse(''); reload() }} />)
            : <p className="journal-empty">{t('noCoursesText')}</p>}
          <select className="native-select journal-add-course" aria-label={t('addCourse')} value={addedCourse} onChange={(event) => setAddedCourse(event.target.value)}>
            <option value="">{t('addCourse')}</option>
            {courseChoices?.courses.filter((course) => !data.courses.some((item) => item.course_id === course.id)).map((course) =>
              <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
          {data.notes.length > 0 && <div className="journal-related"><strong>{t('editedNotesTitle')}</strong><ItemList items={data.notes} empty="" /></div>}
        </section>
        <section className="journal-section"><h2><MessageCircleQuestion size={18} /> {t('openQuestionsTitle')}</h2>
          <ItemList items={data.questions} empty={t('noQuestionsText')} /></section>
        <section className="journal-section journal-reflection"><h2>{t('noteToSelfTitle')}</h2>
          {draft.changed && <div><p role="status">{t('draftChanged')}</p><Button size="sm" variant="outline"
            disabled={draft.pending} onClick={() => { draft.discard(); saveReflection.reset() }}>{t('discardDraftReload')}</Button></div>}
          <textarea aria-label={t('myDailyNoteAria')} value={reflection} maxLength={10_000} rows={5}
            disabled={!canWrite} onChange={(event) => draft.change(event.target.value)}
            placeholder={t('reflectionPlaceholder')} />
          <div className="journal-editor-footer"><span>{t('reflectionHint')}</span>
            <Button size="sm" disabled={!canWrite || draft.pending || draft.changed || !draft.dirty}
              onClick={() => { const snapshot = draft.begin(); if (snapshot) saveReflection.mutate(snapshot) }}>{draft.pending ? t('savingLabel') : t('saveReflectionButton')}</Button></div>
          {saveReflection.error && <p role="alert" className="text-destructive">{saveReflection.error}</p>}
        </section>
      </div>
      <aside className="journal-aside">
        <section className="journal-section"><h2>{t('learningTitle')}</h2>
          <div className="journal-learning"><div><strong>{data.reviews}</strong><span>{t('ankiReviewsLabel')}</span></div>
            <div><strong>{data.attempts}</strong><span>{t('exercisesLabel')}</span></div>
            <div><strong>{data.incorrect_attempts}</strong><span>{t('errorsLabel')}</span></div></div>
          <Link className="journal-more" to="/learning">{t('viewLearningStatusLink')} <ArrowRight size={14} /></Link></section>
        <section className="journal-section"><h2><FileText size={18} /> {t('newMaterialsTitle')}</h2>
          <ItemList items={data.materials} empty={t('noNewMaterialsText')} /></section>
        <section className="journal-section"><h2>{t('ownThoughtsTitle')}</h2>
          <ItemList items={data.jots} empty={t('noJotsText')} /></section>
      </aside>
    </div>}
  </Shell>
}
