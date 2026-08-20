import { describe, expect, it } from 'vitest'
import {
  CanvasId,
  CanvasInteractionContextError,
  CanvasRunId,
  MediaWorkflowId,
  VideoAssetId,
  WorkflowEdgeId,
  WorkflowNodeId,
  createCanvasSnapshot,
  createMediaWorkflow,
  decodeCanvasInteractionContext,
  renderCanvasInteractionContext,
  resolveCanvasInteractionContext,
} from '../src/index.ts'
import type { CanvasInteractionContext, CanvasSnapshot } from '../src/index.ts'

const ids = {
  canvas: CanvasId('canvas-interaction'),
  workflow: MediaWorkflowId('workflow-interaction'),
  prompt: WorkflowNodeId('prompt-1'),
  image: WorkflowNodeId('image-1'),
  edge: WorkflowEdgeId('edge-1'),
  run: CanvasRunId('run-1'),
}

function canvas(revision = 1): CanvasSnapshot {
  const workflow = createMediaWorkflow({
    id: ids.workflow,
    name: 'Interaction workflow',
    nodes: [
      { id: ids.prompt, type: 'prompt', config: { text: 'coffee' } },
      { id: ids.image, type: 'image.generate', config: {} },
    ],
    edges: [{
      id: ids.edge,
      sourceNodeId: ids.prompt,
      sourcePort: 'text',
      targetNodeId: ids.image,
      targetPort: 'prompt',
    }],
    outputNodeIds: [ids.image],
  })
  const base = createCanvasSnapshot({ id: ids.canvas, createdAt: 100, workflow })
  return { ...base, workflowRevision: revision, updatedAt: 100 + revision }
}

function context(overrides: Partial<CanvasInteractionContext> = {}): CanvasInteractionContext {
  return {
    canvasId: ids.canvas,
    workflowId: ids.workflow,
    workflowRevision: 1,
    mode: 'editor',
    selectedNodeIds: [ids.image],
    ...overrides,
  }
}

function expectInteractionError(fn: () => unknown): void {
  expect(fn).toThrow(CanvasInteractionContextError)
}

describe('Canvas interaction decoding', () => {
  it('strictly decodes a bounded node/edge selection', () => {
    const decoded = decodeCanvasInteractionContext({
      canvasId: ids.canvas,
      workflowId: ids.workflow,
      workflowRevision: 1,
      mode: 'editor',
      selectedNodeIds: [ids.image],
      selectedEdgeIds: [ids.edge],
    })
    expect(decoded).toMatchObject({
      canvasId: ids.canvas,
      workflowId: ids.workflow,
      workflowRevision: 1,
      selectedNodeIds: [ids.image],
      selectedEdgeIds: [ids.edge],
    })
  })

  it('rejects unknown fields, duplicate ids, and out-of-bounds regions', () => {
    expectInteractionError(() => decodeCanvasInteractionContext({
      canvasId: ids.canvas,
      workflowId: ids.workflow,
      workflowRevision: 1,
      surprise: true,
    }))
    expectInteractionError(() => decodeCanvasInteractionContext({
      canvasId: ids.canvas,
      workflowId: ids.workflow,
      workflowRevision: 1,
      selectedNodeIds: [ids.image, ids.image],
    }))
    expectInteractionError(() => decodeCanvasInteractionContext({
      canvasId: ids.canvas,
      workflowId: ids.workflow,
      workflowRevision: 1,
      region: {
        asset: {
          kind: 'video',
          video: { assetId: VideoAssetId('video-1'), mediaType: 'video/mp4', bytes: 10 },
        },
        normalizedBounds: { x: 0.9, y: 0, width: 0.2, height: 1 },
      },
    }))
  })
})

describe('Canvas interaction resolution', () => {
  it('membership-checks semantic targets at the current revision', () => {
    expect(resolveCanvasInteractionContext(context(), canvas())).toMatchObject({
      currentWorkflowRevision: 1,
      stale: false,
    })
    expectInteractionError(() => resolveCanvasInteractionContext(context({
      selectedNodeIds: [WorkflowNodeId('missing')],
    }), canvas()))
    expectInteractionError(() => resolveCanvasInteractionContext(context({
      selectedNodeIds: [],
      selectedEdgeIds: [WorkflowEdgeId('missing')],
    }), canvas()))
  })

  it('keeps an older workflow selection admissible and marks it stale', () => {
    const resolved = resolveCanvasInteractionContext(context({
      selectedNodeIds: [WorkflowNodeId('node-from-old-revision')],
    }), canvas(2))
    expect(resolved.currentWorkflowRevision).toBe(2)
    expect(resolved.stale).toBe(true)
  })

  it('requires focusedOutput to refer to the current output candidate', () => {
    expectInteractionError(() => resolveCanvasInteractionContext(context({
      selectedNodeIds: [],
      focusedOutput: { runId: ids.run, assetIndex: 0 },
    }), canvas()))
  })

  it('rejects a different Canvas/workflow identity instead of rebinding selection', () => {
    expectInteractionError(() => resolveCanvasInteractionContext(context({
      canvasId: CanvasId('other-canvas'),
    }), canvas()))
    expectInteractionError(() => resolveCanvasInteractionContext(context({
      workflowId: MediaWorkflowId('other-workflow'),
    }), canvas()))
  })
})

describe('Canvas interaction model rendering', () => {
  it('renders explicit stale guidance and selected targets', () => {
    const text = renderCanvasInteractionContext(resolveCanvasInteractionContext(context({
      selectedNodeIds: [WorkflowNodeId('old-node')],
      selectedAssetRefs: [{
        kind: 'video',
        video: { assetId: VideoAssetId('video-1'), mediaType: 'video/mp4', bytes: 42 },
      }],
    }), canvas(2)))
    expect(text).toContain('context status: STALE')
    expect(text).toContain('call canvas_read before acting')
    expect(text).toContain('selected nodes: old-node')
    expect(text).toContain('selected assets: video:video-1')
  })

  it('renders unavailable current state without inventing a target', () => {
    const text = renderCanvasInteractionContext({
      context: context({ selectedNodeIds: [], selectedEdgeIds: [], selectedAssetRefs: [] }),
      currentWorkflowRevision: null,
      stale: true,
    })
    expect(text).toContain('current workflow revision: unavailable')
    expect(text).toContain('STALE/UNAVAILABLE')
    expect(text).toContain('Do not invent a target when a selection field is absent.')
  })
})
