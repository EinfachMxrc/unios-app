// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, it, vi } from 'vitest'
import { applyAgentSelection, type AgentAccess } from './AgentSetupWizard'
import { request } from '@/api'
vi.mock('@/api', () => ({ request: vi.fn(), useApi: vi.fn() }))
const access: AgentAccess = {
  courses: [{ id: 1, name: 'Demo A', allowed: true }, { id: 2, name: 'Demo B', allowed: true }],
  categories: { course_material: true, notes: true, deadlines: false, mail: true, exam_status: true },
}
beforeEach(() => { vi.mocked(request).mockReset(); vi.mocked(request).mockResolvedValue({}) })
it('disables Work before reconciling every grant, including previously enabled sensitive data', async () => {
  await applyAgentSelection(access, [1], ['course_material', 'notes'])
  const calls = vi.mocked(request).mock.calls
  expect(calls[0]).toEqual(['/api/ai/mcp/state', { method: 'PUT', body: '{"enabled":false}' }])
  expect(calls).toContainEqual(['/api/ai/access/course/2', { method: 'PUT', body: '{"allowed":false}' }])
  for (const key of ['mail', 'exam_status']) expect(calls).toContainEqual([`/api/ai/access/category/${key}`, { method: 'PUT', body: '{"allowed":false}' }])
  expect(calls.at(-1)).toEqual(['/api/ai/connection', { method: 'POST' }])
})
it('does not activate the connection after a partial permission failure', async () => {
  vi.mocked(request).mockRejectedValueOnce(new Error('offline'))
  await expect(applyAgentSelection(access, [1], ['notes'])).rejects.toThrow('offline')
  expect(request).toHaveBeenCalledTimes(1)
  vi.mocked(request).mockReset(); vi.mocked(request).mockResolvedValue({})
  vi.mocked(request).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('grant failed'))
  await expect(applyAgentSelection(access, [1], ['notes'])).rejects.toThrow('grant failed')
  expect(vi.mocked(request).mock.calls.some(([path]) => path === '/api/ai/connection')).toBe(false)
})
