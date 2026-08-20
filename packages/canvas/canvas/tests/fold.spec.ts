import { describe, expect, it } from 'vitest'
import {
  CanvasId,
  CanvasMigrationError,
  CanvasRunId,
  WorkflowNodeId,
  applyCanvasChange,
  cloneCanvasFoldState,
  decodeCanvasChange,
  emptyCanvasFoldState,
} from '@deepseek-ai/dsh-canvas'
import type { CanvasChange } from '@deepseek-ai/dsh-canvas'
import {
  createChange,
  runCompleteChange,
  runStartChange,
  runUpdateChange,
} from './canvas-fixtures.ts'

describe('Canvas durable fold', () => {
  it('ignores unrelated values and decodes only exact current Canvas envelopes', () => {
    expect(decodeCanvasChange(null)).toBeUndefined()
    expect(decodeCanvasChange({ kind: 'other' })).toBeUndefined()
    const change = createChange()
    expect(decodeCanvasChange(change)).toEqual(change)
    expect(() => decodeCanvasChange({ ...change, extra: true })).toThrow(CanvasMigrationError)
    expect(() => decodeCanvasChange({ ...change, meta: {} })).toThrow(CanvasMigrationError)
  })

  it('applies create, workflow edit, run start/update, output select, and clear transitions', () => {
    const state = emptyCanvasFoldState()
    const created = createChange()
    applyCanvasChange(state, created)
    const current = state.canvas
    if (current === null || current.workflow === null) throw new Error('expected current workflow')

    const edited: CanvasChange = {
      ...created,
      operation: 'workflow-edit',
      canvas: {
        ...current,
        workflowRevision: 2,
        workflow: { ...current.workflow, name: 'Edited' },
        updatedAt: current.updatedAt + 1,
      },
    }
    applyCanvasChange(state, edited)
    const afterEdit = state.canvas
    if (afterEdit === null) throw new Error('expected edited Canvas')

    applyCanvasChange(state, runStartChange(afterEdit))
    const queued = state.canvas
    if (queued === null) throw new Error('expected queued Canvas')
    applyCanvasChange(state, runUpdateChange(queued, 'running'))
    const running = state.canvas
    if (running === null) throw new Error('expected running Canvas')
    applyCanvasChange(state, runUpdateChange(running, 'completed'))
    const done = state.canvas
    if (done === null || done.output === null) throw new Error('expected completed Canvas output')

    const selected: CanvasChange = {
      ...created,
      operation: 'output-select',
      canvas: {
        ...done,
        output: { ...done.output, primaryAssetIndex: 1 },
        updatedAt: done.updatedAt + 1,
      },
    }
    applyCanvasChange(state, selected)
    expect(state.canvas?.output?.primaryAssetIndex).toBe(1)

    applyCanvasChange(state, {
      kind: 'canvas/change',
      version: 1,
      operation: 'clear',
      canvas: null,
      meta: { schemaVersion: 1 },
    })
    expect(state.canvas).toBeNull()
  })

  it('keeps historical run-complete replay compatible while current vocabulary uses run-update', () => {
    const state = emptyCanvasFoldState()
    applyCanvasChange(state, createChange())
    if (state.canvas === null) throw new Error('expected Canvas')
    applyCanvasChange(state, runStartChange(state.canvas))
    if (state.canvas === null) throw new Error('expected run')
    expect(() => applyCanvasChange(state, runCompleteChange(state.canvas))).not.toThrow()
    expect(state.canvas?.run?.status).toBe('completed')
  })

  it.each(['failed', 'cancelled', 'interrupted'] as const)(
    'accepts %s as a durable terminal run state',
    (status) => {
      const state = emptyCanvasFoldState()
      applyCanvasChange(state, createChange())
      if (state.canvas === null) throw new Error('expected Canvas')
      applyCanvasChange(state, runStartChange(state.canvas))
      if (state.canvas === null) throw new Error('expected run')
      applyCanvasChange(state, runUpdateChange(state.canvas, status))
      expect(state.canvas?.run?.status).toBe(status)
      expect(state.canvas?.run?.finishedAt).toBeDefined()
    },
  )

  it('rejects duplicate/reused Canvas ids and invalid full-snapshot transitions', () => {
    const state = emptyCanvasFoldState()
    const created = createChange()
    applyCanvasChange(state, created)
    expect(() => applyCanvasChange(state, created)).toThrow('Canvas create requires no current Canvas')

    const current = state.canvas
    if (current === null || current.workflow === null) throw new Error('expected current workflow')
    const badRevision: CanvasChange = {
      ...created,
      operation: 'workflow-replace',
      canvas: {
        ...current,
        workflowRevision: current.workflowRevision + 2,
        workflow: { ...current.workflow, name: 'Bad revision' },
        updatedAt: current.updatedAt + 1,
      },
    }
    expect(() => applyCanvasChange(state, badRevision)).toThrow('advance only the semantic workflow revision')

    applyCanvasChange(state, {
      kind: 'canvas/change', version: 1, operation: 'clear', canvas: null, meta: { schemaVersion: 1 },
    })
    expect(() => applyCanvasChange(state, createChange(CanvasId('canvas-fixture')))).toThrow(
      'fresh revision-one Canvas',
    )
  })

  it('rejects run-start while a non-terminal run is current and accepts a new unique run after completion', () => {
    const state = emptyCanvasFoldState()
    applyCanvasChange(state, createChange())
    const created = state.canvas
    if (created === null) throw new Error('expected created Canvas')
    applyCanvasChange(state, runStartChange(created, CanvasRunId('run-1')))
    const running = state.canvas
    if (running === null) throw new Error('expected running Canvas')
    expect(() => applyCanvasChange(state, runStartChange(running, CanvasRunId('run-2')))).toThrow('non-terminal run')

    applyCanvasChange(state, runUpdateChange(running, 'completed'))
    const completed = state.canvas
    if (completed === null) throw new Error('expected completed Canvas')
    expect(() => applyCanvasChange(state, runStartChange(completed, CanvasRunId('run-2')))).not.toThrow()
  })

  it('rejects reusing a run id anywhere in the Session, including after completion and clear/re-create', () => {
    const state = emptyCanvasFoldState()
    applyCanvasChange(state, createChange(CanvasId('canvas-a')))
    if (state.canvas === null) throw new Error('expected Canvas')
    applyCanvasChange(state, runStartChange(state.canvas, CanvasRunId('run-reused')))
    if (state.canvas === null) throw new Error('expected run')
    applyCanvasChange(state, runUpdateChange(state.canvas, 'completed'))
    applyCanvasChange(state, {
      kind: 'canvas/change', version: 1, operation: 'clear', canvas: null, meta: { schemaVersion: 1 },
    })
    applyCanvasChange(state, createChange(CanvasId('canvas-b')))
    if (state.canvas === null) throw new Error('expected second Canvas')
    expect(() => applyCanvasChange(state, runStartChange(state.canvas, CanvasRunId('run-reused')))).toThrow(
      'cannot be reused',
    )
  })

  it('rejects clear until a non-terminal run reaches a durable terminal state', () => {
    const state = emptyCanvasFoldState()
    applyCanvasChange(state, createChange())
    if (state.canvas === null) throw new Error('expected Canvas')
    applyCanvasChange(state, runStartChange(state.canvas))
    const clear: CanvasChange = {
      kind: 'canvas/change', version: 1, operation: 'clear', canvas: null, meta: { schemaVersion: 1 },
    }
    expect(() => applyCanvasChange(state, clear)).toThrow('current run to be terminal')
    if (state.canvas === null) throw new Error('expected run')
    applyCanvasChange(state, runUpdateChange(state.canvas, 'cancelled'))
    expect(() => applyCanvasChange(state, clear)).not.toThrow()
  })

  it('rejects running -> queued lifecycle regression', () => {
    const state = emptyCanvasFoldState()
    applyCanvasChange(state, createChange())
    if (state.canvas === null) throw new Error('expected Canvas')
    applyCanvasChange(state, runStartChange(state.canvas))
    if (state.canvas === null) throw new Error('expected queued run')
    applyCanvasChange(state, runUpdateChange(state.canvas, 'running'))
    if (state.canvas === null || state.canvas.run === null) throw new Error('expected running run')
    const invalid = runUpdateChange(state.canvas, 'queued')
    expect(() => applyCanvasChange(state, invalid)).toThrow('back to queued')
  })

  it('rejects output selection that changes anything beyond primary index/updatedAt', () => {
    const state = emptyCanvasFoldState()
    applyCanvasChange(state, createChange())
    const created = state.canvas
    if (created === null) throw new Error('expected created Canvas')
    applyCanvasChange(state, runStartChange(created))
    const running = state.canvas
    if (running === null) throw new Error('expected running Canvas')
    applyCanvasChange(state, runUpdateChange(running, 'completed'))
    const completed = state.canvas
    if (completed === null || completed.output === null) throw new Error('expected completed output')

    const invalid: CanvasChange = {
      kind: 'canvas/change',
      version: 1,
      operation: 'output-select',
      meta: { schemaVersion: 1 },
      canvas: {
        ...completed,
        output: {
          ...completed.output,
          assets: completed.output.assets.slice(1),
          primaryAssetIndex: 0,
        },
        updatedAt: completed.updatedAt + 1,
      },
    }
    expect(() => applyCanvasChange(state, invalid)).toThrow('may only change the primary output index')
  })

  it('clones mutable replay id sets without changing current snapshot identity', () => {
    const state = emptyCanvasFoldState()
    applyCanvasChange(state, createChange())
    if (state.canvas === null) throw new Error('expected Canvas')
    applyCanvasChange(state, runStartChange(state.canvas, CanvasRunId('run-a')))
    const cloned = cloneCanvasFoldState(state)
    cloned.seenCanvasIds.add(CanvasId('another'))
    cloned.seenRunIds.add(CanvasRunId('run-b'))
    expect(state.seenCanvasIds.has(CanvasId('another'))).toBe(false)
    expect(state.seenRunIds.has(CanvasRunId('run-b'))).toBe(false)
    expect(cloned.canvas).toBe(state.canvas)
  })

  it('rejects a workflow edit whose final graph still references a removed node', () => {
    const state = emptyCanvasFoldState()
    const created = createChange()
    applyCanvasChange(state, created)
    const current = state.canvas
    if (current === null || current.workflow === null) throw new Error('expected current workflow')
    const nextWorkflow = {
      ...current.workflow,
      nodes: current.workflow.nodes.filter(node => node.id !== WorkflowNodeId('output')),
    }
    const invalid: CanvasChange = {
      ...created,
      operation: 'workflow-edit',
      canvas: {
        ...current,
        workflowRevision: current.workflowRevision + 1,
        workflow: nextWorkflow,
        updatedAt: current.updatedAt + 1,
      },
    }
    expect(() => decodeCanvasChange(invalid)).toThrow()
  })
})
