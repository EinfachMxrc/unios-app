// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { request } from '@/api'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/State'
type Diagnostics = {
  app_version: string
  schema_version: string | null
  os: string
  os_version: string
  connectors: { id: string; version: string }[]
  host: { mode: string; generation: number | null }
  sync: string
  error_codes: string[]
}
function download(name: string, content: object) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function FeedbackPanel() {
  const { t } = useT('feedback')
  const [params] = useSearchParams()
  const page = params.get('from')?.startsWith('/') ? params.get('from')!.split('?')[0].slice(0, 120) : null
  const [kind, setKind] = useState<'problem' | 'idea'>(params.get('feedback') === 'problem' ? 'problem' : 'idea')
  const [message, setMessage] = useState('')
  const [goal, setGoal] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  async function saveFeedback() {
    if (!message.trim()) {
      setStatus(t('emptyMessageWarning'))
      return
    }
    setBusy(true)
    try {
      const diagnostics = includeDiagnostics
        ? await request<Diagnostics>('/api/feedback/diagnostics', { cache: 'no-store' })
        : undefined
      download(`unios-${kind}-${new Date().toISOString().slice(0, 10)}.json`, {
        kind,
        page,
        goal: goal.trim(),
        message: message.trim(),
        diagnostics,
        created_at: new Date().toISOString(),
      })
      setStatus(t('reportSaved'))
    } catch {
      setStatus(t('diagnosticsFailed'))
    } finally {
      setBusy(false)
    }
  }
  async function saveDiagnostics() {
    setBusy(true)
    setStatus('')
    try {
      const result = await request<Diagnostics>('/api/feedback/diagnostics', { cache: 'no-store' })
      download(`unios-diagnose-${new Date().toISOString().slice(0, 10)}.json`, result)
      setStatus(t('diagnosticsSaved'))
    } catch {
      setStatus(t('diagnosticsFailed'))
    } finally {
      setBusy(false)
    }
  }
  // Opens the matching issue form of the public repository, prefilled; nothing is sent from here.
  const issueUrl = new URL('https://github.com/EinfachMxrc/unios-app/issues/new')
  issueUrl.searchParams.set('template', kind === 'problem' ? 'bug.yml' : 'idea.yml')
  issueUrl.searchParams.set('title', `${t('panelTitle')}: ${message.trim().split('\n')[0].slice(0, 100)}`)
  if (kind === 'problem') {
    const where = page ? `${t('affectedPagePrefix', { page })}\n\n` : ''
    issueUrl.searchParams.set('steps', `${where}${goal.trim().slice(0, 600)}`.trim())
    issueUrl.searchParams.set('expected', message.trim().slice(0, 2400))
  } else {
    issueUrl.searchParams.set('problem', goal.trim().slice(0, 600))
    issueUrl.searchParams.set('idea', message.trim().slice(0, 2400))
  }
  return (
    <Panel title={t('panelTitle')}>
      <p className="muted-text mb-4">{t('intro')}</p>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={t('kindGroupAria')}>
        <Button type="button" variant={kind === 'problem' ? 'default' : 'outline'} onClick={() => setKind('problem')}>
          {t('reportProblemButton')}
        </Button>
        <Button type="button" variant={kind === 'idea' ? 'default' : 'outline'} onClick={() => setKind('idea')}>
          {t('suggestImprovementButton')}
        </Button>
      </div>
      {page && <p className="muted-text mb-3">{t('affectedPagePrefix', { page })}</p>}
      <label htmlFor="alpha-feedback-goal" className="block text-sm font-medium mb-2">
        {t('goalLabel')}
      </label>
      <textarea
        id="alpha-feedback-goal"
        className="w-full min-h-20 rounded-lg border border-input bg-background p-3 text-sm mb-4"
        maxLength={2000}
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder={t('goalPlaceholder')}
      />
      <label htmlFor="alpha-feedback" className="block text-sm font-medium mb-2">
        {t('descriptionLabel')}
      </label>
      <textarea
        id="alpha-feedback"
        className="w-full min-h-28 rounded-lg border border-input bg-background p-3 text-sm"
        maxLength={4000}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={kind === 'problem' ? t('problemPlaceholder') : t('ideaPlaceholder')}
      />
      <label className="flex items-center gap-3 mt-4">
        <input
          type="checkbox"
          checked={includeDiagnostics}
          onChange={(event) => setIncludeDiagnostics(event.target.checked)}
        />
        {t('attachDiagnostics')}
      </label>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button asChild disabled={!message.trim()}>
          <a
            href={message.trim() ? issueUrl.href : undefined}
            aria-disabled={!message.trim()}
            target="_blank"
            rel="noreferrer"
          >
            {t('openIssue')}
          </a>
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void saveFeedback()}>
          {t('saveReportButton')}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void saveDiagnostics()}>
          {busy ? t('creatingDiagnosticsButton') : t('createDiagnosticsButton')}
        </Button>
      </div>
      <p className="muted-text mt-3">{t('githubHint')}</p>
      <p className="muted-text mt-3">{t('privacyNote')}</p>
      {status && (
        <p role="status" className="muted-text mt-3">
          {status}
        </p>
      )}
    </Panel>
  )
}
