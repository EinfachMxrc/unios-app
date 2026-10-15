// SPDX-License-Identifier: AGPL-3.0-or-later

import DOMPurify from 'dompurify'

/**
 * Client-side defense-in-depth for Anki card HTML rendered via
 * `dangerouslySetInnerHTML` in StudyPage. The backend already sanitizes card
 * HTML with an allowlist (see `_safe_html` in app/anki/study_api.py) before it
 * ever reaches the browser, but a compromised or buggy host, a stale
 * collection imported from elsewhere, or a future regression in the backend
 * sanitizer should not be able to inject a script tag or attribute-based
 * handler into the study view. This mirrors the backend's allowlist so both
 * layers agree on what is safe.
 */
const ALLOWED_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 's', 'p', 'div', 'span', 'br', 'hr',
  'ul', 'ol', 'li', 'code', 'pre', 'sub', 'sup', 'blockquote', 'table',
  'thead', 'tbody', 'tr', 'th', 'td', 'img',
]
const ALLOWED_ATTR = ['src', 'alt', 'loading']

/**
 * Sanitizes Anki card HTML for rendering. Only the backend's allowed tag set
 * survives, and `img` may only keep a same-origin, relative `src` (the
 * backend rewrites media references to `/api/anki/study/media/<file>`); any
 * absolute or protocol-relative URL on an `img` is stripped so a card can
 * never phone home or load remote content.
 */
export function sanitizeCardHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
  const container = document.createElement('div')
  container.innerHTML = clean
  Array.from(container.querySelectorAll('img')).forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (!src.startsWith('/') || src.startsWith('//')) {
      img.remove()
    }
  })
  return container.innerHTML
}
