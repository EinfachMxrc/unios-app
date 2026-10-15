// SPDX-License-Identifier: AGPL-3.0-or-later

import { useT } from '@/i18n/useT'
import './MathTypingGuide.css'

/** A quiet, keyboard-accessible reference beside both note input modes. */
export function MathTypingGuide() {
  const { t } = useT('notes')
  return (
    <details className="math-typing-guide">
      <summary>{t('math.typingTitle')}</summary>
      <div className="math-typing-content">
        <p>{t('math.typingDescription')}</p>
        <dl>
          <div>
            <dt>{t('math.power')}</dt>
            <dd>
              <code>2^5</code>
              <span>→</span>
              <span>{'2⁵'}</span>
            </dd>
          </div>
          <div>
            <dt>{t('study.base')}</dt>
            <dd>
              <code>(-9)10</code>
              <span>→</span>
              <span>{'(−9)₁₀'}</span>
              <code>(10111)2</code>
              <span>→</span>
              <span>{'(10111)₂'}</span>
            </dd>
          </div>
          <div>
            <dt>{t('study.number')}</dt>
            <dd>
              <pre>{'(01110)2\n+(10111)2\n=(00101)2'}</pre>
            </dd>
          </div>
          <div>
            <dt>{t('math.typingInline')}</dt>
            <dd>
              <code>{'$x^2$'}</code>
              <span>{t('math.typingOr')}</span>
              <code>{String.raw`\(x^2\)`}</code>
            </dd>
          </div>
          <div>
            <dt>{t('math.typingBlock')}</dt>
            <dd>
              <code>{String.raw`$$\frac{1}{2}$$`}</code>
              <span>{t('math.typingOr')}</span>
              <code>{String.raw`\[\frac{1}{2}\]`}</code>
            </dd>
          </div>
          <div>
            <dt>{t('math.typingExamples')}</dt>
            <dd>
              <code>{String.raw`\frac{a}{b}`}</code>
              <code>{String.raw`\sqrt{x}`}</code>
              <code>{String.raw`\sum_{i=1}^{n} i`}</code>
            </dd>
          </div>
        </dl>
        <p>{t('math.typingShortcut')}</p>
      </div>
    </details>
  )
}
