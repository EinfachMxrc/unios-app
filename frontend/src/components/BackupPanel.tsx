// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { FolderOpen, HardDriveDownload, RotateCcw } from 'lucide-react'
import { localDate, request, useApi } from '@/api'
import { ActionFeedback } from '@/components/ActionFeedback'
import { SettingToggle } from '@/components/SettingToggle'
import { Failure, Loading, Panel } from '@/components/State'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/editor/StudioDialog'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useT } from '@/i18n/useT'
import { isDesktopApp } from '@/lib/desktop'
import { restartNativeBackend } from '@/lib/releaseModes'
import './BackupPanel.css'
import './ConfirmDialog.css'

type Snapshot = { name: string; created_at: string | null; files: number; bytes: number }
export type BackupState = {
  folder: string | null
  daily: boolean
  keep: number
  status: { status?: 'success' | 'error'; at?: string; files?: number; bytes?: number; message?: string }
  snapshots: Snapshot[]
  pending_restore: string | null
  last_restore: { status: 'success' | 'error'; name?: string; previous?: string; message?: string } | null
  suggestions: string[]
  confirmation: string
}

const KEEP_CHOICES = [3, 7, 14, 30, 90]
/** Only the latest few states are listed; older ones stay in the folder. */
const LISTED = 8

export function formatSize(bytes: number, locale?: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit > 1 ? 1 : 0 }).format(value)} ${units[unit]}`
}

/** "UniOS-2026-10-13_093000" names its own moment (UTC). */
export function nameDate(name: string): string {
  const match = /^UniOS-(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(name)
  return match ? localDate(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`) : name
}
const snapshotDate = (item: Snapshot) => (item.created_at ? localDate(item.created_at) : nameDate(item.name))

function RestoreDialog({
  snapshot,
  phrase,
  onDone,
  onCancel,
}: {
  snapshot: Snapshot
  phrase: string
  onDone: (state: BackupState) => void
  onCancel: () => void
}) {
  const { t } = useT('backup')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  async function confirm() {
    setBusy(true)
    setFailure('')
    try {
      onDone(
        await request<BackupState>('/api/backup/restore', {
          method: 'POST',
          body: JSON.stringify({ name: snapshot.name, confirmation: typed }),
        }),
      )
    } catch (cause) {
      setFailure(t('failed', { reason: extractApiErrorMessage(cause) }))
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel()
      }}
    >
      <DialogContent className="confirm-dialog backup-restore-dialog" role="alertdialog">
        <DialogTitle>{t('restoreTitle')}</DialogTitle>
        <DialogDescription>{t('restoreText', { date: snapshotDate(snapshot) })}</DialogDescription>
        <label className="backup-field">
          <span>{t('restoreTypeLabel', { phrase })}</span>
          <input
            className="native-input"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        {failure && <ActionFeedback tone="error" message={failure} />}
        <div className="confirm-dialog-actions">
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="destructive" disabled={busy || typed.trim() !== phrase} onClick={() => void confirm()}>
            {t('restoreConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Built-in backup: choose a folder once, then UniOS copies everything there every day. */
export function BackupPanel() {
  const { t } = useT('backup')
  const canWrite = useWritableHost()
  const { data, error, loading, reload } = useApi<BackupState>('/api/backup')
  const [state, setState] = useState<BackupState | null>(null)
  const current = state ?? data
  const [folder, setFolder] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<'settings' | 'run' | 'cancel' | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [restoring, setRestoring] = useState<Snapshot | null>(null)

  async function act(kind: 'settings' | 'run' | 'cancel', call: () => Promise<BackupState>, success?: string) {
    setBusy(kind)
    setFeedback(null)
    try {
      setState(await call())
      if (success) setFeedback({ tone: 'success', message: success })
      setEditing(false)
      reload()
    } catch (cause) {
      setFeedback({ tone: 'error', message: t('failed', { reason: extractApiErrorMessage(cause) }) })
    } finally {
      setBusy(null)
    }
  }
  const saveSettings = (changes: Partial<Pick<BackupState, 'folder' | 'daily' | 'keep'>>) =>
    current &&
    act(
      'settings',
      () =>
        request<BackupState>('/api/backup/settings', {
          method: 'PUT',
          body: JSON.stringify({
            folder: current.folder,
            daily: current.daily,
            keep: current.keep,
            ...changes,
          }),
        }),
      t('saved'),
    )

  if (loading && !current)
    return (
      <Panel title={t('title')}>
        <Loading />
      </Panel>
    )
  if (!current)
    return (
      <Panel title={t('title')}>
        <Failure message={error ?? ''} retry={reload} />
      </Panel>
    )
  const pending = current.snapshots.find((item) => item.name === current.pending_restore)
  const showFolderForm = !current.folder || editing
  const value = folder ?? current.folder ?? current.suggestions[0] ?? ''
  const status = current.status

  return (
    <Panel title={t('title')}>
      <div className="backup-panel">
        <p className="muted-text">{t('intro')}</p>
        {current.last_restore && (
          <ActionFeedback
            tone={current.last_restore.status === 'success' ? 'success' : 'error'}
            message={
              current.last_restore.status === 'success'
                ? t('restoredOk', {
                    date: nameDate(current.last_restore.name ?? ''),
                    previous: current.last_restore.previous ?? '',
                  })
                : t('restoredError', { message: current.last_restore.message ?? '' })
            }
          />
        )}
        {pending && (
          <div className="backup-pending" role="status">
            <p>{t('pending', { date: snapshotDate(pending) })}</p>
            <div className="backup-actions">
              {isDesktopApp() ? (
                <Button size="sm" onClick={() => void restartNativeBackend('normal')}>
                  {t('restartNow')}
                </Button>
              ) : (
                <span className="muted-text">{t('restartOutsideApp')}</span>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={!canWrite || busy !== null}
                onClick={() =>
                  void act('cancel', () => request<BackupState>('/api/backup/restore', { method: 'DELETE' }))
                }
              >
                {t('cancelRestore')}
              </Button>
            </div>
          </div>
        )}
        {showFolderForm ? (
          <form
            className="backup-folder-form"
            onSubmit={(event) => {
              event.preventDefault()
              void saveSettings({ folder: value.trim() })
            }}
          >
            <label className="backup-field">
              <span>{t('folderLabel')}</span>
              <input
                className="native-input"
                value={value}
                placeholder={t('folderPlaceholder')}
                spellCheck={false}
                onChange={(event) => setFolder(event.target.value)}
              />
            </label>
            {current.suggestions.length > 0 && (
              <div className="backup-suggestions" role="group" aria-label={t('suggestions')}>
                {current.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className={suggestion === value ? 'is-chosen' : ''}
                    onClick={() => setFolder(suggestion)}
                  >
                    <FolderOpen size={14} aria-hidden="true" /> {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div className="backup-actions">
              <Button type="submit" size="sm" disabled={!canWrite || !value.trim() || busy !== null}>
                {t('saveFolder')}
              </Button>
              {editing && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false)
                    setFolder(null)
                  }}
                >
                  {t('cancel')}
                </Button>
              )}
            </div>
          </form>
        ) : (
          <>
            <div className="backup-folder">
              <FolderOpen size={16} aria-hidden="true" />
              <code>{current.folder}</code>
              <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => setEditing(true)}>
                {t('changeFolder')}
              </Button>
            </div>
            <SettingToggle
              title={t('daily')}
              description={t('dailyHint')}
              checked={current.daily}
              disabled={!canWrite || busy !== null}
              busy={busy === 'settings'}
              onChange={(daily) => void saveSettings({ daily })}
            />
            <label className="backup-field backup-keep">
              <span>{t('keepLabel')}</span>
              <select
                className="native-select"
                value={current.keep}
                disabled={!canWrite || busy !== null}
                onChange={(event) => void saveSettings({ keep: Number(event.target.value) })}
              >
                {[...new Set([...KEEP_CHOICES, current.keep])]
                  .sort((a, b) => a - b)
                  .map((count) => (
                    <option key={count} value={count}>
                      {t('keepOption', { count })}
                    </option>
                  ))}
              </select>
            </label>
            <div className="backup-run">
              <Button
                size="sm"
                disabled={!canWrite || busy !== null}
                onClick={() => void act('run', () => request<BackupState>('/api/backup/run', { method: 'POST' }))}
              >
                <HardDriveDownload size={15} aria-hidden="true" /> {busy === 'run' ? t('running') : t('runNow')}
              </Button>
              <span className="muted-text">
                {status.status === 'success' && status.at
                  ? t('lastSuccess', {
                      date: localDate(status.at),
                      files: status.files ?? 0,
                      size: formatSize(status.bytes ?? 0),
                    })
                  : status.status === 'error' && status.at
                    ? t('lastError', { date: localDate(status.at), message: status.message ?? '' })
                    : t('never')}
              </span>
            </div>
            {current.snapshots.length > 0 && (
              <div className="backup-snapshots">
                <h3>{t('snapshotsTitle')}</h3>
                <ul>
                  {current.snapshots.slice(0, LISTED).map((item) => (
                    <li key={item.name}>
                      <span>{t('snapshotLine', { date: snapshotDate(item), size: formatSize(item.bytes) })}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canWrite || busy !== null}
                        aria-label={t('restoreLabel', { date: snapshotDate(item) })}
                        onClick={() => setRestoring(item)}
                      >
                        <RotateCcw size={14} aria-hidden="true" /> {t('restore')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {feedback && <ActionFeedback tone={feedback.tone} message={feedback.message} />}
      </div>
      {restoring && (
        <RestoreDialog
          snapshot={restoring}
          phrase={current.confirmation}
          onCancel={() => setRestoring(null)}
          onDone={(next) => {
            setState(next)
            setRestoring(null)
            reload()
          }}
        />
      )}
    </Panel>
  )
}
