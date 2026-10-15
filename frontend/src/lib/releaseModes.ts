// SPDX-License-Identifier: AGPL-3.0-or-later
export async function restartNativeBackend(mode: 'normal' | 'safe' | 'demo'): Promise<void> {
  const bridge = (window as Window & { __TAURI_INTERNALS__?: { invoke?: (command: string, args: Record<string, unknown>) => Promise<unknown> } }).__TAURI_INTERNALS__
  if (!bridge?.invoke) throw new Error('Desktop app required')
  // Native shell navigates to the isolated mode origin after its health check.
  await bridge.invoke('restart_backend', { mode })
}
