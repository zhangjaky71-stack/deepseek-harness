/** N11 renderer-neutral adapter boundary. */

import { describe, expect, it } from 'vitest'
import type { MediaWorkflow, WorkflowNodeId } from '@deepseek-ai/dsh-canvas/client'
import { mergedLayoutPositions, toCanvasFlow } from '../src/client/adapters.ts'

const workflow: MediaWorkflow = {
  id: 'workflow-1' as MediaWorkflow['id'],
  schemaVersion: 1,
  name: 'Flow',
  nodes: [{ id: 'a' as WorkflowNodeId, type: 'prompt', nodeVersion: 1, name: 'Prompt', config: {} }],
  edges: [],
  outputNodeIds: [],
}

describe('Canvas graph adapter', () => {
  it('prefers local drag position over persisted layout without modifying Domain data', () => {
    const layout = { schemaVersion: 1, workflowId: workflow.id, nodePositions: { a: { x: 1, y: 2 } }, updatedAt: 1 } as never
    expect(toCanvasFlow(workflow, layout, { a: { x: 9, y: 8 } }).nodes[0]).toMatchObject({
      id: 'a', label: 'Prompt', position: { x: 9, y: 8 },
    })
    expect(mergedLayoutPositions(workflow, layout, { a: { x: 9, y: 8 } })).toEqual({ a: { x: 9, y: 8 } })
    expect(workflow.nodes[0]).not.toHaveProperty('position')
  })
})
