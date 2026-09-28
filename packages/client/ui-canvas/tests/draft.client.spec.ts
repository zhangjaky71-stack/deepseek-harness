// @vitest-environment jsdom
/** Pure N11 Draft/command/clipboard semantics. */

import { describe, expect, it, vi } from 'vitest'
import type {
  CanvasLayoutSnapshot,
  CanvasSnapshot,
  MediaWorkflow,
  WorkflowEdgeId,
  WorkflowNodeId,
} from '@deepseek-ai/dsh-canvas/client'
import {
  commandFor,
  copySelection,
  createNodeDraft,
  deleteSelectionOperations,
  nodeDraftOperations,
  pasteClipboard,
} from '../src/client/draft.ts'

const node = (id: string, type: 'prompt' | 'image.generate' | 'output') => ({
  id: id as WorkflowNodeId,
  type,
  nodeVersion: 1,
  config: type === 'prompt' ? { text: 'hello' } : {},
})
const workflow: MediaWorkflow = {
  id: 'workflow-1' as MediaWorkflow['id'],
  schemaVersion: 1,
  name: 'Flow',
  nodes: [node('a', 'prompt'), node('b', 'image.generate'), node('c', 'output')],
  edges: [
    { id: 'ab' as WorkflowEdgeId, sourceNodeId: 'a' as WorkflowNodeId, sourcePort: 'text', targetNodeId: 'b' as WorkflowNodeId, targetPort: 'prompt' },
    { id: 'bc' as WorkflowEdgeId, sourceNodeId: 'b' as WorkflowNodeId, sourcePort: 'images', targetNodeId: 'c' as WorkflowNodeId, targetPort: 'images' },
  ],
  outputNodeIds: ['c' as WorkflowNodeId],
}
const canvas: CanvasSnapshot = {
  schemaVersion: 1,
  id: 'canvas-1' as CanvasSnapshot['id'],
  workflowRevision: 3,
  runRevision: 0,
  workflow,
  run: null,
  output: null,
  createdAt: 1,
  updatedAt: 1,
}

describe('Canvas editor draft helpers', () => {
  it('keeps node draft narrow and emits only changed semantic operations', () => {
    const draft = createNodeDraft(canvas, 'a' as WorkflowNodeId)!
    const changed = { ...draft, nameText: 'Prompt A', configText: '{"text":"world"}', dirty: true }
    expect(nodeDraftOperations(workflow, changed)).toEqual([
      { op: 'rename-node', nodeId: 'a', name: 'Prompt A' },
      { op: 'replace-node-config', nodeId: 'a', config: { text: 'world' } },
    ])
  })

  it('deletes edges before nodes and repairs output ids in the same batch', () => {
    expect(deleteSelectionOperations(workflow, ['c' as WorkflowNodeId], [])).toEqual([
      { op: 'disconnect', edgeId: 'bc' },
      { op: 'remove-node', nodeId: 'c' },
      { op: 'set-output-nodes', nodeIds: [] },
    ])
  })

  it('copies only internal edges and pastes fresh ids atomically', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')
    const layout = {
      schemaVersion: 1,
      workflowId: workflow.id,
      nodePositions: { a: { x: 10, y: 20 }, b: { x: 30, y: 40 } },
      updatedAt: 1,
    } as unknown as CanvasLayoutSnapshot
    const clipboard = copySelection(workflow, ['a' as WorkflowNodeId, 'b' as WorkflowNodeId], layout)!
    expect(clipboard.edges.map(edge => edge.id)).toEqual(['ab'])
    const plan = pasteClipboard(clipboard)
    expect(plan.operations.map(operation => operation.op)).toEqual(['add-node', 'add-node', 'connect'])
    expect(new Set(plan.nodeIds.map(String)).size).toBe(2)
    expect(plan.positions[String(plan.nodeIds[0])]).toEqual({ x: 46, y: 56 })
  })

  it('derives inverse operations without retaining a workflow snapshot in history', () => {
    const command = commandFor(workflow, '删除输出', deleteSelectionOperations(workflow, ['c' as WorkflowNodeId], []), 'cmd-1')
    expect(command.inverse.map(operation => operation.op)).toEqual(['set-output-nodes', 'add-node', 'connect'])
    expect(command).not.toHaveProperty('workflow')
  })
})
