// SPDX-License-Identifier: AGPL-3.0-or-later

export type AddonSlot =
  | 'today.secondary'
  | 'course.sidebar'
  | 'course.tools'
  | 'learning.tools'
  | 'note.toolbar'
  | 'material.actions'
  | 'more.section'

export type AddonItem = { label: string; detail?: string; href: string }

export type AddonView = {
  runtime?: "declarative" | "wasm"
  fingerprint?: string
  addon_id: string
  view: 'text' | 'courses' | 'study_blocks' | 'focus_timer'
  title: string
  body: string
  items?: AddonItem[]
  duration_minutes?: number
  break_minutes?: number
  page_url?: string | null
  slot?: AddonSlot
}

export type AddonCatalogItem = {
  id: string
  name: string
  author: string
  version: string
  description: string
  kind: 'feature' | 'ui'
  permissions: string[]
  network_domains: string[]
  fingerprint: string
  source: 'builtin' | 'local'
  installed: boolean
  approved: boolean
  enabled: boolean
}

export function safeAddonHref(value: string): string | null {
  return /^\/(?:courses\/\d+|learning|addons\/[a-z0-9.-]+)$/.test(value) ? value : null
}
