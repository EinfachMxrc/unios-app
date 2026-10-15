// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { request, useApi } from '@/api'
import { Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import type { AdapterProposeResult, AdapterStatusView, AiProviderState } from '@/types'

type AdapterMode = 'cards' | 'exercises'
type AccessCourses = { courses: { id: number; name: string; allowed: boolean }[] }

export function AiAdapterStatusPanel() {
  const { t } = useT('ai')
  const canWrite = useWritableHost()
  const { data, error, loading, reload } = useApi<AdapterStatusView>('/api/ai/adapter/status')
  const { data: access } = useApi<AccessCourses>('/api/ai/access')
  const configured = data?.configured ?? false
  const {
    data: provider,
    error: providerError,
    reload: reloadProvider,
  } = useApi<AiProviderState>('/api/ai/provider', { enabled: configured })
  const [apiKey, setApiKey] = useState('')
  const refreshAll = () => {
    reload()
    reloadProvider()
  }
  const connect = useApiMutation(
    () =>
      request<AiProviderState>('/api/ai/provider/key', {
        method: 'PUT',
        body: JSON.stringify({ api_key: apiKey }),
      }),
    {
      onSuccess: () => {
        setApiKey('')
        refreshAll()
      },
    },
  )
  const chooseModel = useApiMutation(
    (model: string) =>
      request<AiProviderState>('/api/ai/provider/model', {
        method: 'PUT',
        body: JSON.stringify({ model }),
      }),
    { onSuccess: () => refreshAll() },
  )
  const disconnect = useApiMutation(() => request<void>('/api/ai/provider/key', { method: 'DELETE' }), {
    onSuccess: () => refreshAll(),
  })
  const [courseId, setCourseId] = useState('')
  const [mode, setMode] = useState<AdapterMode>('cards')
  const propose = useApiMutation(
    () =>
      request<AdapterProposeResult>('/api/ai/adapter/propose', {
        method: 'POST',
        body: JSON.stringify({ course_id: Number(courseId), mode }),
      }),
    { onSuccess: () => reload() },
  )
  const allowedCourses = (access?.courses ?? []).filter((course) => course.allowed)

  return (
    <Panel title={t('adapterPanelTitle')} action={<Cpu size={20} />}>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : (
        data &&
        (!configured ? (
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (apiKey.trim()) connect.mutate()
            }}
          >
            <p className="muted-text">{t('adapterConnectText')}</p>
            <label className="text-sm">
              {t('apiKeyLabel')}
              <input
                className="native-input ml-2"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                disabled={!canWrite || connect.pending}
                onChange={(event) => {
                  setApiKey(event.target.value)
                  connect.reset()
                }}
              />
            </label>
            <div>
              <Button size="sm" type="submit" disabled={!canWrite || !apiKey.trim() || connect.pending}>
                {connect.pending ? t('connectingKeyButton') : t('connectKeyButton')}
              </Button>
            </div>
            {connect.error && (
              <p role="alert" className="text-sm text-destructive">
                {connect.error}
              </p>
            )}
          </form>
        ) : (
          <>
            <p className="text-sm">
              {data.monthly_budget_tokens !== null
                ? t('tokensUsedWithBudget', { used: data.tokens_used_this_month, budget: data.monthly_budget_tokens })
                : t('tokensUsedNoBudget', { used: data.tokens_used_this_month })}
            </p>
            {(data.tokens_reserved_this_month ?? 0) > 0 && (
              <p className="muted-text text-sm">{t('tokensReserved', { count: data.tokens_reserved_this_month })}</p>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-sm">
                {t('modelLabel')}
                <select
                  className="native-select ml-2"
                  aria-label={t('chooseModelAria')}
                  value={provider?.model ?? ''}
                  disabled={!canWrite || !provider || chooseModel.pending}
                  onChange={(event) => chooseModel.mutate(event.target.value)}
                >
                  {!provider?.model && <option value="">{t('chooseModelOption')}</option>}
                  {(provider?.models ?? []).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={!canWrite || disconnect.pending}
                onClick={() => disconnect.mutate()}
              >
                {disconnect.pending ? t('removingKeyButton') : t('removeKeyButton')}
              </Button>
            </div>
            <p className="muted-text mt-1 text-xs">{t('modelHint')}</p>
            {(providerError || chooseModel.error || disconnect.error) && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {chooseModel.error ?? disconnect.error ?? providerError}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-sm">
                {t('courseLabel')}
                <select
                  className="native-select ml-2"
                  aria-label={t('chooseCourseAria')}
                  value={courseId}
                  disabled={propose.pending}
                  onChange={(event) => {
                    setCourseId(event.target.value)
                    propose.reset()
                  }}
                >
                  <option value="">{t('chooseCourseOption')}</option>
                  {allowedCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                {t('modeLabel')}
                <select
                  className="native-select ml-2"
                  aria-label={t('chooseModeAria')}
                  value={mode}
                  disabled={propose.pending}
                  onChange={(event) => {
                    setMode(event.target.value as AdapterMode)
                    propose.reset()
                  }}
                >
                  <option value="cards">{t('modeCards')}</option>
                  <option value="exercises">{t('modeExercises')}</option>
                </select>
              </label>
              <Button
                size="sm"
                disabled={!canWrite || !courseId || !provider?.model || propose.pending}
                onClick={() => propose.mutate()}
              >
                {propose.pending ? t('creatingSuggestionsButton') : t('createSuggestionsButton')}
              </Button>
            </div>
            {!allowedCourses.length && <p className="muted-text mt-2 text-sm">{t('noAllowedCourseText')}</p>}
            {propose.error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {propose.error}
              </p>
            )}
            {propose.data && (
              <div className="mt-3 rounded-lg border border-border bg-background p-3 text-sm">
                <p>
                  {t('importedSummary', {
                    count: propose.data.imported,
                    tokens: propose.data.tokens_used,
                    model: propose.data.model,
                  })}
                </p>
                <p className="muted-text mt-1">{t('reviewHint')}</p>
                <Link className="subtle-link mt-2 inline-block" to={mode === 'cards' ? '/anki' : '/exercises'}>
                  {mode === 'cards' ? t('goToCardsQueueLink') : t('goToExercisesQueueLink')}
                </Link>
              </div>
            )}
          </>
        ))
      )}
    </Panel>
  )
}
