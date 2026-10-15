// SPDX-License-Identifier: AGPL-3.0-or-later

export function SettingToggle({
  title,
  description,
  checked,
  onChange,
  disabled = false,
  busy = false,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p className="muted-text">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={title}
        aria-checked={checked}
        aria-busy={busy}
        className={`setting-switch ${checked ? 'is-on' : ''}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  )
}
