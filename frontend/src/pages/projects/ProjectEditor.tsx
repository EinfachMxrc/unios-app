// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomId } from '@/lib/uuid'

import { useState } from 'react'
import { Save } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { request, useApi } from '@/api'
import { Failure } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import type { CourseDetail, CoursesResponse } from '@/types'
import { calendarInput, calendarInputInstant } from '@/lib/calendarEditing'
import type { Project, ProjectFields } from './projectTypes'

const blank: ProjectFields = {
  name: '',
  course_id: 0,
  deadline_at: null,
  notes: '',
  members: [],
  links: [],
  todos: [],
  assignment_ids: [],
  github_repo: null,
}

/** Changes one row of an editable list. */
function replaceAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item))
}

function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

/** Creates a project or edits one; an edit sends the revision it started from. */
export function ProjectEditor({ initial, onSaved }: { initial?: Project; onSaved: (project: Project) => void }) {
  const { t } = useT('projects')
  const canWrite = useWritableHost()
  const [form, setForm] = useState<ProjectFields>(initial ?? blank)
  const [deadlineInput, setDeadlineInput] = useState(() =>
    initial?.deadline_at ? calendarInput(initial.deadline_at) : '',
  )
  const { data: courses, error: courseError } = useApi<CoursesResponse>('/api/courses?all_semesters=true')
  const { data: course } = useApi<CourseDetail>(`/api/courses/${form.course_id}`, { enabled: Boolean(form.course_id) })
  const save = useApiMutation<Project, void>(
    () => {
      if (!form.name.trim() || !form.course_id) throw new Error(t('validationNameCourseRequired'))
      const deadlineAt =
        initial?.deadline_at && deadlineInput === calendarInput(initial.deadline_at)
          ? initial.deadline_at
          : deadlineInput
            ? calendarInputInstant(deadlineInput, initial?.deadline_at ?? undefined)
            : null
      if (deadlineInput && !deadlineAt) throw new Error(t('invalidCampusDateTime'))
      const payload = {
        ...form,
        name: form.name.trim(),
        deadline_at: deadlineAt,
        github_repo: form.github_repo?.trim() || null,
        members: form.members.filter((item) => item.name.trim()),
        links: form.links.filter((item) => item.label.trim() && item.url.trim()),
        todos: form.todos.filter((item) => item.title.trim()),
        ...(initial ? { expected_revision: initial.revision } : {}),
      }
      return request<Project>(initial ? `/api/projects/${initial.id}` : '/api/projects', {
        method: initial ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
    },
    { invalidate: ['/api/projects'], onSuccess: onSaved },
  )

  function change<K extends keyof ProjectFields>(key: K, value: ProjectFields[K]) {
    setForm((old) => ({ ...old, [key]: value }))
  }

  return (
    <div className="project-form">
      {save.error && <Failure message={save.error} />}
      {courseError && <Failure message={courseError} />}
      <div className="project-form-grid">
        <label>
          {t('nameLabel')}
          <input value={form.name} maxLength={200} onChange={(event) => change('name', event.target.value)} />
        </label>
        <label>
          {t('courseLabel')}
          <select
            value={form.course_id}
            onChange={(event) => {
              const courseId = Number(event.target.value)
              setForm((old) => ({ ...old, course_id: courseId, assignment_ids: [] }))
            }}
          >
            <option value={0}>{t('chooseCourseOption')}</option>
            {courses?.courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('deadlineLabel')}
          <input
            type="datetime-local"
            aria-label={t('deadlineLabel')}
            aria-describedby="project-deadline-campus"
            value={deadlineInput}
            onChange={(event) => setDeadlineInput(event.target.value)}
          />
          <small id="project-deadline-campus">{t('campusTimeHint', { zone: 'Europe/Berlin' })}</small>
        </label>
        <label>
          {t('githubLabel')}
          <input
            placeholder={t('githubPlaceholder')}
            value={form.github_repo ?? ''}
            onChange={(event) => change('github_repo', event.target.value)}
          />
        </label>
      </div>
      {course?.assignments.length ? (
        <fieldset>
          <legend>{t('assignmentsLegend')}</legend>
          {course.assignments.map((item) => (
            <label className="project-check" key={item.id}>
              <input
                type="checkbox"
                checked={form.assignment_ids.includes(item.id)}
                onChange={(event) =>
                  change(
                    'assignment_ids',
                    event.target.checked
                      ? [...form.assignment_ids, item.id]
                      : form.assignment_ids.filter((id) => id !== item.id),
                  )
                }
              />
              {item.title}
            </label>
          ))}
        </fieldset>
      ) : null}
      <fieldset>
        <legend>{t('todosLegend')}</legend>
        {form.todos.map((todo, index) => (
          <div className="project-inline" key={todo.id}>
            <input
              aria-label={t('todoAria', { index: index + 1 })}
              placeholder={t('todoPlaceholder')}
              value={todo.title}
              onChange={(event) => change('todos', replaceAt(form.todos, index, { title: event.target.value }))}
            />
            <label className="project-check">
              <input
                type="checkbox"
                checked={todo.done}
                onChange={(event) => change('todos', replaceAt(form.todos, index, { done: event.target.checked }))}
              />{' '}
              {t('doneLabel')}
            </label>
            <Button type="button" variant="outline" onClick={() => change('todos', removeAt(form.todos, index))}>
              {t('removeButton')}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => change('todos', [...form.todos, { id: randomId(), title: '', done: false }])}
        >
          {t('addTodoButton')}
        </Button>
      </fieldset>
      <fieldset>
        <legend>{t('membersLegend')}</legend>
        {form.members.map((member, index) => (
          <div className="project-inline" key={index}>
            <input
              aria-label={t('memberNameAria', { index: index + 1 })}
              placeholder={t('memberNamePlaceholder')}
              value={member.name}
              onChange={(event) => change('members', replaceAt(form.members, index, { name: event.target.value }))}
            />
            <input
              aria-label={t('memberGithubAria', { index: index + 1 })}
              placeholder={t('memberGithubPlaceholder')}
              value={member.github_username ?? ''}
              onChange={(event) =>
                change('members', replaceAt(form.members, index, { github_username: event.target.value }))
              }
            />
            <Button type="button" variant="outline" onClick={() => change('members', removeAt(form.members, index))}>
              {t('removeButton')}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => change('members', [...form.members, { name: '', github_username: null }])}
        >
          {t('addMemberButton')}
        </Button>
      </fieldset>
      <fieldset>
        <legend>{t('linksLegend')}</legend>
        {form.links.map((link, index) => (
          <div className="project-inline" key={index}>
            <input
              aria-label={t('linkNameAria', { index: index + 1 })}
              placeholder={t('linkLabelPlaceholder')}
              value={link.label}
              onChange={(event) => change('links', replaceAt(form.links, index, { label: event.target.value }))}
            />
            <input
              aria-label={t('linkUrlAria', { index: index + 1 })}
              type="url"
              placeholder={t('linkUrlPlaceholder')}
              value={link.url}
              onChange={(event) => change('links', replaceAt(form.links, index, { url: event.target.value }))}
            />
            <Button type="button" variant="outline" onClick={() => change('links', removeAt(form.links, index))}>
              {t('removeButton')}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => change('links', [...form.links, { label: '', url: '' }])}
        >
          {t('addLinkButton')}
        </Button>
      </fieldset>
      <label>
        {t('notesLabel')}
        <textarea
          rows={5}
          maxLength={20000}
          value={form.notes}
          onChange={(event) => change('notes', event.target.value)}
        />
      </label>
      <Button disabled={!canWrite || save.pending} onClick={() => save.mutate()}>
        <Save size={16} /> {initial ? t('saveChangesButton') : t('createButton')}
      </Button>
      {!canWrite && <p className="muted-text">{t('writeLockedHint')}</p>}
    </div>
  )
}
