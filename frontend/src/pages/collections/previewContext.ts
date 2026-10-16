// SPDX-License-Identifier: AGPL-3.0-or-later
import { createContext } from 'react'
import type { Item } from './collectionModel'

export const CollectionPreviewContext = createContext<((item: Item) => void) | null>(null)
