// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { request, useApi } from '@/api'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

type Action = { id: string; label: string; requires_confirmation: boolean; input_schema: { required?: string[] } }
type Catalog = { entities: Array<{ kind: string; label: string; actions: Action[] }> }
type Entity = { id: string | number; name?: string; title?: string; is_active?: boolean }

/** Actions, confirmation and validation use the same registry as CLI/MCP. */
export function RegistryActions() {
  const { t } = useT('commandPalette')
  const writable = useWritableHost()
  const { data: catalog } = useApi<Catalog>('/api/schema')
  const [kind, setKind] = useState('resource')
  const [query, setQuery] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [actionId, setActionId] = useState('')
  const [active, setActive] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const { data: entities } = useApi<Entity[]>(`/api/entities/${kind}?limit=100${query.trim().length >= 2 ? `&q=${encodeURIComponent(query.trim())}` : ''}`)
  const definitions = catalog?.entities.filter(entity => entity.actions.length) ?? []
  const action = definitions.find(entity => entity.kind === kind)?.actions.find(item => item.id === actionId)
  const entity = entities?.find(item => String(item.id) === identifier)
  async function run() {
    if (!action || !entity) return
    setBusy(true); setMessage('')
    try {
      const input = action.id === 'course.set_activity' ? { active, expected: entity.is_active } : {}
      const result = await request<{ result: unknown }>(`/api/entities/${kind}/${identifier}/actions/${action.id}`, {
        method: 'POST', body: JSON.stringify({ input, confirmed }),
      })
      setMessage(`${t('actionFinished')} ${JSON.stringify(result.result)}`)
      setConfirmed(false)
    } catch (error) { setMessage(extractApiErrorMessage(error)) }
    finally { setBusy(false) }
  }
  return <section aria-label={t('entityActions')}>
    <h3>{t('entityActions')}</h3>
    <label>{t('entityType')}<select aria-label={t('entityType')} value={kind} onChange={event => {
      setKind(event.target.value); setIdentifier(''); setActionId(''); setConfirmed(false)
    }}>{definitions.map(item => <option key={item.kind} value={item.kind}>{item.label}</option>)}</select></label>
    <label>{t('entityFind')}<input value={query} onChange={event => { setQuery(event.target.value); setIdentifier(''); setConfirmed(false) }} /></label>
    <label>{t('entitySelect')}<select aria-label={t('entitySelect')} value={identifier} onChange={event => { setIdentifier(event.target.value); setConfirmed(false) }}>
      <option value="">{t('choose')}</option>{entities?.map(item => <option key={item.id} value={item.id}>{item.name ?? item.title ?? item.id}</option>)}
    </select></label>
    <label>{t('entityActions')}<select aria-label={t('entityActions')} value={actionId} onChange={event => { setActionId(event.target.value); setConfirmed(false) }}>
      <option value="">{t('choose')}</option>{definitions.find(item => item.kind === kind)?.actions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    {actionId === 'course.set_activity' && <label><input type="checkbox" checked={active} onChange={event => { setActive(event.target.checked); setConfirmed(false) }} />{t('courseActive')}</label>}
    {action?.requires_confirmation && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t('confirmAction')}</label>}
    <Button disabled={!action || !entity || busy || (action.requires_confirmation && (!writable || !confirmed))} onClick={() => void run()}>{t('runAction')}</Button>
    {message && <p role="status">{message}</p>}
  </section>
}
