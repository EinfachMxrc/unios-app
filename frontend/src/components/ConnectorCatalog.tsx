// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { request, useApi } from '@/api'
import { useWritableHost } from '@/hooks/host'

type ConnectorItem = {
  id: string
  package: string
  package_version: string
  capabilities: string[]
  domains: string[]
  secrets: string[]
  runtime: 'container' | 'trusted_python'
  fingerprint: string
  installed: boolean | null
  approved: boolean
  profile_enabled: boolean
}

type Catalog = {
  connectors: ConnectorItem[]
  profiles: Array<{ slug: string; name: string }>
  active_profile: string
  pending_profile: string | null
  enabled_connectors: string[]
}

/** Readable names for connector rights; the raw keys are what manifests declare. */
export function capabilityNames(t: TypedT<'connectors'>): Record<string, string> {
  return {
    'courses.read': t('capReadCourses'),
    'materials.read': t('capLoadMaterials'),
    'assignments.read': t('capReadAssignments'),
    'submissions.write': t('capSendSubmissions'),
    'grades.read': t('capReadGrades'),
    'calendar.read': t('capReadCalendar'),
  }
}

function connectorName(id: string) {
  return id
    .split(/[._-]/)
    .map((part) => part.charAt(0).toLocaleUpperCase('de-DE') + part.slice(1))
    .join(' ')
}

export function ConnectorCatalog({ showConnectors = true }: { showConnectors?: boolean }) {
  const { t } = useT('connectors')
  const capNames = capabilityNames(t)
  const canWrite = useWritableHost()
  const { data, error, reload } = useApi<Catalog>(
    showConnectors ? '/api/connectors/registry' : '/api/connectors/registry?include_connectors=false',
  )
  const [selectedProfile, setSelectedProfile] = useState('')
  const [profileSearch, setProfileSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [secretValues, setSecretValues] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')

  async function chooseProfile() {
    const slug = selectedProfile || data?.pending_profile || data?.active_profile
    if (!slug) return
    setBusy('profile')
    setActionError('')
    try {
      const result = await request<{ restart_required: boolean }>('/api/connectors/profiles/select', {
        method: 'POST',
        body: JSON.stringify({ slug }),
      })
      setMessage(result.restart_required ? t('profileSavedRestartMessage') : t('profileActiveMessage'))
      reload()
    } catch {
      setActionError(t('profileSaveFailedError'))
    } finally {
      setBusy('')
    }
  }

  async function connectorAction(
    item: ConnectorItem,
    action: 'install' | 'approve' | 'revoke' | 'enable',
    enabled?: boolean,
  ) {
    if (action === 'revoke' && !window.confirm(t('revokeConfirm', { name: connectorName(item.id) }))) return
    setBusy(item.id)
    setActionError('')
    try {
      const result = await request<{ restart_required?: boolean }>(`/api/connectors/${item.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ fingerprint: item.fingerprint, ...(action === 'enable' ? { enabled } : {}) }),
      })
      setMessage(
        result.restart_required
          ? t('connectorRestartMessage', { state: enabled ? t('stateActive') : t('stateDeactivated') })
          : action === 'install'
            ? t('installedMessage')
            : action === 'approve'
              ? t('approvedMessage')
              : t('revokedMessage'),
      )
      reload()
    } catch {
      setActionError(t('connectorChangeFailedError'))
    } finally {
      setBusy('')
    }
  }

  async function saveSecret(item: ConnectorItem, alias: string) {
    const key = `${item.id}:${alias}`
    const value = secretValues[key]
    if (!value) return
    setBusy(item.id)
    setActionError('')
    try {
      await request(`/api/connectors/${item.id}/secrets/${alias}`, {
        method: 'POST',
        body: JSON.stringify({ fingerprint: item.fingerprint, value }),
      })
      setSecretValues((current) => ({ ...current, [key]: '' }))
      setMessage(t('secretSavedMessage', { alias }))
    } catch {
      setActionError(t('secretSaveFailedError'))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-5">
      {error && <p role="alert">{error}</p>}
      {actionError && <p role="alert">{actionError}</p>}
      {message && <p role="status">{message}</p>}
      {data && (
        <>
          <div>
            <p className="muted-text">
              {t('activeProfileText', {
                name: data.profiles.find((item) => item.slug === data.active_profile)?.name ?? data.active_profile,
              })}
            </p>
            {data.profiles.length > 4 && (
              <input
                type="search"
                aria-label={t('searchUniversityAria')}
                className="mt-3 rounded-md border px-3 py-2"
                value={profileSearch}
                onChange={(event) => setProfileSearch(event.target.value)}
                placeholder={t('searchUniversityPlaceholder')}
              />
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor="university-profile">{t('universityLabel')}</label>
              <select
                id="university-profile"
                className="native-select"
                value={selectedProfile || data.pending_profile || data.active_profile}
                onChange={(event) => setSelectedProfile(event.target.value)}
              >
                {data.profiles
                  .filter(
                    (item) =>
                      !profileSearch ||
                      item.name.toLocaleLowerCase('de-DE').includes(profileSearch.toLocaleLowerCase('de-DE')) ||
                      item.slug === (selectedProfile || data.pending_profile || data.active_profile),
                  )
                  .map((item) => (
                    <option value={item.slug} key={item.slug}>
                      {item.name}
                    </option>
                  ))}
              </select>
              <Button variant="outline" disabled={!canWrite || busy !== ''} onClick={() => void chooseProfile()}>
                {t('saveProfileButton')}
              </Button>
            </div>
            {data.pending_profile && data.pending_profile !== data.active_profile && (
              <p className="muted-text mt-2">
                {t('selectedPendingText', {
                  name: data.profiles.find((item) => item.slug === data.pending_profile)?.name,
                })}
              </p>
            )}
          </div>
          {showConnectors && (
            <div className="space-y-4">
              {data.connectors.map((item) => {
                const enabled = data.enabled_connectors.includes(item.id)
                return (
                  <section className="rounded-md border p-4" key={item.id} aria-label={item.id}>
                    <h3 className="font-semibold">{connectorName(item.id)}</h3>
                    <p className="muted-text mt-2">
                      {t('canDoText', {
                        capabilities:
                          item.capabilities.map((capability) => capNames[capability] ?? capability).join(', ') ||
                          t('noDataCapabilityText'),
                      })}
                    </p>
                    <p className="muted-text">
                      {t('connectsWithText', { domains: item.domains.join(', ') || t('noExternalSiteText') })}
                    </p>
                    <p className="muted-text mt-2">
                      {enabled
                        ? t('statusConnected')
                        : item.approved
                          ? t('statusReadyToConnect')
                          : item.installed
                            ? t('statusApprovalRequired')
                            : t('statusNotSetUp')}
                    </p>
                    {!item.profile_enabled && <p className="muted-text">{t('notAvailableForUniversityText')}</p>}
                    {item.runtime === 'container' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!item.installed && (
                          <Button
                            variant="outline"
                            disabled={!canWrite || busy !== ''}
                            onClick={() => void connectorAction(item, 'install')}
                          >
                            {t('installButton')}
                          </Button>
                        )}
                        {item.installed && !item.approved && (
                          <Button
                            variant="outline"
                            disabled={!canWrite || busy !== ''}
                            onClick={() => void connectorAction(item, 'approve')}
                          >
                            {t('approvePermissionsButton')}
                          </Button>
                        )}
                        {item.approved && (
                          <Button
                            variant="outline"
                            disabled={!canWrite || busy !== '' || (!enabled && !item.profile_enabled)}
                            onClick={() => void connectorAction(item, 'enable', !enabled)}
                          >
                            {enabled ? t('disableButton') : t('enableButton')}
                          </Button>
                        )}
                        {item.approved && (
                          <Button
                            variant="outline"
                            disabled={!canWrite || busy !== ''}
                            onClick={() => void connectorAction(item, 'revoke')}
                          >
                            {t('revokeButton')}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="muted-text mt-3">{t('devExampleNotSecureText')}</p>
                    )}
                    {item.runtime === 'container' &&
                      item.approved &&
                      item.secrets.map((alias) => {
                        const key = `${item.id}:${alias}`
                        return (
                          <div className="mt-3 flex flex-wrap items-center gap-2" key={alias}>
                            <label htmlFor={`connector-secret-${key}`}>{alias}</label>
                            <input
                              id={`connector-secret-${key}`}
                              type="password"
                              autoComplete="off"
                              className="rounded-md border px-3 py-2"
                              value={secretValues[key] ?? ''}
                              onChange={(event) =>
                                setSecretValues((current) => ({ ...current, [key]: event.target.value }))
                              }
                            />
                            <Button
                              variant="outline"
                              disabled={!canWrite || busy !== '' || !secretValues[key]}
                              onClick={() => void saveSecret(item, alias)}
                            >
                              {t('saveSecretButton')}
                            </Button>
                          </div>
                        )
                      })}
                    <details className="mt-3 border-t pt-3">
                      <summary className="cursor-pointer text-sm">{t('technicalDetailsSummary')}</summary>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>
                          {t('idPackageVersionLine', {
                            id: item.id,
                            package: item.package,
                            version: item.package_version,
                          })}
                        </p>
                        <p>
                          {t('runtimeLine', {
                            runtime: item.runtime === 'container' ? t('runtimeContainer') : t('runtimePython'),
                          })}
                        </p>
                        <p>{t('capabilitiesLine', { capabilities: item.capabilities.join(', ') || t('noneText') })}</p>
                        <p>
                          {t('domainsSecretsLine', {
                            domains: item.domains.join(', ') || t('noneText'),
                            secrets: item.secrets.join(', ') || t('noneText'),
                          })}
                        </p>
                        <p>{t('fingerprintLine', { fingerprint: item.fingerprint })}</p>
                      </div>
                    </details>
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
