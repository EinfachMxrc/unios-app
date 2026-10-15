// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ShieldCheck, Download } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { isDesktopApp } from '@/lib/desktop'
import './RecoveryPage.css'

export type RecoveryStatus = { mode: string; database?: { status: string } }
type Row = { id: number | string; title?: string; name?: string }
type Listing = { items: Row[]; next_after: number | string | null }

// Recovery deliberately does not use the normal mutation, host or offline-cache clients.
async function recoveryRequest<T>(path: string, method = 'GET'): Promise<T> {
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(40000) })
  if (!response.ok) throw new Error('RECOVERY_UNAVAILABLE')
  return response.json() as Promise<T>
}

export default function RecoveryPage({ status }: { status: RecoveryStatus }) {
  const { t } = useT('releaseSystem')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [lists, setLists] = useState<Partial<Record<'notes' | 'files', Listing>>>({})
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('')
    try { await action() } catch { setMessage(t('failure')) } finally { setBusy(false) }
  }
  async function load(kind: 'notes' | 'files') {
    const after = lists[kind]?.next_after
    const result = await recoveryRequest<Listing>(`/api/recovery/${kind}${after == null ? '' : `?after=${encodeURIComponent(after)}`}`)
    setLists(previous => ({ ...previous, [kind]: { ...result, items: [...(previous[kind]?.items ?? []), ...result.items] } }))
  }
  return <main className="recovery-page">
    <header><ShieldCheck aria-hidden="true" /><h1>{t('recoveryTitle')}</h1><p>{t('recoveryIntro')}</p></header>
    <section className="recovery-card">
      <p role="status">{status.database?.status === 'ok' ? t('databaseOk') : t('databaseError')}</p>
      <p className="muted-text">{t('backupScope')}</p>
      <Button disabled={busy} onClick={() => void run(async () => {
        const copy = await recoveryRequest<{ id: string; verified: boolean }>('/api/recovery/backup', 'POST')
        if (copy.verified !== true) throw new Error('UNVERIFIED_COPY')
        setMessage(t('backupDone', { id: copy.id }))
      })}>{t('backup')}</Button>
    </section>
    {(['notes', 'files'] as const).map(kind => <section className="recovery-card" key={kind}>
      <div className="recovery-heading"><h2>{t(kind)}</h2>
        {(!lists[kind] || lists[kind]?.next_after != null) && <Button variant="outline" disabled={busy} onClick={() => void run(() => load(kind))}>{t(lists[kind] ? 'more' : 'load')}</Button>}
      </div>
      {lists[kind]?.items.length === 0 && <p>{t('empty')}</p>}
      <ul>{lists[kind]?.items.map(row => <li key={row.id}><span>{row.title || row.name || String(row.id)}</span><a href={`/api/recovery/${kind}/${encodeURIComponent(row.id)}`} download><Download size={16} aria-hidden="true" />{t('download')}</a></li>)}</ul>
    </section>)}
    {message && <p role="status">{message}</p>}
    <section className="recovery-card"><h2>{t('diagnosticsTitle')}</h2><p>{t('diagnosticsIntro')}</p>
      <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
        const diagnostics = await recoveryRequest<object>('/api/recovery/diagnostics')
        const url = URL.createObjectURL(new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' }))
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'unios-recovery-diagnostics.json'; anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      })}>{t('diagnostics')}</Button>
    </section>
    {isDesktopApp() ? <Button disabled={busy} onClick={() => void run(() => invoke('restart_backend', { mode: 'normal' }))}>{busy ? t('starting') : t('normal')}</Button> : <p>{t('desktopOnly')}</p>}
  </main>
}
