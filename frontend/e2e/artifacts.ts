// SPDX-License-Identifier: AGPL-3.0-or-later

import { test } from '@playwright/test'
import path from 'node:path'

/** Routine runs stay in Playwright's output; published QA needs an explicit directory. */
export function screenshotPath(filename: string): string {
  const name = path.basename(filename)
  return process.env.UNIOS_QA_DIRECTORY
    ? path.resolve(process.env.UNIOS_QA_DIRECTORY, name)
    : test.info().outputPath(name)
}
