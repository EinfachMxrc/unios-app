// SPDX-License-Identifier: AGPL-3.0-or-later

import './BrandMark.css'

/** Decorative mark: the adjacent translated app name supplies the accessible label. */
export function BrandMark({ className = '' }: { className?: string }) {
  return <img className={`unios-brand-mark ${className}`} src="/brand/v2/app-icon.svg" width={32} height={32} alt="" aria-hidden="true" />
}
