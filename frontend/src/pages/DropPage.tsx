// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderDown } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Empty, Failure, ListRows, Loading, Panel } from '@/components/State'
import { Shell } from '@/components/Shell'
import { useApiMutation, extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import type { CourseDetail, CoursesResponse } from '@/types'

type DropFile = { name: string; size: number; modified_at: string; imported: boolean; course_id: number | null }
type DropResponse = { folder: string; files: DropFile[] }
type DropImport = { resource_id: number; version_id: number; version: number; created_version: boolean }

function Assignment({ files, reload }: { files: DropFile[]; reload: () => void }) {
  const { t } = useT('drop')
  const canWrite = useWritableHost()
  const { data: courses, error: coursesError } = useApi<CoursesResponse>('/api/courses?all_semesters=true')
  const [courseId, setCourseId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [detail, setDetail] = useState<CourseDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [busyName, setBusyName] = useState<string | null>(null)
  const selectedCourse = courseId || String(courses?.courses[0]?.id ?? '')

  useEffect(() => {
    if (!selectedCourse) return
    const controller = new AbortController()
    void request<CourseDetail>(`/api/courses/${selectedCourse}`, { signal: controller.signal })
      .then((value) => {
        setDetail(value)
        setDetailError('')
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setDetailError(extractApiErrorMessage(cause))
      })
    return () => controller.abort()
  }, [selectedCourse])

  const importFile = useApiMutation<DropImport & { name: string; courseId: string }, string>(
    async (name: string) => {
      setBusyName(name)
      const result = await request<DropImport>(`/api/drop/${encodeURIComponent(name)}/assign`, {
        method: 'POST',
        body: JSON.stringify({ course_id: Number(selectedCourse), section_id: sectionId ? Number(sectionId) : null }),
      })
      return { ...result, name, courseId: selectedCourse }
    },
    { onSuccess: () => reload() },
  )
  const busy = busyName !== null && importFile.pending ? busyName : null

  return (
    <>
      {coursesError && <Failure message={coursesError} />}
      {detailError && <Failure message={detailError} />}
      {importFile.error && <Failure message={importFile.error} />}
      {importFile.data && (
        <p role="status" className="muted-text mb-4">
          {importFile.data.created_version ? t('importedPrefix') : t('alreadyImportedPrefix')}:{' '}
          <Link to={`/courses/${importFile.data.courseId}#resource-${importFile.data.resource_id}`}>
            {importFile.data.name}
          </Link>
        </p>
      )}
      {courses?.courses.length ? (
        <div className="drop-assignment">
          <label>
            {t('courseLabel')}
            <select
              className="native-select"
              value={selectedCourse}
              disabled={!canWrite || busy !== null}
              onChange={(event) => {
                setCourseId(event.target.value)
                setSectionId('')
                setDetail(null)
              }}
            >
              {courses.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('sectionLabel')}
            <select
              className="native-select"
              value={sectionId}
              disabled={!canWrite || busy !== null || !detail}
              onChange={(event) => setSectionId(event.target.value)}
            >
              <option value="">{t('otherSectionOption')}</option>
              {detail?.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="muted-text">{t('needsCourseText')}</p>
      )}
      {files.length ? (
        <ListRows>
          {files.map((file) => (
            <article className="drop-row" key={file.name}>
              <div>
                <strong>{file.name}</strong>
                <span className="row-subtitle">
                  {file.imported ? t('alreadyImportedStatus') : t('notYetAssignedStatus')}
                  {file.course_id &&
                    ` · ${courses?.courses.find((course) => course.id === file.course_id)?.name ?? t('courseLabel')}`}{' '}
                  · {localDate(file.modified_at)} · {Math.max(1, Math.ceil(file.size / 1024))} KB
                </span>
              </div>
              <Button
                variant="outline"
                disabled={!canWrite || !selectedCourse || !detail || busy !== null}
                onClick={() => {
                  importFile.reset()
                  importFile.mutate(file.name)
                }}
              >
                {file.imported ? t('recheckButton') : t('assignButton')}
              </Button>
            </article>
          ))}
        </ListRows>
      ) : (
        <Empty icon={FolderDown} title={t('emptyFilesTitle')} text={t('emptyFilesText')} />
      )}
    </>
  )
}

export function DropPage() {
  const { t } = useT('drop')
  const { data, error, loading, updatedAt, reload } = useApi<DropResponse>('/api/drop')
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [reload])
  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')} cachedAt={updatedAt}>
      <Panel title={t('folderFilesPanelTitle')}>
        <p className="muted-text mb-3">{t('folderFilesIntro')}</p>
        {data && <code className="drop-folder">{data.folder}</code>}
      </Panel>
      <Panel title={t('assignFilesPanelTitle')}>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <Failure message={error} />
        ) : (
          data && <Assignment files={data.files} reload={reload} />
        )}
      </Panel>
    </Shell>
  )
}
