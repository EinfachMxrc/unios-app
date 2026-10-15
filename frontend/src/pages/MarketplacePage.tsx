// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import './ProductPlatform.css'
import { request, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/button'
import { Failure } from '@/components/State'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { capabilityNames } from '@/components/ConnectorCatalog'

type Connector = {
  id: string
  package: string
  package_version: string
  api_version: number
  domains: string[]
  capabilities: string[]
  secrets: string[]
  review_status: string
  runtime: string
  fingerprint: string
  installed: boolean | null
  approved: boolean
  profile_enabled: boolean
  maintainer: string
  source_url: string
  license: string
  signature_status: string
  image?: string | null
}
type Registry = {
  connectors: Connector[]
  profiles: Array<{ slug: string; name: string; status: string; connectors: string[] }>
  active_profile: string
  pending_profile: string | null
  enabled_connectors: string[]
}

export function MarketplacePage() {
  const { t } = useT('addons')
  const { t: connectors } = useT('connectors')
  const rightNames = capabilityNames(connectors)
  const { data, error, reload } = useApi<Registry>('/api/connectors/registry')
  const writable = useWritableHost()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function change(path: string, body: unknown) {
    if (!window.confirm(t('marketConfirm'))) return
    setBusy(true)
    setMessage('')
    try {
      await request(path, { method: 'POST', body: JSON.stringify(body) })
      reload()
      setMessage(t('marketSaved'))
    } catch (cause) {
      setMessage(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  const matches = (value: string) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  return (
    <Shell title={t('marketplace')}>
      <div className="marketplace-page">
        <p>{t('marketIntro')}</p>
        <label>
          {t('marketSearch')}
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {error && <Failure message={error} />}
        {message && <p role="status">{message}</p>}
        <h2>{t('marketProfiles')}</h2>
        <div className="collections-grid">
          {data?.profiles
            .filter((profile) => matches(profile.name))
            .map((profile) => (
              <article className="panel" key={profile.slug}>
                <h3>{profile.name}</h3>
                <p>{profile.connectors.join(' · ')}</p>
                <Button
                  disabled={!writable || busy || (data.pending_profile ?? data.active_profile) === profile.slug}
                  onClick={() => void change('/api/connectors/profiles/select', { slug: profile.slug })}
                >
                  {(data.pending_profile ?? data.active_profile) === profile.slug
                    ? t('profileSelected')
                    : t('selectProfile')}
                </Button>
              </article>
            ))}
        </div>
        <h2>{t('marketConnectors')}</h2>
        {data?.connectors
          .filter((item) => matches(`${item.id} ${item.package} ${item.maintainer}`))
          .map((item) => (
            <article className="panel my-4" key={item.id}>
              <h3>
                {item.package} · {item.package_version}
              </h3>
              <p>
                {t('marketMetadata', { maintainer: item.maintainer, api: item.api_version, license: item.license })}
              </p>
              <p>{t('unsignedPackage')}</p>
              <a href={item.source_url} target="_blank" rel="noreferrer">
                {t('marketSource')}
              </a>
              <details>
                <summary>{t('marketRights')}</summary>
                <dl className="market-rights">
                  {([
                    ['domains', t('marketDomains'), item.domains],
                    ['capabilities', t('marketCapabilities'), item.capabilities],
                    ['secrets', t('marketSecrets'), item.secrets],
                  ] as const).map(([key, label, values]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      {values.length ? values.map((value) => (
                        <dd key={value}>
                          {key === 'capabilities' ? rightNames[value] ?? value : value}
                          {key === 'capabilities' && rightNames[value] && <code className="market-right-key">{value}</code>}
                        </dd>
                      )) : <dd className="market-rights-none">{t('marketNone')}</dd>}
                    </div>
                  ))}
                </dl>
                <p className="break-all">{t('manifestHash', { hash: item.fingerprint })}</p>
                {item.image && <p className="break-all">{item.image}</p>}
              </details>
              {item.runtime !== 'container' ? (
                <p>{t('referenceOnly')}</p>
              ) : (
                <div className="page-actions">
                  <Button
                    disabled={!writable || busy || item.installed === true}
                    onClick={() => void change(`/api/connectors/${item.id}/install`, { fingerprint: item.fingerprint })}
                  >
                    {item.installed ? t('marketInstalled') : t('marketInstall')}
                  </Button>
                  <Button
                    disabled={!writable || busy || !item.installed || item.approved}
                    onClick={() => void change(`/api/connectors/${item.id}/approve`, { fingerprint: item.fingerprint })}
                  >
                    {item.approved ? t('marketApproved') : t('marketApprove')}
                  </Button>
                  <Button
                    disabled={!writable || busy || !item.approved || !item.profile_enabled}
                    onClick={() =>
                      void change(`/api/connectors/${item.id}/enable`, {
                        fingerprint: item.fingerprint,
                        enabled: !data.enabled_connectors.includes(item.id),
                      })
                    }
                  >
                    {data.enabled_connectors.includes(item.id) ? t('disableButton') : t('enableButton')}
                  </Button>
                  <Button
                    disabled={!writable || busy || !item.approved}
                    onClick={() => void change(`/api/connectors/${item.id}/revoke`, { fingerprint: item.fingerprint })}
                  >
                    {t('revokeButton')}
                  </Button>
                </div>
              )}
            </article>
          ))}
      </div>
    </Shell>
  )
}
