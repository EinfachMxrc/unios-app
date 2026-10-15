// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { notifySyncCompleted, request } from '@/api'
import { useBusyAction } from '@/hooks/useBusyAction'
import type { CourseDetail } from '@/types'

/**
 * Course settings: activity, semester, group per section and downloading other
 * groups' material. One action runs at a time; a new attempt clears the last
 * error, and a failed group-download toggle falls back to the server value.
 */
export function useCourseActions(id: string | undefined, detail: CourseDetail | null, reload: () => void) {
  const { busy, error: actionError, run: runAction } = useBusyAction()
  const [downloadOther, setDownloadOther] = useState<boolean | null>(null)
  useEffect(() => {
    setDownloadOther(null)
  }, [detail?.course.download_other_groups])

  function run(path: string, body: unknown, onError?: () => void) {
    return runAction(async () => {
      try {
        await request(path, { method: 'POST', body: JSON.stringify(body) })
      } catch (cause) {
        onError?.()
        throw cause
      }
    })
  }

  async function changeActivity() {
    if (!detail) return
    const active = detail.course.is_active
    const done = await run(`/api/entities/course/${id}/actions/course.set_activity`, {
      confirmed: true,
      input: { active: !active, expected: active },
    })
    if (!done) return
    notifySyncCompleted()
    reload()
  }

  async function changeSemester(value: string) {
    if (await run(`/api/courses/${id}/semester`, { semester_id: Number(value) })) reload()
  }

  async function changeGroup(sectionId: number, status: string) {
    if (await run(`/api/courses/${id}/sections/${sectionId}/group`, { status })) reload()
  }

  async function changeGroupDownload(enabled: boolean) {
    setDownloadOther(enabled)
    if (
      await run(`/api/courses/${id}/group-download`, { download_other_groups: enabled }, () => setDownloadOther(null))
    )
      reload()
  }

  return { busy, actionError, downloadOther, changeActivity, changeSemester, changeGroup, changeGroupDownload }
}
