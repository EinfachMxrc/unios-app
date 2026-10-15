// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { request, useApi } from '@/api'
import { queryClient } from '@/offlineCache'
import { useWritableHost } from '@/hooks/host'
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/button'
import { Failure, Loading } from '@/components/State'
import type { AddonCatalogItem } from '@/addons/types'
import './addons.css'

export function AddonCatalogPage() {
  const { t } = useT('addons')
  const permissionNames: Record<string, string> = {
    'courses.read': t('permissionCoursesRead'),
    'study_blocks.read': t('permissionStudyBlocksRead'),
  }
  const { data, error, loading, reload } = useApi<AddonCatalogItem[]>('/api/addons/catalog')
  const canWrite = useWritableHost()
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')

  function refresh() {
    reload()
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'api' &&
        typeof query.queryKey[1] === 'string' &&
        query.queryKey[1].startsWith('/api/addons/'),
    })
  }

  async function change(addon: AddonCatalogItem, action: string) {
    if (
      ['revoke', 'uninstall'].includes(action) &&
      !window.confirm(action === 'revoke' ? t('confirmRevoke', { name: addon.name }) : t('confirmUninstall', { name: addon.name }))
    )
      return
    setBusy(addon.id)
    setActionError('')
    setMessage('')
    try {
      await request(`/api/addons/${encodeURIComponent(addon.id)}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ fingerprint: addon.fingerprint }),
      })
      setMessage(t('changeSaved', { name: addon.name }))
      refresh()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('changeSaveFailed'))
    } finally {
      setBusy('')
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 2_800_000) {
      setActionError(t('manifestTooLarge'))
      return
    }
    setBusy('import')
    setActionError('')
    setMessage('')
    try {
      const value = JSON.parse(await file.text()) as Record<string, unknown>
      await request(value.module_base64 ? '/api/addons/import-package' : '/api/addons/import', { method: 'POST', body: JSON.stringify(value) })
      setMessage(t('manifestImported'))
      refresh()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('manifestReadFailed'))
    } finally {
      setBusy('')
    }
  }

  return (
    <Shell title={t('catalogTitle')}>
      <div className="addon-intro">
        <p>
          {t('catalogIntro')}
        </p>
        <label className="addon-import">
          {t('importManifestLabel')}
          <input
            type="file"
            accept=".json,application/json"
            onChange={importFile}
            disabled={!canWrite || Boolean(busy)}
          />
        </label>
        <p className="muted-text">
          {t('stepsHint')}
        </p>
      </div>
      {actionError && (
        <p role="alert" className="addon-error">
          {actionError}
        </p>
      )}
      {message && (
        <p role="status" className="addon-success">
          {message}
        </p>
      )}
      {loading && !data && <Loading />}
      {error && <Failure message={error} />}
      <div className="addon-catalog">
        {data?.map((addon) => (
          <section className="addon-catalog-card" key={addon.id}>
            <div className="addon-catalog-heading">
              <div>
                <span>
                  {addon.kind === 'feature' ? t('kindFeature') : t('kindView')} ·{' '}
                  {addon.source === 'builtin' ? t('sourceBuiltin') : t('sourceLocal')}
                </span>
                <h2>{addon.name}</h2>
              </div>
              <small>{t('versionPrefix', { version: addon.version })}</small>
            </div>
            <p>{addon.description}</p>
            <p className="addon-author">{t('authorPrefix', { author: addon.author })}</p>
            <div className="addon-permissions">
              <strong>{t('requiresLabel')}</strong>
              {addon.permissions.length ? (
                <ul>
                  {addon.permissions.map((permission) => (
                    <li key={permission}>✓ {permissionNames[permission] ?? permission}</li>
                  ))}
                </ul>
              ) : (
                <p>{t('noStudyContent')}</p>
              )}
              <small>{t('privacyHint')}</small>
            </div>
            <div className="addon-actions">
              {!addon.installed ? (
                <Button disabled={!canWrite || Boolean(busy)} onClick={() => void change(addon, 'install')}>
                  {t('installButton')}
                </Button>
              ) : !addon.approved ? (
                <Button disabled={!canWrite || Boolean(busy)} onClick={() => void change(addon, 'approve')}>
                  {t('approveButton')}
                </Button>
              ) : !addon.enabled ? (
                <Button disabled={!canWrite || Boolean(busy)} onClick={() => void change(addon, 'enable')}>
                  {t('enableButton')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={!canWrite || Boolean(busy)}
                  onClick={() => void change(addon, 'disable')}
                >
                  {t('disableButton')}
                </Button>
              )}
              {addon.enabled && addon.kind === 'feature' && (
                <Button asChild variant="outline">
                  <Link to={`/addons/${addon.id}`}>{t('openButton')}</Link>
                </Button>
              )}
              {addon.approved && (
                <Button
                  variant="ghost"
                  disabled={!canWrite || Boolean(busy)}
                  onClick={() => void change(addon, 'revoke')}
                >
                  {t('revokeButton')}
                </Button>
              )}
              {addon.installed && (
                <Button
                  variant="ghost"
                  disabled={!canWrite || Boolean(busy)}
                  onClick={() => void change(addon, 'uninstall')}
                >
                  {t('uninstallButton')}
                </Button>
              )}
            </div>
          </section>
        ))}
      </div>
    </Shell>
  )
}
