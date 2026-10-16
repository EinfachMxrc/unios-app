// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * The presentational parts of a note page. NoteDocument keeps the drafts,
 * revisions and conflict handling; these only show them and report choices.
 */
import { docText, parseBody } from '@/editor/doc'
import { NoteRevisionDiff } from './NoteRevisionDiff'
import { activeIntlLocale, localDate } from '@/api'
import { EntityProperties } from '@/components/EntityProperties'
import { LinkedItems } from '@/components/LinkedItems'
import { NoteReferences } from '@/components/NoteReferences'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import type { archivedDraftsFor, NoteDraft } from '@/noteDraft'
import type { NoteDetail } from '@/types'

export type ArchivedDraft = ReturnType<typeof archivedDraftsFor>[number]
export type ConflictChoice = 'both' | 'local' | 'remote' | 'manual'

/** Conflict and recovery views show readable text, not the stored block lines. */
function draftText(body: string): string {
  return docText(parseBody(body))
}

/** Own draft and the newer host version side by side, with the four ways out. */
export function NoteConflict({
  local,
  remote,
  onResolve,
}: {
  local: NoteDraft
  remote: NoteDetail
  onResolve: (choice: ConflictChoice) => void
}) {
  const { t } = useT('notes')
  return (
    <div className="note-conflict" role="alert">
      <h3>{t('conflictHeading')}</h3>
      <p>{t('conflictExplanation')}</p>
      <div className="note-conflict-versions">
        <section>
          <strong>{t('yourDraftLabel')}</strong>
          <pre>{draftText(local.body)}</pre>
        </section>
        <section>
          <strong>{t('currentHostVersionLabel')}</strong>
          <pre>{draftText(remote.body)}</pre>
        </section>
      </div>
      <div className="note-editor-actions">
        <Button size="sm" onClick={() => onResolve('both')}>
          {t('keepBothButton')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onResolve('local')}>
          {t('myVersionButton')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onResolve('remote')}>
          {t('currentVersionButton')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onResolve('manual')}>
          {t('editManuallyButton')}
        </Button>
      </div>
    </div>
  )
}

/** Saved versions, the file on disk, and drafts that were set aside. */
export function NoteHistory({
  data,
  archived,
  onRevision,
  onRestore,
}: {
  data: NoteDetail
  archived: ArchivedDraft[]
  onRevision: (revision: number | null) => void
  onRestore: (draft: ArchivedDraft) => void
}) {
  const { t } = useT('notes')
  return (
    <details className="note-history-details">
      <summary>{t('versionsAndFileSummary')}</summary>
      <div className="note-history" aria-label={t('versionsAria')}>
        {data.versions.map((item) => (
          <Button
            key={item.revision}
            size="sm"
            variant={item.revision === data.selected_revision ? 'default' : 'outline'}
            onClick={() => onRevision(item.revision === data.note.current_revision ? null : item.revision)}
          >
            {t('versionButton', { revision: item.revision })}
          </Button>
        ))}
      </div>
      {data.selected_revision !== data.note.current_revision && <NoteRevisionDiff older={data} />}
      <p className="muted-text note-file-path">
        {t('currentFileLabel')}{' '}
        {data.versions.find((item) => item.revision === data.note.current_revision)?.relative_path}
      </p>
      {archived.length > 0 && (
        <details>
          <summary>{t('archivedDraftsSummary', { count: archived.length })}</summary>
          {archived.map((item) => (
            <div className="note-archived-draft" key={item.writeId}>
              <strong>
                {item.title} · {new Date(item.updatedAt).toLocaleString(activeIntlLocale())}
              </strong>
              <pre>{draftText(item.body)}</pre>
              <Button size="sm" variant="outline" onClick={() => onRestore(item)}>
                {t('restoreDraftButton')}
              </Button>
            </div>
          ))}
        </details>
      )}
    </details>
  )
}

/** Course, dates, properties, references and links of the note. */
export function NoteSidePanel({ data, id, onSaved }: { data: NoteDetail; id: string; onSaved: () => void }) {
  const { t } = useT('notes')
  return (
    <aside className="note-side-panel" aria-label={t('noteDetailsAria')}>
      <details className="note-context-details">
        <summary>{t('noteDetailsAria')}</summary>
        <EntityProperties
          title={t('contextPropertiesTitle')}
          rows={[
            { label: t('courseLabel'), value: data.note.course_name },
            { label: t('editedLabel'), value: localDate(data.note.updated_at) },
          ]}
          metadata={{ kind: 'note', id }}
          activity={{ kind: 'note', id }}
        />
        <NoteReferences id={id} onSaved={onSaved} />
        <LinkedItems kind="note" id={id} />
      </details>
    </aside>
  )
}
