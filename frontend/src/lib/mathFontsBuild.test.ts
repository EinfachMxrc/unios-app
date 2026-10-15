// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { modernMathFontCss } from '../../tooling/mathFonts'

it('keeps all installed KaTeX faces and WOFF2 sources while avoiding duplicate formats', () => {
  const require = createRequire(import.meta.url)
  const source = readFileSync(require.resolve('katex/dist/katex.min.css'), 'utf8')
  const output = modernMathFontCss(source)
  const sources = (value: string) => [...value.matchAll(/url\([^)]*\.woff2\)/g)].map(match => match[0])
  const families = (value: string) => [...value.matchAll(/font-family:[^;}]+/g)].map(match => match[0])
  expect(sources(output)).toEqual(sources(source))
  expect(sources(output).length).toBeGreaterThan(15)
  expect(families(output)).toEqual(families(source))
  expect(output.match(/@font-face/g)?.length).toBe(source.match(/@font-face/g)?.length)
  expect(output).not.toMatch(/url\([^)]*\.(?:woff|ttf)\)/)
})
it('leaves unrelated fonts and declarations intact', () => {
  const source = '@font-face{font-family:Example;src:url(example.woff) format("woff");font-display:swap} .x{color:red}'
  expect(modernMathFontCss(source)).toBe(source)
})
it('uses a shared local font only when its filename is verified, preserving differing faces', () => {
  const source = '@font-face{src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2"),url(fonts/KaTeX_Main-Regular.woff) format("woff")}@font-face{src:url(fonts/KaTeX_Size3-Regular.woff2) format("woff2")}'
  const output = modernMathFontCss(source, new Set(['KaTeX_Main-Regular.woff2']), '/app/mathlive/fonts/')
  expect(output).toContain('url("/app/mathlive/fonts/KaTeX_Main-Regular.woff2")')
  expect(output).toContain('url(fonts/KaTeX_Size3-Regular.woff2)')
  expect(output).not.toContain('format("woff")')
})
