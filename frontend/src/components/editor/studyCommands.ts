// SPDX-License-Identifier: AGPL-3.0-or-later

import { mathTemplates, type MathTemplate } from './mathTemplates'
import type { StudyTool } from './StudyHelperDialog'
export const studyToolKeys: StudyTool[] = ['number', 'diagram', 'recall', 'statistics', 'source', 'project', 'code']
export type QuickStudyCommand =
  | { kind: 'math'; template?: MathTemplate; block?: boolean }
  | { kind: 'truth'; view?: 'table' | 'forms' | 'kv' }
  | { kind: 'tool'; tool: StudyTool; base?: number }
const aliases: Record<string, QuickStudyCommand> = {
  math: { kind: 'math' },
  formel: { kind: 'math' },
  latex: { kind: 'math' },
  gleichung: { kind: 'math', block: true },
  bruch: { kind: 'math', template: 'fraction' },
  wurzel: { kind: 'math', template: 'root' },
  matrix: { kind: 'math', template: 'matrix', block: true },
  potenz: { kind: 'math', template: 'power' },
  summe: { kind: 'math', template: 'sum' },
  fraction: { kind: 'math', template: 'fraction' },
  sqrt: { kind: 'math', template: 'root' },
  lim: { kind: 'math', template: 'limit' },
  grenzwert: { kind: 'math', template: 'limit' },
  ableitung: { kind: 'math', template: 'derivative' },
  vektor: { kind: 'math', template: 'vector', block: true },
  schritte: { kind: 'math', template: 'steps', block: true },
  system: { kind: 'math', template: 'system', block: true },
  faelle: { kind: 'math', template: 'cases', block: true },
  wahrheit: { kind: 'truth' },
  truth: { kind: 'truth' },
  kv: { kind: 'truth', view: 'kv' },
  logik: { kind: 'truth' },
  dnf: { kind: 'truth', view: 'forms' },
  knf: { kind: 'truth', view: 'forms' },
  wahrheitstabelle: { kind: 'truth' },
  'truth-table': { kind: 'truth' },
  bin: { kind: 'tool', tool: 'number', base: 2 },
  hex: { kind: 'tool', tool: 'number', base: 16 },
  zahlen: { kind: 'tool', tool: 'number' },
  diagramm: { kind: 'tool', tool: 'diagram' },
  diagram: { kind: 'tool', tool: 'diagram' },
  baum: { kind: 'tool', tool: 'diagram' },
  ueben: { kind: 'tool', tool: 'recall' },
  üben: { kind: 'tool', tool: 'recall' },
  recall: { kind: 'tool', tool: 'recall' },
  statistik: { kind: 'tool', tool: 'statistics' },
  statistics: { kind: 'tool', tool: 'statistics' },
  quelle: { kind: 'tool', tool: 'source' },
  source: { kind: 'tool', tool: 'source' },
  projekt: { kind: 'tool', tool: 'project' },
  project: { kind: 'tool', tool: 'project' },
  codeablauf: { kind: 'tool', tool: 'code' },
  trace: { kind: 'tool', tool: 'code' },
}
export function quickStudyCommand(query: string): QuickStudyCommand | null {
  const key = query.trim().toLocaleLowerCase().replace(/^\//, '')
  return aliases[key] ?? (Object.hasOwn(mathTemplates, key) ? { kind: 'math', template: key as MathTemplate } : null)
}
