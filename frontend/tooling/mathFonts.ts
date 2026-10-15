// SPDX-License-Identifier: AGPL-3.0-or-later
/** All supported Tauri/Web browsers support WOFF2; keep every face, one format. */
export function modernMathFontCss(source: string, sharedFonts: ReadonlySet<string> = new Set(), fontsBase = '/mathlive/fonts/'): string {
  return source.replace(/src:([^;}]+)([;}])/g, (declaration: string, choices: string, ending: string) => {
    const modern = choices.split(',').filter(choice => /format\(["']woff2["']\)/.test(choice))
    return modern.length ? `src:${modern.join(',')}${ending}` : declaration
  }).replace(/url\((["']?)fonts\/([^/'")]+\.woff2)\1\)/g, (original: string, _quote: string, name: string) =>
    sharedFonts.has(name) ? `url("${fontsBase}${name}")` : original)
}
