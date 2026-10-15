// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  capturePortalLogin,
  closePortalLogin,
  isDesktopApp,
  openMoodleLoginWindow,
  openPortalLogin,
  portalCaptureCapabilities,
  snapshotPortalPage,
} from './desktop'

type TestWindow = Window & { __TAURI_INTERNALS__?: unknown }

afterEach(() => {
  delete (window as TestWindow).__TAURI_INTERNALS__
})

describe('desktop bridge', () => {
  it('reports a plain browser as not the desktop app', () => {
    expect(isDesktopApp()).toBe(false)
  })

  it('refuses to open a login window outside the desktop app', async () => {
    await expect(openMoodleLoginWindow('https://moodle.example/admin/tool/mobile/launch.php')).rejects.toThrow()
  })

  it('asks the desktop shell to open the official login in its own window', async () => {
    const invoke = vi.fn().mockResolvedValue(null)
    ;(window as TestWindow).__TAURI_INTERNALS__ = { invoke }
    expect(isDesktopApp()).toBe(true)
    await openMoodleLoginWindow('https://moodle.example/admin/tool/mobile/launch.php?passport=x')
    expect(invoke).toHaveBeenCalledWith('open_moodle_login', {
      url: 'https://moodle.example/admin/tool/mobile/launch.php?passport=x',
    })
  })
})

describe('portal sign-in bridge', () => {
  it('passes the portal name and address to the matching desktop commands', async () => {
    const capture = { entry_url: 'https://mycampus.example/', cookies: [] }
    const invoke = vi
      .fn()
      .mockImplementation((command: string) => Promise.resolve(command === 'capture_portal_login' ? capture : null))
    ;(window as TestWindow).__TAURI_INTERNALS__ = { invoke }
    await openPortalLogin('primuss', 'https://mycampus.example/')
    expect(invoke).toHaveBeenLastCalledWith('open_portal_login', {
      portal: 'primuss',
      url: 'https://mycampus.example/',
    })
    await expect(capturePortalLogin('mycampus')).resolves.toEqual(capture)
    expect(invoke).toHaveBeenLastCalledWith('capture_portal_login', { portal: 'mycampus' })
    await closePortalLogin('mycampus')
    expect(invoke).toHaveBeenLastCalledWith('close_portal_login', { portal: 'mycampus' })
  })

  it('fails without the desktop app instead of pretending to sign in', async () => {
    await expect(capturePortalLogin('mycampus')).rejects.toThrow()
  })
})

describe('portal page snapshot', () => {
  it('uses the native capability instead of guessing from the browser platform', async () => {
    const invoke = vi.fn().mockResolvedValue({ traversal: false })
    ;(window as TestWindow).__TAURI_INTERNALS__ = { invoke }
    await expect(portalCaptureCapabilities()).resolves.toEqual({ traversal: false })
    expect(invoke).toHaveBeenCalledWith('portal_capture_capabilities', {})
  })

  it('does not enable traversal for an unknown capability response', async () => {
    const invoke = vi.fn().mockResolvedValue(null)
    ;(window as TestWindow).__TAURI_INTERNALS__ = { invoke }
    await expect(portalCaptureCapabilities()).resolves.toEqual({ traversal: false })
  })
  it('asks the desktop shell for the open portal page', async () => {
    const snapshot = { url: 'https://mycampus.example/blog', title: 'Blog', html: '<html></html>' }
    const invoke = vi.fn().mockResolvedValue(snapshot)
    ;(window as TestWindow).__TAURI_INTERNALS__ = { invoke }
    await expect(snapshotPortalPage('mycampus')).resolves.toEqual(snapshot)
    expect(invoke).toHaveBeenCalledWith('snapshot_portal_page', { portal: 'mycampus' })
  })
})
