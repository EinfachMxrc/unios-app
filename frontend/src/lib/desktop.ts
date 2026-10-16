// SPDX-License-Identifier: AGPL-3.0-or-later

// Bridge to the UniOS desktop shell (Tauri). In a normal browser or the PWA
// none of this exists and callers fall back to plain links.

import type { CrawlBridge, PortalStatus } from './portalCrawl'
import type { BookingSelection, RoomAvailability, RoomSnapshot } from './rooms'

type DesktopInternals = { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> }

function internals(): DesktopInternals | null {
  const candidate = (window as Window & { __TAURI_INTERNALS__?: Partial<DesktopInternals> }).__TAURI_INTERNALS__
  return typeof candidate?.invoke === 'function' ? (candidate as DesktopInternals) : null
}

export function isDesktopApp(): boolean {
  return internals() !== null
}

export async function openExternalUrl(url: string): Promise<void> {
  await invokeDesktop('open_external_url', { url })
}

/** Opens the official Moodle sign-in in a separate app window that catches the return link itself. */
export async function openMoodleLoginWindow(url: string): Promise<void> {
  const bridge = internals()
  if (!bridge) throw new Error('UniOS desktop app is not available')
  await bridge.invoke('open_moodle_login', { url })
}

export type PortalName = 'mycampus' | 'primuss' | 'mail'
export type PortalCapture = { entry_url: string; cookies: unknown[] }

async function invokeDesktop<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const bridge = internals()
  if (!bridge) throw new Error('UniOS desktop app is not available')
  return (await bridge.invoke(command, args)) as T
}

/** Opens a university portal in an app window for the user's own sign-in. */
export function openPortalLogin(portal: PortalName, url: string): Promise<void> {
  return invokeDesktop('open_portal_login', { portal, url })
}

/** Reads the sign-in the user completed in that window (cookies and current address). */
export function capturePortalLogin(portal: PortalName): Promise<PortalCapture> {
  return invokeDesktop('capture_portal_login', { portal })
}

export function closePortalLogin(portal: PortalName): Promise<void> {
  return invokeDesktop('close_portal_login', { portal })
}

export type PortalPageSnapshot = { url: string; title: string; html: string }
export type PortalCaptureCapabilities = { traversal: boolean }

export async function portalCaptureCapabilities(): Promise<PortalCaptureCapabilities> {
  const result = await invokeDesktop<PortalCaptureCapabilities | null>('portal_capture_capabilities', {})
  return { traversal: result?.traversal === true }
}

/** The page currently shown in the portal window, as rendered (address, title and HTML). */
export function snapshotPortalPage(portal: PortalName): Promise<PortalPageSnapshot> {
  return invokeDesktop('snapshot_portal_page', { portal })
}

export function portalStatus(portal: PortalName): Promise<PortalStatus> {
  return invokeDesktop('portal_status', { portal })
}

/** Everything the walk-through needs from the portal window, bound to one portal. */
export function desktopCrawlBridge(portal: PortalName): CrawlBridge {
  return {
    capabilities: portalCaptureCapabilities,
    status: () => portalStatus(portal),
    snapshot: () => snapshotPortalPage(portal),
    links: () => invokeDesktop('portal_links', { portal }),
    navigate: (url) => invokeDesktop('portal_navigate', { portal, url }),
    click: (index, text) => invokeDesktop('portal_click', { portal, index, expectedText: text }),
    scroll: () => invokeDesktop('portal_scroll', { portal }),
    guard: (active, menuBudget) => invokeDesktop('portal_guard', { portal, active, menuBudget }),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
}

/** Opens the official mailbox without granting remote pages any UniOS capabilities. */
export function openUniversityMail(url: string): Promise<void> {
  return invokeDesktop('open_university_mail', { url })
}

export function openRoomBooking(): Promise<void> {
  return invokeDesktop('open_room_booking', {})
}
export function fillRoomBooking(selection: BookingSelection): Promise<{ filled: string[] }> {
  return invokeDesktop('fill_room_booking', { selection })
}
export function readRoomBooking(): Promise<RoomSnapshot> {
  return invokeDesktop('read_room_booking', {})
}
export function checkRoomAvailability(selection: BookingSelection): Promise<RoomAvailability> {
  return invokeDesktop('check_room_availability', { selection })
}
