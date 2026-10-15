// SPDX-License-Identifier: AGPL-3.0-or-later

import { execFileSync } from 'node:child_process'
import console from 'node:console'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = mkdtempSync(join(tmpdir(), 'marc-uni-os-openapi-'))
try {
  const generated = join(temporary, 'api.d.ts')
  const cli = join(frontend, 'node_modules', 'openapi-typescript', 'bin', 'cli.js')
  execFileSync(process.execPath, [cli, join(frontend, 'openapi.json'), '-o', generated], {
    cwd: frontend,
    stdio: 'pipe',
  })
  const committed = readFileSync(join(frontend, 'src', 'generated', 'api.d.ts'), 'utf8')
  if (readFileSync(generated, 'utf8') !== committed) {
    console.error('OpenAPI-Typen veraltet: npm run api:generate ausführen')
    process.exitCode = 1
  } else {
    console.log('OpenAPI-Typen aktuell')
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
