// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Popover } from 'radix-ui'
import { Bell, CalendarDays, CheckCheck, FileClock, Mail, ArrowRight, X, Check, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { localDate } from '@/api'
import { useWritableHost } from '@/hooks/host'
import {
  markAllNotificationsSeen,
  setNotificationRead,
  useNotifications,
  type NotificationItem,
} from '@/hooks/useNotifications'
import { useT } from '@/i18n/useT'
import './NotificationPopover.css'

export function NotificationPopover() {
  const { t } = useT('activity')
  const { data, loading, error } = useNotifications()
  const unreadCount = data?.unread ?? 0
  const badgeCount = unreadCount > 99 ? '99+' : String(unreadCount)
  const triggerLabel = unreadCount > 0 ? t('notificationsWithCount', { count: badgeCount }) : t('notifications')
  const writable = useWritableHost()
  const navigate = useNavigate()
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [failed, setFailed] = useState(false)
  const { t: quality } = useT('quality')
  const priority = (item: NotificationItem) =>
    ['assignment', 'deadline'].includes(item.kind) ? 0 : item.kind === 'mail' ? 1 : 2
  const items = (data?.items ?? [])
    .filter((item) => !item.muted && (filter !== 'unread' || !item.read_at))
    .sort(
      (a, b) =>
        Number(Boolean(a.read_at)) - Number(Boolean(b.read_at)) ||
        priority(a) - priority(b) ||
        Date.parse(b.created_at) - Date.parse(a.created_at),
    )
    .slice(0, 6)
  const groups = new Map<string, NotificationItem[]>()
  for (const item of items) {
    const label = t(item.read_at ? 'read' : 'unread')
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  const materialCount = items.filter((item) => ['material', 'new-files'].includes(item.kind)).length
  async function seeAll() {
    if (data?.latest_id === undefined) return
    setBusy(true)
    setFailed(false)
    try {
      await markAllNotificationsSeen(data.latest_id)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  async function toggleRead(item: NotificationItem) {
    setBusy(true)
    setFailed(false)
    try {
      await setNotificationRead(item.id, !item.read_at)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  async function view(item: NotificationItem) {
    setFailed(false)
    if (writable && !item.read_at) {
      setBusy(true)
      try {
        await setNotificationRead(item.id, true)
      } catch {
        setFailed(true)
        return
      } finally {
        setBusy(false)
      }
    }
    setOpen(false)
    navigate(item.url)
  }
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        setFailed(false)
      }}
    >
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="topbar-notifications"
          aria-label={triggerLabel}
          title={data && data.unread > 0 ? t('unreadCount', { count: data.unread }) : t('notifications')}
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="topbar-notification-count" aria-hidden="true">
              {badgeCount}
            </span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="notification-popover"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          aria-labelledby={titleId}
        >
          <div className="notification-popover-heading">
            <div>
              <h2 id={titleId}>{t('notifications')}</h2>
              {data && <p>{data.unread ? t('unreadCount', { count: data.unread }) : t('allSeen')}</p>}
            </div>
            <Popover.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t('closeNotifications')}>
                <X size={17} />
              </Button>
            </Popover.Close>
          </div>
          <div className="notification-popover-actions">
            <div className="notification-preview-filters" role="group" aria-label={t('notificationFilter')}>
              <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                {t('allPreview')}
              </button>
              <button type="button" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
                {t('unread')}
                {unreadCount > 0 && <span>{badgeCount}</span>}
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!writable || busy || !data?.unread || data.latest_id === undefined}
              onClick={() => void seeAll()}
            >
              <CheckCheck size={16} />
              {busy ? t('markingSeen') : t('markAllSeen')}
            </Button>
          </div>
          {failed && (
            <p className="notification-popover-status" role="alert">
              {t('readFailed')}
            </p>
          )}
          {error && (
            <p className="notification-popover-status" role="alert">
              {t('loadFailed')}
            </p>
          )}
          {loading && !data && (
            <p className="notification-popover-status" role="status">
              {t('loadingNotifications')}
            </p>
          )}
          {!writable && <p className="notification-popover-status">{t('readOnlyNotifications')}</p>}
          <div className="notification-popover-list">
            {[...groups].map(([label, group]) => (
              <section key={label} className="notification-preview-group">
                <h3>{label}</h3>
                {group.map((item) => {
                  const Icon =
                    item.kind === 'mail'
                      ? Mail
                      : ['assignment', 'deadline'].includes(item.kind)
                        ? CalendarDays
                        : ['material', 'new-files'].includes(item.kind)
                          ? FileClock
                          : Bell
                  const course = data?.courses?.find((value) => value.id === item.course_id)?.name
                  const preview = item.body.replace(/https?:\/\/\S+/g, '').trim()
                  return (
                    <div className="notification-preview-row" key={item.id}>
                      <button
                        type="button"
                        className={`notification-preview ${item.read_at ? '' : 'is-unread'}`}
                        disabled={busy}
                        onClick={() => void view(item)}
                      >
                        <span className="notification-preview-icon">
                          <Icon size={18} />
                        </span>
                        <span className="notification-preview-copy">
                          <span className="notification-preview-title">
                            {item.title}
                            {!item.read_at && <span className="notification-unread-dot" aria-label={t('unread')} />}
                          </span>
                          {preview && <span className="notification-preview-body">{preview}</span>}
                          <span className="notification-preview-meta">
                            {course && <span>{course}</span>}
                            <time dateTime={item.created_at}>{localDate(item.created_at)}</time>
                          </span>
                        </span>
                        <ArrowRight size={14} className="notification-preview-arrow" />
                      </button>
                      <button
                        type="button"
                        className="notification-preview-read"
                        disabled={!writable || busy}
                        aria-label={t(item.read_at ? 'markUnreadItem' : 'markReadItem', { title: item.title })}
                        title={t(item.read_at ? 'markUnread' : 'markRead')}
                        onClick={() => void toggleRead(item)}
                      >
                        {item.read_at ? <Circle size={16} /> : <Check size={16} />}
                      </button>
                    </div>
                  )
                })}
              </section>
            ))}
            {!loading && !error && !items.length && (
              <div className="notification-popover-empty">
                <CheckCheck size={24} />
                <strong>{t(filter === 'unread' ? 'noUnreadNotifications' : 'noNotifications')}</strong>
                <p>{t(filter === 'unread' ? 'filteredNotificationsHint' : 'noNotificationsHint')}</p>
              </div>
            )}
          </div>
          {materialCount >= 3 && (
            <p className="notification-popover-status">{quality('noiseSummary', { count: materialCount })}</p>
          )}
          <Popover.Close asChild>
            <Link to="/notifications" className="notification-popover-footer">
              {t('viewAllNotifications')}
              <ArrowRight size={15} />
            </Link>
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
