// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useState } from 'react'
import { useT } from '@/i18n/useT'
import { ApiError, request, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import { queryClient } from '@/offlineCache'
import './MetadataEditor.css'

type Kind = 'note' | 'material' | 'topic' | 'deadline' | 'question' | 'assignment' | 'exam' | 'project'
type Metadata = { object_type: Kind; object_id: string; tags: string[];
  priority: 'low' | 'medium' | 'high' | null; exam_relevant: boolean | null;
  difficulty: 'easy' | 'medium' | 'hard' | null; workflow_status: 'open' | 'working' | 'done' | null;
  revision: number }

export function MetadataEditor({ kind, id }: { kind: Kind; id: string }) {
  const { t } = useT('common')
  const { t: task } = useT('ownTaskSupport')
  const suggestionsId = useId()
  const [open, setOpen] = useState(false)
  const path = `/api/metadata/${kind}/${id}`
  const { data, error: loadError, reload } = useApi<Metadata>(path, { enabled: open })
  const { data: suggestions } = useApi<string[]>('/api/metadata/tags', { enabled: open })
  const canWrite = useWritableHost()
  const [tags, setTags] = useState('')
  const [priority, setPriority] = useState('')
  const [examRelevant, setExamRelevant] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [status, setStatus] = useState('')
  const [hydratedKey, setHydratedKey] = useState('')
  const [baseline, setBaseline] = useState<Metadata | null>(null)
  const [message, setMessage] = useState('')
  const dirty = baseline !== null && (tags !== baseline.tags.map(tag => `#${tag}`).join(', ')
    || priority !== (baseline.priority ?? '') || examRelevant !== (baseline.exam_relevant === null ? '' : String(baseline.exam_relevant))
    || difficulty !== (baseline.difficulty ?? '') || status !== (baseline.workflow_status ?? ''))
  const changed = !!data && !!baseline && hydratedKey === path && data.revision > baseline.revision
  function hydrate(value: Metadata) {
    setTags(value.tags.map((tag) => `#${tag}`).join(', '))
    setPriority(value.priority ?? '')
    setExamRelevant(value.exam_relevant === null ? '' : String(value.exam_relevant))
    setDifficulty(value.difficulty ?? '')
    setStatus(value.workflow_status ?? '')
    setBaseline(value); setHydratedKey(path)
  }
  useEffect(() => {
    if (!data) return
    if (hydratedKey === path && (dirty || (baseline && data.revision < baseline.revision))) return
    hydrate(data)
    // Hydrate only a clean editor; an incoming revision must never replace an unsaved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, path, dirty, hydratedKey])
  useEffect(() => { if (dirty) setMessage('') }, [dirty])
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 2000)
    return () => window.clearTimeout(timer)
  }, [message])
  const save = useApiMutation<Metadata, void>(
    async () => {
      if (!baseline) throw new Error(task('loadPropertiesFirst'))
      try { return await request<Metadata>(path, { method: 'PUT', body: JSON.stringify({
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        priority: priority || null, exam_relevant: examRelevant === '' ? null : examRelevant === 'true',
        difficulty: difficulty || null, workflow_status: status || null, expected_revision: baseline.revision,
      }) }) } catch (cause) { if (cause instanceof ApiError && cause.status === 409) reload(); throw cause }
    },
    { onSuccess: updated => {
      const updatedPath = `/api/metadata/${updated.object_type}/${updated.object_id}`
      queryClient.setQueryData(['api', updatedPath], updated)
      if (updatedPath === path) { hydrate(updated); setMessage(t('metadataEditorSaved')) }
    } },
  )
  return <details className="metadata-editor" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{t('metadataEditorSummary')}</summary>
    {open && (loadError ? <p role="alert">{loadError}<Button size="sm" variant="ghost" onClick={reload}>{task('retry')}</Button></p>
      : !baseline || hydratedKey !== path ? <p className="muted-text">{t('metadataEditorLoading')}</p>
      : <div className="metadata-editor-body" aria-busy={save.pending}>
      {changed && <div className="metadata-draft-conflict"><p role="status">{task('propertiesChanged')}</p>
        <Button size="sm" variant="outline" disabled={save.pending} onClick={() => { if (data) hydrate(data); save.reset(); setMessage('') }}>{task('discardDraftReload')}</Button></div>}
      <label>{t('metadataEditorTagsLabel')}
      <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t('metadataEditorTagsPlaceholder')}
        list={suggestionsId} disabled={save.pending} /></label>
      <datalist id={suggestionsId}>{suggestions?.map((tag) => <option key={tag} value={`#${tag}`} />)}</datalist>
      <div className="metadata-editor-fields"><label>{t('metadataEditorPriorityLabel')}<select className="native-select" value={priority}
        disabled={save.pending}
        onChange={(event) => setPriority(event.target.value)}><option value="">{t('metadataEditorPriorityNone')}</option>
        <option value="low">{t('metadataEditorPriorityLow')}</option>
        <option value="medium">{t('metadataEditorPriorityMedium')}</option><option value="high">{t('metadataEditorPriorityHigh')}</option></select></label>
        <label>{t('metadataEditorExamRelevantLabel')}<select className="native-select" value={examRelevant}
          disabled={save.pending}
          onChange={(event) => setExamRelevant(event.target.value)}><option value="">{t('unknownValue')}</option>
          <option value="true">{t('metadataEditorExamRelevantYes')}</option><option value="false">{t('metadataEditorExamRelevantNo')}</option></select></label>
        <label>{t('metadataEditorDifficultyLabel')}<select className="native-select" value={difficulty}
          disabled={save.pending}
          onChange={(event) => setDifficulty(event.target.value)}><option value="">{t('metadataEditorDifficultyNone')}</option>
          <option value="easy">{t('metadataEditorDifficultyEasy')}</option>
          <option value="medium">{t('metadataEditorDifficultyMedium')}</option><option value="hard">{t('metadataEditorDifficultyHard')}</option></select></label>
        <label>{t('metadataEditorStatusLabel')}<select className="native-select" value={status}
          disabled={save.pending}
          onChange={(event) => setStatus(event.target.value)}><option value="">{t('metadataEditorStatusNone')}</option>
          <option value="open">{t('metadataEditorStatusOpen')}</option>
          <option value="working">{t('metadataEditorStatusWorking')}</option><option value="done">{t('metadataEditorStatusDone')}</option></select></label></div>
      <Button size="sm" disabled={!canWrite || !baseline || changed || save.pending} onClick={() => { setMessage(''); save.mutate() }}>{save.pending ? task('saving') : t('metadataEditorSaveButton')}</Button>
      {save.error && <p role="alert" className="text-destructive">{save.error}</p>}
      {message && <p role="status">{message}</p>}</div>)}
  </details>
}
