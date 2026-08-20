import { describe, expect, it } from 'vitest'
import type { CanvasSnapshot, WorkflowNodeId } from '@deepseek-ai/dsh-canvas/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { CanvasInteractionStore } from '../src/client/interaction-store.ts'
import { buildCanvasInteractionContext } from '../src/client/interaction.ts'

const A = 'session-a' as SessionId
const B = 'session-b' as SessionId

const workflow = {
  id: 'workflow-ui',
  schemaVersion: 1,
  name: 'Interaction workflow',
  nodes: [{ id: 'node-a', type: 'image.generate', config: {} }],
  edges: [],
  outputNodeIds: ['node-a'],
} as unknown as NonNullable<CanvasSnapshot['workflow']>

const assets = [0, 1, 2, 3].map(index => ({
  kind: 'video' as const,
  video: {
    assetId: `video-${index}`,
    mediaType: 'video/mp4',
    bytes: 100 + index,
    width: 640,
    height: 360,
    durationMs: 1000,
  },
})) as NonNullable<CanvasSnapshot['output']>['assets']

function snapshot(overrides: Partial<CanvasSnapshot> = {}): CanvasSnapshot {
  return {
    schemaVersion: 1,
    id: 'canvas-ui',
    workflowRevision: 1,
    runRevision: 1,
    workflow,
    run: null,
    output: {
      runId: 'run-1',
      workflowId: workflow.id,
      workflowRevision: 1,
      assets,
      primaryAssetIndex: 0,
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as CanvasSnapshot
}

describe('Canvas interaction selection store', () => {
  it('keeps selection isolated by Session', () => {
    const store = new CanvasInteractionStore()
    store.selectNode(A, snapshot(), 'node-a' as WorkflowNodeId)
    expect(store.faceOf(A).getSnapshot().selectedNodeIds).toEqual(['node-a'])
    expect(store.faceOf(B).getSnapshot().selectedNodeIds).toEqual([])
  })

  it('anchors semantic selection to the workflow revision observed at click time', () => {
    const store = new CanvasInteractionStore()
    store.selectNode(A, snapshot(), 'node-a' as WorkflowNodeId)
    const context = buildCanvasInteractionContext(store.faceOf(A).getSnapshot(), snapshot({ workflowRevision: 2 }), 'editor')
    expect(context).toMatchObject({
      canvasId: 'canvas-ui',
      workflowId: 'workflow-ui',
      workflowRevision: 1,
      mode: 'editor',
      selectedNodeIds: ['node-a'],
    })
  })

  it('does not rebind an old selection to a replacement Canvas or workflow', () => {
    const store = new CanvasInteractionStore()
    store.selectNode(A, snapshot(), 'node-a' as WorkflowNodeId)
    expect(buildCanvasInteractionContext(
      store.faceOf(A).getSnapshot(),
      snapshot({ id: 'other-canvas' as CanvasSnapshot['id'] }),
      'editor',
    )).toBeUndefined()
    expect(buildCanvasInteractionContext(
      store.faceOf(A).getSnapshot(),
      snapshot({ workflow: { ...workflow, id: 'other-workflow' as typeof workflow.id } }),
      'editor',
    )).toBeUndefined()
  })

  it('focuses candidate three with both durable asset and zero-based index two', () => {
    const store = new CanvasInteractionStore()
    store.selectOutput(A, snapshot(), 2)
    const context = buildCanvasInteractionContext(store.faceOf(A).getSnapshot(), snapshot(), 'minimal')
    expect(context?.focusedOutput).toEqual({ runId: 'run-1', assetIndex: 2 })
    expect(context?.selectedAssetRefs).toEqual([assets[2]])
  })

  it('keeps the durable selected asset after a later output replaces current focus', () => {
    const store = new CanvasInteractionStore()
    store.selectOutput(A, snapshot(), 2)
    const next = snapshot({
      output: {
        runId: 'run-2',
        workflowId: workflow.id,
        workflowRevision: 1,
        assets: [assets[3]!],
        primaryAssetIndex: 0,
      } as NonNullable<CanvasSnapshot['output']>,
    })
    const context = buildCanvasInteractionContext(store.faceOf(A).getSnapshot(), next, 'minimal')
    expect(context?.focusedOutput).toBeUndefined()
    expect(context?.selectedAssetRefs).toEqual([assets[2]])
  })

  it('omits interaction context when nothing is selected', () => {
    const store = new CanvasInteractionStore()
    expect(buildCanvasInteractionContext(store.faceOf(A).getSnapshot(), snapshot(), 'editor')).toBeUndefined()
  })
})
