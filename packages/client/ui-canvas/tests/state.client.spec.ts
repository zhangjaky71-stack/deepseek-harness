import { describe, expect, it } from 'vitest'
import type { CanvasProductState, CanvasSnapshot } from '@deepseek-ai/dsh-canvas/client'
import { canvasPrimaryAction, deriveCanvasPresentation, deriveCanvasViewProductState } from '../src/client/state.ts'

const workflow = {
  id: 'workflow-ui',
  schemaVersion: 1,
  name: 'UI workflow',
  nodes: [],
  edges: [],
  outputNodeIds: [],
} as const

function snapshot(overrides: Partial<CanvasSnapshot> = {}): CanvasSnapshot {
  return {
    schemaVersion: 1,
    id: 'canvas-ui',
    workflowRevision: 1,
    runRevision: 0,
    workflow,
    run: null,
    output: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as unknown as CanvasSnapshot
}

function run(status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted', revision = 1) {
  const terminal = status !== 'queued' && status !== 'running'
  return {
    id: `run-${status}`,
    status,
    workflowId: workflow.id,
    workflowRevision: revision,
    startedAt: 2,
    ...(terminal ? { finishedAt: 3 } : {}),
    ...(status === 'failed' ? { error: { category: 'provider', code: 'failed', message: 'failed' } } : {}),
  } as unknown as NonNullable<CanvasSnapshot['run']>
}

const output = {
  runId: 'run-completed',
  workflowId: workflow.id,
  workflowRevision: 1,
  assets: [{
    kind: 'video',
    video: { assetId: 'video-ui', mediaType: 'video/mp4', bytes: 100, width: 640, height: 360, durationMs: 1000 },
  }],
  primaryAssetIndex: 0,
} as unknown as NonNullable<CanvasSnapshot['output']>

describe('Canvas UI product state', () => {
  it('maps every product state to one primary control and RUNNING only to cancel', () => {
    const expected: Record<CanvasProductState, ReturnType<typeof canvasPrimaryAction>> = {
      EMPTY: 'none', READY: 'run', DIRTY_READY: 'run', RUNNING: 'cancel',
      COMPLETED: 'run', FAILED: 'retry', CANCELLED: 'retry', INTERRUPTED: 'retry',
    }
    for (const [state, action] of Object.entries(expected) as [CanvasProductState, typeof expected[CanvasProductState]][]) {
      expect(canvasPrimaryAction(state)).toBe(action)
    }
  })

  it('implements the N01 product-state rules isomorphically without a browser runtime edge to the Host package', () => {
    expect(deriveCanvasViewProductState(null)).toBe('EMPTY')
    expect(deriveCanvasViewProductState(snapshot())).toBe('READY')
    expect(deriveCanvasViewProductState(snapshot({ runRevision: 1, run: run('running') }))).toBe('RUNNING')
    expect(deriveCanvasViewProductState(snapshot({ runRevision: 1, run: run('failed') }))).toBe('FAILED')
    expect(deriveCanvasViewProductState(snapshot({ runRevision: 1, run: run('cancelled') }))).toBe('CANCELLED')
    expect(deriveCanvasViewProductState(snapshot({ runRevision: 1, run: run('interrupted') }))).toBe('INTERRUPTED')
    expect(deriveCanvasViewProductState(snapshot({ runRevision: 1, run: run('completed'), output }))).toBe('COMPLETED')
    expect(deriveCanvasViewProductState(snapshot({ workflowRevision: 2, runRevision: 1, run: run('completed'), output }))).toBe('DIRTY_READY')
  })

  it('keeps the old output visible in DIRTY_READY', () => {
    expect(deriveCanvasPresentation(snapshot({ workflowRevision: 2, runRevision: 1, run: run('completed'), output }))).toMatchObject({
      state: 'DIRTY_READY',
      primaryAction: 'run',
      showOutput: true,
      staleOutput: true,
    })
  })
})
