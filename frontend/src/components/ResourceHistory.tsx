// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { useApi } from '@/api'
import type { components } from '@/generated/api'
import { useT } from '@/i18n/useT'
import { Failure, Loading } from '@/components/State'
import { ListPagination } from '@/components/ListPagination'

export function ResourceHistory({ resourceId, latestId }: { resourceId: number; latestId: number }) {
  const { t } = useT('courses')
  const { t: quality } = useT('quality')
  const [open, setOpen] = useState(false)
  const [offset, setOffset] = useState(0)
  const { data, loading, error } = useApi<components['schemas']['ResourceVersionsView']>(
    `/api/resources/${resourceId}/versions?offset=${offset}&limit=20`, { enabled: open },
  )
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{quality('versionHistory')}</summary>
    {open && <div>
      {loading && <Loading variant="rows" />}
      {error && <Failure message={error} />}
      {data?.versions.filter(item => item.id !== latestId).map(item => <a key={item.id} href={`/files/${item.id}`}>
        {t('downloadVersion', { version: item.version })}
      </a>)}
      {data?.page.total === 1 && <span>{quality('noPreviousVersions')}</span>}
      <ListPagination page={data?.page} onPage={setOffset} />
    </div>}
  </details>
}
