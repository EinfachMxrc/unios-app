// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { relaunch } from '@tauri-apps/plugin-process'
import { Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { snapshotBeforeUpdate } from '@/components/ReleaseSafetyPanel'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import { isDesktopApp } from '@/lib/desktop'

type Channel = 'stable' | 'beta' | 'nightly'
type UpdateReport = { available: boolean; version: string | null; channel: Channel; notes: string | null; schema_change: boolean }
const CHANNEL_KEY = 'unios-release-channel-v1'
function savedChannel(): Channel {
  try {
    const value = localStorage.getItem(CHANNEL_KEY)
    if (value === 'beta' || value === 'nightly') return value
  } catch { /* unavailable storage leaves the safe default */ }
  return 'stable'
}

export function DesktopReleaseUpdates() {
  const { t } = useT('releaseUpdates')
  const writable = useWritableHost()
  const [channel, setChannel] = useState<Channel>(savedChannel)
  const [available, setAvailable] = useState<UpdateReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!isDesktopApp() || import.meta.env.VITE_UNIOS_UPDATES_ENABLED !== 'true') return null

  function selectChannel(value: Channel) {
    setChannel(value); setAvailable(null); setMessage('')
    try { localStorage.setItem(CHANNEL_KEY, value) } catch { /* usable without storage */ }
  }
  async function check() {
    setBusy(true); setAvailable(null); setMessage(t('checking'))
    try {
      const report = await invoke<UpdateReport>('check_release_updates', { channel })
      setAvailable(report.available ? report : null)
      setMessage(report.available ? t('available', { version: report.version }) : t('current'))
    } catch (error) {
      const code = String(error)
      setMessage(code.includes('INCOMPATIBLE') ? t('incompatible') : t('unavailable'))
    } finally { setBusy(false) }
  }
  async function install() {
    if (!available?.version || available.channel !== channel || !writable) return
    setBusy(true); setMessage(t('preparing'))
    try {
      await snapshotBeforeUpdate()
      await invoke('install_release_update', { channel, version: available.version })
      await relaunch()
    } catch { setAvailable(null); setMessage(t('failed')); setBusy(false) }
  }
  return <Panel title={t('title')}>
    <p>{t('intro')}</p>
    <label className="block mt-4">
      <span className="block mb-2">{t('channel')}</span>
      <select className="w-full max-w-sm" value={channel} disabled={busy}
        onChange={(event) => selectChannel(event.target.value as Channel)}>
        <option value="stable">{t('stable')}</option><option value="beta">{t('beta')}</option><option value="nightly">{t('nightly')}</option>
      </select>
    </label>
    <p className="muted-text mt-2">{channel === 'stable' ? t('stableHelp') : channel === 'beta' ? t('betaHelp') : t('nightlyHelp')}</p>
    <p className="muted-text mt-3">{t('policy')}</p>
    <div className="flex flex-wrap gap-2 mt-4">
      <Button disabled={busy} onClick={() => void check()}>{t('check')}</Button>
      {available && <Button disabled={busy || !writable} onClick={() => void install()}>{t('install')}</Button>}
    </div>
    {message && <p role="status" className="mt-3">{message}</p>}
    {available?.schema_change && <p role="note" className="mt-3">{t('schema')}</p>}
    {available?.notes && <details className="mt-3"><summary>{t('notes')}</summary><p className="whitespace-pre-wrap mt-2">{available.notes}</p></details>}
  </Panel>
}
