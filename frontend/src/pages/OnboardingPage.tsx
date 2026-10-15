// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { ArrowRight, BookOpen, Sparkles } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/BrandMark'
import './OnboardingPage.css'

/** Demo startup is supplied by the native shell; never seed the connected server. */
export function OnboardingPage({
  onStartDemo,
  onConnect,
  demoAvailable = true,
}: {
  onStartDemo: () => Promise<void>
  onConnect: () => void
  demoAvailable?: boolean
}) {
  const { t } = useT('releaseOnboarding')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function demo() {
    setBusy(true)
    setFailed(false)
    try {
      await onStartDemo()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="release-onboarding">
      <div className="release-onboarding-heading">
        <BrandMark />
        <h1>{t('title')}</h1>
        <p>{t('intro')}</p>
      </div>
      <div className="release-onboarding-choices">
        <section>
          <Sparkles aria-hidden="true" />
          <h2>{t('demo')}</h2>
          <p>{t('demoHint')}</p>
          <Button disabled={busy || !demoAvailable} onClick={() => void demo()}>
            {busy ? t('starting') : t('demo')}
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </section>
        <section>
          <BookOpen aria-hidden="true" />
          <h2>{t('connect')}</h2>
          <p>{t('connectHint')}</p>
          <Button variant="outline" disabled={busy} onClick={onConnect}>
            {t('connect')}
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </section>
      </div>
      {!demoAvailable && <p>{t('desktopDemoOnly')}</p>}
      {failed && <p role="alert">{t('failed')}</p>}
      <section className="release-onboarding-steps" aria-label={t('steps')}>
        <h2>{t('steps')}</h2>
        <ol>
          {(['firstCourse', 'firstPdf', 'firstCard', 'ownUniversity'] as const).map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
      </section>
    </main>
  )
}

export function DemoBanner({ onExit }: { onExit: () => Promise<void> }) {
  const { t } = useT('releaseOnboarding')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function exit() {
    setBusy(true)
    setFailed(false)
    try {
      await onExit()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <aside className="release-demo-banner" aria-label={t('demoActive')}>
      <div>
        <span>{t('demoActive')}</span>
        <nav aria-label={t('steps')}>
          <a href="/courses">{t('firstCourse')}</a>
          <a href="/search?q=Schleifen">{t('firstPdf')}</a>
          <a href="/study">{t('firstCard')}</a>
        </nav>
      </div>
      <Button variant="outline" disabled={busy} onClick={() => void exit()}>
        {t('exitDemo')}
      </Button>
      {failed && <p role="alert">{t('failed')}</p>}
    </aside>
  )
}
