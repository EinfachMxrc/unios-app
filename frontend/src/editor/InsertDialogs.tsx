// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Editor } from '@tiptap/core'
import { FileText, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useApi } from '@/api'
import { insertStudyMarkdown } from '@/components/editor/studyInsert'
import { readStudyFence } from '@/components/editor/studyModels'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/editor/StudioDialog'
import { useT } from '@/i18n/useT'
import type { InsertDialog, Range } from './commands'
import { MAX_MEDIA_BYTES, MEDIA_ACCEPT, uploadNoteAsset } from './media'
import { entityKinds, type EntityKind } from './nodes'

const MathEntryDialog = lazy(() => import('@/components/editor/MathEntryDialog'))
const StudyHelperDialog = lazy(() => import('@/components/editor/StudyHelperDialog'))
const WritingGridDialog = lazy(() => import('@/components/editor/WritingGridDialog'))
const TruthTableDialog = lazy(() => import('@/components/editor/TruthTableDialog'))

type Entity = { id: string | number; name?: string; title?: string; filename?: string }

export type OpenDialog = { kind: InsertDialog; range: Range } | null

/** Insert a finished block after the typed trigger and leave a paragraph to keep writing in. */
function place(editor: Editor, range: Range, node: object) {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent([node, { type: 'paragraph' }])
    .run()
}

export function InsertDialogs({
  editor,
  open,
  onClose,
  uploadRef,
}: {
  editor: Editor
  open: OpenDialog
  onClose: () => void
  /** Lets drops and pastes use the same upload path as the dialog. */
  uploadRef: React.MutableRefObject<((file: File, range?: Range) => void) | null>
}) {
  const { t } = useT('editor')
  const { t: notes } = useT('notes')
  const [kind, setKind] = useState<EntityKind>('note')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const controller = useRef<AbortController | null>(null)
  const rangeRef = useRef<Range>({ from: 0, to: 0 })
  if (open) rangeRef.current = open.range

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => () => controller.current?.abort(), [])

  const entities = useApi<Entity[]>(
    `/api/entities/${kind}?limit=40${debounced.length >= 2 ? `&q=${encodeURIComponent(debounced)}` : ''}`,
    { enabled: open?.kind === 'entity' },
  )

  async function upload(file: File, range: Range = rangeRef.current, altText = caption) {
    if (uploading) return
    if (file.size > MAX_MEDIA_BYTES) {
      setFeedback(t('mediaTooLarge'))
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setUploading(true)
    setFeedback('')
    try {
      const asset = await uploadNoteAsset(file, abort.signal)
      if (!abort.signal.aborted && !editor.isDestroyed) {
        place(editor, range, { type: 'media', attrs: { ...asset, alt: altText || file.name } })
        setCaption('')
        onClose()
      }
    } catch {
      if (!abort.signal.aborted) setFeedback(t('uploadFailed'))
    } finally {
      setUploading(false)
      controller.current = null
    }
  }
  uploadRef.current = (file, range) => {
    const at = range ?? { from: editor.state.selection.from, to: editor.state.selection.to }
    void upload(file, at, '')
  }

  const close = () => {
    controller.current?.abort()
    setFeedback('')
    onClose()
  }
  const finish = () => {
    onClose()
    if (!editor.isDestroyed) editor.commands.focus()
  }

  return (
    <>
      <Dialog open={open?.kind === 'entity' || open?.kind === 'media'} onOpenChange={(next) => !next && close()}>
        <DialogContent className="studio-dialog">
          <DialogTitle>{open?.kind === 'entity' ? t('entityTitle') : t('mediaTitle')}</DialogTitle>
          <DialogDescription>
            {open?.kind === 'entity' ? t('entityDescription') : t('mediaDescription')}
          </DialogDescription>
          {open?.kind === 'entity' && (
            <>
              <label>
                {t('entityKind')}
                <select
                  className="native-select"
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value as EntityKind)
                    setQuery('')
                    setDebounced('')
                  }}
                >
                  {entityKinds.map((value) => (
                    <option key={value} value={value}>
                      {t(`entity_${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <input
                className="native-input"
                aria-label={t('entitySearch')}
                placeholder={t('entitySearch')}
                maxLength={100}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="studio-entity-results">
                {(entities.data ?? []).map((entity) => (
                  <button
                    type="button"
                    key={entity.id}
                    onClick={() => {
                      place(editor, rangeRef.current, {
                        type: 'entity',
                        attrs: {
                          kind,
                          id: String(entity.id),
                          label: entity.title ?? entity.name ?? entity.filename ?? String(entity.id),
                        },
                      })
                      finish()
                    }}
                  >
                    <FileText size={16} aria-hidden="true" />
                    {entity.title ?? entity.name ?? entity.filename ?? String(entity.id)}
                  </button>
                ))}
              </div>
              {entities.error && <p role="status">{t('entityFailed')}</p>}
              {!entities.data?.length && !entities.loading && !entities.error && <p>{t('noResults')}</p>}
            </>
          )}
          {open?.kind === 'media' && (
            <>
              <label>
                {t('caption')}
                <input
                  className="native-input"
                  value={caption}
                  maxLength={300}
                  onChange={(event) => setCaption(event.target.value)}
                />
              </label>
              <input
                type="file"
                aria-label={t('chooseMedia')}
                accept={MEDIA_ACCEPT}
                disabled={uploading}
                onChange={(event) => {
                  if (event.target.files?.[0]) void upload(event.target.files[0])
                }}
              />
            </>
          )}
          {uploading && (
            <p role="status">
              {t('uploading')}
              <button type="button" onClick={() => controller.current?.abort()}>
                <X size={14} aria-hidden="true" />
                {t('cancel')}
              </button>
            </p>
          )}
          {feedback && <p role="status">{feedback}</p>}
        </DialogContent>
      </Dialog>
      {open?.kind === 'math' && (
        <Suspense fallback={<p role="status">{notes('math.loading')}</p>}>
          <MathEntryDialog
            displayMode
            onClose={finish}
            onApply={(latex) => {
              place(editor, rangeRef.current, { type: 'blockMath', attrs: { latex } })
              finish()
            }}
          />
        </Suspense>
      )}
      {(open?.kind === 'recall' || open?.kind === 'diagram') && (
        <Suspense fallback={<p role="status">{notes('math.loading')}</p>}>
          <StudyHelperDialog
            initialTool={open.kind}
            onClose={finish}
            onApply={(markdown) => {
              const value = readStudyFence(markdown)
              if (value) place(editor, rangeRef.current, { type: 'studyBlock', attrs: value })
              finish()
            }}
          />
        </Suspense>
      )}
      {open?.kind === 'truth' && (
        <Suspense fallback={<p role="status">{notes('math.loading')}</p>}>
          <TruthTableDialog
            onClose={finish}
            onApply={(markdown) => {
              insertStudyMarkdown(editor, markdown, rangeRef.current)
              finish()
            }}
          />
        </Suspense>
      )}
      {open?.kind === 'helper' && (
        <Suspense fallback={<p role="status">{notes('math.loading')}</p>}>
          <StudyHelperDialog
            onClose={finish}
            onApply={(markdown) => {
              insertStudyMarkdown(editor, markdown, rangeRef.current)
              finish()
            }}
          />
        </Suspense>
      )}
      {open?.kind === 'grid' && (
        <Suspense fallback={<p role="status">{notes('math.loading')}</p>}>
          <WritingGridDialog
            onClose={finish}
            onApply={(markdown) => {
              const value = readStudyFence(markdown)
              if (value) place(editor, rangeRef.current, { type: 'studyBlock', attrs: value })
              finish()
            }}
          />
        </Suspense>
      )}
    </>
  )
}
