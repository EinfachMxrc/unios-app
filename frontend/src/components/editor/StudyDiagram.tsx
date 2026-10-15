// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId } from 'react'
import { useT } from '@/i18n/useT'
import { diagramPositions, parseDiagram } from './studyModels'

export function StudyDiagram({ source }: { source: string }) {
  const { t } = useT('notes')
  const arrow = useId().replace(/:/g, '')
  let diagram
  try {
    diagram = parseDiagram(source)
  } catch {
    return <p role="status">{t('study.errorDiagram')}</p>
  }
  const positions = diagramPositions(diagram)
  const width = Math.max(...positions.map((p) => p.x)) + 120,
    height = Math.max(...positions.map((p) => p.y)) + 65
  return (
    <div className="study-diagram">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('study.diagram')}>
        <title>{t('study.diagram')}</title>
        <defs>
          <marker id={arrow} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
          </marker>
        </defs>
        {diagram.edges.map((edge, i) => {
          const a = positions[edge.from],
            b = positions[edge.to],
            loop = edge.from === edge.to
          return (
            <g key={i}>
              <path
                d={
                  loop
                    ? `M${a.x + 80},${a.y} C${a.x + 135},${a.y - 75} ${a.x - 135},${a.y - 75} ${a.x - 80},${a.y}`
                    : `M${a.x},${a.y + 29} L${b.x},${b.y - 29}`
                }
                fill="none"
                stroke="currentColor"
                markerEnd={`url(#${arrow})`}
              />
              {edge.label && (
                <text x={(a.x + b.x) / 2 + 6} y={(a.y + b.y) / 2} className="study-edge-label">
                  {edge.label}
                </text>
              )}
            </g>
          )
        })}
        {diagram.nodes.map((name, i) => (
          <g key={name}>
            <rect x={positions[i].x - 100} y={positions[i].y - 29} width="200" height="58" rx="10" />
            <text x={positions[i].x} y={positions[i].y - (name.length > 26 ? 3 : -5)} textAnchor="middle">
              <tspan x={positions[i].x}>{name.slice(0, 26)}</tspan>
              {name.length > 26 && (
                <tspan x={positions[i].x} dy="18">
                  {name.slice(26, 52)}
                  {name.length > 52 ? '…' : ''}
                </tspan>
              )}
            </text>
          </g>
        ))}
      </svg>
      <details>
        <summary>{t('study.connections')}</summary>
        <pre>{source}</pre>
      </details>
    </div>
  )
}
