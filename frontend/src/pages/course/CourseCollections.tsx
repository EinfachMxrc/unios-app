// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/api'
import { Failure, Loading } from '@/components/State'
import { useWorkspaceState } from '@/lib/workspaceState'
import { useT } from '@/i18n/useT'
import { CollectionResults } from '../collections/CollectionResults'
import { CollectionPreview } from '../collections/CollectionPreview'
import type { Collection, Item, Result, View } from '../collections/collectionModel'
import '../CollectionsPage.css'
import './CourseCollections.css'

export function CourseCollections({ courseId }: { courseId: number }) {
  const { t } = useT('courses')
  const { t: collections } = useT('collections')
  const { data, error, loading, reload } = useApi<Collection[]>('/api/collections')
  const [identifier, select] = useWorkspaceState(`course:${courseId}:collection`, 0)
  const scoped = data?.filter((item) => item.config.course_id === courseId) ?? []
  const selected = scoped.find((item) => item.id === identifier) ?? scoped[0]
  return (
    <section className="course-collections" aria-label={t('savedViews')}>
      <div className="course-collections-heading">
        <h2>{t('savedViews')}</h2>
        <Link to={selected ? `/collections?id=${selected.id}` : `/collections?course_id=${courseId}`}>
          {selected ? t('manageView') : t('createView')}
        </Link>
      </div>
      {loading && !data ? (
        <Loading variant="rows" />
      ) : error ? (
        <Failure message={error} retry={reload} />
      ) : selected ? (
        <>
          <label className="course-collection-picker">
            {t('chooseSavedView')}
            <select value={selected.id} onChange={(event) => select(Number(event.target.value))}>
              {scoped.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <CourseCollection
            key={`${courseId}:${selected.id}`}
            collection={selected}
            label={collections('resultsTitle')}
          />
        </>
      ) : (
        <p className="muted-text">{t('noSavedViews')}</p>
      )}
    </section>
  )
}

function CourseCollection({ collection, label }: { collection: Collection; label: string }) {
  const { t } = useT('collections')
  const { t: courses } = useT('courses')
  const { data, error, loading, reload } = useApi<Result>(`/api/collections/${collection.id}/results`)
  const [view, setView] = useWorkspaceState<View>(`collection:${collection.id}:inline-view`, collection.config.view, {
    valid: (value): value is View => ['list', 'table', 'cards', 'board', 'calendar'].includes(String(value)),
  })
  const [preview, setPreview] = useState<Item | null>(null)
  const displayView = view === 'calendar' && collection.config.kind === 'topics' ? 'list' : view
  const options: [View, string][] = [
    ['list', t('viewList')],
    ['table', t('viewTable')],
    ['cards', t('viewCards')],
    ['board', t('viewBoard')],
    ['calendar', t('viewCalendar')],
  ]
  return (
    <>
      <div className="course-collection-toolbar">
        <span>
          {label}
          {data && ` · ${courses('viewResults', { shown: data.items.length, total: data.total })}`}
        </span>
        <label>
          {t('viewLabel')}
          <select value={displayView} onChange={(event) => setView(event.target.value as View)}>
            {options
              .filter(([kind]) => kind !== 'calendar' || collection.config.kind !== 'topics')
              .map(([kind, name]) => (
                <option key={kind} value={kind}>
                  {name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {loading && !data ? (
        <Loading variant="rows" />
      ) : error ? (
        <Failure message={error} retry={reload} />
      ) : (
        data && (
          <CollectionResults
            result={data}
            view={displayView}
            groupBy={collection.config.group_by}
            fields={collection.config.visible_fields}
            onPreview={setPreview}
          />
        )
      )}
      {preview && (
        <CollectionPreview key={`${preview.kind}:${preview.id}`} item={preview} onClose={() => setPreview(null)} />
      )}
    </>
  )
}
