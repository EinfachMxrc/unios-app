// SPDX-License-Identifier: AGPL-3.0-or-later
import { NoteView } from '@/editor/NoteView'
import { useNoteDetail } from '@/lib/noteBody'
import { Failure, Loading } from '@/components/State'
import { workingNoteDraftFor } from '@/noteDraft'
import { useT } from '@/i18n/useT'

export default function CollectionNotePreview({ id }: { id: string }) {
  const { t } = useT('collections')
  const { data, error, loading, reload } = useNoteDetail(`/api/notes/${id}`)
  const draft = workingNoteDraftFor(id)
  const body = draft?.body ?? data?.body
  return body !== undefined ? (
    <>
      {draft && (
        <p className="collection-preview-context" role="status">
          {t('localDraftPreview')}
        </p>
      )}
      <NoteView body={body} />
    </>
  ) : loading && !data ? (
    <Loading variant="rows" />
  ) : error ? (
    <Failure message={error} retry={reload} />
  ) : null
}
