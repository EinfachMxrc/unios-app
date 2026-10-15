// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/State'
import { request, useApi, localDate } from '@/api'
import { useWritableHost } from '@/hooks/host'
import { isDesktopApp } from '@/lib/desktop'
import { useT } from '@/i18n/useT'
import type { SystemResponse } from '@/types'

export type CheckedSnapshot = { status: string; created_at: string | null }
export async function snapshotBeforeUpdate(): Promise<CheckedSnapshot> {
  const snapshot = await request<CheckedSnapshot>('/api/host/snapshot', { method: 'POST' })
  // The server has checked integrity. Never install on a warning, stale response or missing date.
  const created = Date.parse(snapshot.created_at ?? '')
  if (snapshot.status !== 'ok' || !Number.isFinite(created) || Math.abs(Date.now() - created) > 5 * 60 * 1000) {
    throw new Error('UPDATE_SNAPSHOT_UNVERIFIED')
  }
  return snapshot
}

export function ReleaseSafetyPanel() {
  const { t } = useT('releaseSystem')
  const { data, reload } = useApi<SystemResponse>('/api/system')
  const writable = useWritableHost()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function snapshot() {
    setBusy(true); setMessage('')
    try { await snapshotBeforeUpdate(); setMessage(t('snapshotOk')); reload() }
    catch { setMessage(t('snapshotBad')) } finally { setBusy(false) }
  }
  async function recover() {
    setBusy(true); setMessage('')
    try { await invoke('restart_backend', { mode: 'safe' }) }
    catch { setMessage(t('failure')); setBusy(false) }
  }
  return <Panel title={t('safetyTitle')}>
    <p>{t('safetyIntro')}</p>
    <p className="muted-text mt-3">{data?.snapshot?.status === 'ok' && data.snapshot.created_at ? t('snapshotDate', { date: localDate(data.snapshot.created_at) }) : t('snapshotUnknown')}</p>
    <div className="flex flex-wrap gap-2 mt-4">
      <Button disabled={busy || !writable} onClick={() => void snapshot()}>{t('snapshot')}</Button>
      {isDesktopApp() && <Button variant="outline" disabled={busy} onClick={() => void recover()}>{t('safe')}</Button>}
    </div>
    {!isDesktopApp() && <p className="muted-text mt-3">{t('desktopOnly')}</p>}
    {message && <p role="status" className="mt-3">{message}</p>}
  </Panel>
}
