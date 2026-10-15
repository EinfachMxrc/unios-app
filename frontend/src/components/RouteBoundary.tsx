// SPDX-License-Identifier: AGPL-3.0-or-later

import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'

function RouteFailure() {
  const { t } = useT('common')
  return (
    <Shell title={t('pageLoadFailed')}>
      <div role="alert">
        <p className="muted-text mb-4">{t('pageLoadFailedHint')}</p>
        <Button onClick={() => window.location.reload()}>{t('pageReload')}</Button>
      </div>
    </Shell>
  )
}

class Boundary extends Component<{ pathname: string; children: ReactNode }, { pathname: string; failed: boolean }> {
  state = { pathname: this.props.pathname, failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  static getDerivedStateFromProps(props: { pathname: string }, state: { pathname: string }) {
    return props.pathname === state.pathname ? null : { pathname: props.pathname, failed: false }
  }
  render() {
    return this.state.failed ? <RouteFailure /> : this.props.children
  }
}

export function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <Boundary pathname={pathname}>{children}</Boundary>
}
