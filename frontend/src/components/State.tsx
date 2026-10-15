// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { queryClient } from '@/offlineCache'
import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'
import { useT } from '@/i18n/useT'
import { Bell, CheckCircle2, Clock3, CloudOff, Sparkles } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Overview } from '@/types'

export function Loading({ variant = 'page' }: { variant?: 'page' | 'rows' | 'editor' }) {
  const { t } = useT('quality')
  return (
    <div className={`loading-layout loading-${variant}`} aria-busy="true" role="status" aria-label={t('loading')}>
      {variant === 'rows' ? Array.from({ length: 4 }, (_, index) => <div className="loading-row" key={index}><Skeleton className="size-10 rounded-lg" /><div><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2 mt-3" /></div></div>) : <>
        <Skeleton className={variant === 'editor' ? 'h-12 w-2/3' : 'h-24 w-full rounded-xl'} />
        <Skeleton className={variant === 'editor' ? 'h-80 w-full rounded-xl' : 'h-56 w-full rounded-xl'} />
      </>}
    </div>
  )
}
export function Failure({ message, retry }: { message: string; retry?: () => void }) {
  const { t: quality } = useT('quality')
  const { t } = useT('state')
  const detail = /\bHTTP\s*\d{3}\b|Traceback|Exception|uvicorn|localhost|127\.0\.0\.1|\/api\//i.test(message)
    ? t('failureGenericDetail')
    : message
  return (
    <Alert variant="destructive">
      <CloudOff className="size-4" />
      <AlertTitle>{t('failureTitle')}</AlertTitle>
      <AlertDescription><p>{detail}</p><div className="state-actions">
        <Button size="sm" variant="outline" onClick={retry ?? (() => { void queryClient.invalidateQueries({ queryKey: ['api'] }) })}>{quality('retry')}</Button>
        <Link to="/system">{quality('connection')}</Link>
      </div></AlertDescription>
    </Alert>
  )
}
export function Empty({ icon: Icon = Sparkles, title, text, action }: { icon?: typeof Sparkles; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={21} strokeWidth={1.7} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && <div className="state-actions">{action}</div>}
    </div>
  )
}
export function SyncContinuityNotice({
  value,
  configured,
}: {
  value: Overview['sync_continuity']
  configured: boolean
}) {
  const { t } = useT('state')
  if (value.state === 'current' || (value.state === 'never' && !configured)) return null
  const overdue = value.state === 'overdue'
  return (
    <Alert role={overdue ? 'alert' : 'status'} className="notice mb-5">
      {overdue ? (
        <Bell className="size-4" />
      ) : value.state === 'never' ? (
        <Clock3 className="size-4" />
      ) : (
        <CheckCircle2 className="size-4" />
      )}
      <AlertTitle>
        {value.state === 'never'
          ? t('syncNeverTitle')
          : overdue
            ? t('syncOverdueTitle')
            : t('syncCurrentTitle')}
      </AlertTitle>
      <AlertDescription>
        {value.state === 'never'
          ? t('syncNeverDescription')
          : overdue
            ? t('syncOverdueDescription', { hours: value.hours_since })
            : t('syncRecoveredDescription', { hours: value.recovered_gap_hours })}
      </AlertDescription>
    </Alert>
  )
}
export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="glass-card">
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
type StatusValue = 'success' | 'ok' | 'warning' | 'error' | 'running' | 'paused' | 'unknown' | 'not_configured'
const STATUS_VALUES: readonly StatusValue[] = ['success', 'ok', 'warning', 'error', 'running', 'paused', 'unknown', 'not_configured']

function isStatusValue(value: string): value is StatusValue {
  return (STATUS_VALUES as readonly string[]).includes(value)
}

export function Status({ value }: { value: string }) {
  const { t } = useT('state')
  const tone =
    value === 'success' || value === 'ok'
      ? 'good'
      : value === 'warning'
        ? 'warn'
        : value === 'unknown' || value === 'not_configured' || value === 'paused' || value === 'running'
          ? 'neutral'
          : 'bad'
  return (
    <Badge className={`status-badge ${tone}`}>
      {isStatusValue(value) ? t(`status.${value}`) : value}
    </Badge>
  )
}
export function ListRows({ children }: { children: ReactNode }) {
  return <div className="row-list" data-keyboard-list>{children}</div>
}
