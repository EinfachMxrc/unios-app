// SPDX-License-Identifier: AGPL-3.0-or-later

import { usePreferences } from '@/preferences'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { useApi, localDate } from '@/api'
import { safeAddonHref, type AddonSlot, type AddonView } from '@/addons/types'
import './addons.css'

export function AddonWidgetSlot({ slot, courseId }: { slot: AddonSlot; courseId?: number }) {
  const preferences = usePreferences()
  const { t } = useT('addons')
  const path = `/api/addons/slots/${slot}${courseId ? `?course_id=${courseId}` : ''}`
  const { data, error } = useApi<AddonView[]>(path, { enabled: preferences.modules.addons })
  if (!preferences.modules.addons || error) return null
  if (!data?.length) return null
  return (
    <div className="addon-slot" aria-label={t('extensionsLabel')}>
      {data.map((widget) => (
        <section className="addon-widget" key={`${widget.addon_id}-${slot}`}>
          <span className="addon-widget-kicker">{t('widgetKicker')}</span>
          <h2>{widget.title}</h2>
          {widget.body && <p>{widget.body}</p>}
          {widget.items &&
            (widget.items.length ? (
              <ul>
                {widget.items.map((item, index) => {
                  const href = safeAddonHref(item.href)
                  return (
                    <li key={`${item.href}-${index}`}>
                      {href ? <Link to={href}>{item.label}</Link> : <span>{item.label}</span>}
                      {item.detail && <small>{localDate(item.detail)}</small>}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="muted-text">{t('noEntriesText')}</p>
            ))}
          {widget.page_url && safeAddonHref(widget.page_url) && (
            <Link className="addon-widget-action" to={widget.page_url}>
              {t('openWidgetLink')}
            </Link>
          )}
        </section>
      ))}
    </div>
  )
}
