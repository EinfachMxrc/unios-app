// SPDX-License-Identifier: AGPL-3.0-or-later
import { useId, type ReactNode } from 'react'
import { useT } from '@/i18n/useT'

type Control = { id: string; required?: boolean; 'aria-invalid'?: true; 'aria-describedby'?: string }
/** A visible label, one helper and a field-specific error; credentials stay in their form. */
export function FormField({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: (control: Control) => ReactNode
}) {
  const id = useId()
  const { t } = useT('quality')
  const description = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ')
  return (
    <div className="form-field">
      <div className="field-heading">
        <label htmlFor={id}>{label}</label>
        {required && <span className="field-required">{t('required')}</span>}
      </div>
      {children({
        id,
        required,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': description || undefined,
      })}
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
