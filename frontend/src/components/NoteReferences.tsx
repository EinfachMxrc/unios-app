// SPDX-License-Identifier: AGPL-3.0-or-later

import { ArrowUpLeft, Link2 } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { request, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import { StudyPeekLink } from '@/components/StudyPeekLink'
import './NoteReferences.css'

type Reference = { id: string; title: string; course_name: string; excerpt: string; revision: number }
type References = { backlinks: Reference[]; mentions: Reference[]; can_link: boolean }

export function NoteReferences({ id, onSaved }: { id: string; onSaved: () => void }) {
  const { t } = useT('notes')
  const canWrite = useWritableHost()
  const { data, error, reload } = useApi<References>(`/api/notes/${id}/references`)
  const link = useApiMutation(
    (item: Reference) =>
      request(`/api/notes/${id}/link-mention/${item.id}`, {
        method: 'POST',
        body: JSON.stringify({ expected_revision: item.revision }),
      }),
    {
      onSuccess: () => {
        reload()
        onSaved()
      },
    },
  )

  return (
    <section className="note-references" aria-label={t('referencesAria')}>
      <h3>{t('referencesTitle')}</h3>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="note-reference-group">
            <h4>
              <ArrowUpLeft size={15} /> {t('linkedGroupTitle')} <span>{data.backlinks.length}</span>
            </h4>
            {data.backlinks.length ? (
              data.backlinks.map((item) => (
                <div className="note-reference" key={item.id}>
                  <StudyPeekLink id={item.id}>{item.title}</StudyPeekLink>
                  <small>{item.course_name}</small>
                  <p>{item.excerpt}</p>
                </div>
              ))
            ) : (
              <p className="note-reference-empty">{t('noBacklinks')}</p>
            )}
          </div>
          <div className="note-reference-group">
            <h4>
              <Link2 size={15} /> {t('unlinkedGroupTitle')} <span>{data.mentions.length}</span>
            </h4>
            {data.mentions.length ? (
              data.mentions.map((item) => (
                <div className="note-reference" key={item.id}>
                  <div className="note-reference-head">
                    <StudyPeekLink id={item.id}>{item.title}</StudyPeekLink>
                    <small>{item.course_name}</small>
                  </div>
                  <p>{item.excerpt}</p>
                  {canWrite && data.can_link && (
                    <Button variant="outline" size="sm" disabled={link.pending} onClick={() => link.mutate(item)}>
                      {link.pending && link.variables?.id === item.id ? t('linkingLabel') : t('linkButton')}
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <p className="note-reference-empty">{t('noMentions')}</p>
            )}
            {!data.can_link && data.mentions.length > 0 && (
              <p className="note-reference-empty">{t('ambiguousTitleNotice')}</p>
            )}
          </div>
        </>
      )}
      {link.error && (
        <p role="alert" className="text-destructive">
          {link.error}
        </p>
      )}
    </section>
  )
}
