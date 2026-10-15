// SPDX-License-Identifier: AGPL-3.0-or-later
import './CourseDisplayName.css'
import { useState } from 'react'
import { notifySyncCompleted, request } from '@/api'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { useBusyAction } from '@/hooks/useBusyAction'
import type { CourseDetail } from '@/types'

export function CourseDisplayName({
  course,
  disabled,
  reload,
}: {
  course: CourseDetail['course']
  disabled: boolean
  reload: () => void
}) {
  const { t } = useT('courses')
  const [value, setValue] = useState(course.display_name ?? '')
  const [expected, setExpected] = useState(course.display_name ?? null)
  const { busy, error, run } = useBusyAction()
  return (
    <form
      className="course-display-name"
      onSubmit={async (event) => {
        event.preventDefault()
        const saved = await run(async () => {
          const saved = await request<{ display_name: string | null }>(`/api/courses/${course.id}/display-name`, {
            method: 'PATCH',
            body: JSON.stringify({ display_name: value, expected_display_name: expected }),
          })
          setValue(saved.display_name ?? '')
          setExpected(saved.display_name)
        })
        if (saved) {
          notifySyncCompleted()
          reload()
        }
      }}
    >
      <label>
        {t('displayName')}
        <input
          value={value}
          maxLength={80}
          disabled={disabled || busy}
          placeholder={course.name}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <p className="muted-text">{t('originalName', { name: course.name })}</p>
      <p className="muted-text">{t('displayNameHint')}</p>
      <Button size="sm" variant="outline" disabled={disabled || busy}>
        {t('saveDisplayName')}
      </Button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
