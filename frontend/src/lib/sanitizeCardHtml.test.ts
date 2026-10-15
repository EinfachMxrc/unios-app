// SPDX-License-Identifier: AGPL-3.0-or-later

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeCardHtml } from './sanitizeCardHtml'

describe('sanitizeCardHtml', () => {
  it('keeps allowed formatting tags', () => {
    const html = '<p>Hallo <strong>Welt</strong> <em>kursiv</em></p>'
    expect(sanitizeCardHtml(html)).toBe(html)
  })

  it('strips script tags and their content', () => {
    expect(sanitizeCardHtml('<p>Text</p><script>alert(1)</script>')).toBe('<p>Text</p>')
  })

  it('strips inline event handler attributes', () => {
    expect(sanitizeCardHtml('<img src="/api/anki/study/media/a.png" onerror="alert(1)">')).toBe(
      '<img src="/api/anki/study/media/a.png">',
    )
  })

  it('keeps an image with a local, relative src', () => {
    const html = '<img src="/api/anki/study/media/bild.png" alt="Bild">'
    expect(sanitizeCardHtml(html)).toBe(html)
  })

  it('drops an image with an absolute remote src', () => {
    expect(sanitizeCardHtml('<img src="https://evil.example/track.png" alt="x">')).toBe('')
  })

  it('drops an image with a protocol-relative src', () => {
    expect(sanitizeCardHtml('<img src="//evil.example/track.png">')).toBe('')
  })

  it('unwraps tags outside the allowlist but keeps their text', () => {
    expect(sanitizeCardHtml('<article>Inhalt</article>')).toBe('Inhalt')
  })
})
