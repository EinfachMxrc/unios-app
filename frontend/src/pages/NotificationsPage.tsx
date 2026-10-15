// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { queryClient } from '@/offlineCache'
import { localDate, request } from '@/api'
import { useT } from '@/i18n/useT'
import { useWritableHost } from '@/hooks/host'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/Shell'
import { Empty, Failure, ListRows, Loading } from '@/components/State'
import './ProductPlatform.css'
import {
  markAllNotificationsSeen,
  setNotificationRead,
  useNotifications,
  type NotificationCenter,
} from '@/hooks/useNotifications'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

export type Center = NotificationCenter

export function NotificationsPage() {
  const { t } = useT('activity')
  const writable = useWritableHost()
  const { data, error: initialError, refreshError, loading, updatedAt, reload } = useNotifications()
  const error = initialError ?? refreshError
  const [filter, setFilter] = useState('unread')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const visibleItems =
    data?.items.filter(
      (item) => filter === 'all' || (filter === 'muted' ? item.muted : !item.read_at && !item.muted),
    ) ?? []
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true)
    setMessage('')
    try {
      await request(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
      reload()
    } catch (cause) {
      setMessage(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  async function read(identifier: number, value: boolean) {
    setBusy(true)
    setMessage('')
    try {
      await setNotificationRead(identifier, value)
    } catch {
      setMessage(t('readFailed'))
    } finally {
      setBusy(false)
    }
  }
  async function readAll() {
    if (data?.latest_id === undefined) return
    setBusy(true)
    setMessage('')
    try {
      await markAllNotificationsSeen(data.latest_id)
    } catch {
      setMessage(t('readFailed'))
    } finally {
      setBusy(false)
    }
  }
  async function toggleScope(scope: string, enabled: boolean) {
    const previous = data
    queryClient.setQueryData(['api', '/api/notifications'], {
      ...data,
      muted_scopes: enabled
        ? [...(data?.muted_scopes ?? []), scope]
        : data?.muted_scopes.filter((value) => value !== scope),
    })
    setBusy(true)
    setMessage('')
    try {
      await request('/api/notifications/mute', { method: 'PUT', body: JSON.stringify({ scope, enabled }) })
      reload()
    } catch (cause) {
      queryClient.setQueryData(['api', '/api/notifications'], previous)
      setMessage(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell title={t('notifications')} cachedAt={updatedAt}>
      <div className="notification-center">
        <div className="page-actions">
          <label className="form-stack">
            {t('notificationFilter')}
            <select
              className="native-select"
              aria-label={t('notificationFilter')}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="unread">{t('unread')}</option>
              <option value="all">{t('allEventsOption')}</option>
              <option value="muted">{t('muted')}</option>
            </select>
          </label>
          <Button
            variant="outline"
            disabled={!writable || busy || !data?.unread || data.latest_id === undefined}
            onClick={() => void readAll()}
          >
            {t('markAllSeen')}
          </Button>
          <Button disabled={!writable || busy} onClick={() => void mutate('/api/notifications/refresh', 'POST')}>
            {t('refreshStored')}
          </Button>
        </div>
        {error && <Failure message={error} retry={reload} />}
        {message && <p role="alert">{message}</p>}
        {loading && !data ? (
          <Loading variant="rows" />
        ) : (
          data &&
          (data.items.length === 0 ? (
            <Empty icon={Bell} title={t('noNotifications')} text={t('noNotificationsHint')} />
          ) : visibleItems.length === 0 ? (
            <Empty
              icon={Bell}
              title={t(filter === 'muted' ? 'noMutedNotifications' : 'noUnreadNotifications')}
              text={t('filteredNotificationsHint')}
              action={
                <Button variant="outline" onClick={() => setFilter('all')}>
                  {t('showAllNotifications')}
                </Button>
              }
            />
          ) : (
            <ListRows>
              {visibleItems.map((item) => (
                <article className="data-row" key={item.id}>
                  <div>
                    <Link
                      to={item.url}
                      onClick={() => {
                        if (writable && !item.read_at) void read(item.id, true)
                      }}
                    >
                      {item.title}
                    </Link>
                    <p>{item.body}</p>
                    <small>
                      {localDate(item.created_at)} · {item.read_at ? t('read') : t('unread')}
                      {item.muted ? ` · ${t('muted')}` : ''}
                    </small>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!writable || busy}
                    onClick={() => void read(item.id, !item.read_at)}
                  >
                    {item.read_at ? t('markUnread') : t('markRead')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!writable || busy}
                    onClick={() => void mutate(`/api/notifications/${item.id}`, 'PATCH', { muted: !item.muted })}
                  >
                    {item.muted ? t('unmute') : t('mute')}
                  </Button>
                </article>
              ))}
            </ListRows>
          ))
        )}
        <details className="my-6">
          <summary>{t('muteCourses')}</summary>
          <label>
            <input
              type="checkbox"
              checked={data?.muted_scopes.includes('all') ?? false}
              disabled={!writable || busy || !data}
              onChange={(event) => void toggleScope('all', event.target.checked)}
            />
            {t('muteAll')}
          </label>
          {data?.courses.map((course) => (
            <label key={course.id} className="block">
              <input
                type="checkbox"
                checked={data.muted_scopes.includes(`course:${course.id}`)}
                disabled={!writable || busy}
                onChange={(event) => void toggleScope(`course:${course.id}`, event.target.checked)}
              />
              {course.name}
            </label>
          ))}
        </details>
      </div>
    </Shell>
  )
}
