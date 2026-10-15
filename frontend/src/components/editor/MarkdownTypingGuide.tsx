// SPDX-License-Identifier: AGPL-3.0-or-later
import { useT } from '@/i18n/useT'
import './MathTypingGuide.css'

export function MarkdownTypingGuide() {
  const { t } = useT('notes')
  return (
    <details className="math-typing-guide">
      <summary>{t('typing.title')}</summary>
      <div className="math-typing-content">
        <p>{t('typing.description')}</p>
        <dl>
          <div>
            <dt>{t('highlight.toggle')}</dt>
            <dd>
              <code>{t('highlight.plainExample')}</code>
              <code>{t('highlight.colorExample')}</code>
            </dd>
          </div>
          <div>
            <dt>{t('typing.list')}</dt>
            <dd>
              <code>- </code>
              <code>* </code>
              <code>1. </code>
            </dd>
          </div>
          <div>
            <dt>{t('typing.heading')}</dt>
            <dd>
              <code># </code>
              <code>## </code>
              <code>### </code>
            </dd>
          </div>
          <div>
            <dt>{t('typing.task')}</dt>
            <dd>
              <code>{'- [ ] '}</code>
              <code>{'- [x] '}</code>
            </dd>
          </div>
          <div>
            <dt>{t('typing.quote')}</dt>
            <dd>
              <code>&gt; </code>
            </dd>
          </div>
        </dl>
        <p>{t('typing.continue')}</p>
      </div>
    </details>
  )
}
