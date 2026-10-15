// SPDX-License-Identifier: AGPL-3.0-or-later

export function hasPdfView(filename: string, mimeType?: string | null): boolean {
  return mimeType === 'application/pdf' || /\.(pdf|txt)$/i.test(filename)
}

/** Office previews are offered too; the reader reports missing conversion honestly. */
export function hasMaterialView(filename: string, mimeType?: string | null): boolean {
  return hasPdfView(filename, mimeType) || /\.(pptx?|docx?)$/i.test(filename)
}

/** Web pages (Moodle "Seite" modules arrive as index.html) and Markdown read as text inside the app. */
export function hasPageView(filename: string, mimeType?: string | null): boolean {
  return mimeType === 'text/html' || mimeType === 'text/markdown' || /\.(html?|md|markdown)$/i.test(filename)
}

export type FileViewKind = 'image' | 'audio' | 'video' | 'code' | 'text' | 'table' | 'docx' | 'xlsx'

/** Mirrors app/material/viewable.py: files UniOS shows in its own viewer instead of only downloading. */
const VIEW_SUFFIXES: [FileViewKind, string[]][] = [
  ['image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']],
  ['audio', ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac']],
  ['video', ['mp4', 'm4v', 'webm']],
  ['code', ['py', 'ipynb', 'java', 'kt', 'scala', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs', 'go', 'rs', 'swift', 'js', 'mjs', 'jsx',
    'ts', 'tsx', 'php', 'rb', 'pl', 'lua', 'r', 'm', 'hs', 'ml', 'erl', 'ex', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'asm',
    's', 'vhd', 'vhdl', 'v', 'sv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'xml', 'css', 'scss', 'tex', 'bib', 'gradle',
    'cmake', 'dockerfile', 'makefile', 'mk', 'pro', 'prolog', 'dart']],
  ['text', ['log', 'ini', 'cfg', 'conf', 'properties', 'rst', 'adoc']],
  ['table', ['csv', 'tsv']],
  ['docx', ['docx', 'docm']],
  ['xlsx', ['xlsx', 'xlsm']],
]

export function fileViewKind(filename: string): FileViewKind | null {
  const name = filename.trim().toLowerCase().split(/[\\/]/).pop() ?? ''
  if (name === 'makefile' || name === 'dockerfile') return 'code'
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null
  const suffix = name.slice(dot + 1)
  return VIEW_SUFFIXES.find(([, suffixes]) => suffixes.includes(suffix))?.[0] ?? null
}

/** Whether "Öffnen" leads to the readable page or the file viewer rather than the PDF reader. */
export function opensAsDocument(filename: string, mimeType?: string | null): boolean {
  return fileViewKind(filename) !== null || (hasPageView(filename, mimeType) && !hasMaterialView(filename, mimeType))
}

/** Where a stored file opens inside UniOS, or null when only downloading makes sense. */
export function openHref(versionId: number, filename: string, mimeType?: string | null): string | null {
  if (opensAsDocument(filename, mimeType)) return `/document/${versionId}`
  if (hasMaterialView(filename, mimeType)) return `/material/${versionId}`
  return null
}
