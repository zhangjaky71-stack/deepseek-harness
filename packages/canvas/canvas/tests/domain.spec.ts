import { describe, expect, it } from 'vitest'
import {
  CanvasDomainError,
  CanvasId,
  CanvasRunId,
  CanvasVariantId,
  MediaWorkflowId,
  VideoAssetId,
  WorkflowEdgeId,
  WorkflowNodeId,
  assertCanvasJsonValue,
  assertCanvasSnapshot,
  createCanvasSnapshot,
  createMediaWorkflow,
  deriveCanvasProductState,
  isCanvasRunTerminal,
} from '../src/index.ts'
import type { CanvasOutput, CanvasRunSnapshot, CanvasSnapshot, MediaWorkflow } from '../src/types.ts'

const ids = {
  canvas: CanvasId('canvas-1'),
  workflow: MediaWorkflowId('workflow-1'),
  prompt: WorkflowNodeId('prompt-1'),
  image: WorkflowNodeId('image-1'),
  output: WorkflowNodeId('output-1'),
  edgePrompt: WorkflowEdgeId('edge-prompt'),
  edgeOutput: WorkflowEdgeId('edge-output'),
  run: CanvasRunId('run-1'),
}

function workflow(): MediaWorkflow {
  return createMediaWorkflow({
    id: ids.workflow,
    name: 'Poster',
    nodes: [
      { id: ids.prompt, type: 'prompt', config: { text: 'coffee poster' } },
      { id: ids.image, type: 'image.generate', config: { count: 1 } },
      { id: ids.output, type: 'output', config: {} },
    ],
    edges: [
      { id: ids.edgePrompt, sourceNodeId: ids.prompt, sourcePort: 'text', targetNodeId: ids.image, targetPort: 'prompt' },
      { id: ids.edgeOutput, sourceNodeId: ids.image, sourcePort: 'image', targetNodeId: ids.output, targetPort: 'input' },
    ],
    outputNodeIds: [ids.output],
  })
}

function fresh(): CanvasSnapshot {
  return createCanvasSnapshot({ id: ids.canvas, createdAt: 100, workflow: workflow() })
}

function expectCanvasError(fn: () => void, code: string): void {
  try {
    fn()
    throw new Error(`expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(CanvasDomainError)
    expect(error).toMatchObject({ code })
  }
}

function videoOutput(workflowRevision = 1): CanvasOutput {
  return {
    runId: ids.run,
    workflowId: ids.workflow,
    workflowRevision,
    assets: [{
      kind: 'video',
      video: {
        assetId: VideoAssetId('video-1'),
        mediaType: 'video/mp4',
        bytes: 1024,
        width: 1080,
        height: 1920,
        durationMs: 10_000,
      },
    }],
    primaryAssetIndex: 0,
  }
}

function run(status: CanvasRunSnapshot['status'], workflowRevision = 1): CanvasRunSnapshot {
  const base = { id: ids.run, status, workflowId: ids.workflow, workflowRevision, startedAt: 110 }
  if (status === 'queued' || status === 'running') return base
  if (status === 'failed') {
    return {
      ...base,
      finishedAt: 120,
      error: { category: 'provider', code: 'PROVIDER_FAILED', message: 'provider failed' },
    }
  }
  return { ...base, finishedAt: 120 }
}

describe('Canvas ids and construction', () => {
  it('brands ids without changing their runtime value', () => {
    expect(CanvasId('canvas-x')).toBe('canvas-x')
    expect(MediaWorkflowId('workflow-x')).toBe('workflow-x')
    expect(WorkflowNodeId('node-x')).toBe('node-x')
    expect(WorkflowEdgeId('edge-x')).toBe('edge-x')
    expect(CanvasRunId('run-x')).toBe('run-x')
    expect(CanvasVariantId('variant-x')).toBe('variant-x')
    expect(VideoAssetId('video-x')).toBe('video-x')
  })

  it('starts empty Canvas state at both revisions zero', () => {
    const snapshot = createCanvasSnapshot({ id: ids.canvas, createdAt: 100 })
    expect(snapshot).toMatchObject({ workflowRevision: 0, runRevision: 0, workflow: null, run: null, output: null })
    expect(deriveCanvasProductState(snapshot)).toBe('EMPTY')
  })

  it('starts a seeded workflow at workflow revision one', () => {
    const snapshot = fresh()
    expect(snapshot.workflowRevision).toBe(1)
    expect(snapshot.runRevision).toBe(0)
    expect(deriveCanvasProductState(snapshot)).toBe('READY')
  })
})

describe('Canvas product state', () => {
  it('treats null as EMPTY', () => {
    expect(deriveCanvasProductState(null)).toBe('EMPTY')
  })

  it('derives DIRTY_READY from output of an older workflow revision', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), workflowRevision: 2, output: videoOutput(1), updatedAt: 130 }
    assertCanvasSnapshot(snapshot)
    expect(deriveCanvasProductState(snapshot)).toBe('DIRTY_READY')
  })

  it('derives RUNNING for a queued run', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), runRevision: 1, run: run('queued'), updatedAt: 110 }
    assertCanvasSnapshot(snapshot)
    expect(deriveCanvasProductState(snapshot)).toBe('RUNNING')
  })

  it('keeps an old-revision run RUNNING while the current workflow is newer', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), workflowRevision: 2, runRevision: 1, run: run('running', 1), updatedAt: 130 }
    assertCanvasSnapshot(snapshot)
    expect(deriveCanvasProductState(snapshot)).toBe('RUNNING')
  })

  it('derives terminal state only when the run targets the current revision', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), runRevision: 1, run: run('failed'), updatedAt: 120 }
    assertCanvasSnapshot(snapshot)
    expect(deriveCanvasProductState(snapshot)).toBe('FAILED')
  })

  it('derives CANCELLED for a current cancelled run', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), runRevision: 1, run: run('cancelled'), updatedAt: 120 }
    assertCanvasSnapshot(snapshot)
    expect(deriveCanvasProductState(snapshot)).toBe('CANCELLED')
  })

  it('derives INTERRUPTED for a current interrupted run', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), runRevision: 1, run: run('interrupted'), updatedAt: 120 }
    assertCanvasSnapshot(snapshot)
    expect(deriveCanvasProductState(snapshot)).toBe('INTERRUPTED')
  })

  it('derives COMPLETED from a current completed run and output', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), runRevision: 2, run: run('completed'), output: videoOutput(), updatedAt: 120 }
    assertCanvasSnapshot(snapshot)
    expect(deriveCanvasProductState(snapshot)).toBe('COMPLETED')
  })

  it('falls back to READY after an old-revision terminal run without a current output', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), workflowRevision: 2, runRevision: 1, run: run('failed', 1), updatedAt: 130 }
    assertCanvasSnapshot(snapshot)
    expect(deriveCanvasProductState(snapshot)).toBe('READY')
  })
})

describe('Canvas revision and output invariants', () => {
  it('allows runRevision to change without altering workflowRevision', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), runRevision: 7, run: run('running'), updatedAt: 130 }
    assertCanvasSnapshot(snapshot)
    expect(snapshot.workflowRevision).toBe(1)
    expect(snapshot.runRevision).toBe(7)
  })

  it('rejects a run that targets a future workflow revision', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), runRevision: 1, run: run('running', 2), updatedAt: 130 }
    expectCanvasError(() => assertCanvasSnapshot(snapshot), 'CANVAS_INVALID_RUN')
  })

  it('rejects primaryAssetIndex outside the candidate set', () => {
    const snapshot: CanvasSnapshot = { ...fresh(), output: { ...videoOutput(), primaryAssetIndex: 1 }, updatedAt: 120 }
    expectCanvasError(() => assertCanvasSnapshot(snapshot), 'CANVAS_INVALID_OUTPUT')
  })

  it('requires a completed run to own the current output', () => {
    const snapshot: CanvasSnapshot = {
      ...fresh(),
      runRevision: 2,
      run: run('completed'),
      output: { ...videoOutput(), runId: CanvasRunId('older-run') },
      updatedAt: 120,
    }
    expectCanvasError(() => assertCanvasSnapshot(snapshot), 'CANVAS_INVALID_OUTPUT')
  })
})

describe('workflow and JSON invariants', () => {
  it('accepts structurally valid open-world node identifiers without a built-in whitelist', () => {
    const customNodeId = WorkflowNodeId('custom-1')
    const custom = createMediaWorkflow({
      id: MediaWorkflowId('workflow-custom'),
      name: 'Plugin workflow',
      nodes: [{
        id: customNodeId,
        type: 'plugin.example.custom-transform',
        nodeVersion: 7,
        config: { strength: 0.5 },
      }],
      outputNodeIds: [customNodeId],
    })
    expect(custom.nodes[0]?.type).toBe('plugin.example.custom-transform')
  })

  it('rejects an empty node type identifier', () => {
    expectCanvasError(() => createMediaWorkflow({
      id: MediaWorkflowId('workflow-empty-type'),
      name: 'invalid',
      nodes: [{ id: WorkflowNodeId('node-empty-type'), type: '', config: {} }],
    }), 'CANVAS_INVALID_WORKFLOW')
  })

  it('rejects duplicate node ids', () => {
    expectCanvasError(() => createMediaWorkflow({
      id: ids.workflow,
      name: 'invalid',
      nodes: [
        { id: ids.prompt, type: 'prompt', config: {} },
        { id: ids.prompt, type: 'output', config: {} },
      ],
    }), 'CANVAS_INVALID_WORKFLOW')
  })

  it('rejects edges whose nodes do not exist', () => {
    expectCanvasError(() => createMediaWorkflow({
      id: ids.workflow,
      name: 'invalid',
      nodes: [{ id: ids.prompt, type: 'prompt', config: {} }],
      edges: [{
        id: ids.edgePrompt,
        sourceNodeId: ids.prompt,
        sourcePort: 'text',
        targetNodeId: WorkflowNodeId('missing'),
        targetPort: 'prompt',
      }],
    }), 'CANVAS_INVALID_WORKFLOW')
  })

  it('rejects binary, non-finite, and cyclic config values', () => {
    expectCanvasError(() => assertCanvasJsonValue(new Uint8Array([1])), 'CANVAS_INVALID_JSON_VALUE')
    expectCanvasError(() => assertCanvasJsonValue(Number.NaN), 'CANVAS_INVALID_JSON_VALUE')
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expectCanvasError(() => assertCanvasJsonValue(cyclic), 'CANVAS_INVALID_JSON_VALUE')
  })

  it('rejects empty branded ids at the domain boundary', () => {
    const snapshot = createCanvasSnapshot({ id: ids.canvas, createdAt: 100 })
    expectCanvasError(() => assertCanvasSnapshot({ ...snapshot, id: CanvasId('') }), 'CANVAS_INVALID_ID')
  })
})

describe('run lifecycle helpers', () => {
  it('classifies terminal statuses', () => {
    expect(isCanvasRunTerminal('queued')).toBe(false)
    expect(isCanvasRunTerminal('running')).toBe(false)
    expect(isCanvasRunTerminal('completed')).toBe(true)
    expect(isCanvasRunTerminal('failed')).toBe(true)
    expect(isCanvasRunTerminal('cancelled')).toBe(true)
    expect(isCanvasRunTerminal('interrupted')).toBe(true)
  })

  it('exposes stable domain errors', () => {
    expectCanvasError(() => assertCanvasJsonValue(Number.POSITIVE_INFINITY), 'CANVAS_INVALID_JSON_VALUE')
  })
})